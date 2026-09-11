import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * `scripts/lib/mcp-stdio.mjs` is an ES module and Jest here runs without
 * `--experimental-vm-modules`, so a dynamic import inside the test would fail.
 * Running it in a real node subprocess also gets `readDotEnv`'s
 * `path.resolve('.env')` for free: the fixture is the subprocess's cwd.
 */
const parse = (envFile: string): Record<string, string> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenv-'));
  fs.writeFileSync(path.join(dir, '.env'), envFile);
  const modulePath = path.resolve(
    __dirname,
    '../../../scripts/lib/mcp-stdio.mjs',
  );
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { readDotEnv } from ${JSON.stringify(modulePath)};` +
        'process.stdout.write(JSON.stringify(readDotEnv()));',
    ],
    { cwd: dir, encoding: 'utf8' },
  );
  fs.rmSync(dir, { recursive: true, force: true });
  return JSON.parse(out);
};

describe('readDotEnv', () => {
  it('reads plain assignments', () => {
    expect(
      parse('CARBON_VOICE_BASE_URL=https://api.carbonvoice.app\n'),
    ).toEqual({
      CARBON_VOICE_BASE_URL: 'https://api.carbonvoice.app',
    });
  });

  // The documented flow is `cp .env.sample .env` and swap in your own key. The
  // sample used to carry a trailing `# Only stdio uses it`, and keeping it made
  // every authenticated call fail with a key that had the comment appended.
  it('strips an inline comment from an unquoted value', () => {
    expect(parse('CARBON_VOICE_API_KEY=abc123 # Only stdio uses it\n')).toEqual(
      {
        CARBON_VOICE_API_KEY: 'abc123',
      },
    );
  });

  it('keeps a # that is part of an unquoted value', () => {
    expect(parse('CARBON_VOICE_API_KEY=abc#123\n')).toEqual({
      CARBON_VOICE_API_KEY: 'abc#123',
    });
  });

  it('preserves a quoted value verbatim, comment characters included', () => {
    expect(parse('CARBON_VOICE_API_KEY="abc # 123"\n')).toEqual({
      CARBON_VOICE_API_KEY: 'abc # 123',
    });
  });

  // The end-anchored unquote could not see a quoted value followed by a
  // comment: the line does not end in a quote, so it fell through to the
  // unquoted branch, which stripped the comment and left BOTH quotes in the
  // value. The server then authenticated as `"abc123"` and got a 401.
  it('strips a comment that follows a double-quoted value', () => {
    expect(parse('CARBON_VOICE_API_KEY="abc123" # local credential\n')).toEqual(
      {
        CARBON_VOICE_API_KEY: 'abc123',
      },
    );
  });

  it('strips a comment that follows a single-quoted value', () => {
    expect(parse("CARBON_VOICE_API_KEY='abc123' # local credential\n")).toEqual(
      {
        CARBON_VOICE_API_KEY: 'abc123',
      },
    );
  });

  // The fix must not become "strip the comment first": that would truncate a
  // value whose own content contains a #.
  it('keeps a quoted # while still stripping the comment after it', () => {
    expect(parse('CARBON_VOICE_API_KEY="abc # 123" # a note\n')).toEqual({
      CARBON_VOICE_API_KEY: 'abc # 123',
    });
  });

  // Non-greedy matching must not stop at an interior quote when the line is
  // not actually a quoted value with a trailing comment.
  it('leaves a value with interior quotes and no comment alone', () => {
    expect(parse('CARBON_VOICE_API_KEY="a" and "b"\n')).toEqual({
      CARBON_VOICE_API_KEY: 'a" and "b',
    });
  });

  it('skips commented-out and blank lines', () => {
    expect(parse('# CARBON_VOICE_PAT=cv_pat_xxx\n\nLOG_LEVEL=debug\n')).toEqual(
      {
        LOG_LEVEL: 'debug',
      },
    );
  });

  it('handles an exported assignment', () => {
    expect(parse('export LOG_TRANSPORT=file\n')).toEqual({
      LOG_TRANSPORT: 'file',
    });
  });

  // Guards the fixture the real sample is copied from.
  it('parses the checked-in .env.sample without leaking comments', () => {
    const sample = fs.readFileSync(
      path.resolve(__dirname, '../../../.env.sample'),
      'utf8',
    );
    const parsed = parse(sample);
    Object.entries(parsed).forEach(([key, value]) => {
      expect(value).not.toContain('#');
      expect(value.trim()).toBe(value);
      expect(key).not.toContain('#');
    });
    expect(parsed.CARBON_VOICE_API_KEY).toBe('SUPER_SECRET');
  });
});
