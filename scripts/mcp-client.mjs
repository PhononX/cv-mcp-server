/**
 * Minimal MCP stdio client for local development.
 *
 * Spawns the built stdio server, completes the handshake, runs one command and
 * exits. Exists because the MCP Inspector is a browser UI — good for poking
 * around, useless in a terminal, a script, or CI.
 *
 *   npm run mcp:list                      # every tool, with its wire cost
 *   npm run mcp:schema -- get_message     # the JSON Schema an agent actually sees
 *   npm run mcp:call   -- get_current_user '{"response_fields":["user.user_guid"]}'
 *   npm run mcp:size                      # tools/list payload budget
 *
 * Reads .env if present (cp .env.sample .env). Tool CALLS hit the real Carbon
 * Voice API and need a valid CARBON_VOICE_API_KEY; tools/list, schema and size
 * need nothing, because the server builds its tool list without calling out.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SERVER = path.resolve('dist/transports/stdio/stdio.js');

if (!fs.existsSync(SERVER)) {
  console.error(`Not built: ${SERVER}\nRun: npm run build`);
  process.exit(1);
}

// Load .env without adding a dependency — the npm scripts don't wrap this in
// env-cmd, so a bare `node scripts/mcp-client.mjs` works too.
const envFile = path.resolve('.env');
const fileEnv = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith('#')) fileEnv[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const rpc = (child, msg) => child.stdin.write(JSON.stringify(msg) + '\n');

const connect = () =>
  new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], {
      env: {
        ...fileEnv,
        ...process.env,
        // Logs go to stderr, so they never corrupt the JSON-RPC stream on
        // stdout — but keep them quiet unless MCP_DEBUG is set.
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
          continue; // not ours; ignore rather than crash
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
        pending.set(id, res);
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`timeout waiting for ${method}`));
        }, 60_000);
        pending.set(id, (m) => {
          clearTimeout(timer);
          res(m);
        });
        rpc(child, { jsonrpc: '2.0', id, method, params });
      });

    call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cv-mcp-client', version: '1.0.0' },
    })
      .then(() => {
        rpc(child, { jsonrpc: '2.0', method: 'notifications/initialized' });
        resolve({ call, close: () => child.kill('SIGKILL') });
      })
      .catch(reject);
  });

const [command, ...rest] = process.argv.slice(2);
const { call, close } = await connect();
const bytes = (v) => Buffer.byteLength(JSON.stringify(v) ?? '', 'utf8');

try {
  if (command === 'list') {
    const { result } = await call('tools/list');
    const rows = result.tools
      .map((t) => ({
        tool: t.name,
        desc: (t.description || '').length,
        schema: bytes(t.inputSchema),
        wire: bytes(t),
        readOnly: t.annotations?.readOnlyHint ?? false,
        destructive: t.annotations?.destructiveHint ?? false,
      }))
      .sort((a, b) => b.wire - a.wire);
    console.table(rows);
    console.log(`${rows.length} tools, ${bytes(result.tools).toLocaleString()} wire bytes`);
  } else if (command === 'schema') {
    const name = rest[0];
    if (!name) throw new Error('usage: npm run mcp:schema -- <tool>');
    const { result } = await call('tools/list');
    const tool = result.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(
        `no such tool: ${name}\navailable: ${result.tools.map((t) => t.name).join(', ')}`,
      );
    }
    console.log('--- description an agent sees ---\n');
    console.log(tool.description);
    console.log('\n--- input JSON Schema ---\n');
    console.log(JSON.stringify(tool.inputSchema, null, 2));
  } else if (command === 'call') {
    const [name, rawArgs = '{}'] = rest;
    if (!name) throw new Error('usage: npm run mcp:call -- <tool> \'<json args>\'');
    let args;
    try {
      args = JSON.parse(rawArgs);
    } catch (e) {
      throw new Error(`arguments must be valid JSON: ${e.message}`);
    }
    const started = Date.now();
    const { result, error } = await call('tools/call', { name, arguments: args });
    console.log(`took ${Date.now() - started}ms`);
    if (error) {
      console.log('JSON-RPC error:', JSON.stringify(error, null, 2));
      process.exitCode = 1;
    } else {
      // isError distinguishes a failed call from a successful one without
      // parsing the body — see src/utils/format-to-mcp-tool-response.ts
      console.log('isError:', result.isError ?? false);
      result.content?.forEach((block) => {
        if (block.type !== 'text') return console.log(block);
        try {
          console.log(JSON.stringify(JSON.parse(block.text), null, 2));
        } catch {
          console.log(block.text);
        }
      });
      console.log(`\nresponse bytes: ${bytes(result.content).toLocaleString()}`);
      if (result.isError) process.exitCode = 1;
    }
  } else if (command === 'size') {
    const { result } = await call('tools/list');
    const wire = bytes(result.tools);
    const desc = result.tools.reduce((s, t) => s + (t.description || '').length, 0);
    const schema = result.tools.reduce((s, t) => s + bytes(t.inputSchema), 0);
    console.log(`tools:        ${result.tools.length}`);
    console.log(`descriptions: ${desc.toLocaleString()}`);
    console.log(`schemas:      ${schema.toLocaleString()}`);
    console.log(`WIRE TOTAL:   ${wire.toLocaleString()} bytes (~${Math.round(wire / 3.7).toLocaleString()} tokens)`);
    console.log('\nPaid on every request, ahead of the system prompt, so it is');
    console.log('also the most cacheable part of the prompt. See scripts/measure-payloads.ts');
  } else {
    console.log(
      [
        'usage:',
        '  npm run mcp:list                    every tool with its wire cost',
        '  npm run mcp:schema -- <tool>        description + input JSON Schema',
        "  npm run mcp:call   -- <tool> '<json>'   invoke a tool",
        '  npm run mcp:size                    tools/list payload budget',
        '',
        'MCP_DEBUG=1 shows server logs on stderr.',
      ].join('\n'),
    );
    process.exitCode = command ? 1 : 0;
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exitCode = 1;
} finally {
  close();
}
