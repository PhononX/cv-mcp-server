/**
 * Shared stdio MCP client plumbing for the dev scripts.
 *
 * Spawns the built server, completes the handshake, and returns a `call`
 * function. Used by scripts/mcp-client.mjs and scripts/mcp-smoke.mjs.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const SERVER_PATH = path.resolve('dist/transports/stdio/stdio.js');

export const assertBuilt = () => {
  if (!fs.existsSync(SERVER_PATH)) {
    console.error(`Not built: ${SERVER_PATH}\nRun: npm run build`);
    process.exit(1);
  }
};

/**
 * Reads .env without adding a dependency. The server itself never loads .env —
 * it reads plain process.env — so the scripts do it, which is why they work
 * where a raw client spawn would not.
 */
export const readDotEnv = () => {
  const file = path.resolve('.env');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // The quote and any trailing comment must be matched TOGETHER. Unquoting
    // first with an end-anchored pattern fails on `KEY="secret" # note` — the
    // line does not end in a quote — and stripping the comment first would
    // truncate `KEY="has # inside"`. Either way the spawned server gets a
    // wrong credential and every authenticated call 401s.
    const quoted = /^(['"])([\s\S]*?)\1\s*(?:#.*)?$/.exec(value);
    if (quoted) {
      value = quoted[2];
    } else {
      // Unquoted values end at an unescaped ` #`, per dotenv semantics.
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]] = value;
  }
  return out;
};

/**
 * `serverPath` is injectable so the child-exit path can be tested against a
 * script that exits on purpose. Production callers use the default.
 */
export const connect = ({
  timeoutMs = 60_000,
  serverPath = SERVER_PATH,
} = {}) =>
  new Promise((resolve, reject) => {
    if (serverPath === SERVER_PATH) {
      assertBuilt();
    }
    const child = spawn('node', [serverPath], {
      env: {
        ...readDotEnv(),
        ...process.env,
        LOG_LEVEL: process.env.MCP_DEBUG ? 'debug' : 'error',
        LOG_TRANSPORT: process.env.LOG_TRANSPORT ?? 'console',
      },
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const pending = new Map();
    let nextId = 1;
    let buf = '';

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue; // not protocol traffic
        }
        const entry = pending.get(msg.id);
        if (entry) {
          pending.delete(msg.id);
          entry.settle(msg);
        }
      }
    });

    // The server calls process.exit(1) on invalid configuration (see
    // src/config/env.ts), so a mistyped .env makes the child spawn fine and
    // then die. Without this the pending promise sat until the 60s timeout and
    // the dev commands looked hung rather than broken — the timeout message
    // would also have blamed the wrong thing.
    let exitError = null;
    // close() kills the child on purpose; that exit is not a failure.
    let closedDeliberately = false;
    const failAllPending = (err) => {
      exitError = err;
      for (const [id, entry] of [...pending]) {
        pending.delete(id);
        entry.fail(err);
      }
    };

    child.on('error', (err) => {
      failAllPending(err);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      // Record EVERY unexpected exit, not only one that catches a call in
      // flight. Gating on `pending.size` left the window between two calls
      // unrecorded: the server could answer `initialize`, die, and the next
      // call() would write to a dead stdin and wait out the full timeout or
      // surface a bare EPIPE. `failAllPending` sets `exitError` before it
      // iterates, so an empty map still arms the fast failure.
      if (closedDeliberately) {
        return;
      }
      const how = signal ? `signal ${signal}` : `code ${code}`;
      failAllPending(
        new Error(
          `MCP server exited (${how}) before answering. It exits on invalid ` +
            `configuration — check .env, and re-run with MCP_DEBUG=1 to see ` +
            `its stderr.`,
        ),
      );
    });

    const call = (method, params = {}) =>
      new Promise((res, rej) => {
        if (exitError) {
          rej(exitError);
          return;
        }
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`timeout waiting for ${method}`));
        }, timeoutMs);
        pending.set(id, {
          settle: (m) => {
            clearTimeout(timer);
            res(m);
          },
          fail: (err) => {
            clearTimeout(timer);
            rej(err);
          },
        });
        child.stdin.write(
          JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
        );
      });

    call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cv-mcp-dev', version: '1.0.0' },
    })
      .then(() => {
        child.stdin.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }) + '\n',
        );
        resolve({
          call,
          close: () => {
            closedDeliberately = true;
            child.kill('SIGKILL');
          },
        });
      })
      .catch(reject);
  });

export const bytes = (v) => Buffer.byteLength(JSON.stringify(v) ?? '', 'utf8');

/** Pulls the text block out of a tools/call result. */
export const resultText = (result) =>
  result?.content?.find((b) => b.type === 'text')?.text ?? '';

export const resultJson = (result) => {
  const text = resultText(result);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
