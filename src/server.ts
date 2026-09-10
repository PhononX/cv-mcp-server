import { z } from 'zod';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { setCarbonVoiceAuthHeader } from './auth';
import { SERVICE_NAME, SERVICE_VERSION } from './constants';
import { getCarbonVoiceAPI } from './cv-api';
import { renderToolDoc, TOOL_DOCS } from './docs';
import { getCarbonVoiceSimplifiedAPI } from './generated';
import {
  actionItemControllerCreateBody,
  actionItemControllerCreateSuggestionsFromMessagesBody,
  actionItemControllerGetByIdParams,
  actionItemControllerListMyActionItemsQueryParams,
  actionItemControllerListParams,
  actionItemControllerListQueryParams,
  actionItemControllerSetStatusBody,
  actionItemControllerUpdateBody,
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
  getAllConversationsQueryParams,
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
  simplifiedMessageShareLinkControllerCreateBody,
  simplifiedMessageShareLinkControllerGetMessageShareLinkParams,
  updateFolderNameBody,
  updateFolderNameParams,
} from './generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';
import {
  ActionItemControllerListMyActionItemsParams,
  ActionItemControllerListParams,
  AddMessageToFolderPayload,
  AIPromptControllerGetPromptsParams,
  AIResponseControllerGetAllResponsesParams,
  CreateActionItemPayload,
  CreateAIResponse,
  CreateFolderPayload,
  CreateMessageShareLink,
  CreateShareLinkAIResponse,
  CreateSuggestionsFromMessagesPayload,
  CreateVoicememoMessage,
  GetAllConversationsParams,
  GetAllRootFoldersParams,
  GetTenRecentMessagesResponseParams,
  ListMessagesParams,
  SearchUserParams,
  SearchUsersBody,
  SendDirectMessage,
  UpdateActionItemPayload,
  UpdateActionItemStatusPayload,
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
import {
  ListInboxNotificationsParams,
  listInboxNotificationsParams,
  SearchMessageIdsParams,
  searchMessageIdsParams,
  SearchMessagesByHeardStatusParams,
  searchMessagesByHeardStatusParams,
  summarizeConversationParams,
} from './schemas';
import { fetchAudioFile, formatToMCPToolResponse, logger } from './utils';

const simplifiedApi = getCarbonVoiceSimplifiedAPI();
const cvApi = getCarbonVoiceAPI();

/**
 * Upstream `listMessages` caps page `size` at 50, so `summarize_conversation`
 * cannot gather more than this in one pass. Requests above it are clamped
 * rather than rejected: an agent that asks for more gets the maximum instead
 * of a failed call it has to retry.
 */
const MAX_SUMMARIZE_MESSAGES = 50;

/**
 * Registers all Carbon Voice tools on an MCP server instance.
 * Streamable HTTP stateless mode must use a fresh McpServer per request when
 * handling concurrent clients: the SDK binds a single transport on the protocol
 * object, so sharing one server across parallel `connect()` calls mis-routes
 * JSON-RPC responses and surfaces as client timeouts (-32001) under load.
 */
function registerCarbonVoiceTools(server: McpServer): void {
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

  // `audio_file` is intentionally dropped from the MCP schema and replaced with
  // `audio_url`. Upstream types it as `zod.instanceof(File)`, which serializes
  // to an untyped `{}` in JSON Schema while its description advertises
  // supported audio formats — so the tool promised audio upload, gave agents no
  // type to aim at, and then rejected every value a JSON-RPC client can express
  // ("Input not instance of File"). A URL is something an agent can actually
  // produce; the server fetches it and forwards the bytes as multipart.
  const createVoicememoMessageInput = createVoiceMemoMessageBody
    .omit({ audio_file: true })
    .extend({
      audio_url: z
        .string()
        .url()
        .optional()
        .describe(
          'Public http(s) URL to an audio file to upload. Supported formats: ' +
            '.mp3, .m4a, .wav, .aac, .ogg, .flac, .wma, .opus, .webm. ' +
            'Overrides `transcript` when provided. The server fetches this URL, ' +
            'so it must be publicly reachable — private, loopback and link-local ' +
            'addresses are refused.',
        ),
    });

  server.registerTool(
    'create_voicememo_message',
    {
      description: renderToolDoc(TOOL_DOCS.create_voicememo_message),
      inputSchema: createVoicememoMessageInput.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      args: Omit<CreateVoicememoMessage, 'audio_file'> & {
        audio_url?: string;
      },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { audio_url, ...rest } = args;
      try {
        const payload: CreateVoicememoMessage = { ...rest };
        if (audio_url) {
          payload.audio_file = await fetchAudioFile(audio_url);
        }

        return formatToMCPToolResponse(
          await simplifiedApi.createVoiceMemoMessage(
            payload,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        // Surface fetch rejections as themselves: the message names what was
        // wrong with the URL, which is what the agent needs to fix the call.
        //
        // Matched on `name` rather than `instanceof`: the class can arrive via
        // more than one module registry (the utils barrel, a test's
        // requireActual, a dual CJS/ESM resolution), and `instanceof` silently
        // fails across duplicates. The name is stable in all of them.
        if ((error as Error)?.name === 'AudioFetchError') {
          logger.warn('Rejected audio_url for voicememo message', {
            audio_url,
            reason: (error as Error).message,
          });
          return formatToMCPToolResponse({
            statusCode: 400,
            body: {
              error: {
                code: 'INVALID_AUDIO_URL',
                message: (error as Error).message,
              },
            },
          });
        }
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
      description:
        'Get detailed information about a specific user by their ID. ' +
        'Returns the full user profile — name, languages, voice settings, ' +
        'workspace memberships and roles, notification preferences, and timestamps. ' +
        'This is richer than `search_user` (which only finds users by phone, email, or name). ' +
        'Use this when you already have a user ID and need their complete information.',
      inputSchema: getUserByIdParams.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (args: GetByIdParams, { authInfo }): Promise<McpToolResponse> => {
      try {
        const contacts = await cvApi.getContacts(
          [args.id],
          setCarbonVoiceAuthHeader(authInfo?.token),
        );
        if (contacts.length === 0) {
          throw new Error('user not found');
        }
        const userInfo = contacts.find((c) => c.id === args.id) ?? contacts[0];
        return formatToMCPToolResponse(userInfo);
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
        'Search for a User by their phone number, email address, id or name. ' +
        '(In order to search for a User, you must provide a phone number, email address, id or name.)' +
        'When searching by name, only users that are part of your contacts will be returned',
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
        'Search multiple Users by their phone numbers, email addresses, ids or names. ' +
        '(In order to search Users, you must provide phone numbers, email addresses, ids or names.)' +
        'When searching by name, only users that are part of your contacts will be returned',
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
  const listConversationsQueryParams = z.object({
    ...getAllConversationsQueryParams.shape,
    user_ids: getAllConversationsQueryParams.shape.user_ids.describe(
      'List of user IDs to filter conversations by. When omitted, all conversations for the caller are returned. ' +
        "Requires actual user IDs, not usernames or display names. If you only have a person's name, call " +
        '`search_users` first (e.g. `names: ["Brett"]`) to resolve it to a user ID. If `search_users` returns ' +
        'more than one candidate for a name, ask the caller which person they meant instead of guessing.',
    ),
    match: getAllConversationsQueryParams.shape.match.describe(
      'Match mode: `any` (union, default) or `all` (intersection). `any` returns conversations with ' +
        'at least one of the given users; `all` returns conversations with all of them.',
    ),
  });

  server.registerTool(
    'list_conversations',
    {
      description:
        'List all conversations. ' +
        'Returns a simplified view of user conversations that have had messages sent or received within the last 6 months. ' +
        'Each result includes id, name, workspace_id, and type ' +
        '(directMessage, customerConversation, namedConversation, or asyncMeeting).',
      inputSchema: listConversationsQueryParams.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      args: GetAllConversationsParams,
      { authInfo },
    ): Promise<McpToolResponse> => {
      const params: GetAllConversationsParams = {};
      if (args.user_ids?.length) {
        params.user_ids = args.user_ids;
      }
      if (args.match) {
        params.match = args.match;
      }
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.getAllConversations(
            params,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error listing conversations:', { params, error });
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
      description: renderToolDoc(TOOL_DOCS.summarize_conversation),
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
          // `limit` is this tool's own param, not a listMessages one: the
          // upstream query takes `size` (capped at 50). Forwarding `args`
          // wholesale silently dropped `limit` — so summaries were built from
          // the default page of 20 messages while the schema promised 50 — and
          // leaked `prompt_id` upstream as a stray query param.
          const listParams: ListMessagesParams = {
            conversation_id: args.conversation_id,
            size: Math.min(
              args.limit ?? MAX_SUMMARIZE_MESSAGES,
              MAX_SUMMARIZE_MESSAGES,
            ),
          };
          if (args.start_date) {
            listParams.start_date = args.start_date;
          }
          if (args.end_date) {
            listParams.end_date = args.end_date;
          }
          if (args.language) {
            listParams.language = args.language;
          }

          const messages = await simplifiedApi.listMessages(
            listParams,
            setCarbonVoiceAuthHeader(authInfo?.token),
          );
          message_ids = messages.results?.map((message) => message.id) || [];
        }

        const aiResponse =
          await simplifiedApi.aIResponseControllerCreateResponse(
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
    async (
      args: CreateFolderPayload,
      { authInfo },
    ): Promise<McpToolResponse> => {
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
      description: renderToolDoc(TOOL_DOCS.list_ai_actions),
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
      description: renderToolDoc(TOOL_DOCS.run_ai_action),
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
      description: renderToolDoc(TOOL_DOCS.run_ai_action_for_shared_link),
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
      description: renderToolDoc(TOOL_DOCS.get_ai_action_responses),
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

  // Message Share Links
  server.registerTool(
    'create_message_share_link',
    {
      description: renderToolDoc(TOOL_DOCS.create_message_share_link),
      inputSchema: simplifiedMessageShareLinkControllerCreateBody.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      args: CreateMessageShareLink,
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.simplifiedMessageShareLinkControllerCreate(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error creating message share link:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'get_message_share_link',
    {
      description: renderToolDoc(TOOL_DOCS.get_message_share_link),
      inputSchema:
        simplifiedMessageShareLinkControllerGetMessageShareLinkParams.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      args: { share_link_id: string },
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.simplifiedMessageShareLinkControllerGetMessageShareLink(
            args.share_link_id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error getting message share link:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  // Action Items
  server.registerTool(
    'list_my_action_items',
    {
      description: renderToolDoc(TOOL_DOCS.list_my_action_items),
      inputSchema: actionItemControllerListMyActionItemsQueryParams.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      args: ActionItemControllerListMyActionItemsParams,
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerListMyActionItems(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error listing my action items:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'list_action_items',
    {
      description: renderToolDoc(TOOL_DOCS.list_action_items),
      inputSchema: actionItemControllerListParams.merge(
        actionItemControllerListQueryParams,
      ).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      args: ActionItemControllerListParams & {
        container_type: string;
        container_id: string;
      },
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        const { container_type, container_id, ...queryParams } = args;
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerList(
            container_type,
            container_id,
            queryParams,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error listing action items:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'get_action_item',
    {
      description: renderToolDoc(TOOL_DOCS.get_action_item),
      inputSchema: actionItemControllerGetByIdParams.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (args: GetByIdParams, { authInfo }): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerGetById(
            args.id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error getting action item:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'create_action_item',
    {
      description: renderToolDoc(TOOL_DOCS.create_action_item),
      inputSchema: actionItemControllerCreateBody.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      args: CreateActionItemPayload,
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerCreate(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error creating action item:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'update_action_item',
    {
      description: renderToolDoc(TOOL_DOCS.update_action_item),
      inputSchema: actionItemControllerGetByIdParams.merge(
        actionItemControllerUpdateBody,
      ).shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      args: UpdateActionItemPayload & { id: string },
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        const { id, ...payload } = args;
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerUpdate(
            id,
            payload,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error updating action item:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'set_action_item_status',
    {
      description: renderToolDoc(TOOL_DOCS.set_action_item_status),
      inputSchema: actionItemControllerGetByIdParams.merge(
        actionItemControllerSetStatusBody,
      ).shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      args: UpdateActionItemStatusPayload & { id: string },
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        const { id, ...payload } = args;
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerSetStatus(
            id,
            payload,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error setting action item status:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'delete_action_item',
    {
      description: renderToolDoc(TOOL_DOCS.delete_action_item),
      inputSchema: actionItemControllerGetByIdParams.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async (args: GetByIdParams, { authInfo }): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerDelete(
            args.id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error deleting action item:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'suggest_action_items_from_messages',
    {
      description: renderToolDoc(TOOL_DOCS.suggest_action_items_from_messages),
      inputSchema: actionItemControllerCreateSuggestionsFromMessagesBody.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      args: CreateSuggestionsFromMessagesPayload,
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerCreateSuggestionsFromMessages(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error suggesting action items:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  // Search & Notifications
  //
  // These three hit the FULL Carbon Voice API, not the simplified surface, so
  // they go through hand-rolled `cvApi` methods rather than the generated
  // client — the same approach already used for `/whoami` and `/contacts`.
  // The capabilities they expose (notified state, mentions, listened/unheard
  // state, notification records) have no simplified-API equivalent.
  server.registerTool(
    'search_message_ids',
    {
      description: renderToolDoc(TOOL_DOCS.search_message_ids),
      inputSchema: searchMessageIdsParams.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      args: SearchMessageIdsParams,
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await cvApi.searchMessageIds(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error searching message ids:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'search_messages_by_heard_status',
    {
      description: renderToolDoc(TOOL_DOCS.search_messages_by_heard_status),
      inputSchema: searchMessagesByHeardStatusParams.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      args: SearchMessagesByHeardStatusParams,
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await cvApi.searchMessagesByHeardStatus(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error searching messages by heard status:', {
          args,
          error,
        });
        return formatToMCPToolResponse(error);
      }
    },
  );

  server.registerTool(
    'list_inbox_notifications',
    {
      description: renderToolDoc(TOOL_DOCS.list_inbox_notifications),
      inputSchema: listInboxNotificationsParams.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      args: ListInboxNotificationsParams,
      { authInfo },
    ): Promise<McpToolResponse> => {
      try {
        return formatToMCPToolResponse(
          await cvApi.listInboxNotifications(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
        );
      } catch (error) {
        logger.error('Error listing inbox notifications:', { args, error });
        return formatToMCPToolResponse(error);
      }
    },
  );
}

/**
 * Builds a new MCP server with all tools registered. Use one instance per
 * stateless HTTP request when handling concurrent clients.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    capabilities: {
      resources: {},
      tools: {},
    },
  });
  registerCarbonVoiceTools(server);
  return server;
}

const server = createMcpServer();
export default server;
