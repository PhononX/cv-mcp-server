import { renderToolDoc, TOOL_DOCS, TOOL_NAMES } from '../../../src/docs';
import { ToolDoc } from '../../../src/docs/types';

/**
 * Guards the documentation contract from
 * `.specs/features/agent-efficiency-improvements/`: every tool description must
 * answer "when do I use this, when do I not, what do I pass, what do I get
 * back, what do I call first" — and must do it inside a token budget, because
 * descriptions are paid in the `tools/list` payload on every request.
 */

/** Per-tool ceiling on rendered description length. See spec Part 3. */
const MAX_DESCRIPTION_CHARS = 1200;

/**
 * Per-tool exceptions to MAX_DESCRIPTION_CHARS. Each one is a decision, not
 * drift: raise one only with the decision that justifies it.
 *
 * `search_transcripts`: design DD-1 option A (2026-11-03,
 * `.specs/features/search-transcripts/design.md`). Its fan-out mode needs the
 * agent to know the rate-limit cost, the workspace-choice step, paging,
 * `scope_capped`, the date window and `skipped_workspaces` (spec STT-20 a-h);
 * the rendered doc measured ~1,890 chars. Raised to 2,050 on 2026-11-04 for
 * STT-20 (i) and (g): on stage an agent put a person's name in `query` instead
 * of `creator_ids`, then called `get_message` per hit for text it already had.
 */
const DESCRIPTION_CHAR_OVERRIDES: Record<string, number> = {
  search_transcripts: 2050,
};

const entries = Object.entries(TOOL_DOCS);

describe('TOOL_DOCS registry', () => {
  it('is not empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('only documents tools that are actually registered', () => {
    entries.forEach(([name]) => {
      expect(TOOL_NAMES as readonly string[]).toContain(name);
    });
  });

  describe.each(entries)('%s', (name, doc: ToolDoc) => {
    it('answers what it does and when to use it', () => {
      expect(doc.purpose.trim().length).toBeGreaterThan(0);
      expect(doc.whenToUse.trim().length).toBeGreaterThan(0);
    });

    it('documents what to pass and what comes back', () => {
      // `example` must be present, but `{}` is the correct example for the
      // tools that genuinely take no arguments (get_current_user,
      // get_workspaces_basic_info) — rendering `EXAMPLE: {}` tells the agent
      // exactly that.
      expect(doc.example).toBeDefined();
      expect(typeof doc.example).toBe('object');
      expect(doc.responseShape.trim().length).toBeGreaterThan(0);
    });

    it('names a real tool in every declared prerequisite', () => {
      doc.prerequisites?.forEach((p) => {
        expect(p.field.trim().length).toBeGreaterThan(0);
        expect(p.fromField.trim().length).toBeGreaterThan(0);
        // A prerequisite pointing at a tool that does not exist sends the
        // agent somewhere it cannot go, which is worse than saying nothing.
        expect(TOOL_NAMES as readonly string[]).toContain(p.fromTool);
      });
    });

    it('gives a recovery step for every documented error', () => {
      doc.commonErrors?.forEach((e) => {
        expect(e.code.trim().length).toBeGreaterThan(0);
        expect(e.meaning.trim().length).toBeGreaterThan(0);
        expect(e.nextAction.trim().length).toBeGreaterThan(0);
      });
    });

    const budget = DESCRIPTION_CHAR_OVERRIDES[name] ?? MAX_DESCRIPTION_CHARS;
    it(`renders within the ${budget}-char budget`, () => {
      expect(renderToolDoc(doc).length).toBeLessThanOrEqual(budget);
    });
  });
});

