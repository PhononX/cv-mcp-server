/**
 * Canonical list of every tool registered by `registerCarbonVoiceTools`.
 *
 * Single source of truth for two guards:
 *  - `tests/unit/server/server.test.ts` asserts the registered set matches this
 *    exactly, so a tool added without documentation fails CI.
 *  - `tests/unit/docs/tool-docs.test.ts` validates that every declared
 *    prerequisite points at a tool that actually exists.
 */
export const TOOL_NAMES = [
  // Messages
  'list_messages',
  'get_message',
  'get_recent_messages',
  'create_conversation_message',
  'create_direct_message',
  'create_voicememo_message',
  'add_attachments_to_message',
  // Users
  'get_user',
  'search_user',
  'search_users',
  'get_current_user',
  // Conversations
  'list_conversations',
  'get_conversation',
  'get_conversation_users',
  'summarize_conversation',
  // Folders
  'get_root_folders',
  'create_folder',
  'get_folder',
  'get_folder_with_messages',
  'update_folder_name',
  'delete_folder',
  'move_folder',
  'move_message_to_folder',
  // Workspace
  'get_workspaces_basic_info',
  // AI Actions
  'list_ai_actions',
  'run_ai_action',
  'run_ai_action_for_shared_link',
  'get_ai_action_responses',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
