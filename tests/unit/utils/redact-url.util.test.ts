import { redactUrlForLog } from '../../../src/utils/redact-url.util';

describe('redactUrlForLog', () => {
  // Codex finding on PR #6: a rejected audio_url was logged raw at warn level.
  // These are commonly presigned, so the signature became a reusable
  // credential sitting in log files and CloudWatch.
  it('strips a presigned query string but keeps host and path', () => {
    expect(
      redactUrlForLog(
        'https://bucket.s3.amazonaws.com/audio/memo.mp3?X-Amz-Signature=deadbeef&X-Amz-Expires=3600',
      ),
    ).toBe(
      'https://bucket.s3.amazonaws.com/audio/memo.mp3 (credentials/query redacted)',
    );
  });

  it('strips userinfo credentials', () => {
    const out = redactUrlForLog('https://user:secret@example.com/memo.mp3');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('user');
    expect(out).toContain('example.com/memo.mp3');
  });

  it('leaves a URL with no secrets readable and unflagged', () => {
    expect(redactUrlForLog('https://example.com/audio/memo.mp3')).toBe(
      'https://example.com/audio/memo.mp3',
    );
  });

  it('keeps a non-default port, which matters for debugging', () => {
    expect(redactUrlForLog('http://example.com:8080/a.mp3')).toBe(
      'http://example.com:8080/a.mp3',
    );
  });

  it('does not echo an unparseable value', () => {
    expect(redactUrlForLog('not a url ?sig=secret')).toBe(
      '(unparseable url redacted)',
    );
  });
});
