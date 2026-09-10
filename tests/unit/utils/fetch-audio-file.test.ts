import {
  AudioFetchError,
  fetchAudioFile,
  isBlockedAddress,
} from '../../../src/utils/fetch-audio-file';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1', 'IPv4 loopback'],
    ['10.1.2.3', 'private 10/8'],
    ['172.16.0.1', 'private 172.16/12'],
    ['172.31.255.254', 'private 172.31 upper bound'],
    ['192.168.1.1', 'private 192.168/16'],
    // The cloud metadata endpoint is the single most valuable SSRF target.
    ['169.254.169.254', 'link-local cloud metadata'],
    ['0.0.0.0', 'this-network'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 unique-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['not-an-ip', 'unparseable input'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public DNS'],
    ['1.1.1.1', 'public DNS'],
    ['172.15.0.1', 'just below the private 172.16 range'],
    ['172.32.0.1', 'just above the private 172.31 range'],
    ['192.167.0.1', 'just below 192.168'],
    ['93.184.216.34', 'ordinary public host'],
    ['2606:4700::1111', 'public IPv6'],
  ])('allows %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('fetchAudioFile', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('rejects a non-http scheme without making a request', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    await expect(fetchAudioFile('file:///etc/passwd')).rejects.toThrow(
      /must use http or https/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a loopback literal without making a request', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    await expect(
      fetchAudioFile('http://127.0.0.1/internal.mp3'),
    ).rejects.toThrow(/non-public address/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects the cloud metadata endpoint without making a request', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    await expect(
      fetchAudioFile('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow(/non-public address/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a malformed URL', async () => {
    await expect(fetchAudioFile('not a url')).rejects.toThrow(
      /not a valid URL/,
    );
  });

  it('rejects an empty body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as any;

    await expect(fetchAudioFile('https://8.8.8.8/a.mp3')).rejects.toThrow(
      /empty file/,
    );
  });

  it('rejects a body larger than the cap even when content-length lies', async () => {
    const oversized = Buffer.alloc(26 * 1024 * 1024, 1);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      // Understates the real size, so only the streamed check can catch it.
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': '10',
      }),
      arrayBuffer: async () => oversized.buffer.slice(0, oversized.byteLength),
    }) as any;

    await expect(fetchAudioFile('https://8.8.8.8/big.mp3')).rejects.toThrow(
      /above the .* limit/,
    );
  });

  it('returns a File named from the URL on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => Buffer.from('ID3audio').buffer,
    }) as any;

    const file = await fetchAudioFile('https://8.8.8.8/memo.mp3');
    expect(file.name).toBe('memo.mp3');
    expect(file.type).toBe('audio/mpeg');
    expect(file.size).toBeGreaterThan(0);
  });

  it('gives an unsupported extension a supported one', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => Buffer.from('ID3audio').buffer,
    }) as any;

    const file = await fetchAudioFile('https://8.8.8.8/download');
    expect(file.name).toBe('download.mp3');
  });

  it('re-validates redirect targets, so a public URL cannot bounce inward', async () => {
    // The SSRF guard is worthless if only the first hop is checked.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 302,
      headers: new Headers({ location: 'http://169.254.169.254/latest/' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as any;

    await expect(fetchAudioFile('https://8.8.8.8/a.mp3')).rejects.toThrow(
      /non-public address/,
    );
  });

  // --- Codex review findings on PR #6 -------------------------------------

  it('accepts an IPv6-literal URL, whose hostname arrives bracketed', async () => {
    // WHATWG URL.hostname keeps the brackets: `[2606:4700::1111]`. Left as-is,
    // net.isIP returns 0, the value is treated as a DNS name, the lookup fails,
    // and every public IPv6-literal URL is refused. The existing isBlockedAddress
    // tests passed bare addresses, so they could not catch this.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      body: null,
      arrayBuffer: async () => Buffer.from('ID3audio').buffer,
    }) as any;

    const file = await fetchAudioFile('https://[2606:4700::1111]/memo.mp3');
    expect(file.name).toBe('memo.mp3');
  });

  it('still blocks a bracketed IPv6 loopback literal', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    await expect(fetchAudioFile('https://[::1]/memo.mp3')).rejects.toThrow(
      /non-public address/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aborts mid-stream once the cap is exceeded, without buffering it all', async () => {
    // The P1 finding: checking the size after `arrayBuffer()` lets an
    // unbounded chunked response exhaust the heap before the check runs.
    // A 1 MiB chunk generator that would produce 40 MiB must be cut short.
    let chunksProduced = 0;
    let cancelled = false;
    const oneMiB = new Uint8Array(1024 * 1024);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      body: {
        getReader: () => ({
          read: async () => {
            chunksProduced += 1;
            if (chunksProduced > 40) return { done: true, value: undefined };
            return { done: false, value: oneMiB };
          },
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
      arrayBuffer: async () => {
        throw new Error('arrayBuffer must not be used when a stream exists');
      },
    }) as any;

    await expect(fetchAudioFile('https://8.8.8.8/big.mp3')).rejects.toThrow(
      /exceeds the .* limit/,
    );
    // 25 MiB cap: stopped shortly after crossing it, nowhere near 40.
    expect(chunksProduced).toBeLessThan(30);
    expect(cancelled).toBe(true);
  });

  it('reads a streamed body in full when it is under the cap', async () => {
    let served = false;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      body: {
        getReader: () => ({
          read: async () => {
            if (served) return { done: true, value: undefined };
            served = true;
            return { done: false, value: new Uint8Array([1, 2, 3, 4]) };
          },
          cancel: async () => undefined,
        }),
      },
    }) as any;

    const file = await fetchAudioFile('https://8.8.8.8/small.mp3');
    expect(file.size).toBe(4);
  });

  it('surfaces an upstream failure status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as any;

    await expect(fetchAudioFile('https://8.8.8.8/missing.mp3')).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it('throws AudioFetchError, whose name server.ts narrows on', async () => {
    const error = await fetchAudioFile('not a url').catch((e) => e);
    expect(error).toBeInstanceOf(AudioFetchError);
    expect(error.name).toBe('AudioFetchError');
  });
});
