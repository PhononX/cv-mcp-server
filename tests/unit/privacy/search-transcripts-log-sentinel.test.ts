/**
 * STT-26 / STT-27: no log line written by cv-mcp-server may carry the
 * `search_transcripts` query or any matched chunk, at any level, in either
 * mode, on any path; and the failure lines must still name the tool and the
 * status.
 *
 * Real path, network faked at the edge: the real McpServer + Client over
 * InMemoryTransport, the real cv-api client, the real `mutator` and its
 * interceptors, the real logger at `debug`. The network is a custom axios
 * adapter on the exported `customAxios`. The HTTP request log (point d) is
 * driven through the real `logRequest` middleware with a fake `res`.
 *
 * Log points (design "Privacy"): a = tool handler error log, b = axios
 * request log, c = axios error log, d = HTTP request log.
 */
import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';

import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const QUERY = `sentinel-query-${'7f3c9a1e-5b2d-4c8f-9e61-0a4b3d2c1f85'}`;
const CHUNK = `sentinel-chunk-${'c2e4a6b8-1d3f-4a5c-8e7b-9f0a1b2c3d4e'}`;

type Outcome = { status: number; data: unknown } | { network: true };
type Route = {
  basicInfo?: Outcome;
  search?: (workspaceId: string) => Outcome;
};

const ok = (data: unknown): Outcome => ({ status: 200, data });
const fail = (status: number, data: unknown = { message: 'x' }): Outcome => ({
  status,
  data,
});

const hitBody = (workspace_id: string) => ({
  results: [
    {
      message_id: `m-${workspace_id}`,
      conversation_id: 'c-1',
      conversation_name: 'General',
      workspace_id,
      creator_id: 'u-1',
      creator_name: 'Ann',
      created_at: '2026-10-01T10:00:00Z',
      parent_message_id: null,
      score: 0.8,
      matched_chunk: CHUNK,
    },
  ],
  scope_capped: false,
});

// Worst case of cv-api's I18nValidationExceptionFilter: the input comes back
// in `value`, in `target` and inside a constraint string.
const ECHO_400 = {
  statusCode: 400,
  error: 'Bad Request',
  message: [
    {
      property: 'query',
      value: QUERY,
      target: { query: QUERY, workspace_id: 'ws-a' },
      constraints: { isValid: `query "${QUERY}" is not valid` },
    },
  ],
};

const WORKSPACES = [
  { id: 'ws-a', name: 'Alpha' },
  { id: 'ws-b', name: 'Beta' },
  { id: 'ws-c', name: 'Gamma' },
  { id: 'personal', name: 'Personal' },
];

let route: Route = {};
const captured: { level: string; message: string; line: string }[] = [];

// Loaded under jest.isolateModules with LOG_LEVEL=debug (tests/setup.ts
// forces `error`, which would make a debug check vacuous).
let logger: import('winston').Logger;
let client: import('@modelcontextprotocol/sdk/client/index.js').Client;
let logRequest: typeof import('../../../src/transports/http/middleware/log-request.middlware').logRequest;

const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AxiosError } = require('axios');
  const outcome: Outcome | undefined =
    config.url === '/simplified/workspaces/basic-info'
      ? route.basicInfo
      : config.url === '/search/transcripts'
        ? route.search?.(JSON.parse(String(config.data)).workspace_id)
        : undefined;
  if (!outcome) throw new Error(`unrouted ${config.method} ${config.url}`);
  if ('network' in outcome) {
    throw new AxiosError('socket hang up', 'ECONNRESET', config, {});
  }
  const response: AxiosResponse = {
    data: outcome.data,
    status: outcome.status,
    statusText: String(outcome.status),
    headers: {},
    config,
    request: {},
  };
  if (outcome.status >= 400) {
    throw new AxiosError(
      `Request failed with status code ${outcome.status}`,
      'ERR_BAD_REQUEST',
      config,
      {},
      response,
    );
  }
  return response;
};

