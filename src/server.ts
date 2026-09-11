import { z } from 'zod';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { setCarbonVoiceAuthHeader } from './auth';
import { SERVICE_NAME, SERVICE_VERSION } from './constants';
import { getCarbonVoiceAPI } from './cv-api';
import { renderToolDoc, TOOL_DOCS } from './docs';
import { getCarbonVoiceSimplifiedAPI } from './generated';
import {
  actionItemControllerCreateSuggestionsFromMessagesBody,
  actionItemControllerGetByIdParams,
  actionItemControllerListMyActionItemsQueryParams,
  actionItemControllerListParams,
  actionItemControllerListQueryParams,
  actionItemControllerSetStatusBody,
  addLinkAttachmentsToMessageBody,
  addLinkAttachmentsToMessageParams,
  createConversationMessageParams,
  createFolderBody,
  deleteFolderParams,
  getAllConversationsQueryParams,
  getAllRootFoldersQueryParams,
  getConversationByIdParams,
  getFolderByIdParams,
  getFolderMessagesParams,
  getMessageByIdParams,
  getMessageByIdQueryParams,
  getTenRecentMessagesResponseQueryParams,
  getUserByIdParams,
  moveFolderBody,
  moveFolderParams,
  searchUserQueryParams,
  searchUsersBody,
  simplifiedMessageShareLinkControllerCreateBody,
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
  createActionItemBodyShape,
  createConversationMessageBodyShape,
  createVoicememoBodyShape,
  getAiActionResponsesQueryShape,
  getFolderInputShape,
  getMessageShareLinkParamsShape,
  listAiActionsQueryShape,
  ListInboxNotificationsParams,
  listInboxNotificationsParams,
  listMessagesInputShape,
  moveMessageToFolderBodyShape,
  runAiActionBodyShape,
  runAiActionForSharedLinkBodyShape,
  SearchMessageIdsParams,
  searchMessageIdsParams,
  SearchMessagesByHeardStatusParams,
  searchMessagesByHeardStatusParams,
  sendDirectMessageBodyShape,
  SuggestActionItemsFromMessageParams,
  suggestActionItemsFromMessageParams,
  summarizeConversationParams,
  updateActionItemBodyShape,
} from './schemas';
import {
  ConversationTypeFilter,
  fetchAudioFile,
  filterConversationsByType,
  formatToMCPToolResponse,
  logger,
  redactUrlForLog,
} from './utils';

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
 * Optional projection param merged into every tool that returns a substantial
 * payload. Omitting it passes the response through by reference, so existing
 * integrations are byte-for-byte unaffected — see `projectResponse`.
 *
 * The text is deliberately terse: this one string is repeated on 25 tools, so
 * every character costs 25x in the `tools/list` payload that every session
 * pays before making a single call. The earlier, chattier version accounted for
 * 10.6% of the entire payload on its own.
 *
 * Two semantics are left out on purpose. That paths traverse arrays
 * element-wise is shown by the `results.id` example rather than stated, and
 * that pagination fields are always kept is omitted because the worst case if
 * an agent does not know is that it redundantly asks for `total` — about 30
 * characters on one call, against 25 copies of a sentence on every session.
 */
