import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// import { z } from 'zod';

import { SERVICE_NAME, SERVICE_VERSION } from './constants';

import {
  AddLinkAttachmentsToMessageInput,
  CreateConversationMessageInput,
  GetByIdParams,
  GetFolderInput,
  GetMessageInput,
  McpToolResponse,
  MoveFolderInput,
  UpdateFolderNameInput,
} from './interfaces';
import { formatToMCPToolResponse, logger } from './utils';
import { getCarbonVoiceSimplifiedAPI } from './generated';
import {
  createConversationMessageBody,
  createConversationMessageParams,
  getUserByIdParams,
  getMessageByIdParams,
  getMessageByIdQueryParams,
  getTenRecentMessagesResponseQueryParams,
  listMessagesQueryParams,
  searchUserQueryParams,
  sendDirectMessageBody,
  searchUsersBody,
  addLinkAttachmentsToMessageParams,
  addLinkAttachmentsToMessageBody,
  getAllRootFoldersQueryParams,
  createFolderBody,
  createVoiceMemoMessageBody,
  getFolderByIdParams,
  getFolderByIdQueryParams,
  updateFolderNameBody,
  updateFolderNameParams,
  deleteFolderParams,
  moveFolderParams,
  moveFolderBody,
  addMessageToFolderOrWorkspaceBody,
  getFolderMessagesParams,
  getCountsGroupedByWorkspaceQueryParams,
} from './generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';
import {
  AddMessageToFolderPayload,
  CreateFolderPayload,
  CreateVoicememoMessage,
  GetAllRootFoldersParams,
  GetCountsGroupedByWorkspaceParams,
  GetFolderByIdParams,
  GetTenRecentMessagesResponseParams,
  ListMessagesParams,
  SearchUserParams,
  SearchUsersBody,
  SendDirectMessage,
  UpdateFolderNamePayload,
} from './generated/models';

// Create server instance
const server = new McpServer({
  name: SERVICE_NAME,
  version: SERVICE_VERSION,
  capabilities: {
    resources: {},
    tools: {},
  },
});

const api = getCarbonVoiceSimplifiedAPI();

// type GetMessageInput = z.infer<typeof getMessageByIdParams> &
//   z.infer<typeof getMessageByIdQueryParams>;

/**********************
 * Tools
 *********************/

