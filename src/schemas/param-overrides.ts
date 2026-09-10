import {
  actionItemControllerCreateBody,
  actionItemControllerUpdateBody,
  addMessageToFolderOrWorkspaceBody,
  aIPromptControllerGetPromptsQueryParams,
  aIResponseControllerCreateResponseBody,
  aIResponseControllerGetAllResponsesQueryParams,
  createConversationMessageBody,
  createShareLinkAIResponseBody,
  createVoiceMemoMessageBody,
  getFolderByIdQueryParams,
  listMessagesQueryParams,
  sendDirectMessageBody,
  simplifiedMessageShareLinkControllerGetMessageShareLinkParams,
} from '../generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';

/**
 * Corrected and completed parameter descriptions.
 *
 * These live here rather than in `src/generated/` (wiped on every
 * `npm run generate:api`) and rather than in cv-api (decision 0.1: tool text
 * is authored MCP-side so it cannot change under us when the live spec moves).
 *
 * Each override below fixes text that is wrong or absent upstream, and each
 * rule was read out of the cv-api handler rather than inferred, so the
 * descriptions match what actually gets rejected.
 *
 * Two of these are upstream doc bugs worth reporting separately, since Swagger
 * and every other API consumer still sees the wrong text:
 *  - `create_voicememo_message.workspace_id` reads "not allowed when folder_id
 *    specified is different from the folder_id" — a copy-paste of the
 *    `folder_id` text, and it describes a rule the handler does not enforce.
 *  - `get_folder.direction` never mentions the `include_first_level_tree` gate
 *    that its sibling `date` does document.
 */

/**
 * `get_folder`: upstream documents the `include_first_level_tree` gate on
 * `date` but not on `direction`, even though both are inert without it.
 */
export const getFolderInputShape = {
  ...getFolderByIdQueryParams.shape,
  direction: getFolderByIdQueryParams.shape.direction.describe(
    'Direction of the results (newer or older). Only takes effect when ' +
      '`include_first_level_tree` is true — otherwise it is silently ignored.',
  ),
  date: getFolderByIdQueryParams.shape.date.describe(
    'Return only subfolders updated relative to this date and `direction`. ' +
      'Only takes effect when `include_first_level_tree` is true — otherwise ' +
      'it is silently ignored.',
  ),
};

/**
 * `create_voicememo_message`: the handler requires one of transcript, links or
 * audio, enforces a 2-5000 character transcript and at most 100 link URLs, and
 * applies NO mutual-exclusivity rule to folder_id/workspace_id despite what
 * the upstream text claims.
 */
export const createVoicememoBodyShape = {
  ...createVoiceMemoMessageBody.shape,
  transcript: createVoiceMemoMessageBody.shape.transcript.describe(
    'Text to speak via text-to-speech. 2-5000 characters. Ignored when ' +
      '`audio_url` is provided. One of `transcript`, `links` or `audio_url` is required.',
  ),
  links: createVoiceMemoMessageBody.shape.links.describe(
    'Link URLs to attach. Max 100, and each must be a valid URL. ' +
      'One of `transcript`, `links` or `audio_url` is required.',
  ),
  folder_id: createVoiceMemoMessageBody.shape.folder_id.describe(
    'Folder to file the memo in. The folder type must match the memo type.',
  ),
  workspace_id: createVoiceMemoMessageBody.shape.workspace_id.describe(
    'Workspace to place the memo in when it is not going into a folder.',
  ),
};

/**
 * `create_conversation_message`: the transcript-or-links requirement was only
 * ever stated in the tool description, so neither param carried it.
 */
export const createConversationMessageBodyShape = {
  ...createConversationMessageBody.shape,
  transcript: createConversationMessageBody.shape.transcript.describe(
    'Text to speak via text-to-speech. Either `transcript` or `links` is required.',
  ),
  links: createConversationMessageBody.shape.links.describe(
    'Link URLs to attach. Either `transcript` or `links` is required.',
  ),
};

/**
 * `move_message_to_folder`: exactly one destination is required — the handler
 * rejects both ("Only one of folder_id or workspace_id is allowed") and
 * neither ("Either folder_id or workspace_id is required"). It also requires
 * that the caller created the message and that the message type MATCHES the
 * destination folder's type, neither of which was documented anywhere.
 */
export const moveMessageToFolderBodyShape = {
  ...addMessageToFolderOrWorkspaceBody.shape,
  message_id: addMessageToFolderOrWorkspaceBody.shape.message_id.describe(
    'Message to move. Only `voicememo` and `prerecorded` messages can be ' +
      'moved, you must be the message creator, and the message type must match ' +
      "the destination folder's type (a voicememo cannot go into a prerecorded folder).",
  ),
  folder_id: addMessageToFolderOrWorkspaceBody.shape.folder_id.describe(
    'Destination folder. Pass exactly one of `folder_id` or `workspace_id` — ' +
      'both together, or neither, is rejected.',
  ),
  workspace_id: addMessageToFolderOrWorkspaceBody.shape.workspace_id.describe(
    'Destination workspace, to take the message out of any folder. Pass ' +
      'exactly one of `folder_id` or `workspace_id` — both together, or ' +
      'neither, is rejected.',
  ),
};

