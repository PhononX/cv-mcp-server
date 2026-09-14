import {
  AudioFetchError,
  fetchAudioFile,
  ipv6ToBytes,
  isBlockedAddress,
} from '../../../src/utils/fetch-audio-file';

/**
 * Judges an address the way production does: through WHATWG URL parsing.
 *
 * Feeding hand-written strings straight to isBlockedAddress let two real bugs
 * ship. Brackets (URL.hostname keeps them) and canonicalization
 * (`[::ffff:127.0.0.1]` becomes `::ffff:7f00:1`) both happen in the caller, so
 * a test that skips the caller tests a form that cannot occur.
 */
const blockedViaUrl = (url: string): boolean => {
  const hostname = new URL(url).hostname;
  const bare =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  return isBlockedAddress(bare);
};

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
    ['100.127.255.254', 'carrier-grade NAT upper bound'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'limited broadcast'],
    ['240.0.0.1', 'reserved 240/4'],
    // TEST-NET and 6to4 relay space: not routable on the public internet, but
    // deployments do route them internally, which is exactly what makes them
    // reachable targets. All four were classified public before the CIDR table.
    ['192.0.2.1', 'TEST-NET-1'],
    ['198.51.100.5', 'TEST-NET-2'],
    ['203.0.113.9', 'TEST-NET-3'],
    ['192.88.99.1', 'deprecated 6to4 relay anycast'],
    ['192.0.0.1', 'IETF protocol assignments'],
    ['198.18.0.1', 'benchmarking'],
    ['198.19.255.254', 'benchmarking upper bound'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fd00::1', 'IPv6 unique-local'],
    ['fec0::1', 'IPv6 site-local, deprecated but still routed internally'],
    ['feff::1', 'IPv6 site-local upper bound'],
    // IANA IPv6 special-purpose prefixes with no simple bit pattern. Every one
    // of these was classified public until the CIDR table was added — the IPv4
    // sweep fixed its own half and left this one as ad-hoc byte checks.
    ['2001:db8::1', 'documentation, RFC 3849'],
    ['2001:db8:ffff:ffff::1', 'documentation, upper bound'],
    ['3fff::1', 'documentation, RFC 9637'],
    ['3fff:0fff:ffff::1', 'documentation /20 upper bound'],
    ['100::1', 'discard-only'],
    ['100:0:0:0:ffff::1', 'discard-only /64 upper bound'],
    ['2001:2::1', 'benchmarking'],
    ['2001:10::1', 'ORCHID, deprecated'],
    ['2001:1f:ffff::1', 'ORCHID /28 upper bound'],
    ['2001:20::1', 'ORCHIDv2'],
    ['2001:30::1', 'drone remote ID'],
    ['5f00::1', 'SRv6 SIDs'],
    ['5f00:ffff::1', 'SRv6 SIDs /16 upper bound'],
    ['2001::1', 'Teredo — refused deliberately; it embeds an IPv4'],
    // 6to4 embeds its IPv4 at bytes 2-5 (2002:WWXX:YYZZ::/48 is WW.XX.YY.ZZ),
    // not 12-15 like the mapped/compatible/NAT64 forms. Undecoded, these
    // reached internal targets through a URL that looks purely IPv6 — the
    // metadata case below is the one that matters.
    ['2002:a9fe:a9fe::1', '6to4 embedding 169.254.169.254, cloud metadata'],
    ['2002:7f00:0001::1', '6to4 embedding 127.0.0.1'],
    ['2002:0a00:0001::1', '6to4 embedding 10.0.0.1'],
    ['2002:c0a8:0101::1', '6to4 embedding 192.168.1.1'],
    ['2002::1', '6to4 embedding 0.0.0.0'],
    // Outside 2000::/3, the only range allocated for global unicast. These are
    // unallocated rather than special-purpose, so no registry enumeration
    // reaches them — only the positive test does. 3ffe::/16 is former 6bone,
    // returned to IANA; the earlier suite asserted it REACHABLE.
    ['3ffe:ffff::1', '6bone, returned to IANA'],
    ['3ffe::1', '6bone lower bound'],
    ['4000::1', 'unallocated, outside 2000::/3'],
    ['6000::1', 'unallocated, outside 2000::/3'],
    ['8000::1', 'unallocated, outside 2000::/3'],
    ['c000::1', 'unallocated, outside 2000::/3'],
    ['e000::1', 'unallocated, outside 2000::/3'],
    ['f000::1', 'unallocated, outside 2000::/3'],
    ['1000::1', 'unallocated, just below 2000::/3'],
    // Just outside their enumerated prefixes, yet still blocked — because
    // 100::/64 and 5f00::/16 both sit outside 2000::/3, so the global-unicast
    // test covers their neighbourhood and those two table rows are now
    // redundant. They are kept as registry documentation, not as load-bearing
    // checks. Under the old deny-list these two addresses were asserted
    // REACHABLE, which is what "outside a blocked prefix" used to imply.
    ['101::1', 'just above the discard-only /64, still outside 2000::/3'],
    ['5f01::1', 'just above the SRv6 /16, still outside 2000::/3'],
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
    ['100.63.255.255', 'just below the carrier-grade NAT range'],
    ['100.128.0.1', 'just above the carrier-grade NAT range'],
    ['198.17.255.255', 'just below the benchmarking range'],
    ['198.20.0.1', 'just above the benchmarking range'],
    ['223.255.255.255', 'just below multicast'],
    // A /1../31 mask is a negative int32 in JS. Without the unsigned coercion
    // in `inIpv4Block`, every address at or above 128.0.0.0 is misjudged.
    ['129.0.0.1', 'above 128.0.0.0, where a signed mask would misjudge'],
    // The registry marks these globally reachable despite sitting among the
    // special-purpose blocks, so the table must not sweep them up.
    ['192.31.196.1', 'AS112-v4, globally reachable'],
    ['192.175.48.1', 'direct delegation AS112, globally reachable'],
    // The old octet check blocked all of 192.0.0.0/16 as a side effect of
    // testing only the first two octets. Only /24s inside it are reserved.
    ['192.0.1.1', 'inside 192.0/16 but not a reserved /24'],
    ['2606:4700::1111', 'public IPv6'],
    ['2000::1', 'global unicast lower bound'],
    ['2a00::1', 'ordinary RIR-allocated space'],
    // The embedded-IPv4 forms all sit OUTSIDE 2000::/3, so they must be
    // resolved before the global-unicast test or a public embedded address
    // would be refused. These prove that ordering.
    ['::ffff:8.8.8.8', 'IPv4-mapped public address'],
    ['64:ff9b::8.8.8.8', 'NAT64-wrapped public address'],
    // Marked globally reachable by the registry despite sitting among the
    // special-purpose ranges. Listing the specific blocked sub-prefixes rather
    // than the enclosing 2001::/23 is what keeps these working.
    ['2001:4:112::1', 'AS112-v6, globally reachable'],
    ['2620:4f:8000::1', 'direct delegation AS112, globally reachable'],
    // Just outside each blocked prefix — these prove the masks are the right
    // width rather than merely blocking something.
    ['3fff:1000::1', 'just above the documentation /20'],
    ['3fff:1000::1', 'just above the documentation /20, still global unicast'],
    ['2001:f::1', 'just below the ORCHID /28'],
    ['2001:40::1', 'just above the ORCHIDv2 /28'],

    // 6to4 is re-judged on its embedded IPv4, not blanket-refused: one
    // wrapping a public address stays reachable.
    ['2002:0808:0808::1', '6to4 embedding 8.8.8.8'],
    ['2002:5db8:d822::1', '6to4 embedding 93.184.216.34'],
  ])('allows %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('SSRF guard through real URL parsing', () => {
  // The forms an attacker would actually use. Each of these bypassed the guard
  // before the byte-level rewrite, because WHATWG URL canonicalizes an
  // IPv4-mapped literal to hex and the old dotted-decimal regex never matched.
  it.each([
    ['http://[::ffff:127.0.0.1]/a.mp3', 'IPv4-mapped loopback'],
    ['http://[::ffff:169.254.169.254]/a.mp3', 'IPv4-mapped cloud metadata'],
    ['http://[::ffff:10.0.0.1]/a.mp3', 'IPv4-mapped private 10/8'],
    ['http://[::ffff:172.16.0.1]/a.mp3', 'IPv4-mapped private 172.16/12'],
    ['http://[::ffff:192.168.1.1]/a.mp3', 'IPv4-mapped private 192.168/16'],
    ['http://[::127.0.0.1]/a.mp3', 'IPv4-compatible loopback (deprecated)'],
    ['http://[::1]/a.mp3', 'IPv6 loopback'],
    ['http://[fe80::1]/a.mp3', 'IPv6 link-local'],
    ['http://[fd00::1]/a.mp3', 'IPv6 unique-local'],
    ['https://[fec0::1]/a.mp3', 'IPv6 site-local (RFC 3879, still routed)'],
    ['http://[ff02::1]/a.mp3', 'IPv6 multicast'],
    ['http://127.0.0.1/a.mp3', 'IPv4 loopback'],
    ['http://169.254.169.254/a.mp3', 'IPv4 cloud metadata'],
    // RFC 8215 local-use NAT64. Behind DNS64 an internal hostname resolves to a
    // synthesized address in this range; the embedded IPv4 can sit at several
    // offsets depending on the network's prefix length, so the whole /48 is
    // refused rather than guessing where to look.
    ['https://[64:ff9b:1::7f00:1]/a.mp3', 'NAT64 local-use, loopback embedded'],
    [
      'https://[64:ff9b:1::a9fe:a9fe]/a.mp3',
      'NAT64 local-use, metadata embedded',
    ],
    ['https://[64:ff9b:1:0:0:0:a00:1]/a.mp3', 'NAT64 local-use, private 10/8'],
    [
      'https://[64:ff9b:1::1]/a.mp3',
      'NAT64 local-use, any address in the range',
    ],
    // The well-known prefix stays decided by its embedded IPv4.
    ['https://[64:ff9b::7f00:1]/a.mp3', 'NAT64 well-known, loopback embedded'],
  ])('blocks %s (%s)', (url) => {
    expect(blockedViaUrl(url)).toBe(true);
  });

  it.each([
    ['https://[2606:4700::1111]/a.mp3', 'public IPv6'],
    ['https://[2001:4860:4860::8888]/a.mp3', 'public IPv6 DNS'],
    ['https://[::ffff:8.8.8.8]/a.mp3', 'IPv4-mapped PUBLIC address'],
    ['https://8.8.8.8/a.mp3', 'public IPv4'],
  ])('allows %s (%s)', (url) => {
    expect(blockedViaUrl(url)).toBe(false);
  });

  it('blocks NAT64-embedded private space', () => {
    // 64:ff9b::/96 translates to IPv4, so it must be judged on the embedded
    // address rather than treated as ordinary public IPv6.
    expect(isBlockedAddress('64:ff9b::7f00:1')).toBe(true);
    expect(isBlockedAddress('64:ff9b::a9fe:a9fe')).toBe(true);
  });

  it('blocks an IPv6 address it cannot parse rather than guessing', () => {
    expect(isBlockedAddress('not-an-address')).toBe(true);
  });
});