// Messages
server.registerTool(
  'list_messages',
  {
    description:
      'List Messages. By default returns messages created in last 5 days. The maximum allowed range between dates is 31 days.',
    inputSchema: listMessagesQueryParams.shape,
  },
  async (params: ListMessagesParams): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.listMessages(params));
    } catch (error) {
      logger.error('Error listing messages:', { params, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_message',
  {
    description: 'Get a message by its ID.',
    inputSchema: getMessageByIdParams.merge(getMessageByIdQueryParams).shape,
  },
  async (args: GetMessageInput): Promise<McpToolResponse> => {
    try {
      const { id, ...queryParams } = args;
      return formatToMCPToolResponse(await api.getMessageById(id, queryParams));
    } catch (error) {
      logger.error('Error getting message by id:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_recent_messages',
  {
    description:
      'Get most recent messages, including their associated Conversation, Creator, and Labels information. Returns a maximum of 10 messages.',
    inputSchema: getTenRecentMessagesResponseQueryParams.shape,
  },
  async (
    args: GetTenRecentMessagesResponseParams,
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await api.getTenRecentMessagesResponse(args),
      );
    } catch (error) {
      logger.error('Error getting recent messages:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'create_conversation_message',
  {
    description:
      'Send a message to a conversation. In order to create a Message, you must provide transcript or link attachments.',
    inputSchema: createConversationMessageParams.merge(
      createConversationMessageBody,
    ).shape,
  },
  async (args: CreateConversationMessageInput): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await api.createConversationMessage(args.id, args),
      );
    } catch (error) {
      logger.error('Error creating conversation message:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'create_direct_message',
  {
    description:
      'Send a Direct Message (DM) to a User or a Group of Users. In order to create a Direct Message, you must provide transcript or link attachments.',
    inputSchema: sendDirectMessageBody.shape,
  },
  async (args: SendDirectMessage): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.sendDirectMessage(args));
    } catch (error) {
      logger.error('Error creating direct message:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'create_voicememo_message',
  {
    description:
      'Create a VoiceMemo Message. In order to create a VoiceMemo Message, you must provide a transcript or link attachments.',
    inputSchema: createVoiceMemoMessageBody.shape,
  },
  async (args: CreateVoicememoMessage): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.createVoiceMemoMessage(args));
    } catch (error) {
      logger.error('Error creating voicememo message:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'add_attachments_to_message',
  {
    description:
      'Add attachments to a message. In order to add attachments to a message, you must provide a message id and the attachments.',
    inputSchema: addLinkAttachmentsToMessageParams.merge(
      addLinkAttachmentsToMessageBody,
    ).shape,
  },
  async (args: AddLinkAttachmentsToMessageInput): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await api.addLinkAttachmentsToMessage(args.id, { links: args.links }),
      );
    } catch (error) {
      logger.error('Error adding attachments to message:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

// Users
server.registerTool(
  'get_user',
  {
    description: 'Get a User by their ID.',
    inputSchema: getUserByIdParams.shape,
  },
  async (args: GetByIdParams): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.getUserById(args.id));
    } catch (error) {
      logger.error('Error getting user by id:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'search_user',
  {
    description:
      'Search for a User by their phone number or email address. (In order to search for a User, you must provide a phone number or email address.)',
    inputSchema: searchUserQueryParams.shape,
  },
  async (args: SearchUserParams): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.searchUser(args));
    } catch (error) {
      logger.error('Error searching for user:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'search_users',
  {
    description:
      'Search multiple Users by their phone numbers, email addresses or ids. (In order to search Users, you must provide phone numbers, email addresses or ids.)',
    inputSchema: searchUsersBody.shape,
  },
  async (args: SearchUsersBody): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.searchUsers(args));
    } catch (error) {
      logger.error('Error searching users:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

// Conversations
server.registerTool(
  'list_conversations',
  {
    description:
      'List all conversations. Returns a simplified view of user conversations that have had messages sent or received within the last 6 months.',
  },
  async (): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.getAllConversations());
    } catch (error) {
      logger.error('Error listing conversations:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

// Folders
server.registerTool(
  'get_workspace_folders_and_message_counts',
  {
    description:
      'Returns, for each workspace, the total number of folders and messages, as well as a breakdown of folders, messages, and messages not in any folder.(Required to inform message type:voicememo,prerecorded)',
    inputSchema: getCountsGroupedByWorkspaceQueryParams.shape,
  },
  async (args: GetCountsGroupedByWorkspaceParams): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await api.getCountsGroupedByWorkspace(args),
      );
    } catch (error) {
      logger.error('Error listing workspace folders:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_root_folders',
  {
    description:
      'Lists all root folders for a given workspace, including their names, IDs, and basic structure, but does not provide aggregate counts.(Required to inform message type:voicememo,prerecorded)',
    inputSchema: getAllRootFoldersQueryParams.shape,
  },
  async (args: GetAllRootFoldersParams): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.getAllRootFolders(args));
    } catch (error) {
      logger.error('Error listing root folders:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'create_folder',
  {
    description: 'Create a new folder.',
    inputSchema: createFolderBody.shape,
  },
  async (args: CreateFolderPayload): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.createFolder(args));
    } catch (error) {
      logger.error('Error creating folder:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_folder',
  {
    description: 'Get a folder by its ID.',
    inputSchema: getFolderByIdParams.merge(getFolderByIdQueryParams).shape,
  },
  async (args: GetFolderInput): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.getFolderById(args.id, args));
    } catch (error) {
      logger.error('Error getting folder by id:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_folder_with_messages',
  {
    description:
      'Get a folder including its messages by its ID. (Only messages at folder level are returned.)',
    inputSchema: getFolderMessagesParams.shape,
  },
  async (args: GetByIdParams): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.getFolderMessages(args.id));
    } catch (error) {
      logger.error('Error getting folder with messages:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'update_folder_name',
  {
    description: 'Update a folder name by its ID.',
    inputSchema: updateFolderNameParams.merge(updateFolderNameBody).shape,
  },
  async (args: UpdateFolderNameInput): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.updateFolderName(args.id, args));
    } catch (error) {
      logger.error('Error updating folder name:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'delete_folder',
  {
    description:
      'Delete a folder by its ID. Deleting a folder will also delete nested folders and all the messages in referenced folders. (This is a destructive action and cannot be undone, so please be careful.)',
    inputSchema: deleteFolderParams.shape,
  },
  async (args: GetByIdParams): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.deleteFolder(args.id));
    } catch (error) {
      logger.error('Error deleting folder:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'move_folder',
  {
    description:
      'Move a folder by its ID. Move a Folder into another Folder or into a Workspace.',
    inputSchema: moveFolderParams.merge(moveFolderBody).shape,
  },
  async (args: MoveFolderInput): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(await api.moveFolder(args.id, args));
    } catch (error) {
      logger.error('Error moving folder:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'move_message_to_folder',
  {
    description:
      'Move a message to a folder by its ID. Move a Message into another Folder or into a Workspace. Only allowed to move messages of type: voicememo,prerecorded.',
    inputSchema: addMessageToFolderOrWorkspaceBody.shape,
  },
  async (args: AddMessageToFolderPayload): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await api.addMessageToFolderOrWorkspace(args),
      );
    } catch (error) {
      logger.error('Error moving message to folder:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

export default server;
