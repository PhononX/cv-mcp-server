import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// import { z } from 'zod';

import { SERVICE_NAME, SERVICE_VERSION } from './constants';

import {
  AddLinkAttachmentsToMessageInput,
  CreateConversationMessageInput,
  GetByIdParams,
  GetMessageInput,
  McpToolResponse,
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
} from './generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';
import {
  AddLinkAttachmentPayload,
  GetTenRecentMessagesResponseParams,
  ListMessagesParams,
  SearchUserParams,
  SearchUsersBody,
  SendDirectMessage,
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

export default server;
