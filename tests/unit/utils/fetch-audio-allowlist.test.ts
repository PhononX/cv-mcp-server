/**
 * `AUDIO_FETCH_ALLOWED_HOSTS` is read from the validated env at module load, so
 * these live in their own file with the config mocked — the main suite runs
 * with an empty allowlist and must keep doing so.
 */
const ALLOWED: string[] = [];

jest.mock('../../../src/config', () => ({
  env: {
    get AUDIO_FETCH_ALLOWED_HOSTS() {
      return ALLOWED;
    },
    AUDIO_FETCH_MAX_BYTES: 26_214_400,
    AUDIO_FETCH_TIMEOUT_MS: 30_000,
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
const { fetchAudioFile } = require('../../../src/utils/fetch-audio-file');

const setAllowlist = (...entries: string[]) => {
  ALLOWED.length = 0;
  ALLOWED.push(...entries);
};

const reject = async (url: string): Promise<string> => {
  const error = await fetchAudioFile(url).catch((e: Error) => e);
  return error instanceof Error ? error.message : '';
};

describe('AUDIO_FETCH_ALLOWED_HOSTS matching', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => Buffer.from('ID3audio').buffer,
    }) as never;
  });

  afterEach(() => setAllowlist());

  // `url.hostname` keeps the brackets on an IPv6 literal, so comparing it raw
  // meant an allowlisted IPv6 origin never matched its own entry.
  it('matches an IPv6 literal entry written bare', async () => {
    setAllowlist('2606:4700::1111');

    await expect(
      fetchAudioFile('https://[2606:4700::1111]/a.mp3'),
    ).resolves.toBeDefined();
  });

  it('matches an IPv6 literal entry written with brackets', async () => {
    setAllowlist('[2606:4700::1111]');

    await expect(
      fetchAudioFile('https://[2606:4700::1111]/a.mp3'),
    ).resolves.toBeDefined();
  });

  it('still refuses an IPv6 literal that is not on the list', async () => {
    setAllowlist('2606:4700::1111');

    expect(await reject('https://[2001:4860:4860::8888]/a.mp3')).toMatch(
      /not in the configured allowlist/,
    );
  });

  it('still refuses a private address even when its host is allowlisted', async () => {
    setAllowlist('[::1]');

    expect(await reject('https://[::1]/a.mp3')).toMatch(/non-public address/);
  });

  it('permits plain http for an allowlisted host', async () => {
    setAllowlist('cdn.example.com', '8.8.8.8');

    await expect(fetchAudioFile('http://8.8.8.8/a.mp3')).resolves.toBeDefined();
  });

  it('matches ordinary hostnames and their subdomains', async () => {
    setAllowlist('example.com');

    expect(await reject('https://other.test/a.mp3')).toMatch(
      /not in the configured allowlist/,
    );
  });
});
