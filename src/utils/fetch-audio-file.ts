import { File } from 'node:buffer';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';

import { logger } from './logger';

import { env } from '../config';

/**
 * Fetches an audio file from a caller-supplied URL so it can be forwarded to
 * the Carbon Voice multipart upload endpoint.
 *
 * MCP is JSON-RPC, so an agent can never hand us a `File`. Accepting a URL and
 * fetching it server-side is the only way to make audio upload reachable — but
 * it also turns this server into a fetcher of arbitrary URLs, so every request
 * is constrained:
 *
 *  - scheme must be http/https
 *  - every hop's host is DNS-resolved and rejected if it lands in private,
 *    loopback, link-local, multicast or otherwise reserved address space
 *  - redirects are followed manually, re-validating each hop
 *  - an optional hostname allowlist (`AUDIO_FETCH_ALLOWED_HOSTS`) can restrict
 *    fetches to known-good origins entirely
 *  - size is capped both by `content-length` and while streaming
 *  - the whole operation is bounded by a timeout
 *
 * Residual risk: between validating a resolved IP and connecting by hostname
 * there is a DNS-rebinding window. Closing it fully means pinning the socket to
 * the validated IP. Set `AUDIO_FETCH_ALLOWED_HOSTS` in production to remove the
 * exposure instead.
 */

const MAX_REDIRECTS = 3;

/**
 * Rejects if `work` outlives `ms`.
 *
 * `dns.lookup` takes no AbortSignal, so aborting the fetch controller does
 * nothing to a stalled resolver — a caller-supplied hostname could hold a tool
 * call well past AUDIO_FETCH_TIMEOUT_MS, and past it again on every redirect
 * hop. The deadline has to cover resolution too, not just the transfer.
 */
const withDeadline = async <T>(
  work: Promise<T>,
  ms: number,
  message: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AudioFetchError(message)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

/** Extensions the upstream endpoint documents as supported. */
const SUPPORTED_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.wav',
  '.aac',
  '.ogg',
  '.flac',
  '.wma',
  '.opus',
  '.webm',
];

export class AudioFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioFetchError';
  }
}

/**
 * Expands an IPv6 address to its 16 bytes, or null if it does not parse.
 *
 * Needed because string prefix matching is not sound against the forms WHATWG
 * URL actually produces: `http://[::ffff:127.0.0.1]/` canonicalizes to
 * `::ffff:7f00:1`, so a regex looking for dotted-decimal never fires and the
 * address reads as ordinary public space. Byte comparison has no such blind
 * spot.
 */
export const ipv6ToBytes = (input: string): number[] | null => {
  let addr = input.split('%')[0].toLowerCase();

  // A trailing dotted quad (`::ffff:127.0.0.1`) is legal syntax; fold it into
  // two hex groups so the rest of the parse is uniform.
  const dotted = addr.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const octets = dotted[2].split('.').map(Number);
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
      return null;
    }
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    addr = `${dotted[1]}${hi}:${lo}`;
  }

  const halves = addr.split('::');
  if (halves.length > 2) {
    return null;
  }

  const head = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  let groups: string[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const tail = halves[1] ? halves[1].split(':').filter(Boolean) : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0) {
      return null;
    }
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  }

  if (groups.length !== 8) {
    return null;
  }

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
};

/**
 * True when an IP sits in address space that should never be reachable from a
 * user-supplied URL — loopback, private ranges, link-local (which covers cloud
 * metadata endpoints such as 169.254.169.254), and unspecified/reserved blocks.
 *
 * IPv6 is judged on bytes rather than string prefixes, and any address that
 * embeds an IPv4 address — IPv4-mapped (`::ffff:0:0/96`), the deprecated
 * IPv4-compatible (`::/96`), or NAT64 (`64:ff9b::/96`) — is re-judged on the
 * embedded IPv4. Without that, `[::ffff:169.254.169.254]` reaches the metadata
 * service through a guard that believes it is public.
 */
