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
 * True when an IP sits in address space that should never be reachable from a
 * user-supplied URL — loopback, private ranges, link-local (which covers cloud
 * metadata endpoints such as 169.254.169.254), and unspecified/reserved blocks.
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

  const normalized = ip.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')) return true;
  if (normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique-local
  if (normalized.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) must be judged on the embedded IPv4 address.
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
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
  const host = hostname.toLowerCase();
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
};

const assertUrlIsFetchable = async (raw: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AudioFetchError(`audio_url is not a valid URL: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AudioFetchError(
      `audio_url must use http or https, got "${url.protocol}"`,
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
  const addresses = literal
    ? [host]
    : (await dns.lookup(host, { all: true })).map((a) => a.address);

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
 * Fetches `audio_url` and returns it as a `File` suitable for the generated
 * client's multipart upload. Throws `AudioFetchError` with an agent-actionable
 * message on any rejection.
 */
export const fetchAudioFile = async (rawUrl: string): Promise<File> => {
  const maxBytes = env.AUDIO_FETCH_MAX_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    env.AUDIO_FETCH_TIMEOUT_MS,
  );

  try {
    let target = await assertUrlIsFetchable(rawUrl);
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
        throw new AudioFetchError(
          `audio_url returned ${response.status} with no redirect target`,
        );
      }
      if (hop === MAX_REDIRECTS) {
        throw new AudioFetchError(
          `audio_url exceeded ${MAX_REDIRECTS} redirects`,
        );
      }
      // Re-validate every hop: a public URL is free to redirect inward.
      target = await assertUrlIsFetchable(new URL(location, target).toString());
    }

    if (!response || !response.ok) {
      throw new AudioFetchError(
        `audio_url could not be fetched (HTTP ${response?.status ?? 'unknown'})`,
      );
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
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
      `audio_url could not be fetched: ${(error as Error)?.message ?? 'unknown error'}`,
    );
  } finally {
    clearTimeout(timeout);
  }
};
