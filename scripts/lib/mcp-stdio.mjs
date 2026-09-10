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
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith('#')) {
      out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
};

export const connect = ({ timeoutMs = 60_000 } = {}) =>
  new Promise((resolve, reject) => {
    assertBuilt();
    const child = spawn('node', [SERVER_PATH], {
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
        const resolver = pending.get(msg.id);
        if (resolver) {
          pending.delete(msg.id);
          resolver(msg);
        }
      }
    });

    child.on('error', reject);

    const call = (method, params = {}) =>
      new Promise((res, rej) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`timeout waiting for ${method}`));
        }, timeoutMs);
        pending.set(id, (m) => {
          clearTimeout(timer);
          res(m);
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
        resolve({ call, close: () => child.kill('SIGKILL') });
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