beforeAll(async () => {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  /* eslint-disable @typescript-eslint/no-require-imports */
  jest.isolateModules(() => {
    const Transport: typeof import('winston-transport') = require('winston-transport');
    logger = require('../../../src/utils/logger').logger;
    logger.add(
      new (class extends Transport {
        log(info: Record<string | symbol, unknown>, next: () => void) {
          captured.push({
            level: String(info.level),
            message: String(info.message),
            // Whole entry: message, meta and the formatted line winston
            // writes (Symbol.for('message')).
            line: inspect(info, { depth: null, breakLength: Infinity }),
          });
          next();
        }
      })({ level: 'debug' }),
    );
    require('../../../src/utils/axios-instance').customAxios.defaults.adapter =
      adapter;
    const { createMcpServer } = require('../../../src/server');
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const {
      InMemoryTransport,
    } = require('@modelcontextprotocol/sdk/inMemory.js');
    logRequest =
      require('../../../src/transports/http/middleware/log-request.middlware').logRequest;

    const server = createMcpServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'sentinel', version: '1.0.0' });
    (globalThis as Record<string, unknown>).__sentinelConnect = Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
  process.env.LOG_LEVEL = previous;
  await (globalThis as Record<string, unknown>).__sentinelConnect;
});

afterAll(async () => {
  await client?.close();
});

/** Lines of one scenario that contain either sentinel, with the log message. */
const hitsIn = (lines: typeof captured) =>
  lines
    .filter((l) => l.line.includes(QUERY) || l.line.includes(CHUNK))
    .map((l) => `${l.level}: ${l.message.slice(0, 60)}`);

const runScenario = async (r: Route, args: Record<string, unknown>) => {
  route = r;
  const start = captured.length;
  await client.callTool({
    name: 'search_transcripts',
    arguments: { query: QUERY, ...args },
  });
  return captured.slice(start);
};

/** STT-27: the scenario logged at least one line naming the tool/route and the status. */
const namesToolAndStatus = (lines: typeof captured, status: string) =>
  lines.some(
    (l) =>
      (l.line.includes('/search/transcripts') ||
        l.line.includes('search_transcripts')) &&
      l.line.includes(status),
  );

it('runs the real logger at debug (non-vacuous)', () => {
  expect(logger.level).toBe('debug');
});

describe.each<[string, Route, Record<string, unknown>, string]>([
  [
    'single 200',
    { search: () => ok(hitBody('ws-a')) },
    { workspace_id: 'ws-a' },
    '200',
  ],
  [
    'single 400 echoing the input',
    { search: () => fail(400, ECHO_400) },
    { workspace_id: 'ws-a' },
    '400',
  ],
  ['single 429', { search: () => fail(429) }, { workspace_id: 'ws-a' }, '429'],
  ['single 503', { search: () => fail(503) }, { workspace_id: 'ws-a' }, '503'],
  [
    'single network error',
    { search: () => ({ network: true }) },
    { workspace_id: 'ws-a' },
    'NETWORK_ERROR',
  ],
  [
    'fan-out all 200',
    {
      basicInfo: ok(WORKSPACES),
      search: (id) => ok(hitBody(id)),
    },
    {},
    '200',
  ],
  [
    'fan-out mixed 200/403/429/503',
    {
      basicInfo: ok(WORKSPACES),
      search: (id) =>
        ({
          'ws-a': ok(hitBody(id)),
          'ws-b': fail(429),
          'ws-c': fail(503),
          personal: fail(403),
        })[id] as Outcome,
    },
    {},
    '429',
  ],
  [
    'fan-out all 503',
    { basicInfo: ok(WORKSPACES), search: () => fail(503, ECHO_400) },
    {},
    '503',
  ],
  ['fan-out basic-info 503', { basicInfo: fail(503) }, {}, '503'],
])('%s', (_label, r, args, status) => {
  let lines: typeof captured;

  beforeAll(async () => {
    lines = await runScenario(r, args);
  });

  it('logs neither the query nor a matched chunk', () => {
    expect(hitsIn(lines)).toEqual([]);
  });

  it('still logs the tool or route with its status (STT-27)', () => {
    expect(namesToolAndStatus(lines, status)).toBe(true);
  });
});

describe('HTTP request log (point d)', () => {
  const toolCall = (id: number, name: string) => ({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: { query: QUERY } },
  });

  const drive = (body: unknown) => {
    const start = captured.length;
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headersSent: true,
      writableEnded: true,
      end: () => undefined,
    });
    const req = {
      method: 'POST',
      url: '/mcp',
      headers: { 'user-agent': 'sentinel' },
      body,
    };
    logRequest(req as never, res as never, () => undefined);
    res.emit('finish');
    return captured.slice(start);
  };

  it.each([
    ['a single tools/call object', toolCall(1, 'search_transcripts')],
    [
      'a JSON-RPC batch array',
      [toolCall(1, 'search_transcripts'), toolCall(2, 'search_transcripts')],
    ],
  ])('keeps the query out for %s', (_label, body) => {
    const lines = drive(body);

    expect(hitsIn(lines)).toEqual([]);
    expect(namesToolAndStatus(lines, '200')).toBe(true);
  });
});
