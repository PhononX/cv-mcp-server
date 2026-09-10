import {
  AudioFetchError,
  fetchAudioFile,
  isBlockedAddress,
} from '../../../src/utils/fetch-audio-file';

jest.mock('../../../src/utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
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
      headers: new Headers({ 'content-type': 'audio/mpeg', 'content-length': '10' }),
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
