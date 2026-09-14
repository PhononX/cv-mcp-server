import { renderToolDoc, TOOL_DOCS, TOOL_NAMES } from '../../../src/docs';

/**
 * Acceptance criterion 1 from
 * `.specs/features/agent-efficiency-improvements/spec.md`:
 *
 *   "An agent with no prior exposure to this interface can complete a
 *    multi-step task without a failed or wasted call."
 *
 * The canonical task is *"find the messages in workspace X from last week and
 * summarize them"*, which runs:
 *
 *   get_workspaces_basic_info -> list_messages -> list_ai_actions
 *                             -> summarize_conversation
 *
 * This cannot call the real API, so it checks the property that actually
 * decides whether an agent succeeds: at every hop, is the NEXT step and the
 * value it needs derivable from what the agent has already been told? Before
 * this work the chain was broken at step three, because list_ai_actions — the
 * only source of the required prompt_id — told agents not to use it.
 */

interface Hop {
  tool: string;
  /** Params the agent must supply, and where each comes from. */
  needs: Array<{ field: string; from: 'user' | string }>;
}

const CANONICAL_TASK: Hop[] = [
  { tool: 'get_workspaces_basic_info', needs: [] },
  {
    tool: 'list_messages',
    needs: [{ field: 'workspace_id', from: 'get_workspaces_basic_info' }],
  },
  { tool: 'list_ai_actions', needs: [] },
  {
    tool: 'summarize_conversation',
    needs: [
      { field: 'prompt_id', from: 'list_ai_actions' },
      { field: 'conversation_id', from: 'list_conversations' },
    ],
  },
];

/**
 * A hop's `recommendedFields` is a projection agents really apply. If it strips
 * a field a LATER hop needs and this hop is the one that supplies it, following
 * the advice forces the agent to repeat the call unprojected — the projection
 * defeats the chain it is documented to serve.
 *
 * This is the third finding of that shape on this branch (after
 * `list_my_action_items` stripping `assigned_to`, and the unread search
 * stripping its own messages), so it is asserted rather than re-audited by
 * hand: an earlier manual audit checked `recommendedFields` against each doc's
 * own prose and did not think to check it against the NEXT tool's inputs.
 */
describe('recommended projections do not break the chain', () => {
  CANONICAL_TASK.forEach((hop, index) => {
    const later = CANONICAL_TASK.slice(index + 1);
    const doc = TOOL_DOCS[hop.tool as keyof typeof TOOL_DOCS] as any;
    if (!doc?.recommendedFields || later.length === 0) return;

    later.forEach((next) => {
      const nextDoc = TOOL_DOCS[next.tool as keyof typeof TOOL_DOCS] as any;

      next.needs.forEach((need) => {
        // The consuming tool's PARAM name is not the producing tool's RESPONSE
        // field name — `summarize_conversation.prompt_id` comes from
        // `list_ai_actions.id`. The prerequisite records that mapping, so
        // resolve through it; matching on the param name reports
        // `list_ai_actions` as stripping a field it never returns.
        const link = (nextDoc?.prerequisites ?? []).find(
          (p: any) => p.field === need.field && p.fromTool === hop.tool,
        );

        // When this hop is the DECLARED source, its prerequisite names the
        // response field authoritatively. Otherwise the hop may still supply
        // the value under the parameter's own name — `summarize_conversation`
        // declares `conversation_id` as coming from `list_conversations`, yet
        // `list_messages` returns it too, and that is the path an agent
        // following this chain actually takes. Requiring a declared link here
        // made the guard pass vacuously on exactly the case it was written for.
        const responseField = link
          ? link.fromField.split('.').pop()
          : need.field;
        if (!doc.responseShape.includes(responseField)) return;

        it(`${hop.tool} keeps ${responseField} for ${next.tool}.${need.field}`, () => {
          const kept = doc.recommendedFields.some(
            (f: string) => f.split('.').pop() === responseField,
          );
          expect(kept).toBe(true);
        });
      });
    });
  });
});

