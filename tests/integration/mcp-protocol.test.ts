import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { TOOL_NAMES } from '../../src/docs';

/**
 * Protocol-level tests: a real `McpServer` driven by a real `Client` over an
 * in-memory transport.
 *
 * Everything in `tests/unit/server/` mocks `registerTool`, so it asserts what
 * we *passed* to the SDK, never what a client *receives*. That blind spot
 * shipped a real bug: `create_voicememo_message.audio_file` was typed
 * `zod.instanceof(File)`, which serializes to an untyped `{}` in JSON Schema
 * while its description advertised audio formats — the tool promised audio
 * upload and rejected everything a JSON-RPC client could send. No unit test
 * could see it, because the defect only exists after zod becomes JSON Schema.
 *
 * These tests also use the REAL `formatToMCPToolResponse`, so response
 * projection and the `isError` flag are exercised end to end rather than
 * asserted against a mock.
 */

// ---------------------------------------------------------------------------
// Upstream API doubles. Only the network is faked; the server, the transport,
// the formatter and the projection layer are all real.
// ---------------------------------------------------------------------------

const LIST_MESSAGES_FIXTURE = {
  page: 1,
  size: 20,
  sort_direction: 'DESC',
  total: 1487,
  results_count: 2,
  has_next_page: true,
  filters: { workspace_id: 'wsp_1' },
  results: [
    {
      id: 'msg_1',
      transcript: 'First message transcript, reasonably long so size matters.',
      ai_summary: 'A summary that also costs bytes.',
      audio_url: `https://media.example.com/1.mp3?sig=${'a'.repeat(80)}`,
      creator_id: 'usr_1',
      created_at: '2026-09-08T10:00:00.000Z',
      duration_ms: 48000,
      reply_count: 2,
      status: 'active',
      type: 'channel',
    },
    {
      id: 'msg_2',
      transcript: 'Second message transcript, also long enough to matter.',
      ai_summary: 'Another summary.',
      audio_url: `https://media.example.com/2.mp3?sig=${'b'.repeat(80)}`,
      creator_id: 'usr_2',
      created_at: '2026-09-08T11:00:00.000Z',
      duration_ms: 51000,
      reply_count: 0,
      status: 'active',
      type: 'channel',
    },
  ],
};

const WHOAMI_FIXTURE = {
  success: true,
  user: {
    user_guid: 'usr_1',
    first_name: 'Alice',
    last_name: 'Anderson',
    email_txt: 'alice@example.com',
    workspace_guids: Array.from({ length: 40 }, (_, i) => `wsp_${i}`),
    lifecycle_events: Array.from({ length: 12 }, (_, i) => ({
      name: `evt_${i}`,
      count: i,
    })),
    settings: Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`setting_${i}`, '']),
    ),
  },
  settings: { is_gated: false, member_count: 3 },
};

const listMessages = jest.fn();
const getWhoAmI = jest.fn();
const aIResponseControllerCreateResponse = jest.fn();
// The void endpoints (202/204, empty body) resolve to undefined, which is what
// the wire-format test below exercises.
const actionItemControllerCreateSuggestionsFromMessages = jest.fn();
const createActionItemSuggestionsFromMessage = jest.fn();
const getAllConversations = jest.fn();

jest.mock('../../src/generated', () => {
  const explicit: Record<string, unknown> = {};
  // Any method not explicitly stubbed resolves to {} — the tools under test
  // here are the ones with explicit doubles.
  return {
    getCarbonVoiceSimplifiedAPI: () =>
      new Proxy(explicit, {
        get: (target, prop: string) => {
          if (prop === 'listMessages') return listMessages;
          if (prop === 'aIResponseControllerCreateResponse') {
            return aIResponseControllerCreateResponse;
          }
          if (prop === 'actionItemControllerCreateSuggestionsFromMessages') {
            return actionItemControllerCreateSuggestionsFromMessages;
          }
          if (prop === 'getAllConversations') return getAllConversations;
          return jest.fn().mockResolvedValue({});
        },
      }),
  };
});