/**
 * Parameters the upstream spec leaves undescribed. Surfaced by the
 * protocol-level contract test in `tests/integration/mcp-protocol.test.ts`,
 * which found 34 such params — including `prompt_id` on four separate tools,
 * the one value the whole AI-action chain hinges on.
 *
 * Enum-constrained params are deliberately NOT given prose: the enum reaches
 * the agent in the JSON Schema and already fixes the value space, so a
 * sentence restating it would be pure wire cost.
 *
 * These stay terse on purpose. Each one is paid in every `tools/list` payload.
 */

/** `prompt_id` is required by four tools and produced by exactly one. */
const PROMPT_ID = 'AI Action ID, from `list_ai_actions` (its `id`).';
const MESSAGE_IDS = 'Message IDs, from `list_messages` (`results[].id`).';
const ASSIGNEE = 'Assignee user ID, from `search_users`. Not a name.';
const DUE_DATE = 'Due date as an ISO 8601 timestamp.';

export const listMessagesInputShape = {
  ...listMessagesQueryParams.shape,
  page: listMessagesQueryParams.shape.page.describe(
    '1-based page number. Use with `size`; check `has_next_page` in the response.',
  ),
};

export const sendDirectMessageBodyShape = {
  ...sendDirectMessageBody.shape,
  to: sendDirectMessageBody.shape.to.describe(
    'Recipients: `user_ids` (from `search_users`) and/or `emails`. At least one required.',
  ),
};

export const listAiActionsQueryShape = {
  ...aIPromptControllerGetPromptsQueryParams.shape,
  workspace_id:
    aIPromptControllerGetPromptsQueryParams.shape.workspace_id.describe(
      'Limit to AI Actions owned by this workspace, from `get_workspaces_basic_info`.',
    ),
};

export const runAiActionBodyShape = {
  ...aIResponseControllerCreateResponseBody.shape,
  prompt_id:
    aIResponseControllerCreateResponseBody.shape.prompt_id.describe(PROMPT_ID),
  message_ids:
    aIResponseControllerCreateResponseBody.shape.message_ids.describe(
      MESSAGE_IDS,
    ),
  channel_id: aIResponseControllerCreateResponseBody.shape.channel_id.describe(
    'Conversation the messages belong to, from `list_conversations`.',
  ),
  workspace_id:
    aIResponseControllerCreateResponseBody.shape.workspace_id.describe(
      'Workspace scope, from `get_workspaces_basic_info`.',
    ),
};

export const runAiActionForSharedLinkBodyShape = {
  ...createShareLinkAIResponseBody.shape,
  prompt_id: createShareLinkAIResponseBody.shape.prompt_id.describe(PROMPT_ID),
  share_link_ids: createShareLinkAIResponseBody.shape.share_link_ids.describe(
    'Share link IDs, from `create_message_share_link` (its `id`).',
  ),
  language: createShareLinkAIResponseBody.shape.language.describe(
    'Response language. Defaults to the original message language.',
  ),
};

export const getAiActionResponsesQueryShape = {
  ...aIResponseControllerGetAllResponsesQueryParams.shape,
  prompt_id:
    aIResponseControllerGetAllResponsesQueryParams.shape.prompt_id.describe(
      'Only responses generated by this AI Action, from `list_ai_actions`.',
    ),
  message_id:
    aIResponseControllerGetAllResponsesQueryParams.shape.message_id.describe(
      'Only responses about this message, from `list_messages`.',
    ),
  channel_id:
    aIResponseControllerGetAllResponsesQueryParams.shape.channel_id.describe(
      'Only responses in this conversation, from `list_conversations`.',
    ),
  limit: aIResponseControllerGetAllResponsesQueryParams.shape.limit.describe(
    'Max responses to return.',
  ),
  date: aIResponseControllerGetAllResponsesQueryParams.shape.date.describe(
    'ISO 8601 anchor timestamp; pair with `direction` to page.',
  ),
};

export const getMessageShareLinkParamsShape = {
  ...simplifiedMessageShareLinkControllerGetMessageShareLinkParams.shape,
  share_link_id:
    simplifiedMessageShareLinkControllerGetMessageShareLinkParams.shape.share_link_id.describe(
      'Share link ID, from `create_message_share_link` (its `id`).',
    ),
};

export const createActionItemBodyShape = {
  ...actionItemControllerCreateBody.shape,
  title: actionItemControllerCreateBody.shape.title.describe(
    'What needs doing. The only required field.',
  ),
  notes_text:
    actionItemControllerCreateBody.shape.notes_text.describe(
      'Free-text detail.',
    ),
  assigned_to:
    actionItemControllerCreateBody.shape.assigned_to.describe(ASSIGNEE),
  due_date: actionItemControllerCreateBody.shape.due_date.describe(DUE_DATE),
  source_message_id:
    actionItemControllerCreateBody.shape.source_message_id.describe(
      'Message that prompted this item, from `list_messages`.',
    ),
  workspace_id: actionItemControllerCreateBody.shape.workspace_id.describe(
    'Workspace scope, from `get_workspaces_basic_info`.',
  ),
};

export const updateActionItemBodyShape = {
  ...actionItemControllerUpdateBody.shape,
  title: actionItemControllerUpdateBody.shape.title.describe(
    'New title. Omit to leave unchanged.',
  ),
  notes_text: actionItemControllerUpdateBody.shape.notes_text.describe(
    'New notes. Omit to leave unchanged.',
  ),
  assigned_to:
    actionItemControllerUpdateBody.shape.assigned_to.describe(ASSIGNEE),
  due_date: actionItemControllerUpdateBody.shape.due_date.describe(DUE_DATE),
};
