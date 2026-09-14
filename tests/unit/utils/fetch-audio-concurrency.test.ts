/**
 * The concurrency budget is process-wide module state, so it lives in its own
 * file with the config mocked — the main suite must keep running with the
 * default and no leaked counter.
 */
const MAX = 2;

jest.mock('../../../src/config', () => ({
  env: {
    AUDIO_FETCH_ALLOWED_HOSTS: [],
    AUDIO_FETCH_MAX_BYTES: 26_214_400,
    AUDIO_FETCH_TIMEOUT_MS: 30_000,
    AUDIO_FETCH_MAX_CONCURRENT: MAX,
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  fetchAudioFile,
  withAudioFetchPermit,
  _resetAudioFetchConcurrency,
} = require('../../../src/utils/fetch-audio-file');

/** A fetch that hangs until released, so slots can be held open deliberately. */
const hangingFetch = () => {
  let release: (v: unknown) => void = () => undefined;
  const gate = new Promise((r) => (release = r));
  global.fetch = jest.fn(async () => {
    await gate;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => Buffer.from('ID3audio').buffer,
    };
  }) as never;
  return () => release(undefined);
};

describe('audio fetch concurrency budget', () => {
  afterEach(() => _resetAudioFetchConcurrency());

  it('refuses a fetch once the budget is full', async () => {
    const release = hangingFetch();
    const held = [
      fetchAudioFile('https://8.8.8.8/a.mp3'),
      fetchAudioFile('https://8.8.8.8/b.mp3'),
    ];
    // Let both occupy their slots before the third arrives.
    await new Promise((r) => setImmediate(r));

    const error = await fetchAudioFile('https://8.8.8.8/c.mp3').catch(
      (e: Error) => e,
    );

    expect(error.name).toBe('AudioFetchError');
    expect(error.message).toMatch(/too many audio downloads/);
    expect(error.message).toContain(String(MAX));

    release();
    await Promise.all(held);
  });

  it('releases the slot after a successful fetch', async () => {
    const release = hangingFetch();
    const first = fetchAudioFile('https://8.8.8.8/a.mp3');
    await new Promise((r) => setImmediate(r));
    release();
    await first;

    // The budget should be back to full, so two more must both be admitted.
    const release2 = hangingFetch();
    const more = [
      fetchAudioFile('https://8.8.8.8/b.mp3'),
      fetchAudioFile('https://8.8.8.8/c.mp3'),
    ];
    await new Promise((r) => setImmediate(r));
    release2();

    await expect(Promise.all(more)).resolves.toHaveLength(2);
  });

  // The slot is released in the same `finally` that clears the timeout, so a
  // rejection must not leak it — otherwise a few bad URLs would wedge the
  // server permanently.
  it('releases the slot after a failed fetch', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as never;

    for (let i = 0; i < MAX + 3; i++) {
      const err = await fetchAudioFile('https://8.8.8.8/a.mp3').catch(
        (e: Error) => e,
      );
      expect(err.message).not.toMatch(/too many audio downloads/);
    }
  });

  it('releases the slot when the URL is rejected before any request', async () => {
    for (let i = 0; i < MAX + 3; i++) {
      const err = await fetchAudioFile('http://127.0.0.1/a.mp3').catch(
        (e: Error) => e,
      );
      expect(err.message).not.toMatch(/too many audio downloads/);
    }
  });

  // The bytes a download costs are not freed when the download ends — they
  // live inside the returned File until the upstream upload consumes them, and
  // the upload is the slower half. A permit released at the end of the fetch
  // bounds only the cheap part, which is the bug this pairing exists to close.
  describe('a permit held across the upload', () => {
    it('keeps the budget charged while the upload runs', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => Buffer.from('ID3audio').buffer,
      })) as never;

      let finishUpload: (v: unknown) => void = () => undefined;
      const uploading = new Promise((r) => (finishUpload = r));

      // Two callers download and then sit in their (stalled) uploads.
      const held = [1, 2].map((n) =>
        withAudioFetchPermit(async () => {
          await fetchAudioFile(`https://8.8.8.8/${n}.mp3`);
          await uploading;
          return n;
        }),
      );
      // Let both get past the download and into the upload.
      await new Promise((r) => setImmediate(r));

      const error = await fetchAudioFile('https://8.8.8.8/c.mp3').catch(
        (e: Error) => e,
      );
      expect(error.message).toMatch(/too many audio downloads/);

      finishUpload(undefined);
      await expect(Promise.all(held)).resolves.toEqual([1, 2]);
    });

    it('does not charge the nested fetch a second permit', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => Buffer.from('ID3audio').buffer,
      })) as never;

      // MAX is 2. If the inner fetch took its own permit, this single
      // operation would hold two and a second caller would be refused — and at
      // a limit of 1 the operation would deadlock against itself.
      const outer = withAudioFetchPermit(async () => {
        await fetchAudioFile('https://8.8.8.8/a.mp3');
        return withAudioFetchPermit(async () => 'nested-ok');
      });

      await expect(outer).resolves.toBe('nested-ok');
    });

    it('releases the permit when the upload throws', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => Buffer.from('ID3audio').buffer,
      })) as never;

      for (let i = 0; i < MAX + 3; i++) {
        const err = await withAudioFetchPermit(async () => {
          await fetchAudioFile('https://8.8.8.8/a.mp3');
          throw new Error('upload failed');
        }).catch((e: Error) => e);
        expect(err.message).toBe('upload failed');
      }
    });
  });
});
