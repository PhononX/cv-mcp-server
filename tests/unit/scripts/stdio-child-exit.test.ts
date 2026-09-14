import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * `scripts/lib/mcp-stdio.mjs` is an ES module and jest here runs without
 * `--experimental-vm-modules`, so it is driven from a real node subprocess.
 */
const MODULE = path.resolve(__dirname, '../../../scripts/lib/mcp-stdio.mjs');

const runAgainstServer = (
  serverSource: string,
  timeoutMs: number,
  callAfterConnect = false,
): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stdio-exit-'));
  const serverPath = path.join(dir, 'server.mjs');
  fs.writeFileSync(serverPath, serverSource);
  try {
    return execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { connect } from ${JSON.stringify(MODULE)};` +
          `const started = Date.now();` +
          `connect({ serverPath: ${JSON.stringify(serverPath)}, timeoutMs: ${timeoutMs} })` +
          (callAfterConnect
            ? `  .then((c) => new Promise((r) => setTimeout(r, 120)).then(() => c.call('tools/list')))` +
              `  .then(() => process.stdout.write('RESOLVED'))`
            : `  .then(() => process.stdout.write('RESOLVED'))`) +
          `  .catch((e) => process.stdout.write(` +
          `    JSON.stringify({ message: e.message, elapsed: Date.now() - started })` +
          `  ));`,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe('connect() when the spawned server dies', () => {
  // The real server calls process.exit(1) on invalid configuration, so this is
  // what a mistyped .env actually does: the child spawns fine, then exits.
  // Before the exit handler, the pending initialize sat until the full timeout.
  it('rejects immediately instead of waiting out the timeout', () => {
    const out = runAgainstServer(
      "process.stderr.write('bad config\\n'); process.exit(1);",
      10_000,
    );
    const result = JSON.parse(out);

    expect(result.message).toMatch(/MCP server exited \(code 1\)/);
    expect(result.message).toMatch(/check \.env/);
    // The point of the fix: it must not sit on the timeout. Generous bound so
    // a slow CI runner cannot make this flaky, but far below the 10s timeout.
    expect(result.elapsed).toBeLessThan(5_000);
  });

  // The gap Codex found in the first version of this fix: the exit was only
  // recorded when it caught a call in flight. A server that answers
  // `initialize` and then dies left `exitError` unset, so the NEXT call wrote
  // to a dead stdin and waited out the whole timeout.
  it('fails a later call when the server died between calls', () => {
    const out = runAgainstServer(
      // Answer initialize so connect() resolves, then exit before any tool call.
      `let buf = '';
       process.stdin.on('data', (c) => {
         buf += c.toString();
         if (buf.includes('"initialize"')) {
           process.stdout.write(
             JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\\n',
           );
           setTimeout(() => process.exit(3), 20);
         }
       });`,
      10_000,
      // Connect succeeds here, so the probe must go on to make a second call.
      true,
    );
    const result = JSON.parse(out);

    expect(result.message).toMatch(/MCP server exited \(code 3\)/);
    expect(result.elapsed).toBeLessThan(5_000);
  });

  it('reports the signal when the child is killed rather than exiting', () => {
    const out = runAgainstServer(
      'process.kill(process.pid, "SIGKILL");',
      10_000,
    );
    const result = JSON.parse(out);

    expect(result.message).toMatch(/MCP server exited \(signal SIGKILL\)/);
    expect(result.elapsed).toBeLessThan(5_000);
  });
});