jest.mock('../../src/cv-api', () => ({
  getCarbonVoiceAPI: () => ({
    getWhoAmI,
    getContacts: jest.fn().mockResolvedValue([]),
    searchMessageIds: jest.fn().mockResolvedValue({ ids: [], has_more: false }),
    searchMessagesByHeardStatus: jest.fn().mockResolvedValue({ messages: [] }),
    listInboxNotifications: jest
      .fn()
      .mockResolvedValue({ results: [], total_results: 0, total_unread: 0 }),
    createActionItemSuggestionsFromMessage,
  }),
  getCarbonVoiceApiStatus: jest.fn(),
}));

// Auth header construction is not under test; keep it inert.
jest.mock('../../src/auth', () => ({
  setCarbonVoiceAuthHeader: () => ({ headers: {} }),
}));

type ToolShape = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
};

// ---------------------------------------------------------------------------
// Expected annotation contract.
//
// ChatGPT app submission requires all three hints to be present on every tool,
// and two of the three MCP defaults (`destructiveHint`, `openWorldHint`) are
// `true` — so an omitted hint is not a neutral omission, it advertises the
// tool as more dangerous and less contained than it is. These tables are the
// expected wire values; the assertions below read them off a real
// `tools/list` response, not off the registration call.
// ---------------------------------------------------------------------------

/**
 * Every tool whose domain of interaction reaches outside the authenticated
 * Carbon Voice account — not only tools where this MCP server itself makes
 * the outbound call:
 *  - `create_direct_message` can address arbitrary email addresses.
 *  - `create_voicememo_message` makes the server fetch an arbitrary
 *    caller-supplied public URL directly.
 *  - `create_conversation_message` and `add_attachments_to_message` accept
 *    `links`, which the Carbon Voice backend (cv-api) dereferences to fetch a
 *    title/description. This server never makes that request itself, but
 *    calling the tool still causes Carbon Voice's infrastructure to fetch a
 *    caller-supplied URL.
 *  - `run_ai_action_for_shared_link` and `get_message_share_link` both accept
 *    a share link ID that can point to a message shared by someone the
 *    caller has no existing relationship with.
 * Every other tool is closed over the caller's own account and workspaces.
 */
const OPEN_WORLD_TOOLS = [
  'create_conversation_message',
  'create_direct_message',
  'create_voicememo_message',
  'add_attachments_to_message',
  'run_ai_action_for_shared_link',
  'get_message_share_link',
];

/**
 * Every tool whose `destructiveHint` must be `true` — it deletes, overwrites
 * an existing field, replaces a current location, or sends a message that no
 * tool here can withdraw. Anything absent from this list must be `false`.
 */
const DESTRUCTIVE_TOOLS = [
  'create_conversation_message',
  'create_direct_message',
  'update_folder_name',
  'delete_folder',
  'move_folder',
  'move_message_to_folder',
  'update_action_item',
  'set_action_item_status',
  'delete_action_item',
];

let client: Client;
let tools: ToolShape[];

const textOf = (result: { content?: Array<{ type: string; text?: string }> }) =>
  result.content?.find((b) => b.type === 'text')?.text ?? '';

const jsonOf = (result: Parameters<typeof textOf>[0]) =>
  JSON.parse(textOf(result));

beforeAll(async () => {
  listMessages.mockResolvedValue(LIST_MESSAGES_FIXTURE);
  getWhoAmI.mockResolvedValue(WHOAMI_FIXTURE);
  actionItemControllerCreateSuggestionsFromMessages.mockResolvedValue(
    undefined,
  );
  createActionItemSuggestionsFromMessage.mockResolvedValue([
    { id: 'ai_1', title: 'Send the deck', status: 'suggested' },
  ]);
  getAllConversations.mockResolvedValue({
    results_count: 3,
    results: [
      { id: 'c1', name: 'Fred', workspace_id: 'w1', type: 'directMessage' },
      {
        id: 'c2',
        name: 'Project X',
        workspace_id: 'w1',
        type: 'namedConversation',
      },
      { id: 'c3', name: 'Standup', workspace_id: 'w1', type: 'asyncMeeting' },
    ],
  });

  // Required (not dynamically imported) after the mocks are registered:
  // this Jest config runs without --experimental-vm-modules, so `await
  // import()` throws here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMcpServer } = require('../../src/server');
  const server = createMcpServer();

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'contract-test', version: '1.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  tools = (await client.listTools()).tools as ToolShape[];
});

afterAll(async () => {
  await client?.close();
});

// ---------------------------------------------------------------------------
// 1. tools/list contract
// ---------------------------------------------------------------------------

