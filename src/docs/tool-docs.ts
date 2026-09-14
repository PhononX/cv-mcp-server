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
      'List your action items across every conversation and folder: those ' +
      'assigned to you, PLUS unassigned ones you created.',
    whenToUse:
      'Answering "what do I owe / what is on my plate" — but check ' +
      "`assigned_to` before calling something the user's own commitment: a " +
      'null one is an item they raised that nobody has picked up. Filter by ' +
      '`status` (`todo` open, `suggested` AI-proposed, `done` complete). Page ' +
      'with `starting_after`.',
    whenNotToUse:
      '`list_action_items` when you want one specific conversation or folder ' +
      'rather than everything of yours.',
    example: { status: 'todo', limit: 25 },
    responseShape:
      '`{results: [{id, title, status, notes_text?, assigned_to?, due_date?, ' +
      'container_id?, container_type?, source_message_id?, creator_id, ...}], ' +
      'total?, results_count?, has_more?, next_cursor?, filters?}`. ' +
      'Keep paging while `has_more` is true, passing `next_cursor` as `starting_after`.',
    // `assigned_to` is not optional here the way it is on other tools: the
    // guidance above tells the agent to check it before calling an item the
    // user's own commitment, so a projection that strips it makes the tool's
    // own instruction impossible to follow.
    recommendedFields: [
      'results.id',
      'results.title',
      'results.status',
      'results.assigned_to',
      'results.due_date',
    ],
  },

  list_action_items: {
    purpose:
      'List action items belonging to one container — a conversation, a folder, or home.',
    whenToUse:
      'You have a `container_id` and want its action items. `container_type` is ' +
      '`channel` for a conversation, `folder` for a folder, or `home`. A ' +
      'conversation id is NOT a folder id — resolve `container_id` with the tool ' +
      'matching your `container_type`. Filter by `status` or `assigned_to` ' +
      '(pass the string `null` for unassigned).',
    whenNotToUse:
      '`list_my_action_items` for everything assigned to you regardless of where it lives.',
    prerequisites: [
      {
        field: 'container_id',
        fromTool: 'list_conversations',
        fromField: 'results[].id',
        when: '`container_type` is `channel`',
      },
      {
        field: 'container_id',
        fromTool: 'get_root_folders',
        fromField: 'results[].id',
        when: '`container_type` is `folder`',
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

  suggest_action_items_from_message: {
    purpose:
      'Extract action items from ONE message and return them immediately.',
    whenToUse:
      'Turning a single message into tasks — "what did she ask me to do?". ' +
      'The items come back in this call, already saved with ' +
      '`status: "suggested"`; promote the ones you want with ' +
      '`set_action_item_status`. Prefer this over ' +
      '`suggest_action_items_from_messages` whenever there is exactly one ' +
      'message, since it needs no polling.',
    whenNotToUse:
      '`suggest_action_items_from_messages` for two or more messages — it ' +
      'reasons over the whole set at once and can catch commitments that span ' +
      'messages, which calling this tool repeatedly cannot. ' +
      '`create_action_item` when you already know the task.',
    prerequisites: [
      {
        field: 'message_id',
        fromTool: 'list_messages',
        fromField: 'results[].id',
      },
    ],
    example: { message_id: 'msg-1' },
    // Runs the model inline, so it is slower than most tools but saves the
    // poll loop the plural endpoint forces.
    responseShape:
      'Array of the created action items, each with `id`, `title`, ' +
      '`assigned_to`, `due_date`, `notes_text` and `status: "suggested"`. An ' +
      'empty array means the model found nothing actionable. Runs the ' +
      'extraction inline, so expect this call to take a few seconds.',
  },

  suggest_action_items_from_messages: {
    purpose:
      'Queue AI extraction of candidate action items from specific messages. Runs in the background.',
    whenToUse:
      'Turning a conversation into tasks — "what did we agree to?". Pass the ' +
      '`message_ids` to analyse, then POLL `list_my_action_items` or ' +
      '`list_action_items` with `status: "suggested"` for the results, and ' +
      'promote the ones you want with `set_action_item_status`.',
    whenNotToUse:
      '`suggest_action_items_from_message` (singular) for a SINGLE message — ' +
      'it returns the items directly, with no polling. ' +
      '`create_action_item` when you already know the task and do not need it ' +
      'inferred — that returns the item synchronously, with an id.',
    prerequisites: [
      {
        field: 'message_ids',
        fromTool: 'list_messages',
        fromField: 'results[].id',
      },
    ],
    example: { message_ids: ['msg-1', 'msg-2'] },
    // The endpoint is 202 ACCEPTED with an empty body (`mutator<void>`), and
    // cv-api documents it as "enqueued and processed in the background. No
    // response will be returned." Promising records here sent agents looking
    // for ids that never arrive.
    responseShape:
      'ACKNOWLEDGEMENT ONLY — no items are returned. Extraction is queued and ' +
      'runs in the background, so poll a listing tool with ' +
      '`status: "suggested"` to see the results.',
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
    // Full-API shape, so `_guid` naming rather than the simplified `id`. Named
    // explicitly because an agent cannot choose `response_fields` against
    // `messages: [...]`.
    responseShape:
      '`{messages: [{message_guid, creator_guid, creator_first_name, ' +
      'channel_guids, transcript_txt, message_ts, heard_status, ...}], ' +
      'unheard_counts_by_channel: {conversation_id: count}, success}`. ' +
      'Use `unheard_counts_by_channel` to decide where to look first.',
    // Must keep the messages: "catch me up" is answered from them, and a
    // projection down to counts alone would force the whole call to be
    // repeated unprojected to say anything about what was actually missed.
    recommendedFields: [
      'unheard_counts_by_channel',
      'messages.message_guid',
      'messages.channel_guids',
      'messages.creator_first_name',
      'messages.transcript_txt',
      'messages.message_ts',
    ],
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

  /**********************
   * Messages
   *********************/

  create_voicememo_message: {
    purpose:
      'Create a voice memo, either from text (spoken via text-to-speech) or from an audio file at a URL.',
    whenToUse:
      'Pass `transcript` (2-5000 chars) to have Carbon Voice speak the text, ' +
      'or an https `audio_url` to upload audio, which wins over `transcript`. ' +
      'File it with `folder_id`, whose type must match, or a `workspace_id`.',
    whenNotToUse:
      '`create_conversation_message` to post into an existing conversation, or ' +
      '`create_direct_message` to send to specific people. A voice memo is ' +
      'standalone and lives in a folder or workspace.',
    example: {
      transcript: 'Reminder to review the pricing deck before Friday.',
    },
    responseShape:
      '`{message: {id, link, transcript?, audio_url?, duration_ms, status, ' +
      'type, created_at, ...}}`. `status` is often `processing` at first.',
    commonErrors: [
      {
        code: 'INVALID_AUDIO_URL',
        meaning:
          '`audio_url` is not https, unreachable, too large, timed out, ' +
          'embeds credentials, or resolves to a private address.',
        nextAction:
          'The message gives the reason. Use a public https URL, or pass ' +
          '`transcript` instead.',
      },
      {
        code: 'BAD_REQUEST',
        meaning:
          'None of `transcript`, `audio_url` or `links` was provided, or ' +
          'the transcript is outside 2-5000 characters.',
        nextAction:
          'Provide one of the three, and keep the transcript within the length limits.',
      },
    ],
  },

  list_messages: {
    purpose:
      'List messages, filtering by date, conversation, folder, workspace, creator or language.',
    whenToUse:
      'The general-purpose message reader; full bodies incl. transcript and AI ' +
      'summary. All filters optional. Max date span 183 days. `user_ids` filters ' +
      'by SENDER — for messages exchanged WITH someone, pass `conversation_id` ' +
      'from `list_conversations`. Use presigned URLs as-is.',
    whenNotToUse:
      '`get_recent_messages` for the latest few (capped at 10, no paging). ' +
      '`search_message_ids` for notified state, mentions or labels.',
    prerequisites: [
      {
        field: 'workspace_id',
        fromTool: 'get_workspaces_basic_info',
        fromField: 'id',
        when: 'restricting to one workspace',
      },
    ],
    example: {
      workspace_id: 'ws-abc',
      start_date: '2026-09-01T00:00:00Z',
      size: 25,
    },
    responseShape:
      '`{page, size, sort_direction, total, results_count, has_next_page, ' +
      'filters, results: [{id, transcript?, ai_summary?, audio_url?, creator_id, ' +
      'conversation_id?, duration_ms, reply_count, status, type, created_at, ' +
      '...}]}`. Page on `has_next_page`/`total`.',
    recommendedFields: [
      'total',
      'has_next_page',
      'results.id',
      'results.conversation_id',
      'results.transcript',
      'results.created_at',
    ],
  },

  get_message: {
    purpose: 'Get one message by ID, optionally expanded with related records.',
    whenToUse:
      'You have a message ID. `fields` ADDS related data (`conversation`, ' +
      '`creator`, `labels`) — it does not narrow the response. Use ' +
      '`response_fields` to narrow.',
    whenNotToUse:
      '`list_messages` when you do not have an ID, or need several messages — ' +
      'it already returns full bodies, so fetching each one again is wasted.',
    prerequisites: [
      { field: 'id', fromTool: 'list_messages', fromField: 'results[].id' },
    ],
    example: { id: 'msg-abc', fields: 'creator' },
    responseShape:
      '`{message: {id, transcript?, ai_summary?, audio_url?, creator_id, ' +
      'duration_ms, status, type, attachments?, created_at, ...}}`.',
  },

  get_recent_messages: {
    purpose:
      'Get up to 10 of the most recent messages, each with its conversation, creator and labels.',
    whenToUse:
      'A quick "what just happened" glance. Pre-joined, so no follow-up calls ' +
      'for creator or conversation names.',
    whenNotToUse:
      '`list_messages` whenever you need more than 10, any date range, paging, ' +
      'or a filter other than conversation and language — this tool supports none of those.',
    example: { conversation_id: 'conv-abc' },
    responseShape:
      '`{results: [{message: {...}, conversation: {...}, creator: {...}, ' +
      'labels: [...]}]}`. No total and no paging: the cap of 10 is the whole answer.',
  },

  create_conversation_message: {
    purpose:
      'Post a message into an existing conversation, or reply in a thread.',
    whenToUse:
      'You have a `conversation_id`. Pass `parent_id` (a message ID) to reply ' +
      'as a thread. Either `transcript` or `links` is required — the schema ' +
      'marks neither individually, so both param descriptions say so.',
    whenNotToUse:
      '`create_direct_message` to reach people who are not already in a ' +
      'conversation. `create_voicememo_message` for a standalone memo.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'list_conversations',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'conv-abc', transcript: 'Agreed, shipping Friday.' },
    responseShape:
      '`{message: {id, link, transcript?, status, type, conversation_id, created_at, ...}}`.',
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning: 'Neither `transcript` nor `links` was provided.',
        nextAction: 'Pass at least one of them.',
      },
    ],
  },

  create_direct_message: {
    purpose:
      'Send a direct message to one or more people, by user ID or email.',
    whenToUse:
      'Reaching people outside an existing conversation. Address it with ' +
      '`to.user_ids` or `to.emails`. Requires `transcript` or `links`.',
    whenNotToUse:
      '`create_conversation_message` when a conversation already exists — a DM ' +
      'starts a separate thread rather than joining it.',
    prerequisites: [
      { field: 'to.user_ids', fromTool: 'search_users', fromField: 'id' },
    ],
    example: {
      to: { user_ids: ['user-abc'] },
      transcript: 'Quick question about the deck.',
    },
    responseShape:
      '`{message: {id, link, transcript?, status, conversation_id, created_at, ...}}`.',
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning:
          'A user ID is invalid, or neither `transcript` nor `links` was provided.',
        nextAction:
          'Resolve people with `search_users` — never pass a display name as a ' +
          'user ID — and include a transcript or links.',
      },
    ],
  },

  add_attachments_to_message: {
    purpose: 'Attach one or more link URLs to an existing message.',
    whenToUse: 'Adding external links to a message that already exists.',
    whenNotToUse:
      '`create_message_share_link` to share a Carbon Voice message outward — ' +
      'that produces a link, this consumes them.',
    prerequisites: [
      { field: 'id', fromTool: 'list_messages', fromField: 'results[].id' },
    ],
    example: { id: 'msg-abc', links: ['https://example.com/spec'] },
    responseShape: '`{...}` confirmation with the resulting attachments.',
  },

  get_user: {
    purpose:
      "Get a user's full profile by ID — names, languages, voice settings, workspace roles.",
    whenToUse: 'You already have a user ID and need complete details.',
    whenNotToUse:
      '`search_user` / `search_users` to FIND someone by email, phone or name. ' +
      '`get_current_user` for the caller — this tool needs an explicit ID and ' +
      'will not default to you.',
    prerequisites: [{ field: 'id', fromTool: 'search_users', fromField: 'id' }],
    example: { id: 'user-abc' },
    responseShape:
      '`{id, first_name, last_name?, languages, voice_gender, workspace_ids, ' +
      'workspace_roles, user_type, created_at, ...}`.',
    recommendedFields: ['id', 'first_name', 'last_name', 'workspace_ids'],
  },

  search_user: {
    purpose: 'Find a single user by email, phone or name.',
    whenToUse:
      'Resolving ONE person. Supply exactly one of `email`, `phone` or ' +
      '`name`. Name search only matches your own contacts.',
    whenNotToUse:
      '`search_users` for several people in one call — it takes arrays and saves ' +
      'a round trip per person. `get_user` when you already have the ID.',
    example: { email: 'someone@example.com' },
    responseShape:
      '`{id, full_name, first_name, last_name?, link, image_url?, languages?, ...}`. ' +
      'Use `id` wherever another tool asks for a user ID.',
    commonErrors: [
      {
        code: 'NOT_FOUND',
        meaning: 'Nobody matched, or a name search hit a non-contact.',
        nextAction:
          'Try an email or phone instead of a name; name search is limited to your contacts.',
      },
    ],
  },

  search_users: {
    purpose: 'Resolve several users at once by emails, phones, IDs or names.',
    whenToUse:
      'Turning a list of people into user IDs in one call — the right first step ' +
      'before any tool that takes user IDs. Name search only matches your contacts.',
    whenNotToUse:
      '`search_user` for a single lookup. `get_user` for a full profile once you have the ID.',
    example: { names: ['Brett'] },
    responseShape:
      'Array of `{id, full_name, first_name, last_name?, link, languages?, ...}`. ' +
      'If a name returns more than one candidate, ask which person was meant ' +
      'rather than guessing.',
    recommendedFields: ['id', 'full_name'],
  },

  get_current_user: {
    purpose: "Get the calling user's own identity, workspaces and settings.",
    whenToUse:
      'Establishing who you are acting as, or finding the caller’s workspace IDs ' +
      'before a workspace-scoped call. Takes no arguments.',
    whenNotToUse:
      '`get_user` for somebody else (it requires an explicit ID). ' +
      '`get_workspaces_basic_info` if you only need workspace IDs and names — ' +
      'it is far smaller than this response.',
    example: {},
    responseShape:
      '`{success, user: {user_guid, first_name, last_name?, email_txt?, ' +
      'phone_txt?, workspace_guids, identities, entries, environments, ' +
      'lifecycle_events, notification_settings, settings, ...}, settings: {...}}`. ' +
      'This payload is LARGE — several unbounded arrays and an open settings map.',
    recommendedFields: [
      'user.user_guid',
      'user.first_name',
      'user.email_txt',
      'user.workspace_guids',
    ],
  },

  list_conversations: {
    purpose:
      'List your conversations from the last 6 months, optionally filtered by participants and type.',
    whenToUse:
      'Finding a `conversation_id`. Filter with `user_ids` plus `match`, and ' +
      'narrow to `types` — YOUR DM with someone is ' +
      '`user_ids: ["<their id>"], types: ["directMessage"]`. You are always an ' +
      'implicit participant, so never pass your own ID.',
    whenNotToUse:
      '`get_conversation` when you already have an ID and want full detail — this ' +
      'returns only id, name, workspace_id and type.',
    example: { user_ids: ['user-abc'], types: ['directMessage'] },
    responseShape:
      '`{results_count, results: [{id, name, workspace_id, type}]}` where type is ' +
      '`directMessage` | `customerConversation` | `namedConversation` | `asyncMeeting`. ' +
      'No paging: `results_count` is the size of what is returned, after `types`. ' +
      'An empty `results` is a real answer — no such conversation — not an error.',
  },

  get_conversation: {
    purpose: 'Get one conversation by ID, with full metadata.',
    whenToUse:
      'You have a `conversation_id` and need its description, visibility, owner or workspace name.',
    whenNotToUse:
      '`get_conversation_users` for the participant list. `list_messages` with ' +
      '`conversation_id` for its messages — this returns neither.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'list_conversations',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'conv-abc' },
    responseShape:
      '`{id, name, description?, link, workspace_id, workspace_name, owner_id, ' +
      'type, visibility, ...}`.',
  },

  get_conversation_users: {
    purpose: 'List the people in a conversation.',
    whenToUse:
      'Finding out who is in a conversation, or collecting participant user IDs.',
    whenNotToUse:
      '`search_users` to resolve people by name or email generally — this is ' +
      'scoped to one conversation.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'list_conversations',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'conv-abc' },
    responseShape: 'Array of user objects with `id` and profile fields.',
    recommendedFields: ['id', 'full_name'],
  },

  get_root_folders: {
    purpose: 'List the root folders of a workspace for a given folder type.',
    whenToUse:
      'Orienting in the folder tree, or finding a `folder_id`. `type` is required: ' +
      '`voicememo` or `prerecorded`. `include_all_tree` returns nested folders too.',
    whenNotToUse:
      '`get_folder` to inspect one folder. `get_folder_with_messages` when you ' +
      'want a folder’s messages rather than its structure.',
    example: { type: 'voicememo', workspace_id: 'ws-abc' },
    responseShape:
      '`{type, workspace_id?, include_all_tree?, sort_by, sort_direction, ' +
      'results: [{id, name, parent_folder_id?, subfolder_ids?, ' +
      'total_nested_folders_count, total_nested_messages_count, ...}]}`. ' +
      'Not paginated — this is the complete set.',
    recommendedFields: [
      'results.id',
      'results.name',
      'results.total_nested_messages_count',
    ],
  },

  create_folder: {
    purpose: 'Create a folder in a workspace, optionally nested under another.',
    whenToUse:
      'Organising memos. `name`, `type` and `workspace_id` are all required; add ' +
      '`parent_folder_id` to nest.',
    whenNotToUse: '`move_folder` to relocate a folder that already exists.',
    prerequisites: [
      {
        field: 'workspace_id',
        fromTool: 'get_workspaces_basic_info',
        fromField: 'id',
      },
    ],
    example: { name: 'Q4 planning', type: 'voicememo', workspace_id: 'ws-abc' },
    responseShape: 'The created folder, same shape as `get_folder`.',
  },

  get_folder: {
    purpose:
      "Get one folder's metadata and, optionally, its immediate subfolders.",
    whenToUse:
      'Inspecting a folder. Set `include_first_level_tree: true` to get ' +
      'subfolders. Both `date` AND `direction` are silently ignored unless you ' +
      'do — upstream only documented that caveat on `date`.',
    whenNotToUse:
      '`get_folder_with_messages` when you want the messages inside the folder — ' +
      'this returns structure and counts only.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'get_root_folders',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'folder-abc', include_first_level_tree: true },
    responseShape:
      '`{id, name, type, workspace_id, parent_folder_id?, path?, ' +
      'subfolder_ids?, message_ids?, total_nested_folders_count, ' +
      'total_nested_messages_count, subfolders?, ...}`.',
  },

  get_folder_with_messages: {
    purpose: 'Get a folder together with the messages stored directly in it.',
    whenToUse:
      'Reading a folder’s contents. Only messages at that folder’s own level are ' +
      'returned — nested folders are not walked.',
    whenNotToUse:
      '`get_folder` for structure and counts without message bodies. ' +
      '`list_messages` with `folder_id` when you need date filtering or paging, ' +
      'which this tool does not support.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'get_root_folders',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'folder-abc' },
    responseShape: '`{folder: {...}, messages: [{...}]}`.',
    recommendedFields: ['folder.id', 'folder.name', 'messages'],
  },

  update_folder_name: {
    purpose: 'Rename a folder.',
    whenToUse:
      'Changing only the name. `name` is the sole editable field here.',
    whenNotToUse: '`move_folder` to change where a folder sits in the tree.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'get_root_folders',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'folder-abc', name: 'Q4 planning (final)' },
    responseShape: 'The updated folder, same shape as `get_folder`.',
  },

  delete_folder: {
    purpose:
      'Permanently delete a folder, including every nested folder and all their messages.',
    whenToUse:
      'Only when the whole subtree should be destroyed. This cascades and cannot be undone.',
    whenNotToUse:
      '`move_folder` to get a folder out of the way, or `move_message_to_folder` ' +
      'to relocate its messages first. Check ' +
      '`total_nested_messages_count` via `get_folder` before calling — the ' +
      'cascade is easy to underestimate.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'get_root_folders',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'folder-abc' },
    responseShape: 'Deletion confirmation.',
  },

  move_folder: {
    purpose: 'Move a folder into another folder, or up to a workspace root.',
    whenToUse:
      'Relocating a folder. Pass `folder_id` for a new parent folder, or ' +
      '`workspace_id` to move it to the workspace root — one or the other, not both.',
    whenNotToUse:
      '`update_folder_name` to rename in place. `move_message_to_folder` for a ' +
      'single message rather than a folder.',
    prerequisites: [
      {
        field: 'id',
        fromTool: 'get_root_folders',
        fromField: 'results[].id',
      },
    ],
    example: { id: 'folder-abc', folder_id: 'folder-parent' },
    responseShape: 'The moved folder, same shape as `get_folder`.',
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning:
          'Both `folder_id` and `workspace_id` were given, or neither, or the ' +
          'move would nest a folder inside itself.',
        nextAction: 'Pass exactly one destination.',
      },
    ],
  },

  move_message_to_folder: {
    purpose: 'Move a message into a folder, or out to a workspace.',
    whenToUse:
      'Filing a memo. Only `voicememo`/`prerecorded` messages you created can ' +
      "be moved, and the message type must match the folder's type. Pass " +
      'exactly one of `folder_id` or `workspace_id`.',
    whenNotToUse:
      '`move_folder` to relocate a whole folder. `create_voicememo_message` with ' +
      '`folder_id` to file a memo at creation time instead of moving it after.',
    prerequisites: [
      {
        field: 'message_id',
        fromTool: 'list_messages',
        fromField: 'results[].id',
      },
    ],
    example: { message_id: 'msg-abc', folder_id: 'folder-abc' },
    responseShape: 'The updated message with its new placement.',
    commonErrors: [
      {
        code: 'BAD_REQUEST',
        meaning:
          'The message type is not `voicememo`/`prerecorded`, it does not match ' +
          "the destination folder's type, or both/neither destination was given.",
        nextAction:
          'Check `type` via `get_message` and the folder type via `get_folder`; ' +
          'they must match. Pass exactly one destination.',
      },
    ],
  },

  get_workspaces_basic_info: {
    purpose: 'List every workspace you belong to, as id and name only.',
    whenToUse:
      'The cheapest way to resolve a workspace name to an ID before a ' +
      'workspace-scoped call. Takes no arguments.',
    whenNotToUse:
      '`get_current_user` if you need more than ids and names — but note that ' +
      'response is much larger, so prefer this one when ids suffice.',
    example: {},
    responseShape: 'Array of `{id, name}`. Nothing else, and no paging.',
  },
};
