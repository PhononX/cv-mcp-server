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