export const isBlockedAddress = (ip: string): boolean => {
  const version = net.isIP(ip);
  if (version === 0) {
    return true;
  }

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 192 && b === 0) return true; // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  const bytes = ipv6ToBytes(ip);
  if (!bytes) {
    // Validated as IPv6 by net.isIP but unparseable here: refuse rather than
    // guess.
    return true;
  }

  const zeros = (from: number, to: number) =>
    bytes.slice(from, to).every((byte) => byte === 0);

  // Any address embedding an IPv4 address is decided by that address.
  const isIpv4Mapped = zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff;
  const isIpv4Compatible = zeros(0, 12);
  // The well-known NAT64 prefix, RFC 6052 — 64:ff9b::/96, embedded IPv4 in the
  // last 32 bits.
  const isWellKnownNat64 =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    zeros(4, 12);

  if (isIpv4Mapped || isIpv4Compatible || isWellKnownNat64) {
    return isBlockedAddress(bytes.slice(12).join('.'));
  }

  // 64:ff9b:1::/48 — RFC 8215's LOCAL-USE NAT64 range. Behind DNS64 an internal
  // hostname can resolve to a synthesized address in here whose embedded IPv4
  // is private or link-local. Unlike the well-known prefix above, the embedded
  // address can sit at several offsets (RFC 6052 allows /32, /40, /48, /56,
  // /64 and /96 network-specific prefixes) and we cannot know which the local
  // network uses — so rather than guess where to look, refuse the whole range.
  // It is reserved for local use, so nothing reachable through it is a
  // legitimate public audio source.
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes[4] === 0x00 &&
    bytes[5] === 0x01
  ) {
    return true;
  }

  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (bytes[0] === 0xff) return true; // ff00::/8 multicast

  return false;
};

/**
 * WHATWG `URL.hostname` keeps the square brackets on an IPv6 literal, so
 * `https://[2606:4700::1111]/a.mp3` yields `[2606:4700::1111]`. Left as-is,
 * `net.isIP` returns 0, the value is treated as a DNS name, the lookup fails,
 * and every public IPv6-literal URL is rejected. Brackets belong in the URL,
 * not in an address we are about to test or resolve.
 */
const bareHostname = (hostname: string): string =>
  hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

const isHostAllowlisted = (hostname: string): boolean => {
  const allowed = env.AUDIO_FETCH_ALLOWED_HOSTS;
  if (allowed.length === 0) {
    return true;
  }
  // Compare bare hostnames. `url.hostname` keeps the brackets on an IPv6
  // literal, so without this an allowlisted IPv6 origin never matches its own
  // entry and is refused. Entries are normalized too, since an operator may
  // reasonably write either form.
  const host = bareHostname(hostname).toLowerCase();
  return allowed.some((raw) => {
    const entry = bareHostname(raw).toLowerCase();
    return host === entry || host.endsWith(`.${entry}`);
  });
};

/**
 * Strips `user:password@` out of any URL embedded in an upstream error message.
 *
 * `assertUrlIsFetchable` rejects credential-bearing URLs before fetch sees
 * them, so the known leak is already closed; this is the backstop for any other
 * upstream message that quotes the URL, because these messages are interpolated
 * into `AudioFetchError` and logged.
 */
const stripUrlCredentials = (message: string): string =>
  message.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/g,
    '$1<credentials redacted>@',
  );

