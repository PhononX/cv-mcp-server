import { z } from 'zod';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { setCarbonVoiceAuthHeader } from './auth';
import { SERVICE_NAME, SERVICE_VERSION } from './constants';
import { getCarbonVoiceAPI } from './cv-api';
import { getCarbonVoiceSimplifiedAPI } from './generated';
import {
  addLinkAttachmentsToMessageBody,
  addLinkAttachmentsToMessageParams,
  addMessageToFolderOrWorkspaceBody,
  aIPromptControllerGetPromptsQueryParams,
  aIResponseControllerCreateResponseBody,
  aIResponseControllerGetAllResponsesQueryParams,
  createConversationMessageBody,
  createConversationMessageParams,
  createFolderBody,
  createShareLinkAIResponseBody,
  createVoiceMemoMessageBody,
  deleteFolderParams,
  getAllRootFoldersQueryParams,
  getConversationByIdParams,
  getFolderByIdParams,
  getFolderByIdQueryParams,
  getFolderMessagesParams,
  getMessageByIdParams,
  getMessageByIdQueryParams,
  getTenRecentMessagesResponseQueryParams,
  getUserByIdParams,
  listMessagesQueryParams,
  moveFolderBody,
  moveFolderParams,
  searchUserQueryParams,
  searchUsersBody,
  sendDirectMessageBody,
  updateFolderNameBody,
  updateFolderNameParams,
} from './generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';
import {
  AddMessageToFolderPayload,
  AIPromptControllerGetPromptsParams,
  AIResponseControllerGetAllResponsesParams,
  CreateAIResponse,
  CreateFolderPayload,
  CreateShareLinkAIResponse,
  CreateVoicememoMessage,
  GetAllRootFoldersParams,
  GetTenRecentMessagesResponseParams,
  ListMessagesParams,
  SearchUserParams,
  SearchUsersBody,
  SendDirectMessage,
} from './generated/models';
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
import { SummarizeConversationParams } from './interfaces/conversation.interface';
import { summarizeConversationParams } from './schemas';
import { formatToMCPToolResponse, logger } from './utils';

// Create server instance
const server = new McpServer({
  name: SERVICE_NAME,
  version: SERVICE_VERSION,
  capabilities: {
    resources: {},
    tools: {},
  },
});

const simplifiedApi = getCarbonVoiceSimplifiedAPI();
const cvApi = getCarbonVoiceAPI();

/**********************
 * Tools
 *********************/

