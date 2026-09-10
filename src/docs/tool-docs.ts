import { ToolDocRegistry } from './types';

/**
 * Agent-facing documentation for every registered MCP tool.
 *
 * Authored here, not inherited from the generated OpenAPI descriptions — see
 * `types.ts` and `.specs/features/agent-efficiency-improvements/STATE.md`
 * (decision 0.1). Where upstream text is wrong or incomplete, override it here.
 *
 * Keep entries terse: every character is paid in the `tools/list` payload on
 * every request, before the agent makes a single call.
 */
export const TOOL_DOCS: ToolDocRegistry = {
  /**********************
   * AI Actions
   *********************/

  // NOTE: the previous description ended with "Do not use unless the user
  // explicitly requests it." That line made the whole AI-action chain
  // unusable: this is the ONLY source of the `prompt_id` that `run_ai_action`
  // and `summarize_conversation` both require, so discouraging it left agents
  // with a required param they had no way to obtain.
  list_ai_actions: {
    purpose:
      'List the AI Actions (Prompts) available to you — each has an `id` usable as `prompt_id`.',
    whenToUse:
      'Before calling `run_ai_action` or `summarize_conversation`, to find a `prompt_id`. Also to show the user which AI Actions exist. ' +
      'Filter by `owner_type` (`user` = your own, `workspace` = shared, `system` = Carbon Voice built-ins).',
    whenNotToUse:
      '`get_ai_action_responses` if you want results that were already generated rather than the list of available actions.',
    example: { owner_type: 'system' },
    responseShape:
      'Array of `{id, name, description?, prompt, owner_type, workspace_id?, response_format?, created_at, last_updated_at}`. Use `id` ' +
      'as ' +
      '`prompt_id` elsewhere.',
    recommendedFields: ['id', 'name', 'description', 'owner_type'],
  },

  run_ai_action: {
    purpose: 'Run an AI Action (Prompt) against one or more specific messages.',
    whenToUse:
      'You have concrete `message_ids` and a `prompt_id`, and want the AI Action applied to exactly those messages.',
    whenNotToUse:
      '`summarize_conversation` if you want a whole conversation summarized and would otherwise have to list its messages yourself — it ' +
      'does that selection for you.',
    prerequisites: [
      { field: 'prompt_id', fromTool: 'list_ai_actions', fromField: 'id' },
      {
        field: 'message_ids',
        fromTool: 'list_messages',
        fromField: 'results[].id',
      },
    ],
    example: {
      prompt_id: 'prompt-abc',
      message_ids: ['msg-1', 'msg-2'],
      language: 'english',
    },
    responseShape:
      '`{id, prompt_id, message_ids, creator_id, channel_id?, workspace_id?, responses: [{language, text?, markdown?, html?, json?}], ' +
      'created_at}`. The generated output is in `responses[]`, one entry per language.',
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning: '`prompt_id` or one of `message_ids` is not a valid ID.',
        nextAction:
          'Call `list_ai_actions` for valid `prompt_id` values and `list_messages` for valid message IDs; do not retry with the same IDs.',
      },
    ],
  },

  summarize_conversation: {
    purpose:
      'Summarize a conversation by running an AI Action over its recent messages.',
    whenToUse:
      'You want a conversation summarized and have a `conversation_id`. Message selection is handled for you — omit `message_ids` and ' +
      'the ' +
      'most recent messages are used.',
    whenNotToUse:
      '`run_ai_action` if you already know exactly which `message_ids` to process, or want a non-summary AI Action.',
    prerequisites: [
      { field: 'prompt_id', fromTool: 'list_ai_actions', fromField: 'id' },
      {
        field: 'conversation_id',
        fromTool: 'list_conversations',
        fromField: 'results[].id',
      },
    ],
    example: {
      conversation_id: 'conv-abc',
      prompt_id: 'prompt-abc',
      limit: 50,
    },
    responseShape:
      'Same as `run_ai_action`: `{id, prompt_id, message_ids, responses: [{language, text?, markdown?, ...}], ...}`.',
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning: '`prompt_id` is not a valid AI Action ID.',
        nextAction: 'Call `list_ai_actions` to get valid `prompt_id` values.',
      },
    ],
  },

  get_ai_action_responses: {
    purpose: 'Retrieve AI Action results that were generated previously.',
    whenToUse:
      'You want existing output rather than a fresh run — e.g. showing what an AI Action already produced for a message or conversation. ' +
      'Combine `prompt_id`, `message_id` and `channel_id` to narrow.',
    whenNotToUse:
      '`run_ai_action` (or `summarize_conversation`) to generate new output; this tool only reads what already exists and returns an ' +
      'empty array if nothing has been generated.',
    example: { channel_id: 'conv-abc', limit: 10 },
    responseShape:
      'Array of `{id, prompt_id, creator_id, message_ids, channel_id?, workspace_id?, responses: [{language, text?, markdown?, html?, ' +
      'json?}], created_at}`.',
    recommendedFields: ['id', 'prompt_id', 'responses'],
  },

  run_ai_action_for_shared_link: {
    purpose:
      'Run an AI Action (Prompt) against one or more shared messages, addressed by share link ID.',
    whenToUse:
      'You have share link IDs — from `create_message_share_link`, or a link someone gave you — and want an AI Action applied to the ' +
      'messages behind them.',
    whenNotToUse:
      '`run_ai_action` if you have the message IDs directly; going through a share link adds nothing when you already have access.',
    prerequisites: [
      {
        field: 'share_link_ids',
        fromTool: 'create_message_share_link',
        fromField: 'id',
      },
      { field: 'prompt_id', fromTool: 'list_ai_actions', fromField: 'id' },
    ],
    example: {
      prompt_id: 'prompt-abc',
      share_link_ids: ['share-abc'],
    },
    responseShape:
      '`{share_link_ids, responses: [{language, text?, markdown?, html?, json?}], ...}`.',
    commonErrors: [
      {
        code: 'NOT_FOUND',
        meaning:
          'A share link ID does not exist, or its access has been revoked or expired.',
        nextAction:
          'Create a fresh link with `create_message_share_link`, or verify the ID with `get_message_share_link`.',
      },
    ],
  },

  /**********************
   * Message Share Links
   *********************/

  create_message_share_link: {
    purpose:
      'Create a shareable link to an existing message (e.g. a voice memo), and get the URL back.',
    whenToUse:
      '`share_type: "link"` for a shareable URL; `"forward"` to attach the share onto another message (also needs `message_id`). Also ' +
      'how ' +
      'you get a `share_link_ids` value.',
    whenNotToUse:
      '`add_attachments_to_message` to attach an external URL to a message, rather than share a Carbon Voice message outward.',
    prerequisites: [
      {
        field: 'shared_message_id',
        fromTool: 'list_messages',
        fromField: 'results[].id',
      },
    ],
    example: {
      shared_message_id: 'msg-abc',
      share_type: 'link',
      access_type: 'public',
    },
    responseShape:
      '`{id, link, share_type, access_type, created_by, specified_access?, end_access_at?, revoked_at?, shared_message: {...}}`. `link` ' +
      'is the URL to hand out; `id` is the `share_link_ids` value other tools take.',
    recommendedFields: ['id', 'link', 'share_type', 'access_type'],
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning:
          '`shared_message_id` is invalid, or `share_type` is "forward" without `message_id`.',
        nextAction:
          'Confirm the ID with `get_message`; when forwarding, also pass `message_id`.',
      },
    ],
  },

  get_message_share_link: {
    purpose:
      'Look up an existing message share link by its ID, including the message behind it.',
    whenToUse:
      'You have a share link ID and want its URL, access settings, or whether it is still valid — check `revoked_at` and `end_access_at` ' +
      'before relying on it.',
    whenNotToUse:
      '`create_message_share_link` to make a new link; this only reads existing ones. `get_message` if you have the message ID and do ' +
      'not ' +
      'care about the share.',
    prerequisites: [
      {
        field: 'share_link_id',
        fromTool: 'create_message_share_link',
        fromField: 'id',
      },
    ],
    example: { share_link_id: 'share-abc' },
    responseShape:
      'Same shape as `create_message_share_link`: `{id, link, share_type, access_type, revoked_at?, end_access_at?, shared_message: ' +
      '{...}, ...}`.',
    recommendedFields: ['id', 'link', 'revoked_at', 'end_access_at'],
    commonErrors: [
      {
        code: 'NOT_FOUND',
        meaning: 'No share link with that ID, or it is no longer accessible.',
        nextAction:
          'Create a new one with `create_message_share_link`; do not retry the same ID.',
      },
    ],
  },

  /**********************
   * Action Items
   *********************/

  list_my_action_items: {
    purpose:
      'List action items assigned to you, across every conversation and folder.',
    whenToUse:
      'Answering "what do I owe / what is on my plate". Filter by `status` ' +
      '(`todo` for open work, `suggested` for AI-proposed items not yet accepted, ' +
      '`done` for completed). Page with `starting_after`.',
    whenNotToUse:
      '`list_action_items` when you want one specific conversation or folder ' +
      'rather than everything assigned to you.',
    example: { status: 'todo', limit: 25 },
    responseShape:
      '`{results: [{id, title, status, notes_text?, assigned_to?, due_date?, ' +
      'container_id?, container_type?, source_message_id?, creator_id, ...}], ' +
      'total?, results_count?, has_more?, next_cursor?, filters?}`. ' +
      'Keep paging while `has_more` is true, passing `next_cursor` as `starting_after`.',
    recommendedFields: [
      'results.id',
      'results.title',
      'results.status',
      'results.due_date',
    ],
  },

  list_action_items: {
    purpose:
      'List action items belonging to one container — a conversation, a folder, or home.',
    whenToUse:
      'You have a `container_id` and want its action items. `container_type` is ' +
      '`channel` for a conversation, `folder` for a folder, or `home`. ' +
      'Filter by `status` or `assigned_to` (pass the string `null` for unassigned).',
    whenNotToUse:
      '`list_my_action_items` for everything assigned to you regardless of where it lives.',
    prerequisites: [
      {
        field: 'container_id',
        fromTool: 'list_conversations',
        fromField: 'results[].id',
      },
    ],
    example: {
      container_type: 'channel',
      container_id: 'conv-abc',
      status: 'todo',
    },
    responseShape:
      'Same as `list_my_action_items`: `{results: [...], total?, results_count?, ' +
      'has_more?, next_cursor?, filters?}`.',
    recommendedFields: [
      'results.id',
      'results.title',
      'results.status',
      'results.assigned_to',
    ],
  },

  get_action_item: {
    purpose: 'Get one action item by its ID, with full detail.',
    whenToUse:
      'You have an action item ID and need its notes, assignee, due date, or source message.',
    whenNotToUse:
      '`list_my_action_items` or `list_action_items` if you do not have an ID yet — ' +
      'they already return the same fields per item, so a follow-up call is usually wasted.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'list_my_action_items',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'ai-abc' },
    responseShape:
      '`{id, title, status, notes_text?, creator_id, assigned_to?, due_date?, ' +
      'container_id?, container_type?, source_message_id?, last_updated_by, ...}`.',
  },

  create_action_item: {
    purpose:
      'Create an action item, optionally attached to a conversation or folder.',
    whenToUse:
      'Recording a task. Only `title` is required. Attach it by passing both ' +
      '`container_type` and `container_id`, and link it to what prompted it with ' +
      '`source_message_id`.',
    whenNotToUse:
      '`suggest_action_items_from_messages` to have tasks extracted from message ' +
      'content automatically instead of writing each one yourself.',
    example: { title: 'Send the pricing deck', assigned_to: 'user-abc' },
    responseShape:
      '`{id, title, status, notes_text?, assigned_to?, due_date?, container_id?, ' +
      'container_type?, creator_id, ...}`. New items start at status `todo`.',
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning:
          '`assigned_to` is not a valid user ID, or `container_id` does not match `container_type`.',
        nextAction:
          'Resolve people with `search_users` (never pass a name) and containers with ' +
          '`list_conversations` or `get_root_folders`.',
      },
    ],
  },

  update_action_item: {
    purpose: "Change an action item's title, notes, assignee, or due date.",
    whenToUse:
      'Editing item content. Send only the fields you want changed — omitted fields ' +
      'are left as they are.',
    whenNotToUse:
      '`set_action_item_status` to move an item between `todo` / `done` / `suggested`; ' +
      'status is not editable here.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'list_my_action_items',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'ai-abc', due_date: '2026-10-01' },
    responseShape: 'The updated action item, same shape as `get_action_item`.',
  },

  set_action_item_status: {
    purpose: 'Move an action item between `suggested`, `todo` and `done`.',
    whenToUse:
      'Completing an item (`done`), reopening it (`todo`), or accepting an AI-suggested ' +
      'item by promoting it from `suggested` to `todo`.',
    whenNotToUse:
      '`update_action_item` for title, notes, assignee or due date; this tool only sets status.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'list_my_action_items',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'ai-abc', status: 'done' },
    responseShape: 'The updated action item, same shape as `get_action_item`.',
  },

  delete_action_item: {
    purpose: 'Permanently delete an action item.',
    whenToUse: 'The item was created in error and should not exist at all.',
    whenNotToUse:
      '`set_action_item_status` with `done` to complete an item — that keeps the record. ' +
      'Deleting cannot be undone, so prefer it only when the item is genuinely spurious.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'list_my_action_items',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'ai-abc' },
    responseShape: 'Deletion confirmation for the removed item.',
  },

  suggest_action_items_from_messages: {
    purpose:
      'Have Carbon Voice extract candidate action items from the content of specific messages.',
    whenToUse:
      'Turning a conversation into tasks — "what did we agree to?". Pass the ' +
      '`message_ids` to analyse. Results come back at status `suggested`; promote the ' +
      'ones you want with `set_action_item_status`.',
    whenNotToUse:
      '`create_action_item` when you already know the task and do not need it inferred.',
    prerequisites: [
      {
        field: 'message_ids',
        fromTool: 'list_messages',
        fromField: 'results[].id',
      },
    ],
    example: { message_ids: ['msg-1', 'msg-2'] },
    responseShape:
      'The created suggestions, each shaped like `get_action_item`, at status `suggested`.',
  },

  /**********************
   * Search & Notifications
   *********************/

  search_message_ids: {
    purpose:
      'Find message IDs by notified state, mentions, labels, creator, ' +
      'conversation or workspace — returning IDs plus cursor metadata.',
    whenToUse:
      'Any filter `list_messages` cannot express: whether you were notified ' +
      '(`notified_status`), whether you were tagged (`tagged_user_ids`), or by ' +
      '`label_ids`. Cheap in tokens because it returns IDs only — hydrate the ' +
      'ones you need with `get_message`.',
    whenNotToUse:
      '`list_messages` when a date range, conversation or workspace filter is ' +
      'all you need and you want full message bodies in one call. ' +
      '`search_messages_by_heard_status` for unread/listened state, which this ' +
      'tool cannot filter on.',
    example: { notified_status: 'notified', limit: 50 },
    responseShape:
      '`{ids: [{...}], has_more, next_cursor?}`. Keep paging while `has_more` ' +
      'is true, passing `next_cursor` back as `next_cursor`.',
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning:
          'An ID list contains names rather than IDs, or exceeds 50 entries.',
        nextAction:
          'Resolve people to IDs with `search_users` and conversations with ' +
          '`list_conversations`; split lists longer than 50.',
      },
    ],
  },

  search_messages_by_heard_status: {
    purpose:
      'Find messages by whether you have listened to them, and get per-conversation unheard counts.',
    whenToUse:
      '"What have I not listened to yet" / "catch me up". `heardStatus: ' +
      '"unheard"` is the unread filter. The response also carries ' +
      '`unheard_counts_by_channel`, so you can prioritise conversations without ' +
      'fetching their messages.',
    whenNotToUse:
      '`search_message_ids` for notified state, mentions or date anchors — this ' +
      'tool accepts no date filter (see note below). `list_messages` for plain ' +
      'recent history.',
    example: { heardStatus: 'unheard', limit: 25 },
    responseShape:
      '`{messages: [...], unheard_counts_by_channel: {conversation_id: count}, ' +
      'success}`. Use `unheard_counts_by_channel` to decide where to look first.',
    recommendedFields: ['unheard_counts_by_channel'],
  },

  list_inbox_notifications: {
    purpose: 'List your inbox notifications, with a total unread count.',
    whenToUse:
      'Answering "what did I miss" or "where was I mentioned" — pass ' +
      '`category: "mentions"` for mentions. The response includes ' +
      '`total_unread`, so you can report a count without paging.',
    whenNotToUse:
      '`search_message_ids` with `notified_status` if you want the messages ' +
      'themselves rather than notification records. ' +
      '`search_messages_by_heard_status` for unlistened messages.',
    example: { category: 'mentions', limit: 25 },
    responseShape:
      '`{results: [...], total_results, total_unread, filters}`. Pages with ' +
      '`skip`/`limit`, not cursors.',
    recommendedFields: ['results', 'total_unread', 'total_results'],
  },
};