const responseFieldsShape = {
  response_fields: z
    .array(z.string())
    .optional()
    .describe(
      'Dot-path allowlist to shrink the response, e.g. ["results.id","total"]. Omit for the full payload.',
    ),
};

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
      description: renderToolDoc(TOOL_DOCS.list_messages),
      inputSchema: {
        ...listMessagesInputShape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: ListMessagesParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...params } = input;
      try {
        // Fallback to regular API
        return formatToMCPToolResponse(
          await simplifiedApi.listMessages(
            params,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error listing messages:', { params, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'list_messages',
        });
      }
    },
  );

  server.registerTool(
    'get_message',
    {
      description: renderToolDoc(TOOL_DOCS.get_message),
      inputSchema: {
        ...getMessageByIdParams.merge(getMessageByIdQueryParams).shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetMessageInput & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        const { id, ...queryParams } = args;
        return formatToMCPToolResponse(
          await simplifiedApi.getMessageById(
            id,
            queryParams,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting message by id:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_message',
        });
      }
    },
  );

  server.registerTool(
    'get_recent_messages',
    {
      description: renderToolDoc(TOOL_DOCS.get_recent_messages),
      inputSchema: {
        ...getTenRecentMessagesResponseQueryParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetTenRecentMessagesResponseParams & {
        response_fields?: string[];
      },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.getTenRecentMessagesResponse(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting recent messages:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_recent_messages',
        });
      }
    },
  );

  server.registerTool(
    'create_conversation_message',
    {
      description: renderToolDoc(TOOL_DOCS.create_conversation_message),
      inputSchema: {
        ...createConversationMessageParams.shape,
        ...createConversationMessageBodyShape,
      },
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'create_conversation_message',
        });
      }
    },
  );

  server.registerTool(
    'create_direct_message',
    {
      description: renderToolDoc(TOOL_DOCS.create_direct_message),
      inputSchema: { ...sendDirectMessageBodyShape },
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'create_direct_message',
        });
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
  const createVoicememoMessageInput = z
    .object(createVoicememoBodyShape)
    .omit({ audio_file: true })
    .extend({
      audio_url: z
        .string()
        .url()
        .optional()
        .describe(
          'Public **https** URL to an audio file to upload. Supported formats: ' +
            '.mp3, .m4a, .wav, .aac, .ogg, .flac, .wma, .opus, .webm. ' +
            'Overrides `transcript` when provided. The server fetches this URL, ' +
            'so it must be publicly reachable — private, loopback and link-local ' +
            'addresses are refused, and plain http only works for hosts the ' +
            'operator has allowlisted.',
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
        const authHeader = setCarbonVoiceAuthHeader(authInfo?.token);
        const payload: CreateVoicememoMessage = { ...rest };
        if (audio_url) {
          // Prove the caller is authenticated BEFORE fetching a URL they
          // chose. On the HTTP transport `createOAuthTokenVerifier` only
          // DECODES the bearer token — nothing validates its signature — so
          // cv-api is the sole authority on whether the caller is real. Every
          // other tool consults that authority first by construction, because
          // its only side effect IS the upstream call. This one has an
          // outbound fetch in front of it, so without this preflight a caller
          // holding a forged token could make the server resolve and download
          // arbitrary public URLs, and only learn it was unauthorized
          // afterwards.
          //
          // /whoami is the cheapest authenticated endpoint. It costs one round
          // trip on the audio path only, which is negligible next to the
          // download and multipart upload that follow.
          await cvApi.getWhoAmI(authHeader);
          payload.audio_file = await fetchAudioFile(audio_url);
        }

        return formatToMCPToolResponse(
          await simplifiedApi.createVoiceMemoMessage(payload, authHeader),
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
          // Never log the raw URL: an audio_url is commonly presigned, so
          // the signature would land in log files and CloudWatch as a
          // reusable credential.
          logger.warn('Rejected audio_url for voicememo message', {
            audio_url: audio_url ? redactUrlForLog(audio_url) : undefined,
            reason: (error as Error).message,
          });
          return formatToMCPToolResponse(
            {
              statusCode: 400,
              body: {
                error: {
                  code: 'INVALID_AUDIO_URL',
                  message: (error as Error).message,
                },
              },
            },
            { isError: true, tool: 'create_voicememo_message' },
          );
        }
        // `args` carries `audio_url`, which is commonly presigned — logging it
        // whole would put the signature in the log at error level. This branch
        // is reached whenever the failure is NOT an audio-fetch rejection (an
        // upstream upload refusal, say), so it needs the same redaction the
        // AudioFetchError branch above applies.
        logger.error('Error creating voicememo message:', {
          args: {
            ...rest,
            audio_url: audio_url ? redactUrlForLog(audio_url) : undefined,
          },
          error,
        });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'create_voicememo_message',
        });
      }
    },
  );

  server.registerTool(
    'add_attachments_to_message',
    {
      description: renderToolDoc(TOOL_DOCS.add_attachments_to_message),
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'add_attachments_to_message',
        });
      }
    },
  );

  // Users
  server.registerTool(
    'get_user',
    {
      description: renderToolDoc(TOOL_DOCS.get_user),
      inputSchema: {
        ...getUserByIdParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetByIdParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        const contacts = await cvApi.getContacts(
          [args.id],
          setCarbonVoiceAuthHeader(authInfo?.token),
        );
        if (contacts.length === 0) {
          throw new Error('user not found');
        }
        const userInfo = contacts.find((c) => c.id === args.id) ?? contacts[0];
        return formatToMCPToolResponse(userInfo, {
          responseFields: response_fields,
        });
      } catch (error) {
        logger.error('Error getting user by id:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_user',
        });
      }
    },
  );

  server.registerTool(
    'search_user',
    {
      description: renderToolDoc(TOOL_DOCS.search_user),
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'search_user',
        });
      }
    },
  );

  server.registerTool(
    'search_users',
    {
      description: renderToolDoc(TOOL_DOCS.search_users),
      inputSchema: {
        ...searchUsersBody.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: SearchUsersBody & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.searchUsers(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error searching users:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'search_users',
        });
      }
    },
  );

  server.registerTool(
    'get_current_user',
    {
      description: renderToolDoc(TOOL_DOCS.get_current_user),
      // An object schema (rather than none) is what gives the handler access
      // to authInfo; response_fields is the only real param.
      inputSchema: { ...responseFieldsShape },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      params: { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields } = params;
      try {
        return formatToMCPToolResponse(
          await cvApi.getWhoAmI(setCarbonVoiceAuthHeader(authInfo?.token)),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error searching users:', { params, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_current_user',
        });
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
      'Match mode for `user_ids`: `any` (union, default) or `all` (intersection). YOU are always ' +
        'included implicitly — `user_ids: ["u1"]` already means conversations containing you and u1, ' +
        'so never pass your own ID. Doing so under `any` matches every conversation you are in and ' +
        'silently discards the filter.',
    ),
    // MCP-side filter. The upstream endpoint has no `type` parameter, but every
    // result carries `type`, so filtering here keeps non-matching rows out of
    // the agent's context — which is the expensive half.
    types: z
      .array(
        z.enum([
          'directMessage',
          'customerConversation',
          'namedConversation',
          'asyncMeeting',
        ]),
      )
      .optional()
      .describe(
        'Keep only these conversation types. `directMessage` is the 1:1 with ' +
          'someone — combine with `user_ids` to find your DM with a person. ' +
          '`namedConversation` is a conversation somebody named. Omit for all types.',
      ),
  });

  server.registerTool(
    'list_conversations',
    {
      description: renderToolDoc(TOOL_DOCS.list_conversations),
      inputSchema: {
        ...listConversationsQueryParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetAllConversationsParams & {
        types?: ConversationTypeFilter[];
        response_fields?: string[];
      },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, types, ...args } = input;
      const params: GetAllConversationsParams = {};
      if (args.user_ids?.length) {
        params.user_ids = args.user_ids;
      }
      if (args.match) {
        params.match = args.match;
      }
      try {
        return formatToMCPToolResponse(
          filterConversationsByType(
            await simplifiedApi.getAllConversations(
              params,
              setCarbonVoiceAuthHeader(authInfo?.token),
            ),
            types,
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error listing conversations:', { params, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'list_conversations',
        });
      }
    },
  );

  server.registerTool(
    'get_conversation',
    {
      description: renderToolDoc(TOOL_DOCS.get_conversation),
      inputSchema: {
        ...getConversationByIdParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetByIdParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.getConversationById(
            args.id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting conversation by id:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_conversation',
        });
      }
    },
  );

  server.registerTool(
    'get_conversation_users',
    {
      description: renderToolDoc(TOOL_DOCS.get_conversation_users),
      inputSchema: {
        ...getConversationByIdParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetByIdParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.getConversationUsers(
            args.id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting conversation users:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_conversation_users',
        });
      }
    },
  );

  server.registerTool(
    'summarize_conversation',
    {
      description: renderToolDoc(TOOL_DOCS.summarize_conversation),
      inputSchema: {
        ...summarizeConversationParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      input: SummarizeConversationParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
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
            // Clamp the upper bound rather than reject it: an agent asking
            // for more than a page gets the maximum instead of a failed call.
            // The lower bound is a schema concern (`.int().positive()`) — 0 or
            // a fraction has no sensible clamp, and forwarding it as `size`
            // would be rejected by the upstream page validation, which the old
            // code never hit because it dropped `limit` entirely.
            size: Math.max(
              1,
              Math.min(
                Math.floor(args.limit ?? MAX_SUMMARIZE_MESSAGES),
                MAX_SUMMARIZE_MESSAGES,
              ),
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

        return formatToMCPToolResponse(aiResponse, {
          responseFields: response_fields,
        });
      } catch (error) {
        logger.error('Error summarizing conversation:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'summarize_conversation',
        });
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
      description: renderToolDoc(TOOL_DOCS.get_root_folders),
      inputSchema: {
        ...getAllRootFoldersQueryParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetAllRootFoldersParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.getAllRootFolders(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error listing root folders:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_root_folders',
        });
      }
    },
  );

  server.registerTool(
    'create_folder',
    {
      description: renderToolDoc(TOOL_DOCS.create_folder),
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'create_folder',
        });
      }
    },
  );

  server.registerTool(
    'get_folder',
    {
      description: renderToolDoc(TOOL_DOCS.get_folder),
      inputSchema: {
        ...getFolderByIdParams.shape,
        ...getFolderInputShape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetFolderInput & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.getFolderById(
            args.id,
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting folder by id:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_folder',
        });
      }
    },
  );

  server.registerTool(
    'get_folder_with_messages',
    {
      description: renderToolDoc(TOOL_DOCS.get_folder_with_messages),
      inputSchema: {
        ...getFolderMessagesParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetByIdParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.getFolderMessages(
            args.id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting folder with messages:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_folder_with_messages',
        });
      }
    },
  );

  server.registerTool(
    'update_folder_name',
    {
      description: renderToolDoc(TOOL_DOCS.update_folder_name),
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'update_folder_name',
        });
      }
    },
  );

  server.registerTool(
    'delete_folder',
    {
      description: renderToolDoc(TOOL_DOCS.delete_folder),
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'delete_folder',
        });
      }
    },
  );

  server.registerTool(
    'move_folder',
    {
      description: renderToolDoc(TOOL_DOCS.move_folder),
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'move_folder',
        });
      }
    },
  );

  server.registerTool(
    'move_message_to_folder',
    {
      description: renderToolDoc(TOOL_DOCS.move_message_to_folder),
      inputSchema: { ...moveMessageToFolderBodyShape },
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'move_message_to_folder',
        });
      }
    },
  );

  // Workspace
  server.registerTool(
    'get_workspaces_basic_info',
    {
      description: renderToolDoc(TOOL_DOCS.get_workspaces_basic_info),
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_workspaces_basic_info',
        });
      }
    },
  );

  // AI Magic
  server.registerTool(
    'list_ai_actions',
    {
      description: renderToolDoc(TOOL_DOCS.list_ai_actions),
      inputSchema: {
        ...listAiActionsQueryShape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: AIPromptControllerGetPromptsParams & {
        response_fields?: string[];
      },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.aIPromptControllerGetPrompts(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error listing ai actions:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'list_ai_actions',
        });
      }
    },
  );

  server.registerTool(
    'run_ai_action',
    {
      description: renderToolDoc(TOOL_DOCS.run_ai_action),
      inputSchema: {
        ...runAiActionBodyShape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      input: CreateAIResponse & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.aIResponseControllerCreateResponse(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error running ai action:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'run_ai_action',
        });
      }
    },
  );

  server.registerTool(
    'run_ai_action_for_shared_link',
    {
      description: renderToolDoc(TOOL_DOCS.run_ai_action_for_shared_link),
      inputSchema: {
        ...runAiActionForSharedLinkBodyShape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      input: CreateShareLinkAIResponse & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.createShareLinkAIResponse(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error running ai action for shared link:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'run_ai_action_for_shared_link',
        });
      }
    },
  );

  server.registerTool(
    'get_ai_action_responses',
    {
      description: renderToolDoc(TOOL_DOCS.get_ai_action_responses),
      inputSchema: {
        ...getAiActionResponsesQueryShape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: AIResponseControllerGetAllResponsesParams & {
        response_fields?: string[];
      },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.aIResponseControllerGetAllResponses(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting ai action responses:', { error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_ai_action_responses',
        });
      }
    },
  );

  // Message Share Links
  server.registerTool(
    'create_message_share_link',
    {
      description: renderToolDoc(TOOL_DOCS.create_message_share_link),
      inputSchema: {
        ...simplifiedMessageShareLinkControllerCreateBody.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      input: CreateMessageShareLink & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.simplifiedMessageShareLinkControllerCreate(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error creating message share link:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'create_message_share_link',
        });
      }
    },
  );

  server.registerTool(
    'get_message_share_link',
    {
      description: renderToolDoc(TOOL_DOCS.get_message_share_link),
      inputSchema: {
        ...getMessageShareLinkParamsShape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: { share_link_id: string } & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.simplifiedMessageShareLinkControllerGetMessageShareLink(
            args.share_link_id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting message share link:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_message_share_link',
        });
      }
    },
  );

  // Action Items
  server.registerTool(
    'list_my_action_items',
    {
      description: renderToolDoc(TOOL_DOCS.list_my_action_items),
      inputSchema: {
        ...actionItemControllerListMyActionItemsQueryParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: ActionItemControllerListMyActionItemsParams & {
        response_fields?: string[];
      },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerListMyActionItems(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error listing my action items:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'list_my_action_items',
        });
      }
    },
  );

  server.registerTool(
    'list_action_items',
    {
      description: renderToolDoc(TOOL_DOCS.list_action_items),
      inputSchema: {
        ...actionItemControllerListParams.merge(
          actionItemControllerListQueryParams,
        ).shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: ActionItemControllerListParams & {
        container_type: string;
        container_id: string;
      } & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        const { container_type, container_id, ...queryParams } = args;
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerList(
            container_type,
            container_id,
            queryParams,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error listing action items:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'list_action_items',
        });
      }
    },
  );

  server.registerTool(
    'get_action_item',
    {
      description: renderToolDoc(TOOL_DOCS.get_action_item),
      inputSchema: {
        ...actionItemControllerGetByIdParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: GetByIdParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await simplifiedApi.actionItemControllerGetById(
            args.id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error getting action item:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'get_action_item',
        });
      }
    },
  );

  server.registerTool(
    'create_action_item',
    {
      description: renderToolDoc(TOOL_DOCS.create_action_item),
      inputSchema: { ...createActionItemBodyShape },
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'create_action_item',
        });
      }
    },
  );

  server.registerTool(
    'update_action_item',
    {
      description: renderToolDoc(TOOL_DOCS.update_action_item),
      inputSchema: {
        ...actionItemControllerGetByIdParams.shape,
        ...updateActionItemBodyShape,
      },
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'update_action_item',
        });
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'set_action_item_status',
        });
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'delete_action_item',
        });
      }
    },
  );

  // The synchronous single-message variant. Hits the FULL API (see the note on
  // `cvApi.createActionItemSuggestionsFromMessage`) because the endpoint is
  // excluded from the OpenAPI document the generated client is built from.
  server.registerTool(
    'suggest_action_items_from_message',
    {
      description: renderToolDoc(TOOL_DOCS.suggest_action_items_from_message),
      inputSchema: {
        ...suggestActionItemsFromMessageParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (
      input: SuggestActionItemsFromMessageParams & {
        response_fields?: string[];
      },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await cvApi.createActionItemSuggestionsFromMessage(
            args.message_id,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error suggesting action items from message:', {
          args,
          error,
        });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'suggest_action_items_from_message',
        });
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
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'suggest_action_items_from_messages',
        });
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
      inputSchema: {
        ...searchMessageIdsParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: SearchMessageIdsParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await cvApi.searchMessageIds(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error searching message ids:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'search_message_ids',
        });
      }
    },
  );

  server.registerTool(
    'search_messages_by_heard_status',
    {
      description: renderToolDoc(TOOL_DOCS.search_messages_by_heard_status),
      inputSchema: {
        ...searchMessagesByHeardStatusParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: SearchMessagesByHeardStatusParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await cvApi.searchMessagesByHeardStatus(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error searching messages by heard status:', {
          args,
          error,
        });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'search_messages_by_heard_status',
        });
      }
    },
  );

  server.registerTool(
    'list_inbox_notifications',
    {
      description: renderToolDoc(TOOL_DOCS.list_inbox_notifications),
      inputSchema: {
        ...listInboxNotificationsParams.shape,
        ...responseFieldsShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
    },
    async (
      input: ListInboxNotificationsParams & { response_fields?: string[] },
      { authInfo },
    ): Promise<McpToolResponse> => {
      const { response_fields, ...args } = input;
      try {
        return formatToMCPToolResponse(
          await cvApi.listInboxNotifications(
            args,
            setCarbonVoiceAuthHeader(authInfo?.token),
          ),
          { responseFields: response_fields },
        );
      } catch (error) {
        logger.error('Error listing inbox notifications:', { args, error });
        return formatToMCPToolResponse(error, {
          isError: true,
          tool: 'list_inbox_notifications',
        });
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