const assertUrlIsFetchable = async (
  raw: string,
  deadlineAt: number,
): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Deliberately does not echo `raw`: it may be a presigned URL, and this
    // message reaches the logs.
    throw new AudioFetchError('audio_url is not a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AudioFetchError(
      `audio_url must use http or https, got "${url.protocol}"`,
    );
  }

  // Plain http is refused unless the host is explicitly allowlisted.
  //
  // The address checks below are a time-of-check/time-of-use pair: we resolve
  // the hostname and validate what comes back, then `fetch` resolves it AGAIN
  // on its own. A caller who controls the hostname's DNS can answer our lookup
  // with a public address and fetch's lookup with an internal one, and the
  // guard never sees it (DNS rebinding).
  //
  // TLS is what closes that in practice: on https, the rebound internal host
  // has to present a certificate valid for the ATTACKER'S hostname, which an
  // internal service will not have, so the handshake fails before any request
  // is sent. On plain http there is no such check, which is why the bypass is
  // an http-only attack and why http now needs an explicit allowlist entry —
  // at which point rebinding requires controlling DNS for a host the operator
  // named.
  //
  // This narrows the window rather than closing it; pinning the connection to
  // the validated address is the complete fix. See the note in fetchAudioFile.
  if (url.protocol === 'http:' && env.AUDIO_FETCH_ALLOWED_HOSTS.length === 0) {
    throw new AudioFetchError(
      'audio_url must use https. Plain http is accepted only for hosts named in AUDIO_FETCH_ALLOWED_HOSTS.',
    );
  }

  // Reject userinfo HERE rather than letting fetch do it. Node's own rejection
  // reads "Request cannot be constructed from a URL that includes credentials:
  // <the whole URL>", and that message is interpolated into AudioFetchError and
  // logged as `reason` — so deferring to fetch would put the password in the
  // logs, defeating the URL redaction. The message below names neither.
  if (url.username || url.password) {
    throw new AudioFetchError(
      'audio_url must not embed credentials (user:password@); use a presigned URL or a plain link',
    );
  }

  if (!isHostAllowlisted(url.hostname)) {
    throw new AudioFetchError(
      `audio_url host "${url.hostname}" is not in the configured allowlist`,
    );
  }

  // A literal IP needs no lookup; a hostname must be resolved and every
  // returned address checked, since one bad answer is enough to reach
  // internal infrastructure.
  const host = bareHostname(url.hostname);
  const literal = net.isIP(host);
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    throw new AudioFetchError('audio_url fetch timed out before resolution');
  }
  const addresses = literal
    ? [host]
    : (
        await withDeadline(
          dns.lookup(host, { all: true }),
          remaining,
          `audio_url host resolution timed out after ${env.AUDIO_FETCH_TIMEOUT_MS}ms`,
        )
      ).map((a) => a.address);

  if (addresses.length === 0) {
    throw new AudioFetchError(
      `audio_url host "${url.hostname}" could not be resolved`,
    );
  }

  const blocked = addresses.find(isBlockedAddress);
  if (blocked) {
    throw new AudioFetchError(
      `audio_url host "${url.hostname}" resolves to a non-public address (${blocked}) and will not be fetched`,
    );
  }

  return url;
};

const deriveFilename = (url: URL): string => {
  const base = path.basename(url.pathname) || 'audio';
  const ext = path.extname(base).toLowerCase();
  if (SUPPORTED_EXTENSIONS.includes(ext)) {
    return base;
  }
  return `${base.replace(/\.[^.]*$/, '') || 'audio'}.mp3`;
};

/**
 * Reads a response body, aborting as soon as the accumulated size exceeds
 * `maxBytes`. Bounds peak memory to roughly the cap regardless of what the
 * server claims in `content-length`.
 */