describe('renderToolDoc', () => {
  const minimal: ToolDoc = {
    purpose: 'Does a thing.',
    whenToUse: 'When you want the thing.',
    example: { id: 'abc' },
    responseShape: '`{id}`',
  };

  it('leads with selection guidance so it survives client truncation', () => {
    const out = renderToolDoc(minimal);
    expect(out.indexOf('Does a thing.')).toBe(0);
    expect(out.indexOf('USE WHEN:')).toBeLessThan(out.indexOf('EXAMPLE:'));
    expect(out.indexOf('EXAMPLE:')).toBeLessThan(out.indexOf('RETURNS:'));
  });

  it('omits optional sections that were not supplied', () => {
    const out = renderToolDoc(minimal);
    expect(out).not.toContain('USE INSTEAD:');
    expect(out).not.toContain('FIRST:');
    expect(out).not.toContain('NARROW:');
    expect(out).not.toContain('ERROR ');
  });

  // A prerequisite whose source depends on another parameter must say so.
  // `list_action_items` takes a conversation id OR a folder id depending on
  // `container_type`, and naming one source unconditionally sends an agent to
  // the wrong tool for the other — a lookup that fails rather than a wrong
  // answer, but only because the ids happen not to collide.
  it('renders a conditional prerequisite with its condition', () => {
    const out = renderToolDoc({
      ...minimal,
      prerequisites: [
        {
          field: 'container_id',
          fromTool: 'get_root_folders',
          fromField: 'results[].id',
          when: '`container_type` is `folder`',
        },
      ],
    });

    expect(out).toContain(
      'FIRST: `container_id` comes from `get_root_folders` (field `results[].id`) ' +
        'when `container_type` is `folder`',
    );
  });

  it('renders an unconditional prerequisite without a dangling "when"', () => {
    const out = renderToolDoc({
      ...minimal,
      prerequisites: [
        {
          field: 'id',
          fromTool: 'list_conversations',
          fromField: 'results[].id',
        },
      ],
    });

    expect(out).toContain(
      'FIRST: `id` comes from `list_conversations` (field `results[].id`) — call it first',
    );
    expect(out).not.toContain('when ');
  });

  it('renders the example as valid JSON an agent can copy', () => {
    const line = renderToolDoc(minimal)
      .split('\n')
      .find((l) => l.startsWith('EXAMPLE: '))!;
    expect(JSON.parse(line.replace('EXAMPLE: ', ''))).toEqual({ id: 'abc' });
  });

  it('names the counterpart tool and the producing tool when given', () => {
    const out = renderToolDoc({
      ...minimal,
      whenNotToUse: '`other_tool` if you want something else.',
      prerequisites: [
        { field: 'prompt_id', fromTool: 'list_ai_actions', fromField: 'id' },
      ],
      recommendedFields: ['id', 'name'],
    });
    expect(out).toContain('USE INSTEAD: `other_tool`');
    expect(out).toContain('`prompt_id`');
    expect(out).toContain('`list_ai_actions`');
    expect(out).toContain('NARROW: pass response_fields ["id","name"]');
  });
});

describe('AI action chain discoverability', () => {
  // Regression guard: list_ai_actions is the ONLY producer of the prompt_id
  // that these tools require. Its description previously ended with "Do not
  // use unless the user explicitly requests it.", which left agents with a
  // required param they had no sanctioned way to obtain.
  it('does not discourage the only source of prompt_id', () => {
    expect(renderToolDoc(TOOL_DOCS.list_ai_actions)).not.toMatch(
      /do not use unless/i,
    );
  });

  it.each(['run_ai_action', 'summarize_conversation'])(
    '%s points at list_ai_actions for prompt_id',
    (tool) => {
      const doc = TOOL_DOCS[tool];
      expect(
        doc.prerequisites?.some(
          (p) => p.field === 'prompt_id' && p.fromTool === 'list_ai_actions',
        ),
      ).toBe(true);
      expect(renderToolDoc(doc)).toContain('`list_ai_actions`');
    },
  );
});

describe('summarize_conversation limit bounds', () => {
  // Codex finding on PR #6: the schema must not accept values the upstream
  // page validation will reject, now that the handler forwards limit as `size`.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { summarizeConversationParams } = require('../../../src/schemas');

  it.each([0, -1, 2.5])('rejects limit=%s', (limit) => {
    expect(
      summarizeConversationParams.safeParse({
        conversation_id: 'c',
        prompt_id: 'p',
        limit,
      }).success,
    ).toBe(false);
  });

  it.each([1, 20, 50, 200])(
    'accepts limit=%s (clamped in the handler)',
    (limit) => {
      expect(
        summarizeConversationParams.safeParse({
          conversation_id: 'c',
          prompt_id: 'p',
          limit,
        }).success,
      ).toBe(true);
    },
  );

  it('defaults to 50 when omitted', () => {
    const parsed = summarizeConversationParams.parse({
      conversation_id: 'c',
      prompt_id: 'p',
    });
    expect(parsed.limit).toBe(50);
  });
});