describe('canonical multi-step task is completable from the descriptions alone', () => {
  it.each(CANONICAL_TASK.map((h) => h.tool))('%s is registered', (tool) => {
    expect(TOOL_NAMES as readonly string[]).toContain(tool);
  });

  it.each(CANONICAL_TASK.map((h) => h.tool))('%s is documented', (tool) => {
    expect(TOOL_DOCS[tool]).toBeDefined();
  });

  it('no step in the chain discourages its own use', () => {
    // The regression that broke this task outright.
    CANONICAL_TASK.forEach(({ tool }) => {
      const rendered = renderToolDoc(TOOL_DOCS[tool]);
      expect(rendered).not.toMatch(/do not use unless/i);
      expect(rendered).not.toMatch(/should not be used/i);
    });
  });

  it('every required value names the tool that produces it', () => {
    CANONICAL_TASK.forEach(({ tool, needs }) => {
      const doc = TOOL_DOCS[tool];
      needs.forEach(({ field, from }) => {
        const declared = doc.prerequisites?.some(
          (p) => p.field === field && p.fromTool === from,
        );
        const mentioned = renderToolDoc(doc).includes(`\`${from}\``);
        // Either a structured prerequisite or an explicit pointer in prose is
        // enough for the agent; both being absent is the failure mode.
        expect(declared || mentioned).toBe(true);
      });
    });
  });

  it('each producing tool documents the field the next step consumes', () => {
    // list_ai_actions must say its `id` is the prompt_id, or the agent has the
    // right tool and still cannot fill the param.
    expect(TOOL_DOCS.list_ai_actions.responseShape).toContain('prompt_id');
    // get_workspaces_basic_info must say it returns ids.
    expect(TOOL_DOCS.get_workspaces_basic_info.responseShape).toContain('id');
    // list_messages must document the paging signal so the agent knows when
    // it has everything for the summary.
    expect(TOOL_DOCS.list_messages.responseShape).toContain('has_next_page');
  });

  it('summarize_conversation explains that it selects messages itself', () => {
    // Otherwise an agent burns a list_messages call it does not need, then
    // passes message_ids that limit the summary.
    const rendered = renderToolDoc(TOOL_DOCS.summarize_conversation);
    expect(rendered).toMatch(/message_ids/);
    expect(rendered.toLowerCase()).toMatch(/omit|handled for you/);
  });
});

describe('every documented prerequisite forms a usable chain', () => {
  it('names a registered tool and a non-empty source field', () => {
    Object.entries(TOOL_DOCS).forEach(([tool, doc]) => {
      doc.prerequisites?.forEach((p) => {
        expect(TOOL_NAMES as readonly string[]).toContain(p.fromTool);
        expect(p.fromField.trim().length).toBeGreaterThan(0);
        expect(p.fromTool).not.toBe(tool);
      });
    });
  });

  it('never points a tool at itself for a value', () => {
    Object.entries(TOOL_DOCS).forEach(([tool, doc]) => {
      doc.prerequisites?.forEach((p) => expect(p.fromTool).not.toBe(tool));
    });
  });

  it('resolves run_ai_action_for_shared_link, which had no producer at all', () => {
    // Before share links were exposed, nothing could produce share_link_ids,
    // so this tool was unreachable.
    const doc = TOOL_DOCS.run_ai_action_for_shared_link;
    const producer = doc.prerequisites?.find(
      (p) => p.field === 'share_link_ids',
    );
    expect(producer?.fromTool).toBe('create_message_share_link');
    expect(TOOL_NAMES as readonly string[]).toContain(producer!.fromTool);
  });
});

describe('every overlapping tool pair points at its counterpart', () => {
  const PAIRS: Array<[string, string]> = [
    ['list_messages', 'get_recent_messages'],
    ['get_recent_messages', 'list_messages'],
    ['get_folder', 'get_folder_with_messages'],
    ['get_folder_with_messages', 'get_folder'],
    ['run_ai_action', 'summarize_conversation'],
    ['summarize_conversation', 'run_ai_action'],
    ['get_current_user', 'get_user'],
    ['get_user', 'get_current_user'],
    ['search_user', 'search_users'],
    ['search_users', 'search_user'],
    ['list_ai_actions', 'get_ai_action_responses'],
    ['get_ai_action_responses', 'run_ai_action'],
    ['delete_action_item', 'set_action_item_status'],
    ['update_action_item', 'set_action_item_status'],
    ['set_action_item_status', 'update_action_item'],
    ['list_my_action_items', 'list_action_items'],
    ['list_action_items', 'list_my_action_items'],
    ['search_message_ids', 'search_messages_by_heard_status'],
    ['search_messages_by_heard_status', 'search_message_ids'],
    ['list_inbox_notifications', 'search_message_ids'],
    ['delete_folder', 'move_folder'],
    ['move_folder', 'update_folder_name'],
    ['update_folder_name', 'move_folder'],
  ];

  it.each(PAIRS)('%s points at %s', (tool, counterpart) => {
    const doc = TOOL_DOCS[tool];
    expect(doc).toBeDefined();
    expect(doc.whenNotToUse).toBeDefined();
    expect(doc.whenNotToUse).toContain(`\`${counterpart}\``);
  });
});
