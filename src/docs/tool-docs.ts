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
};