describe('search_transcripts doc', () => {
  const doc = TOOL_DOCS.search_transcripts;
  const rendered = renderToolDoc(doc);

  it('has an override only for itself (DD-1)', () => {
    expect(Object.keys(DESCRIPTION_CHAR_OVERRIDES)).toEqual([
      'search_transcripts',
    ]);
  });

  // STT-19
  it('says it finds a discussed topic by meaning without date or conversation', () => {
    expect(doc.purpose).toMatch(/by meaning/);
    expect(doc.whenToUse).toContain('Where did we discuss');
    expect(doc.whenToUse).toContain('without knowing the date or conversation');
  });

  it.each([
    'search_message_ids',
    'list_messages',
    'search_messages_by_heard_status',
  ])('points at `%s` instead (STT-19)', (tool) => {
    expect(doc.whenNotToUse).toContain(`\`${tool}\``);
  });

  it('warns that exact names, URLs and ticket numbers may be missed (STT-19)', () => {
    expect(doc.whenNotToUse).toContain(
      'Exact names, URLs, ticket numbers may be missed',
    );
  });

  // STT-20 (a)-(i)
  it.each([
    ['a: omitting workspace_id costs one of 20/min per workspace', '20/min'],
    ['a: send workspace_id when known', 'send it when known'],
    [
      'b: ask the user when needs_workspace_choice',
      '`needs_workspace_choice` true: ask the user',
    ],
    ['c: page with exclude_message_ids', 'exclude_message_ids'],
    [
      'd: null conversation_id is a voice memo',
      '`conversation_id: null` = your voice memo',
    ],
    ['e: scope_capped means narrow', '`scope_capped` true: narrow'],
    ['f: half-open date window', '[start_date, end_date)'],
    ['f: both dates need an offset', 'offset'],
    [
      'g: matched_chunk usually holds the transcript; get_messages for more',
      '`matched_chunk` is usually the whole transcript; for more, `get_messages` with the `message_id`s',
    ],
    [
      'i: a person goes in creator_ids, not in query',
      'their `search_user` id in `creator_ids`, not the name in `query`',
    ],
    [
      'h: skipped workspaces were not searched',
      '`skipped_workspaces` were NOT searched',
    ],
    [
      'b: then call again with the chosen workspace id',
      'ask the user which workspace (name, count, best `matched_chunk`), then call again with its id',
    ],
    [
      'c: page by sending the ids already seen',
      'Next page: seen ids in `exclude_message_ids`',
    ],
    [
      'h: tell the user and retry RATE_LIMITED later by id',
      'tell the user; retry `RATE_LIMITED` ones later by id',
    ],
  ])('%s', (_label, marker) => {
    expect(rendered).toContain(marker);
  });

  // STT-21
  it('maps workspace_id to get_workspaces_basic_info.id', () => {
    expect(doc.prerequisites).toEqual([
      expect.objectContaining({
        field: 'workspace_id',
        fromTool: 'get_workspaces_basic_info',
        fromField: 'id',
      }),
    ]);
  });

  // STT-22 removed (DD-1)
  it('has no recommendedFields', () => {
    expect(doc.recommendedFields).toBeUndefined();
  });

  // STT-23
  it('documents exactly BAD_REQUEST, FORBIDDEN, RATE_LIMITED, SERVER_ERROR, NOT_FOUND', () => {
    expect(doc.commonErrors?.map((e) => e.code)).toEqual([
      'BAD_REQUEST',
      'FORBIDDEN',
      'RATE_LIMITED',
      'SERVER_ERROR',
      'NOT_FOUND',
    ]);
  });

  it('tells RATE_LIMITED to wait a minute or retry one workspace', () => {
    const step = doc.commonErrors?.find(
      (e) => e.code === 'RATE_LIMITED',
    )?.nextAction;
    expect(step).toContain('wait a minute');
    expect(step).toContain('one `workspace_id`');
  });

  it('tells NOT_FOUND not to retry', () => {
    const step = doc.commonErrors?.find(
      (e) => e.code === 'NOT_FOUND',
    )?.nextAction;
    expect(step).toContain('do not retry');
  });
});