describe('ipv6ToBytes', () => {
  it('expands a compressed address to 16 bytes', () => {
    expect(ipv6ToBytes('::1')).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]);
  });

  it('expands the canonical hex form of an IPv4-mapped address', () => {
    // What URL parsing actually hands us for [::ffff:127.0.0.1].
    expect(ipv6ToBytes('::ffff:7f00:1')?.slice(10)).toEqual([
      0xff, 0xff, 127, 0, 0, 1,
    ]);
  });

  it('expands the dotted-quad form to the same bytes', () => {
    expect(ipv6ToBytes('::ffff:127.0.0.1')).toEqual(
      ipv6ToBytes('::ffff:7f00:1'),
    );
  });

  it('expands a full uncompressed address', () => {
    expect(ipv6ToBytes('2001:0db8:0000:0000:0000:0000:0000:0001')).toEqual(
      ipv6ToBytes('2001:db8::1'),
    );
  });

  it('strips a zone identifier', () => {
    expect(ipv6ToBytes('fe80::1%eth0')).toEqual(ipv6ToBytes('fe80::1'));
  });

  it.each([
    ['1::2::3', 'two compression markers'],
    ['gggg::1', 'non-hex group'],
    ['1:2:3:4:5:6:7', 'too few groups without ::'],
    ['1:2:3:4:5:6:7:8:9', 'too many groups'],
    ['::ffff:999.0.0.1', 'octet out of range'],
  ])('rejects %s (%s)', (addr) => {
    expect(ipv6ToBytes(addr)).toBeNull();
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
      fetchAudioFile('https://127.0.0.1/internal.mp3'),
    ).rejects.toThrow(/non-public address/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects the cloud metadata endpoint without making a request', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    await expect(
      fetchAudioFile('https://169.254.169.254/latest/meta-data/'),
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
      headers: new Headers({ location: 'https://169.254.169.254/latest/' }),
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

  it('bounds DNS resolution by the fetch timeout', async () => {
    // Codex finding on PR #6: dns.lookup takes no AbortSignal, so aborting the
    // fetch controller does nothing to a stalled resolver — a caller-supplied
    // hostname could hold the tool call well past AUDIO_FETCH_TIMEOUT_MS.
    const dns = require('node:dns/promises');
    const hang = jest
      .spyOn(dns, 'lookup')
      .mockImplementation(() => new Promise(() => undefined));
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    const started = Date.now();
    await expect(
      fetchAudioFile('https://slow-resolver.example.com/memo.mp3'),
    ).rejects.toThrow(/timed out/);

    // Bounded by the configured timeout, not left hanging on the resolver.
    expect(Date.now() - started).toBeLessThan(35_000);
    expect(fetchSpy).not.toHaveBeenCalled();
    hang.mockRestore();
  }, 40_000);

  it('does not echo the supplied URL in the invalid-URL error', async () => {
    // That message is logged, and an audio_url is commonly presigned.
    const error = await fetchAudioFile(
      'not a url ?X-Amz-Signature=secret',
    ).catch((e) => e);
    expect(error.message).not.toContain('secret');
    expect(error.message).toBe('audio_url is not a valid URL');
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

  // Node's own rejection reads "Request cannot be constructed from a URL that
  // includes credentials: <the whole URL>", and that message is interpolated
  // into AudioFetchError and logged as `reason` by server.ts. Rejecting during
  // validation keeps the password out of the logs entirely.
  it('rejects a URL with embedded credentials without making a request', async () => {
    const spy = jest.fn();
    global.fetch = spy as any;

    const error = await fetchAudioFile(
      'https://alice-keyid:sup3rs3cret@8.8.8.8/audio.mp3',
    ).catch((e) => e);

    expect(error).toBeInstanceOf(AudioFetchError);
    expect(error.message).toMatch(/must not embed credentials/);
    expect(error.message).not.toContain('sup3rs3cret');
    expect(error.message).not.toContain('alice-keyid');
    expect(error.message).not.toContain('8.8.8.8');
    expect(spy).not.toHaveBeenCalled();
  });

  it('strips credentials out of an interpolated upstream message', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new Error(
          'Request cannot be constructed from a URL that includes credentials: https://user:sup3rs3cret@8.8.8.8/a.mp3',
        ),
      ) as any;

    const error = await fetchAudioFile('https://8.8.8.8/a.mp3').catch((e) => e);

    expect(error.message).not.toContain('sup3rs3cret');
    expect(error.message).toContain('<credentials redacted>@');
  });

  // Throwing without consuming or cancelling leaves undici holding the
  // connection, and the abort timer is cleared in `finally` — so nothing else
  // closes it.
  it('cancels the body when the declared length is over the cap', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(999_999_999) }),
      body: { cancel, getReader: () => ({ read: jest.fn() }) },
    }) as any;

    await expect(fetchAudioFile('https://8.8.8.8/big.mp3')).rejects.toThrow(
      /above the .*-byte limit/,
    );
    expect(cancel).toHaveBeenCalled();
  });

  it('cancels the body on an upstream failure status', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      body: { cancel, getReader: () => ({ read: jest.fn() }) },
    }) as any;

    await expect(fetchAudioFile('https://8.8.8.8/missing.mp3')).rejects.toThrow(
      /HTTP 404/,
    );
    expect(cancel).toHaveBeenCalled();
  });

  // The address checks are a time-of-check/time-of-use pair — fetch resolves
  // the hostname again when it connects — so a caller controlling DNS can
  // rebind between the two. TLS closes that in practice (the rebound internal
  // host cannot present a certificate for the attacker's hostname), which is
  // why plain http needs an explicit allowlist entry.
  it('refuses plain http when no allowlist is configured', async () => {
    const spy = jest.fn();
    global.fetch = spy as any;

    const error = await fetchAudioFile('http://example.com/a.mp3').catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(AudioFetchError);
    expect(error.message).toMatch(/must use https/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('still accepts https when no allowlist is configured', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => Buffer.from('ID3audio').buffer,
    }) as any;

    await expect(
      fetchAudioFile('https://8.8.8.8/a.mp3'),
    ).resolves.toBeInstanceOf(File);
  });

  it('throws AudioFetchError, whose name server.ts narrows on', async () => {
    const error = await fetchAudioFile('not a url').catch((e) => e);
    expect(error).toBeInstanceOf(AudioFetchError);
    expect(error.name).toBe('AudioFetchError');
  });
});