const readCapped = async (
  response: Response,
  maxBytes: number,
): Promise<Buffer> => {
  const reader = response.body?.getReader();
  if (!reader) {
    // No readable stream (e.g. a 204). Fall back, bounded by the same cap.
    const fallback = Buffer.from(await response.arrayBuffer());
    if (fallback.byteLength > maxBytes) {
      throw new AudioFetchError(
        `audio_url is ${fallback.byteLength} bytes, above the ${maxBytes}-byte limit`,
      );
    }
    return fallback;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop pulling bytes we have already decided to reject.
        await reader.cancel().catch(() => undefined);
        throw new AudioFetchError(
          `audio_url exceeds the ${maxBytes}-byte limit (aborted after ${total} bytes)`,
        );
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
};

/**
 * Releases a response body we have decided not to read.
 *
 * Throwing without consuming or cancelling leaves undici holding the
 * connection open until GC, and the abort timer is cleared in `finally`, so
 * nothing else will close it. Repeated oversized or error responses would
 * accumulate sockets and stall later fetches.
 */
const discardBody = async (response?: Response): Promise<void> => {
  await response?.body?.cancel().catch(() => undefined);
};

/**
 * Fetches `audio_url` and returns it as a `File` suitable for the generated
 * client's multipart upload. Throws `AudioFetchError` with an agent-actionable
 * message on any rejection.
 */
// KNOWN LIMITATION — DNS rebinding.
//
// `assertUrlIsFetchable` resolves the hostname and validates every address it
// gets back, then `fetch` performs its OWN resolution when it connects. Nothing
// guarantees the two lookups agree, so a caller who controls the hostname's DNS
// can pass our check with a public address and have fetch connect to a private
// one. Closing it completely means pinning the connection to the address we
// validated — supplying a custom `lookup` to the connection layer while keeping
// the original hostname for the Host header and TLS SNI — which Node's global
// `fetch` cannot express without an undici dispatcher.
//
// Until then two things narrow it: https is required unless the operator
// allowlists the host (see `assertUrlIsFetchable` — TLS makes the rebound
// address fail certificate validation), and `AUDIO_FETCH_ALLOWED_HOSTS`
// restricts which hosts are reachable at all.
export const fetchAudioFile = async (rawUrl: string): Promise<File> => {
  const maxBytes = env.AUDIO_FETCH_MAX_BYTES;
  const deadlineAt = Date.now() + env.AUDIO_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    env.AUDIO_FETCH_TIMEOUT_MS,
  );

  try {
    let target = await assertUrlIsFetchable(rawUrl, deadlineAt);
    let response: Response | undefined;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(target, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.8' },
      });

      if (response.status < 300 || response.status >= 400) {
        break;
      }

      const location = response.headers.get('location');
      if (!location) {
        await discardBody(response);
        throw new AudioFetchError(
          `audio_url returned ${response.status} with no redirect target`,
        );
      }
      if (hop === MAX_REDIRECTS) {
        await discardBody(response);
        throw new AudioFetchError(
          `audio_url exceeded ${MAX_REDIRECTS} redirects`,
        );
      }
      // The redirect response itself is finished with; the next hop opens its
      // own.
      await discardBody(response);
      // Re-validate every hop: a public URL is free to redirect inward.
      target = await assertUrlIsFetchable(
        new URL(location, target).toString(),
        deadlineAt,
      );
    }

    if (!response || !response.ok) {
      await discardBody(response);
      throw new AudioFetchError(
        `audio_url could not be fetched (HTTP ${response?.status ?? 'unknown'})`,
      );
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await discardBody(response);
      throw new AudioFetchError(
        `audio_url is ${declaredLength} bytes, above the ${maxBytes}-byte limit`,
      );
    }

    // content-length can lie or be absent, so enforce the cap on real bytes —
    // and do it WHILE reading. Buffering the whole body first (arrayBuffer())
    // and checking afterwards means an unbounded chunked response can exhaust
    // the heap before the check ever runs, which makes the limit decorative.
    const buffer = await readCapped(response, maxBytes);
    if (buffer.byteLength === 0) {
      throw new AudioFetchError('audio_url returned an empty file');
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0].trim() ||
      'application/octet-stream';
    const filename = deriveFilename(target);

    logger.debug('Fetched audio file for voicememo upload', {
      host: target.hostname,
      bytes: buffer.byteLength,
      contentType,
      filename,
    });

    return new File([buffer], filename, { type: contentType });
  } catch (error) {
    if (error instanceof AudioFetchError) {
      throw error;
    }
    if ((error as Error)?.name === 'AbortError') {
      throw new AudioFetchError(
        `audio_url fetch timed out after ${env.AUDIO_FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw new AudioFetchError(
      `audio_url could not be fetched: ${stripUrlCredentials(
        (error as Error)?.message ?? 'unknown error',
      )}`,
    );
  } finally {
    clearTimeout(timeout);
  }
};
