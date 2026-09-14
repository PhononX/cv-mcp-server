/**
 * Reduces a URL to `host + path` for logging.
 *
 * A caller-supplied `audio_url` is very often a presigned URL — the signature
 * lives in the query string, and userinfo (`https://user:pass@host/`) is legal
 * too. Logging the raw value writes a reusable credential into log files and
 * CloudWatch, where it long outlives the request. Host and path are enough to
 * debug a rejection; the secret parts are not.
 */
export const redactUrlForLog = (raw: string): string => {
  try {
    const url = new URL(raw);
    const hadSecrets = Boolean(url.username || url.password || url.search);
    return `${url.protocol}//${url.host}${url.pathname}${hadSecrets ? ' (credentials/query redacted)' : ''}`;
  } catch {
    // Unparseable: say so rather than echoing whatever was supplied.
    return '(unparseable url redacted)';
  }
};
