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
 * Voice API and need stdio credentials — CARBON_VOICE_PAT (preferred) or
 * CARBON_VOICE_API_KEY. tools/list, schema and size need nothing, because the
 * server builds its tool list without calling out.
 */
import { bytes, connect } from './lib/mcp-stdio.mjs';
import { connectHttp } from './lib/mcp-http.mjs';

const argv = process.argv.slice(2);

// --http [url] targets a locally running HTTP transport instead of spawning
// the stdio server; --token uses a real OAuth access token instead of a
// locally minted one (needed for calls that touch data).
const httpFlag = argv.indexOf('--http');
const tokenFlag = argv.indexOf('--token');
const httpUrl =
  httpFlag === -1
    ? undefined
    : argv[httpFlag + 1]?.startsWith('http')
      ? argv[httpFlag + 1]
      : 'http://localhost:3005/';
const token = tokenFlag === -1 ? undefined : argv[tokenFlag + 1];

// Indices consumed as flag VALUES, so they are not mistaken for positional
// args. Guarding on the flag being present matters: with --token absent,
// `tokenFlag + 1` is 0, which would swallow the command itself.
const consumed = new Set();
if (httpFlag !== -1) {
  consumed.add(httpFlag);
  if (argv[httpFlag + 1]?.startsWith('http')) consumed.add(httpFlag + 1);
}
if (tokenFlag !== -1) {
  consumed.add(tokenFlag);
  consumed.add(tokenFlag + 1);
}
const positional = argv.filter(
  (a, i) => !consumed.has(i) && !a.startsWith('--'),
);
const [command, ...rest] = positional;

const { call, close, usingMintedToken } = httpUrl
  ? await connectHttp({ url: httpUrl, token })
  : await connect();

if (httpUrl) {
  console.log(`connected over HTTP to ${httpUrl}`);
  if (usingMintedToken) {
    console.log(
      'using a locally minted token: tools/list and schemas work, but tool ' +
        'calls that touch data will 401 at cv-api. Pass --token <access_token> ' +
        'for real data.\n',
    );
  }
}

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
    console.log(
      `${rows.length} tools, ${bytes(result.tools).toLocaleString()} wire bytes`,
    );
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
    if (!name)
      throw new Error("usage: npm run mcp:call -- <tool> '<json args>'");
    let args;
    try {
      args = JSON.parse(rawArgs);
    } catch (e) {
      throw new Error(`arguments must be valid JSON: ${e.message}`);
    }
    const started = Date.now();
    const { result, error } = await call('tools/call', {
      name,
      arguments: args,
    });
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
      console.log(
        `\nresponse bytes: ${bytes(result.content).toLocaleString()}`,
      );
      if (result.isError) process.exitCode = 1;
    }
  } else if (command === 'size') {
    const { result } = await call('tools/list');
    const wire = bytes(result.tools);
    const desc = result.tools.reduce(
      (s, t) => s + (t.description || '').length,
      0,
    );
    const schema = result.tools.reduce((s, t) => s + bytes(t.inputSchema), 0);
    console.log(`tools:        ${result.tools.length}`);
    console.log(`descriptions: ${desc.toLocaleString()}`);
    console.log(`schemas:      ${schema.toLocaleString()}`);
    console.log(
      `WIRE TOTAL:   ${wire.toLocaleString()} bytes (~${Math.round(wire / 3.7).toLocaleString()} tokens)`,
    );
    console.log(
      '\nPaid on every request, ahead of the system prompt, so it is',
    );
    console.log(
      'also the most cacheable part of the prompt. See scripts/measure-payloads.ts',
    );
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
  // await: the HTTP client's close issues a DELETE to terminate the
  // server-side session, and the process must not exit before it lands.
  await close();
}