// Messages
server.registerTool(
  'list_messages',
  {
    description:
      'List Messages. By default returns latest 20 messages. The maximum allowed range between dates is 183 days (6 months). ' +
      'All presigned URLs returned by this tool are ready to use. ' +
      'Do not parse, modify, or re-encode them—always present or use the URLs exactly as received.' +
      'If you want to get messages from a specific date range, you can use the "start_date" and "end_date" parameters. ' +
      'If you want to get messages from a specific date, you can use the "date" parameter. ' +
      'If you want to get messages from a specific user, you can use the "user_ids" parameter. ' +
      'If you want to get messages from a specific conversation, you can use the "conversation_id" parameter. ' +
      'If you want to get messages from a specific folder, you can use the "folder_id" parameter. ' +
      'If you want to get messages from a specific workspace, you can use the "workspace_id" parameter. ' +
      'If you want to get messages for a particular language, you can use the "language" parameter. ',
    inputSchema: listMessagesQueryParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (
    params: ListMessagesParams,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      // Fallback to regular API
      return formatToMCPToolResponse(
        await simplifiedApi.listMessages(
          params,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: GetMessageInput, { authInfo }): Promise<McpToolResponse> => {
    try {
      const { id, ...queryParams } = args;
      return formatToMCPToolResponse(
        await simplifiedApi.getMessageById(
          id,
          queryParams,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
      'Get most recent messages, including their associated Conversation, Creator, and Labels information. ' +
      'Returns a maximum of 10 messages.',
    inputSchema: getTenRecentMessagesResponseQueryParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (
    args: GetTenRecentMessagesResponseParams,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getTenRecentMessagesResponse(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
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
      'Sends a message to an existing conversation or any type with a conversation_id. ' +
      'To reply as a thread, included a message_id for "parent_id". You must provide a transcript or attachment.',
    inputSchema: createConversationMessageParams.merge(
      createConversationMessageBody,
    ).shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (
    args: CreateConversationMessageInput,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.createConversationMessage(
          args.id,
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
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
      'Send a Direct Message (DM) to a User or a Group of Users. ' +
      'In order to create a Direct Message, you must provide transcript or link attachments.',
    inputSchema: sendDirectMessageBody.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (args: SendDirectMessage, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.sendDirectMessage(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (
    args: CreateVoicememoMessage,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.createVoiceMemoMessage(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (
    args: AddLinkAttachmentsToMessageInput,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.addLinkAttachmentsToMessage(
          args.id,
          {
            links: args.links,
          },
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: GetByIdParams, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getUserById(
          args.id,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
      'Search for a User by their phone number or email address. ' +
      '(In order to search for a User, you must provide a phone number or email address.)',
    inputSchema: searchUserQueryParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: SearchUserParams, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.searchUser(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
      'Search multiple Users by their phone numbers, email addresses or ids. ' +
      '(In order to search Users, you must provide phone numbers, email addresses or ids.)',
    inputSchema: searchUsersBody.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: SearchUsersBody, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.searchUsers(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error searching users:', { args, error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_current_user',
  {
    description: 'Get the current user information. ',
    inputSchema: z.object({}).shape, // Needed in order to have access to authInfo
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (params: unknown, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await cvApi.getWhoAmI(setCarbonVoiceAuthHeader(authInfo?.token)),
      );
    } catch (error) {
      logger.error('Error searching users:', { params, error });
      return formatToMCPToolResponse(error);
    }
  },
);

// Conversations
server.registerTool(
  'list_conversations',
  {
    description:
      'List all conversations. ' +
      'Returns a simplified view of user conversations that have had messages sent or received within the last 6 months.',
    inputSchema: z.object({}).shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: unknown, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getAllConversations(
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error listing conversations:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_conversation',
  {
    description: 'Get a conversation by its ID.',
    inputSchema: getConversationByIdParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: GetByIdParams, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getConversationById(
          args.id,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error getting conversation by id:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_conversation_users',
  {
    description: 'Get users in a conversation.',
    inputSchema: getConversationByIdParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: GetByIdParams, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getConversationUsers(
          args.id,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error getting conversation users:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'summarize_conversation',
  {
    description: 'Summarize a conversation.',
    inputSchema: summarizeConversationParams.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (
    args: SummarizeConversationParams,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      let message_ids: string[] = args.message_ids || [];

      // If no message ids are provided, get couple of messages from the conversation
      if (!args.message_ids) {
        const messages = await simplifiedApi.listMessages(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        );
        message_ids = messages.results?.map((message) => message.id) || [];
      }

      const aiResponse = await simplifiedApi.aIResponseControllerCreateResponse(
        {
          prompt_id: args.prompt_id,
          message_ids: message_ids,
          channel_id: args.conversation_id,
          language: args.language,
        },
        setCarbonVoiceAuthHeader(authInfo?.token),
      );

      return formatToMCPToolResponse(aiResponse);
    } catch (error) {
      logger.error('Error summarizing conversation:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

// TODO: First we need to implement List messages filtered by unread messages
// server.registerTool(
//   'catch_up_conversation',
//   {
//     description: 'Catch up a conversation.',
//     inputSchema: catchUpConversationParams.shape,
//   },
//   async (args: CatchUpConversationParams): Promise<McpToolResponse> => {
//     try {
//       let message_ids: string[] = args.message_ids || [];

//       // If no message ids are provided, get couple of messages from the conversation
//       if (!args.message_ids?.length) {
//         const messages = await api.listMessages(args);
//         message_ids = messages.results?.map((message) => message.id) || [];
//       }

//       const aiResponse = await api.aIResponseControllerCreateResponse({
//         prompt_id: args.prompt_id,
//         message_ids: message_ids,
//         channel_id: args.conversation_id,
//         language: args.language,
//       });

//       return formatToMCPToolResponse(aiResponse);
//     } catch (error) {
//       logger.error('Error catching up conversation:', { error });
//       return formatToMCPToolResponse(error);
//     }
//   },
// );

// Folders
// server.registerTool(
//   'get_workspace_folders_and_message_counts',
//   {
//     description:
//       'Returns, for each workspace, the total number of folders and messages, as well as a breakdown of folders, ' +
//       'messages, and messages not in any folder.(Required to inform message type:voicememo,prerecorded)',
//     inputSchema: getCountsGroupedByWorkspaceQueryParams.shape,
//   },
//   async (args: GetCountsGroupedByWorkspaceParams): Promise<McpToolResponse> => {
//     try {
//       return formatToMCPToolResponse(
//         await api.getCountsGroupedByWorkspace(args),
//       );
//     } catch (error) {
//       logger.error('Error listing workspace folders:', { error });
//       return formatToMCPToolResponse(error);
//     }
//   },
// );

server.registerTool(
  'get_root_folders',
  {
    description:
      'Lists all root folders for a given workspace, including their names, IDs, and basic structure, ' +
      'but does not provide aggregate counts.(Required to inform message type:voicememo,prerecorded)',
    inputSchema: getAllRootFoldersQueryParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (
    args: GetAllRootFoldersParams,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getAllRootFolders(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (args: CreateFolderPayload, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.createFolder(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: GetFolderInput, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getFolderById(
          args.id,
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (args: GetByIdParams, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getFolderMessages(
          args.id,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (
    args: UpdateFolderNameInput,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.updateFolderName(
          args.id,
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
      'Delete a folder by its ID. Deleting a folder will also delete nested folders and all the messages in referenced folders. ' +
      '(This is a destructive action and cannot be undone, so please be careful.)',
    inputSchema: deleteFolderParams.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
  },
  async (args: GetByIdParams, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.deleteFolder(
          args.id,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (args: MoveFolderInput, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.moveFolder(
          args.id,
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
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
      'Move a message to a folder by its ID. Move a Message into another Folder or into a Workspace. ' +
      'Only allowed to move messages of type: voicememo,prerecorded.',
    inputSchema: addMessageToFolderOrWorkspaceBody.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (
    args: AddMessageToFolderPayload,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.addMessageToFolderOrWorkspace(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error moving message to folder:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

// Workspace
server.registerTool(
  'get_workspaces_basic_info',
  {
    description: 'Get basic information about a workspace.',
    inputSchema: z.object({}).shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (params: unknown, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.getAllWorkspacesWithBasicInfo(
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error getting workspaces basic info:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

// AI Magic
server.registerTool(
  'list_ai_actions',
  {
    description:
      'List AI Actions (Prompts). Optionally, you can filter by owner type and workspace id. ' +
      'Filtering by owner type, Possible values: "user", "workspace", "system". ' +
      'Do not use unless the user explicitly requests it.',
    inputSchema: aIPromptControllerGetPromptsQueryParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (
    args: AIPromptControllerGetPromptsParams,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.aIPromptControllerGetPrompts(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error listing ai actions:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'run_ai_action',
  {
    description:
      'Run an AI Action (Prompt) for a message. You can run an AI Action for a message by its ID or a list of message IDs.',
    inputSchema: aIResponseControllerCreateResponseBody.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (args: CreateAIResponse, { authInfo }): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.aIResponseControllerCreateResponse(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error running ai action:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'run_ai_action_for_shared_link',
  {
    description:
      'Run an AI Action (Prompt) for a shared link. You can run an AI Action for a shared link by its ID or a list of shared link IDs. ' +
      'You can also provide the language of the response.',
    inputSchema: createShareLinkAIResponseBody.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (
    args: CreateShareLinkAIResponse,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.createShareLinkAIResponse(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error running ai action for shared link:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

server.registerTool(
  'get_ai_action_responses',
  {
    description:
      'Retrieve previously generated AI Action (Prompt) responses by filtering for a specific prompt, message, or conversation ID. ' +
      'Combine filters to narrow results and view all AI-generated responses related to a particular prompt, message, or conversation.',
    inputSchema: aIResponseControllerGetAllResponsesQueryParams.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async (
    args: AIResponseControllerGetAllResponsesParams,
    { authInfo },
  ): Promise<McpToolResponse> => {
    try {
      return formatToMCPToolResponse(
        await simplifiedApi.aIResponseControllerGetAllResponses(
          args,
          setCarbonVoiceAuthHeader(authInfo?.token),
        ),
      );
    } catch (error) {
      logger.error('Error getting ai action responses:', { error });
      return formatToMCPToolResponse(error);
    }
  },
);

export default server;
