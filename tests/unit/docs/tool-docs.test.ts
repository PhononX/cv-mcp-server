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

    it(`renders within the ${MAX_DESCRIPTION_CHARS}-char budget`, () => {
      expect(renderToolDoc(doc).length).toBeLessThanOrEqual(
        MAX_DESCRIPTION_CHARS,
      );
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