describe('tools/list contract', () => {
  it('lists every registered tool, in TOOL_NAMES order', () => {
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
  });

  it('keeps the annotation expectation tables pointed at real tools', () => {
    // A typo in either table would otherwise pass silently: the per-tool
    // checks below use `.includes(name)`, so a misspelled entry just never
    // matches and the tool it was meant to cover quietly asserts `false`.
    [...OPEN_WORLD_TOOLS, ...DESTRUCTIVE_TOOLS].forEach((name) => {
      expect(TOOL_NAMES).toContain(name);
    });
  });

  it('covers every registered tool with an explicit annotation expectation', () => {
    // The submission is checked against all 42 tools, so the guard has to be
    // whole-surface: a tool added without annotations must fail here.
    expect(
      tools.filter(
        (t) =>
          typeof t.annotations?.readOnlyHint === 'boolean' &&
          typeof t.annotations?.destructiveHint === 'boolean' &&
          typeof t.annotations?.openWorldHint === 'boolean',
      ).length,
    ).toBe(TOOL_NAMES.length);
  });

  it('marks exactly the open-world tools as open-world', () => {
    expect(
      tools.filter((t) => t.annotations?.openWorldHint).map((t) => t.name),
    ).toEqual(OPEN_WORLD_TOOLS);
  });

  it('survives a JSON round trip with nothing lost', () => {
    // A schema containing a function or `undefined` silently loses fields on
    // the wire; comparing against a re-parsed copy catches that.
    expect(JSON.parse(JSON.stringify(tools))).toEqual(tools);
  });

  describe.each(TOOL_NAMES.map((n) => [n]))('%s', (name) => {
    const tool = () => tools.find((t) => t.name === name)!;

    it('has a description and an object input schema', () => {
      expect(tool().description?.length).toBeGreaterThan(0);
      expect(tool().inputSchema?.type).toBe('object');
    });

    it('declares all three behaviour hints explicitly as booleans', () => {
      // Presence is asserted with `in`, not truthiness: `destructiveHint` and
      // `openWorldHint` both DEFAULT to `true`, so a missing key reads to a
      // host as the dangerous value rather than as "unspecified".
      const annotations = tool().annotations ?? {};
      expect({
        tool: name,
        keys: ['readOnlyHint', 'destructiveHint', 'openWorldHint'].filter(
          (k) => k in annotations,
        ),
      }).toEqual({
        tool: name,
        keys: ['readOnlyHint', 'destructiveHint', 'openWorldHint'],
      });
      expect(typeof annotations.readOnlyHint).toBe('boolean');
      expect(typeof annotations.destructiveHint).toBe('boolean');
      expect(typeof annotations.openWorldHint).toBe('boolean');
    });

    it('declares the expected openWorldHint', () => {
      expect({
        tool: name,
        openWorld: tool().annotations?.openWorldHint,
      }).toEqual({ tool: name, openWorld: OPEN_WORLD_TOOLS.includes(name) });
    });

    it('declares the expected destructiveHint', () => {
      expect({
        tool: name,
        destructive: tool().annotations?.destructiveHint,
      }).toEqual({
        tool: name,
        destructive: DESTRUCTIVE_TOOLS.includes(name),
      });
    });

    it('never marks a read-only tool as destructive', () => {
      // The spec ties `destructiveHint` to `readOnlyHint == false` ("This
      // property is meaningful only when readOnlyHint == false"), but
      // `openWorldHint` is an independent axis — a read-only tool can still be
      // open-world (the spec's own example, a web search tool, is exactly
      // that: it only reads, but its domain is the open internet).
      // `get_message_share_link` is this server's case: read-only, but it can
      // retrieve a message shared by someone outside the caller's account.
      if (!tool().annotations?.readOnlyHint) return;
      expect({
        tool: name,
        destructive: tool().annotations?.destructiveHint,
      }).toEqual({ tool: name, destructive: false });
    });

    it('gives every parameter a usable JSON Schema type', () => {
      // THE REGRESSION GUARD. `zod.instanceof(File)` renders as `{}` — no
      // type, no enum, nothing an agent can aim at — and then rejects every
      // value it could send. Any param that reaches the wire untyped is a
      // guaranteed wasted call, so require one of the keys that actually
      // constrains a value.
      const constraining = [
        'type',
        'enum',
        'const',
        'anyOf',
        'oneOf',
        'allOf',
        '$ref',
      ];
      Object.entries(tool().inputSchema?.properties ?? {}).forEach(
        ([param, schema]) => {
          const keys = Object.keys(schema);
          expect({
            tool: name,
            param,
            keys,
            hasConstraint: constraining.some((k) => k in schema),
          }).toEqual({
            tool: name,
            param,
            keys,
            hasConstraint: true,
          });
        },
      );
    });

    it('documents every parameter that needs it', () => {
      // An undocumented param is one an agent has to guess at. This check
      // found 34 of them on first run — including `prompt_id` on four tools,
      // the single value the whole AI-action chain hinges on.
      //
      // Two deliberate exemptions, both because the schema already carries
      // the meaning and prose would be pure wire cost:
      //   - path/id params whose name is the whole story
      //   - enum-constrained params, where the enum reaches the agent in the
      //     JSON Schema and already fixes the value space
      const selfEvident = ['id', 'container_id', 'container_type'];
      Object.entries(tool().inputSchema?.properties ?? {}).forEach(
        ([param, schema]) => {
          if (selfEvident.includes(param)) return;
          if ('enum' in schema || 'const' in schema) return;
          const described =
            typeof schema.description === 'string' &&
            schema.description.length > 0;
          expect({ tool: name, param, described }).toEqual({
            tool: name,
            param,
            described: true,
          });
        },
      );
    });

    it('names only real properties as required', () => {
      const props = Object.keys(tool().inputSchema?.properties ?? {});
      (tool().inputSchema?.required ?? []).forEach((req) => {
        expect(props).toContain(req);
      });
    });

    // The example is what an agent copies. Checked against the LIVE schema
    // rather than the doc, so a parameter that is renamed or dropped upstream
    // surfaces here instead of as a rejected call in production.
    it('gives an example whose keys are all real parameters', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TOOL_DOCS } = require('../../src/docs');
      const example = TOOL_DOCS[name]?.example ?? {};
      const props = Object.keys(tool().inputSchema?.properties ?? {});

      Object.keys(example).forEach((key) => {
        expect({ tool: name, key, real: props.includes(key) }).toEqual({
          tool: name,
          key,
          real: true,
        });
      });
    });

    it('requires every required parameter in its own example', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TOOL_DOCS } = require('../../src/docs');
      const example = TOOL_DOCS[name]?.example ?? {};

      (tool().inputSchema?.required ?? []).forEach((req) => {
        expect({ tool: name, req, present: req in example }).toEqual({
          tool: name,
          req,
          present: true,
        });
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 2. tools/list payload budget
// ---------------------------------------------------------------------------

describe('tools/list payload budget', () => {
  /**
   * Tool definitions render at position 0 of the prompt, ahead of the system
   * prompt and the conversation, so this payload is paid on every request.
   * Measured 62,215 bytes at the time of writing; the ceiling leaves room to
   * add tools deliberately while failing on accidental bloat.
   */
  const MAX_WIRE_BYTES = 72_000;
  const MAX_PER_TOOL_BYTES = 4_000;

  const wire = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');

  it(`keeps the whole payload under ${MAX_WIRE_BYTES} bytes`, () => {
    const total = wire(tools);
    // Surfaced in the failure message so a breach says how far over it is.
    expect({
      total,
      limit: MAX_WIRE_BYTES,
      over: total > MAX_WIRE_BYTES,
    }).toEqual({ total, limit: MAX_WIRE_BYTES, over: false });
  });

  it(`keeps every single tool under ${MAX_PER_TOOL_BYTES} bytes`, () => {
    const offenders = tools
      .map((t) => ({ name: t.name, bytes: wire(t) }))
      .filter((t) => t.bytes > MAX_PER_TOOL_BYTES);
    expect(offenders).toEqual([]);
  });

  it('reports the current cost, so a reviewer sees the trend', () => {
    const total = wire(tools);
    const descriptions = tools.reduce(
      (sum, t) => sum + (t.description?.length ?? 0),
      0,
    );
    // eslint-disable-next-line no-console
    console.log(
      `tools/list: ${tools.length} tools, ${total} bytes ` +
        `(~${Math.round(total / 3.7)} tokens), ${descriptions} in descriptions`,
    );
    expect(total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Response projection, end to end through the real formatter
// ---------------------------------------------------------------------------

describe('response_fields projection over the protocol', () => {
  it('returns the full payload when response_fields is omitted', async () => {
    const result = await client.callTool({
      name: 'list_messages',
      arguments: { workspace_id: 'wsp_1' },
    });

    expect(jsonOf(result as never)).toEqual(LIST_MESSAGES_FIXTURE);
    expect((result as { isError?: boolean }).isError).toBeFalsy();
  });

  it('narrows the payload when response_fields is supplied', async () => {
    const result = await client.callTool({
      name: 'list_messages',
      arguments: {
        workspace_id: 'wsp_1',
        response_fields: ['results.id', 'results.transcript'],
      },
    });

    const body = jsonOf(result as never);
    expect(body.results).toEqual([
      { id: 'msg_1', transcript: LIST_MESSAGES_FIXTURE.results[0].transcript },
      { id: 'msg_2', transcript: LIST_MESSAGES_FIXTURE.results[1].transcript },
    ]);
    // The heavy fields are gone.
    expect(body.results[0]).not.toHaveProperty('audio_url');
    expect(body.results[0]).not.toHaveProperty('ai_summary');
  });

  it('keeps pagination metadata that was never requested', async () => {
    // Stripping these would destroy the "is there more?" signal the tool
    // descriptions tell agents to rely on.
    const result = await client.callTool({
      name: 'list_messages',
      arguments: { workspace_id: 'wsp_1', response_fields: ['results.id'] },
    });

    const body = jsonOf(result as never);
    expect(body.total).toBe(1487);
    expect(body.has_next_page).toBe(true);
    expect(body.results_count).toBe(2);
    // `filters` only echoes the request, so it is waste under a projection.
    expect(body).not.toHaveProperty('filters');
  });

  it('measurably shrinks the response', async () => {
    const full = await client.callTool({
      name: 'get_current_user',
      arguments: {},
    });
    const narrowed = await client.callTool({
      name: 'get_current_user',
      arguments: {
        response_fields: [
          'user.user_guid',
          'user.first_name',
          'user.email_txt',
        ],
      },
    });

    const fullBytes = textOf(full as never).length;
    const narrowedBytes = textOf(narrowed as never).length;
    expect(narrowedBytes).toBeLessThan(fullBytes * 0.5);
    expect(jsonOf(narrowed as never).user.user_guid).toBe('usr_1');
  });

  it('never forwards response_fields to the upstream API', async () => {
    listMessages.mockClear();
    await client.callTool({
      name: 'list_messages',
      arguments: { workspace_id: 'wsp_1', response_fields: ['results.id'] },
    });

    expect(listMessages).toHaveBeenCalledTimes(1);
    const forwarded = listMessages.mock.calls[0][0];
    expect(forwarded).not.toHaveProperty('response_fields');
    expect(forwarded.workspace_id).toBe('wsp_1');
  });

  it('applies the schema defaults the direct-handler tests never see', async () => {
    // Worth pinning explicitly: on the real protocol path the SDK PARSES
    // arguments through the zod schema before the handler runs, so
    // `.default()` values are materialised and forwarded upstream. The unit
    // tests call handlers directly with raw args, so they never observe this —
    // which is precisely the gap this suite exists to cover.
    listMessages.mockClear();
    listMessages.mockResolvedValue(LIST_MESSAGES_FIXTURE);
    await client.callTool({
      name: 'list_messages',
      arguments: { workspace_id: 'wsp_1' },
    });

    const forwarded = listMessages.mock.calls[0][0];
    expect(forwarded).toMatchObject({
      workspace_id: 'wsp_1',
      page: 1,
      size: 20,
      sort_direction: 'DESC',
    });
  });

  it('ignores unknown paths rather than failing the call', async () => {
    const result = await client.callTool({
      name: 'list_messages',
      arguments: {
        workspace_id: 'wsp_1',
        response_fields: ['results.nope', 'results.id'],
      },
    });

    expect((result as { isError?: boolean }).isError).toBeFalsy();
    expect(jsonOf(result as never).results).toEqual([
      { id: 'msg_1' },
      { id: 'msg_2' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Error surfacing, also through the real formatter
// ---------------------------------------------------------------------------

describe('error responses over the protocol', () => {
  it('flags a failure with isError and attaches the documented next action', async () => {
    aIResponseControllerCreateResponse.mockRejectedValueOnce({
      statusCode: 400,
      body: { error: { code: 'BAD_REQUEST', message: 'invalid prompt' } },
    });

    const result = await client.callTool({
      name: 'run_ai_action',
      arguments: { prompt_id: 'bogus', message_ids: ['msg_1'] },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    const body = jsonOf(result as never);
    expect(body.body.error.code).toBe('BAD_REQUEST');
    // The hint is rendered from TOOL_DOCS at failure time, so the description
    // and the error can never drift apart.
    expect(body.body.error.next_action).toContain('list_ai_actions');
  });

  it('rejects an unreachable audio_url without calling the API', async () => {
    const result = await client.callTool({
      name: 'create_voicememo_message',
      // https, so the ADDRESS check is what rejects this rather than the
      // https-only rule added in cfacbf4 — the address guard is the point.
      arguments: { audio_url: 'https://169.254.169.254/latest/meta-data/' },
    });

    expect((result as { isError?: boolean }).isError).toBe(true);
    const body = jsonOf(result as never);
    expect(body.body.error.code).toBe('INVALID_AUDIO_URL');
    expect(body.body.error.message).toMatch(/non-public address/);
  });
});

// The MCP text content block requires `text` to be a string. A void endpoint
// resolves to undefined and JSON.stringify(undefined) is undefined, not a
// string — so without a substitution the block is invalid and the SDK client
// rejects the response before a handler ever sees it. That makes this a
// protocol-level test rather than a formatter unit test.
describe('void endpoints over the protocol', () => {
  it('returns a valid text block for an empty 202 response', async () => {
    const result = await client.callTool({
      name: 'suggest_action_items_from_messages',
      arguments: { message_ids: ['msg_1', 'msg_2'] },
    });

    expect((result as { isError?: boolean }).isError).toBeUndefined();
    expect(typeof textOf(result as never)).toBe('string');
    expect(jsonOf(result as never)).toEqual({ success: true });
  });

  it('returns the items directly from the synchronous single-message tool', async () => {
    const result = await client.callTool({
      name: 'suggest_action_items_from_message',
      arguments: { message_id: 'msg_1' },
    });

    expect((result as { isError?: boolean }).isError).toBeUndefined();
    expect(createActionItemSuggestionsFromMessage).toHaveBeenCalledWith(
      'msg_1',
      expect.anything(),
    );
    expect(jsonOf(result as never)).toEqual([
      { id: 'ai_1', title: 'Send the deck', status: 'suggested' },
    ]);
  });
});

// `types` is an MCP-side filter: the upstream endpoint has no such parameter
// and no paging, so the filtering has to happen here, and the parameter must
// not be forwarded as an unknown query string.
describe('list_conversations type filter over the protocol', () => {
  it('returns every conversation when types is omitted', async () => {
    const result = await client.callTool({
      name: 'list_conversations',
      arguments: {},
    });

    expect(jsonOf(result as never).results).toHaveLength(3);
  });

  it('narrows to the requested type and recomputes results_count', async () => {
    const result = await client.callTool({
      name: 'list_conversations',
      arguments: { user_ids: ['u_fred'], types: ['directMessage'] },
    });

    const body = jsonOf(result as never);
    expect(body.results).toEqual([
      { id: 'c1', name: 'Fred', workspace_id: 'w1', type: 'directMessage' },
    ]);
    expect(body.results_count).toBe(1);
  });

  it('never forwards types to the upstream API', async () => {
    getAllConversations.mockClear();

    await client.callTool({
      name: 'list_conversations',
      arguments: { user_ids: ['u_fred'], types: ['directMessage'] },
    });

    expect(getAllConversations).toHaveBeenCalledWith(
      { user_ids: ['u_fred'] },
      expect.anything(),
    );
  });

  it('composes with response_fields', async () => {
    const result = await client.callTool({
      name: 'list_conversations',
      arguments: {
        types: ['namedConversation'],
        response_fields: ['results.id', 'results.name'],
      },
    });

    const body = jsonOf(result as never);
    expect(body.results).toEqual([{ id: 'c2', name: 'Project X' }]);
    expect(body.results_count).toBe(1);
  });
});

// The README's tool inventory is what a human reads before wiring this server
// up, and it drifted three separate ways before this guard: it advertised
// `get_workspace_folders_and_message_counts`, whose registration is commented
// out in `src/server.ts`; it omitted `summarize_conversation`, `get_current_user`
// and `suggest_action_items_from_message`; and it carried a stale tool count.
//
// This is worth automating precisely because it is mechanical — unlike the
// truthfulness of a tool's prose, which no test can check.
describe('readme tool inventory', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('node:fs');
  const path = require('node:path');
  const { TOOL_NAMES } = require('../../src/docs');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const readme: string = fs.readFileSync(
    path.resolve(__dirname, '../../readme.md'),
    'utf8',
  );
  const section = readme.slice(
    readme.indexOf('## Available Tools'),
    readme.indexOf('## Narrowing Responses'),
  );
  const listed = [...section.matchAll(/\*\*`([a-z_]+)`\*\*/g)].map((m) => m[1]);

  it('finds the Available Tools section', () => {
    expect(section.length).toBeGreaterThan(0);
    expect(listed.length).toBeGreaterThan(0);
  });

  it('documents every registered tool', () => {
    const missing = TOOL_NAMES.filter((t: string) => !listed.includes(t));

    expect({ missing }).toEqual({ missing: [] });
  });

  it('advertises no tool that is not registered', () => {
    const phantom = listed.filter((t) => !TOOL_NAMES.includes(t));

    expect({ phantom }).toEqual({ phantom: [] });
  });

  it('states the current tool count wherever it states one', () => {
    const counts = [...readme.matchAll(/\b(\d+) tools\b/g)].map((m) =>
      Number(m[1]),
    );

    counts.forEach((n) => {
      expect({ claimed: n, actual: TOOL_NAMES.length }).toEqual({
        claimed: TOOL_NAMES.length,
        actual: TOOL_NAMES.length,
      });
    });
  });
});

// `name` is the same kind of MCP-side filter as `types`, with one extra
// obligation: a zero-match result must not read as "no such conversation".
describe('list_conversations name filter over the protocol', () => {
  it('narrows to conversations whose name contains the string', async () => {
    const result = await client.callTool({
      name: 'list_conversations',
      arguments: { name: 'project x' },
    });

    const body = jsonOf(result as never);
    expect(body.results).toEqual([
      {
        id: 'c2',
        name: 'Project X',
        workspace_id: 'w1',
        type: 'namedConversation',
      },
    ]);
    expect(body.results_count).toBe(1);
  });

  it('never forwards name to the upstream API', async () => {
    getAllConversations.mockClear();

    await client.callTool({
      name: 'list_conversations',
      arguments: { user_ids: ['u_fred'], name: 'fred' },
    });

    expect(getAllConversations).toHaveBeenCalledWith(
      { user_ids: ['u_fred'] },
      expect.anything(),
    );
  });

  // The case the ticket is really about: an agent told `results: []` and
  // nothing else will report that the conversation does not exist, which is
  // wrong and unrecoverable when the user merely misspelled it.
  it('reports the pre-filter total when nothing matches', async () => {
    const result = await client.callTool({
      name: 'list_conversations',
      arguments: { name: 'no such conversation' },
    });

    const body = jsonOf(result as never);
    expect(body.results).toEqual([]);
    expect(body.results_count).toBe(0);
    expect(body.unfiltered_count).toBe(3);
  });

  // Two types in, one row out: the name has to do real narrowing here, so
  // this cannot pass against an implementation that filters nothing.
  it('composes with types', async () => {
    const result = await client.callTool({
      name: 'list_conversations',
      arguments: { name: 'stand', types: ['directMessage', 'asyncMeeting'] },
    });

    const body = jsonOf(result as never);
    expect(body.results).toEqual([
      { id: 'c3', name: 'Standup', workspace_id: 'w1', type: 'asyncMeeting' },
    ]);
    expect(body.results_count).toBe(1);
  });

  // A projection must not strip the signal that keeps an empty result honest.
  it('composes with response_fields, keeping unfiltered_count', async () => {
    const result = await client.callTool({
      name: 'list_conversations',
      arguments: {
        name: 'no such conversation',
        response_fields: ['results.id'],
      },
    });

    const body = jsonOf(result as never);
    expect(body.results).toEqual([]);
    expect(body.results_count).toBe(0);
    expect(body.unfiltered_count).toBe(3);
  });
});
