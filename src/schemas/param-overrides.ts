import {
  addMessageToFolderOrWorkspaceBody,
  createConversationMessageBody,
  createVoiceMemoMessageBody,
  getFolderByIdQueryParams,
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
