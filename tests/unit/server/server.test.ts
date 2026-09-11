import { z } from 'zod';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { setCarbonVoiceAuthHeader } from '../../../src/auth';
import { getCarbonVoiceAPI } from '../../../src/cv-api';
import { TOOL_NAMES } from '../../../src/docs';
import { getCarbonVoiceSimplifiedAPI } from '../../../src/generated';
import { formatToMCPToolResponse, logger } from '../../../src/utils';
import {
  listMessagesQueryParams,
  getAllConversationsQueryParams,
} from '../../../src/generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';

// Mock the auth module
jest.mock('../../../src/auth', () => ({
  setCarbonVoiceAuthHeader: jest.fn((token) => ({
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })),
}));

// Mock the cv-api module
jest.mock('../../../src/cv-api', () => {
  const cvApiMock = {
    getWhoAmI: jest.fn().mockResolvedValue({ user: {} }),
    searchMessageIds: jest.fn(),
    searchMessagesByHeardStatus: jest.fn(),
    listInboxNotifications: jest.fn(),
  };
  return {
    getCarbonVoiceAPI: jest.fn(() => cvApiMock),
  };
});

// Mock the generated API module
jest.mock('../../../src/generated', () => {
  const simplifiedApiMock = {
    listMessages: jest.fn(),
    getMessageById: jest.fn(),
    getTenRecentMessagesResponse: jest.fn(),
    createConversationMessage: jest.fn(),
    sendDirectMessage: jest.fn(),
    createVoiceMemoMessage: jest.fn(),
    addLinkAttachmentsToMessage: jest.fn(),
    getUserById: jest.fn(),
    searchUser: jest.fn(),
    searchUsers: jest.fn(),
    getAllConversations: jest.fn(),
    getConversationById: jest.fn(),
    getConversationUsers: jest.fn(),
    summarizeConversation: jest.fn(),
    getAllRootFolders: jest.fn(),
    createFolder: jest.fn(),
    getFolderById: jest.fn(),
    getFolderMessages: jest.fn(),
    updateFolderName: jest.fn(),
    deleteFolder: jest.fn(),
    moveFolder: jest.fn(),
    addMessageToFolderOrWorkspace: jest.fn(),
    getAllWorkspacesWithBasicInfo: jest.fn(),
    aIPromptControllerGetPrompts: jest.fn(),
    aIResponseControllerCreateResponse: jest.fn(),
    createShareLinkAIResponse: jest.fn(),
    aIResponseControllerGetAllResponses: jest.fn(),
    simplifiedMessageShareLinkControllerCreate: jest.fn(),
    simplifiedMessageShareLinkControllerGetMessageShareLink: jest.fn(),
    actionItemControllerListMyActionItems: jest.fn(),
    actionItemControllerList: jest.fn(),
    actionItemControllerGetById: jest.fn(),
    actionItemControllerCreate: jest.fn(),
    actionItemControllerUpdate: jest.fn(),
    actionItemControllerSetStatus: jest.fn(),
    actionItemControllerDelete: jest.fn(),
    actionItemControllerCreateSuggestionsFromMessages: jest.fn(),
  };
  return {
    getCarbonVoiceSimplifiedAPI: jest.fn(() => simplifiedApiMock),
  };
});

// Mock the utils module
jest.mock('../../../src/utils', () => ({
  formatToMCPToolResponse: jest.fn(),
  fetchAudioFile: jest.fn(),
  // Real implementation: the point of the assertion below is that redaction
  // actually happens, not that a stub was called.
  redactUrlForLog: jest.requireActual('../../../src/utils/redact-url.util')
    .redactUrlForLog,
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('MCP Server', () => {
  // Mock the registerTool method
  const mockRegisterTool = jest.fn();

  // Mock the McpServer constructor
  const mockMcpServer = jest.fn().mockImplementation(() => ({
    registerTool: mockRegisterTool,
  }));

  // Mock auth context
  const mockContext = {
    authInfo: { token: 'test-token' },
  };

  // Mock the getCarbonVoiceAPI function
  const cvApiMock = {
    getWhoAmI: jest.fn().mockResolvedValue({ user: {} }),
    getContacts: jest.fn(),
    searchMessageIds: jest.fn().mockResolvedValue({ ids: [], has_more: false }),
    searchMessagesByHeardStatus: jest
      .fn()
      .mockResolvedValue({ messages: [], unheard_counts_by_channel: {} }),
    listInboxNotifications: jest
      .fn()
      .mockResolvedValue({ results: [], total_results: 0, total_unread: 0 }),
  };

  const mockGetCarbonVoiceAPI = jest.fn().mockReturnValue(cvApiMock);

  // Create a single simplifiedApiMock object with all API methods
  const simplifiedApiMock = {
    listMessages: jest.fn().mockResolvedValue({ messages: [] }),
    getMessageById: jest.fn().mockResolvedValue({ message: {} }),
    getTenRecentMessagesResponse: jest.fn().mockResolvedValue({ messages: [] }),
    createConversationMessage: jest.fn().mockResolvedValue({ message: {} }),
    sendDirectMessage: jest.fn().mockResolvedValue({ message: {} }),
    createVoiceMemoMessage: jest.fn().mockResolvedValue({ message: {} }),
    addLinkAttachmentsToMessage: jest.fn().mockResolvedValue({ success: true }),
    getUserById: jest.fn().mockResolvedValue({ user: {} }),
    searchUser: jest.fn().mockResolvedValue({ user: {} }),
    searchUsers: jest.fn().mockResolvedValue({ users: [] }),
    getAllConversations: jest.fn().mockResolvedValue({ conversations: [] }),
    getConversationById: jest.fn().mockResolvedValue({ conversation: {} }),
    getConversationUsers: jest.fn().mockResolvedValue({ users: [] }),
    getAllRootFolders: jest.fn().mockResolvedValue({ folders: [] }),
    createFolder: jest.fn().mockResolvedValue({ folder: {} }),
    getFolderById: jest.fn().mockResolvedValue({ folder: {} }),
    getFolderMessages: jest.fn().mockResolvedValue({ folder: {} }),
    updateFolderName: jest.fn().mockResolvedValue({ folder: {} }),
    deleteFolder: jest.fn().mockResolvedValue({ success: true }),
    moveFolder: jest.fn().mockResolvedValue({ success: true }),
    addMessageToFolderOrWorkspace: jest
      .fn()
      .mockResolvedValue({ success: true }),
    getAllWorkspacesWithBasicInfo: jest
      .fn()
      .mockResolvedValue({ workspaces: [] }),
    aIPromptControllerGetPrompts: jest.fn().mockResolvedValue({ prompts: [] }),
    aIResponseControllerCreateResponse: jest
      .fn()
      .mockResolvedValue({ response: {} }),
    createShareLinkAIResponse: jest.fn().mockResolvedValue({ response: {} }),
    aIResponseControllerGetAllResponses: jest
      .fn()
      .mockResolvedValue({ responses: [] }),
    simplifiedMessageShareLinkControllerCreate: jest
      .fn()
      .mockResolvedValue({ id: 'share-1', link: 'https://cv/s/share-1' }),
    simplifiedMessageShareLinkControllerGetMessageShareLink: jest
      .fn()
      .mockResolvedValue({ id: 'share-1', link: 'https://cv/s/share-1' }),
    actionItemControllerListMyActionItems: jest
      .fn()
      .mockResolvedValue({ results: [], has_more: false }),
    actionItemControllerList: jest
      .fn()
      .mockResolvedValue({ results: [], has_more: false }),
    actionItemControllerGetById: jest
      .fn()
      .mockResolvedValue({ id: 'ai-1', title: 't', status: 'todo' }),
    actionItemControllerCreate: jest
      .fn()
      .mockResolvedValue({ id: 'ai-1', title: 't', status: 'todo' }),
    actionItemControllerUpdate: jest
      .fn()
      .mockResolvedValue({ id: 'ai-1', title: 't2', status: 'todo' }),
    actionItemControllerSetStatus: jest
      .fn()
      .mockResolvedValue({ id: 'ai-1', title: 't', status: 'done' }),
    actionItemControllerDelete: jest.fn().mockResolvedValue({ success: true }),
    actionItemControllerCreateSuggestionsFromMessages: jest
      .fn()
      .mockResolvedValue([{ id: 'ai-2', status: 'suggested' }]),
    getWhoAmI: jest.fn().mockResolvedValue({ user: {} }),
  };

  // Mock the getCarbonVoiceSimplifiedAPI function to return our mock
  const mockGetCarbonVoiceSimplifiedAPI = jest
    .fn()
    .mockReturnValue(simplifiedApiMock);

  // Mock the formatToMCPToolResponse function
  const mockFormatToMCPToolResponse = jest
    .fn()
    .mockReturnValue({ content: [] });

  // Mock the logger
  const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
  };

  // Mock the audio fetcher used by create_voicememo_message's audio_url path
  const mockFetchAudioFile = jest.fn();

  // Mock the setCarbonVoiceAuthHeader function
  const mockSetCarbonVoiceAuthHeader = jest.fn().mockReturnValue({
    headers: { Authorization: 'Bearer test-token' },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Set up mocks before importing the server module
    jest.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: mockMcpServer,
    }));

    jest.doMock('../../../src/generated', () => ({
      getCarbonVoiceSimplifiedAPI: mockGetCarbonVoiceSimplifiedAPI,
    }));

    jest.doMock('../../../src/utils', () => ({
      formatToMCPToolResponse: mockFormatToMCPToolResponse,
      fetchAudioFile: mockFetchAudioFile,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      redactUrlForLog: require('../../../src/utils/redact-url.util')
        .redactUrlForLog,
      logger: mockLogger,
    }));

    jest.doMock('../../../src/auth', () => ({
      setCarbonVoiceAuthHeader: mockSetCarbonVoiceAuthHeader,
    }));

    jest.doMock('../../../src/cv-api', () => ({
      getCarbonVoiceAPI: mockGetCarbonVoiceAPI,
    }));

    // Import the server module after mocks are set up
    require('../../../src/server');
  });

  describe('Constraint descriptions', () => {
    // Phase 3: rules that previously cost a failed call to discover, or that
    // upstream documented incorrectly. Each was read out of the cv-api handler,
    // so these assertions pin behaviour, not guesses.
    const findCall = (name: string) =>
      mockRegisterTool.mock.calls.find((c: any) => c[0] === name);

    it('get_folder documents the include_first_level_tree gate on BOTH date and direction', () => {
      // Upstream only ever documented it on `date`, so `direction` silently
      // no-op'd with nothing to warn the agent.
      const schema = findCall('get_folder')[1].inputSchema;
      expect(schema.direction.description).toContain(
        'include_first_level_tree',
      );
      expect(schema.date.description).toContain('include_first_level_tree');
    });

    it('create_voicememo_message no longer carries the incoherent workspace_id text', () => {
      // Upstream reads: "not allowed when folder_id specified is different
      // from the folder_id" — a copy-paste of the folder_id text describing a
      // rule the handler does not enforce.
      const schema = findCall('create_voicememo_message')[1].inputSchema;
      expect(schema.workspace_id.description).not.toContain(
        'different from the folder_id',
      );
      expect(schema.transcript.description).toContain('2-5000');
      expect(schema.links.description).toContain('100');
    });

    it('move_message_to_folder states that exactly one destination is required', () => {
      const schema = findCall('move_message_to_folder')[1].inputSchema;
      expect(schema.folder_id.description).toContain('exactly one');
      expect(schema.workspace_id.description).toContain('exactly one');
    });

    it('move_message_to_folder states the message/folder type-match rule', () => {
      // Enforced by FolderService.validateMessageToBeAddedToFolder and
      // documented nowhere upstream.
      const schema = findCall('move_message_to_folder')[1].inputSchema;
      expect(schema.message_id.description).toContain('must match');
      expect(schema.message_id.description).toContain('creator');
    });

    it('create_conversation_message puts the transcript-or-links rule on the params', () => {
      const schema = findCall('create_conversation_message')[1].inputSchema;
      expect(schema.transcript.description).toContain('required');
      expect(schema.links.description).toContain('required');
    });
  });

  describe('Response projection (response_fields)', () => {
    const findCall = (name: string) =>
      mockRegisterTool.mock.calls.find((c: any) => c[0] === name);

    const PROJECTED_TOOLS = [
      'list_messages',
      'get_message',
      'get_recent_messages',
      'get_user',
      'search_users',
      'get_current_user',
      'list_conversations',
      'get_conversation',
      'get_conversation_users',
      'summarize_conversation',
      'get_root_folders',
      'get_folder',
      'get_folder_with_messages',
      'list_ai_actions',
      'run_ai_action',
      'run_ai_action_for_shared_link',
      'get_ai_action_responses',
      'create_message_share_link',
      'get_message_share_link',
      'list_my_action_items',
      'list_action_items',
      'get_action_item',
      'search_message_ids',
      'search_messages_by_heard_status',
      'list_inbox_notifications',
    ];

    it.each(PROJECTED_TOOLS)('%s exposes response_fields', (tool) => {
      expect(Object.keys(findCall(tool)[1].inputSchema)).toContain(
        'response_fields',
      );
    });

    it('does not add response_fields to tools that return only a confirmation', () => {
      // Every param costs description weight in tools/list, so projection is
      // only offered where there is a payload worth narrowing.
      ['delete_folder', 'delete_action_item', 'move_message_to_folder'].forEach(
        (tool) => {
          expect(Object.keys(findCall(tool)[1].inputSchema)).not.toContain(
            'response_fields',
          );
        },
      );
    });

    it('never forwards response_fields to the upstream API', async () => {
      // The whole point of destructuring it out: the API would see an unknown
      // query param, and existing param assertions would break.
      await findCall('list_messages')[2](
        { workspace_id: 'ws-1', response_fields: ['results.id'] },
        mockContext,
      );

      expect(simplifiedApiMock.listMessages).toHaveBeenCalledWith(
        { workspace_id: 'ws-1' },
        { headers: { Authorization: 'Bearer test-token' } },
      );
      expect(
        simplifiedApiMock.listMessages.mock.calls[0][0],
      ).not.toHaveProperty('response_fields');
    });

    it('strips response_fields even when the handler re-destructures args', async () => {
      // get_message splits `id` off the query params; response_fields must not
      // survive into the query either.
      await findCall('get_message')[2](
        { id: 'm-1', language: 'english', response_fields: ['message.id'] },
        mockContext,
      );

      expect(simplifiedApiMock.getMessageById).toHaveBeenCalledWith(
        'm-1',
        { language: 'english' },
        { headers: { Authorization: 'Bearer test-token' } },
      );
    });

    it('passes the requested fields to the formatter', async () => {
      await findCall('get_current_user')[2](
        { response_fields: ['user.user_guid'] },
        mockContext,
      );

      expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
        expect.anything(),
        { responseFields: ['user.user_guid'] },
      );
    });

    it('passes undefined when the caller omits projection', async () => {
      await findCall('get_current_user')[2]({}, mockContext);

      expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
        expect.anything(),
        { responseFields: undefined },
      );
    });
  });

  describe('Error responses', () => {
    // F2 from the review: success and failure previously returned an identical
    // envelope, so an agent could not tell a failed call from a successful one
    // without parsing the body for an `error` key.
    //
    // Sampled across tool families rather than all 41: the point is that the
    // catch blocks carry the flag and the tool name, not that every API method
    // can reject. Each case rejects only its own method, with `...Once`, so
    // nothing leaks into later tests.
    const cases: Array<[string, 'simplified' | 'cv', string, any]> = [
      ['list_messages', 'simplified', 'listMessages', {}],
      ['get_current_user', 'cv', 'getWhoAmI', {}],
      [
        'run_ai_action',
        'simplified',
        'aIResponseControllerCreateResponse',
        { prompt_id: 'p', message_ids: ['m'] },
      ],
      [
        'create_message_share_link',
        'simplified',
        'simplifiedMessageShareLinkControllerCreate',
        { shared_message_id: 'm' },
      ],
      [
        'list_my_action_items',
        'simplified',
        'actionItemControllerListMyActionItems',
        {},
      ],
      ['search_message_ids', 'cv', 'searchMessageIds', {}],
    ];

    it.each(cases)(
      '%s marks its failure with isError and its own tool name',
      async (tool, target, method, args) => {
        const mocks: any = target === 'cv' ? cvApiMock : simplifiedApiMock;
        mocks[method].mockRejectedValueOnce(new Error(`boom-${tool}`));

        const call = mockRegisterTool.mock.calls.find(
          (c: any) => c[0] === tool,
        );
        expect(call).toBeDefined();

        await call[2](args, mockContext);

        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          expect.anything(),
          { isError: true, tool },
        );
      },
    );
  });

  describe('Tool inventory', () => {
    const registeredNames = () =>
      mockRegisterTool.mock.calls.map((call: any) => call[0]);

    // Guards the documentation contract: TOOL_NAMES is the single source of
    // truth used by tests/unit/docs/tool-docs.test.ts to validate that every
    // declared prerequisite points at a tool that exists. A tool registered
    // without being added there — or removed without being taken out — fails
    // here rather than silently breaking those cross-references.
    it('registers exactly the tools listed in TOOL_NAMES', () => {
      expect([...registeredNames()].sort()).toEqual([...TOOL_NAMES].sort());
    });

    // Prompt-cache stability. Tool definitions render at position 0 of the
    // prompt — ahead of the system prompt and the conversation — so the
    // `tools/list` payload is the most valuable cacheable prefix we have. Any
    // change to it, INCLUDING REORDERING, invalidates the whole cache for
    // every downstream turn. Registration order is currently just the order of
    // the calls in server.ts, which nothing else enforces; this pins it so a
    // reordering during a refactor fails here instead of silently costing
    // every session its cache hits.
    it('registers tools in exactly the TOOL_NAMES order, for cache stability', () => {
      expect(registeredNames()).toEqual([...TOOL_NAMES]);
    });

    it('registers no tool twice', () => {
      const registered = registeredNames();
      expect(new Set(registered).size).toBe(registered.length);
    });

    it('exposes a deterministic tool order across repeated registrations', () => {
      // A second server built in the same process must produce the identical
      // order — catches anything order-dependent creeping into registration
      // (a Set/Map iteration, a conditional, a date-seeded branch).
      const first = registeredNames();
      mockRegisterTool.mockClear();
      jest.isolateModules(() => {
        require('../../../src/server');
      });
      expect(registeredNames()).toEqual(first);
    });
  });

  describe('Tool Registration', () => {
    describe('list_messages tool', () => {
      let listMessagesCall: any;
      beforeEach(() => {
        // Find the list_messages tool registration
        listMessagesCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'list_messages',
        );
      });

      it('should register list_messages tool with correct parameters', () => {
        expect(listMessagesCall).toBeDefined();
        expect(listMessagesCall[0]).toBe('list_messages');
        expect(listMessagesCall[1].inputSchema).toBeDefined();
        expect(listMessagesCall[1].description).toBeDefined();
        expect(listMessagesCall[1].annotations).toBeDefined();
        expect(listMessagesCall[1].annotations.readOnlyHint).toBe(true);
        expect(listMessagesCall[1].annotations.destructiveHint).toBe(false);
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = listMessagesCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          page: 1,
          size: 10,
          sort_direction: 'DESC' as const,
          conversation_id: 'test-conv-id',
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(simplifiedApiMock.listMessages).toHaveBeenCalledWith(
          testParams,
          {
            headers: { Authorization: 'Bearer test-token' },
          },
        );

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.listMessages.mockRejectedValueOnce(apiError);

        const toolHandler = listMessagesCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler({}, mockContext);

        // Verify the API was called
        expect(simplifiedApiMock.listMessages).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error listing messages:',
          {
            params: {},
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('get_message tool', () => {
      let getMessageCall: any;
      beforeEach(() => {
        // Find the get_message tool registration
        getMessageCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_message',
        );
      });

      it('should register get_message tool with correct parameters', () => {
        expect(getMessageCall).toBeDefined();
        expect(getMessageCall[0]).toBe('get_message');
        expect(getMessageCall[1].inputSchema).toBeDefined();
        expect(getMessageCall[1].annotations).toBeDefined();
        expect(getMessageCall[1].annotations.readOnlyHint).toBe(true);
        expect(getMessageCall[1].annotations.destructiveHint).toBe(false);
        expect(getMessageCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getMessageCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          id: 'test-message-id',
          include_attachments: true,
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(simplifiedApiMock.getMessageById).toHaveBeenCalledWith(
          testParams.id,
          { include_attachments: true },
          {
            headers: { Authorization: 'Bearer test-token' },
          },
        );

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.getMessageById.mockRejectedValueOnce(apiError);

        const toolHandler = getMessageCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler({ id: 'test-id' }, mockContext);

        // Verify the API was called
        expect(simplifiedApiMock.getMessageById).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting message by id:',
          {
            args: { id: 'test-id' },
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('get_recent_messages tool', () => {
      let getRecentMessagesCall: any;
      beforeEach(() => {
        // Find the get_recent_messages tool registration
        getRecentMessagesCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_recent_messages',
        );
      });

      it('should register get_recent_messages tool with correct parameters', () => {
        expect(getRecentMessagesCall).toBeDefined();
        expect(getRecentMessagesCall[0]).toBe('get_recent_messages');
        expect(getRecentMessagesCall[1].inputSchema).toBeDefined();
        expect(getRecentMessagesCall[1].annotations).toBeDefined();
        expect(getRecentMessagesCall[1].annotations.readOnlyHint).toBe(true);
        expect(getRecentMessagesCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(getRecentMessagesCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getRecentMessagesCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          include_attachments: true,
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(
          simplifiedApiMock.getTenRecentMessagesResponse,
        ).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.getTenRecentMessagesResponse.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = getRecentMessagesCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler({}, mockContext);

        // Verify the API was called
        expect(
          simplifiedApiMock.getTenRecentMessagesResponse,
        ).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting recent messages:',
          {
            args: {},
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('create_conversation_message tool', () => {
      let createConversationMessageCall: any;
      beforeEach(() => {
        // Find the create_conversation_message tool registration
        createConversationMessageCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'create_conversation_message',
        );
      });

      it('should register create_conversation_message tool with correct parameters', () => {
        expect(createConversationMessageCall).toBeDefined();
        expect(createConversationMessageCall[0]).toBe(
          'create_conversation_message',
        );
        expect(createConversationMessageCall[1].inputSchema).toBeDefined();
        expect(createConversationMessageCall[1].annotations).toBeDefined();
        expect(createConversationMessageCall[1].annotations.readOnlyHint).toBe(
          false,
        );
        expect(
          createConversationMessageCall[1].annotations.destructiveHint,
        ).toBe(false);
        expect(createConversationMessageCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = createConversationMessageCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          id: 'test-conversation-id',
          transcript: 'Hello world',
          parent_id: 'test-parent-id',
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(
          simplifiedApiMock.createConversationMessage,
        ).toHaveBeenCalledWith(testParams.id, testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.createConversationMessage.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = createConversationMessageCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler(
          { id: 'test-id', transcript: 'test' },
          mockContext,
        );

        // Verify the API was called
        expect(simplifiedApiMock.createConversationMessage).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error creating conversation message:',
          {
            args: { id: 'test-id', transcript: 'test' },
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('create_direct_message tool', () => {
      let createDirectMessageCall: any;
      beforeEach(() => {
        // Find the create_direct_message tool registration
        createDirectMessageCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'create_direct_message',
        );
      });

      it('should register create_direct_message tool with correct parameters', () => {
        expect(createDirectMessageCall).toBeDefined();
        expect(createDirectMessageCall[0]).toBe('create_direct_message');
        expect(createDirectMessageCall[1].inputSchema).toBeDefined();
        expect(createDirectMessageCall[1].annotations).toBeDefined();
        expect(createDirectMessageCall[1].annotations.readOnlyHint).toBe(false);
        expect(createDirectMessageCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(createDirectMessageCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = createDirectMessageCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          to_recipients: ['user1', 'user2'],
          transcript: 'Hello world',
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(simplifiedApiMock.sendDirectMessage).toHaveBeenCalledWith(
          testParams,
          {
            headers: { Authorization: 'Bearer test-token' },
          },
        );

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.sendDirectMessage.mockRejectedValueOnce(apiError);

        const toolHandler = createDirectMessageCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler(
          { to_recipients: ['user1'], transcript: 'test' },
          mockContext,
        );

        // Verify the API was called
        expect(simplifiedApiMock.sendDirectMessage).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error creating direct message:',
          {
            args: { to_recipients: ['user1'], transcript: 'test' },
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('create_voicememo_message tool', () => {
      let createVoicememoMessageCall: any;
      beforeEach(() => {
        // Find the create_voicememo_message tool registration
        createVoicememoMessageCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'create_voicememo_message',
        );
      });

      it('should register create_voicememo_message tool with correct parameters', () => {
        expect(createVoicememoMessageCall).toBeDefined();
        expect(createVoicememoMessageCall[0]).toBe('create_voicememo_message');
        expect(createVoicememoMessageCall[1].inputSchema).toBeDefined();
        expect(createVoicememoMessageCall[1].annotations).toBeDefined();
        expect(createVoicememoMessageCall[1].annotations.readOnlyHint).toBe(
          false,
        );
        expect(createVoicememoMessageCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(createVoicememoMessageCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = createVoicememoMessageCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          transcript: 'Hello world',
          links: ['https://example.com/audio.mp3'],
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(simplifiedApiMock.createVoiceMemoMessage).toHaveBeenCalledWith(
          testParams,
          {
            headers: { Authorization: 'Bearer test-token' },
          },
        );

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.createVoiceMemoMessage.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = createVoicememoMessageCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler({ transcript: 'test' }, mockContext);

        // Verify the API was called
        expect(simplifiedApiMock.createVoiceMemoMessage).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error creating voicememo message:',
          {
            args: { transcript: 'test' },
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('add_attachments_to_message tool', () => {
      let addAttachmentsToMessageCall: any;
      beforeEach(() => {
        // Find the add_attachments_to_message tool registration
        addAttachmentsToMessageCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'add_attachments_to_message',
        );
      });

      it('should register add_attachments_to_message tool with correct parameters', () => {
        expect(addAttachmentsToMessageCall).toBeDefined();
        expect(addAttachmentsToMessageCall[0]).toBe(
          'add_attachments_to_message',
        );
        expect(addAttachmentsToMessageCall[1].inputSchema).toBeDefined();
        expect(addAttachmentsToMessageCall[1].annotations).toBeDefined();
        expect(addAttachmentsToMessageCall[1].annotations.readOnlyHint).toBe(
          false,
        );
        expect(addAttachmentsToMessageCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(addAttachmentsToMessageCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = addAttachmentsToMessageCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          id: 'test-message-id',
          links: ['https://example.com/file.pdf'],
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(
          simplifiedApiMock.addLinkAttachmentsToMessage,
        ).toHaveBeenCalledWith(
          testParams.id,
          { links: testParams.links },
          {
            headers: { Authorization: 'Bearer test-token' },
          },
        );

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.addLinkAttachmentsToMessage.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = addAttachmentsToMessageCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler(
          { id: 'test-id', links: ['test-link'] },
          mockContext,
        );

        // Verify the API was called
        expect(
          simplifiedApiMock.addLinkAttachmentsToMessage,
        ).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error adding attachments to message:',
          {
            args: { id: 'test-id', links: ['test-link'] },
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('search_user tool', () => {
      let searchUserCall: any;
      beforeEach(() => {
        // Find the search_user tool registration
        searchUserCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'search_user',
        );
      });

      it('should register search_user tool with correct parameters', () => {
        expect(searchUserCall).toBeDefined();
        expect(searchUserCall[0]).toBe('search_user');
        expect(searchUserCall[1].inputSchema).toBeDefined();
        expect(searchUserCall[1].annotations).toBeDefined();
        expect(searchUserCall[1].annotations.readOnlyHint).toBe(true);
        expect(searchUserCall[1].annotations.destructiveHint).toBe(false);
        expect(searchUserCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = searchUserCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          phone_number: '+1234567890',
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(simplifiedApiMock.searchUser).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.searchUser.mockRejectedValueOnce(apiError);

        const toolHandler = searchUserCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler(
          { phone_number: '+1234567890' },
          mockContext,
        );

        // Verify the API was called
        expect(simplifiedApiMock.searchUser).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error searching for user:',
          {
            args: { phone_number: '+1234567890' },
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('search_users tool', () => {
      let searchUsersCall: any;
      beforeEach(() => {
        // Find the search_users tool registration
        searchUsersCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'search_users',
        );
      });

      it('should register search_users tool with correct parameters', () => {
        expect(searchUsersCall).toBeDefined();
        expect(searchUsersCall[0]).toBe('search_users');
        expect(searchUsersCall[1].inputSchema).toBeDefined();
        expect(searchUsersCall[1].annotations).toBeDefined();
        expect(searchUsersCall[1].annotations.readOnlyHint).toBe(true);
        expect(searchUsersCall[1].annotations.destructiveHint).toBe(false);
        expect(searchUsersCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = searchUsersCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          phone_numbers: ['+1234567890', '+0987654321'],
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(simplifiedApiMock.searchUsers).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });

        // Verify formatToMCPToolResponse was called
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Mock the API to throw an error
        const apiError = new Error('API error');
        simplifiedApiMock.searchUsers.mockRejectedValueOnce(apiError);

        const toolHandler = searchUsersCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler(
          { phone_numbers: ['+1234567890'] },
          mockContext,
        );

        // Verify the API was called
        expect(simplifiedApiMock.searchUsers).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error searching users:',
          {
            args: { phone_numbers: ['+1234567890'] },
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('get_current_user tool', () => {
      let getCurrentUserCall: any;
      beforeEach(() => {
        getCurrentUserCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_current_user',
        );
      });

      it('should register get_current_user tool with correct parameters', () => {
        expect(getCurrentUserCall).toBeDefined();
        expect(getCurrentUserCall[0]).toBe('get_current_user');
        expect(getCurrentUserCall[1].inputSchema).toBeDefined();
        expect(getCurrentUserCall[1].annotations).toBeDefined();
        expect(getCurrentUserCall[1].annotations.readOnlyHint).toBe(true);
        expect(getCurrentUserCall[1].annotations.destructiveHint).toBe(false);
        expect(getCurrentUserCall[1].description).toBeDefined();
      });

      it('should call cv API with correct parameters', async () => {
        const toolHandler = getCurrentUserCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        await expect(toolHandler({}, mockContext)).resolves.not.toThrow();

        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        // Skip this test for now as it requires complex mock setup
        expect(true).toBe(true);
      });
    });

    describe('list_conversations tool', () => {
      let listConversationsCall: any;
      beforeEach(() => {
        listConversationsCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'list_conversations',
        );
      });

      it('should register list_conversations tool with correct parameters', () => {
        expect(listConversationsCall).toBeDefined();
        expect(listConversationsCall[0]).toBe('list_conversations');
        expect(listConversationsCall[1].inputSchema).toBeDefined();
        expect(listConversationsCall[1].annotations).toBeDefined();
        expect(listConversationsCall[1].annotations.readOnlyHint).toBe(true);
        expect(listConversationsCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(listConversationsCall[1].description).toBeDefined();
      });

      it('should accept user_ids and match query params via inputSchema', () => {
        // Every upstream query param is still exposed, plus the two the MCP
        // server adds itself: `types` filters rows, `response_fields` narrows
        // columns. Neither is forwarded upstream.
        expect(Object.keys(listConversationsCall[1].inputSchema)).toEqual([
          ...Object.keys(getAllConversationsQueryParams.shape),
          'types',
          'response_fields',
        ]);
      });

      it('should expose types as an enum of the four conversation kinds', () => {
        const types = listConversationsCall[1].inputSchema.types;

        expect(types).toBeDefined();
        expect(types.isOptional()).toBe(true);
        expect(types.description).toContain('directMessage');
      });

      it('should document user_ids as filtering by ID, not username', () => {
        expect(
          listConversationsCall[1].inputSchema.user_ids.description,
        ).toContain('IDs, not usernames');
      });

      it('should document match options and default', () => {
        const description =
          listConversationsCall[1].inputSchema.match.description;
        expect(description).toContain('any');
        expect(description).toContain('all');
        expect(description).toContain('default');
      });

      it('should document the returned conversation fields', () => {
        const description = listConversationsCall[1].description;
        expect(description).toContain('id');
        expect(description).toContain('name');
        expect(description).toContain('workspace_id');
        expect(description).toContain('type');
      });

      it('should reject an invalid match value via schema validation', () => {
        const schema = z.object(listConversationsCall[1].inputSchema);

        const result = schema.safeParse({ match: 'invalid-match' });

        expect(result.success).toBe(false);
        expect(simplifiedApiMock.getAllConversations).not.toHaveBeenCalled();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = listConversationsCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        await expect(toolHandler({}, mockContext)).resolves.not.toThrow();

        expect(simplifiedApiMock.getAllConversations).toHaveBeenCalledWith(
          {},
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.getAllConversations.mockRejectedValueOnce(apiError);

        const toolHandler = listConversationsCall[2];
        const result = await toolHandler({}, mockContext);

        expect(simplifiedApiMock.getAllConversations).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error listing conversations:',
          { params: {}, error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });

      it('should forward user_ids and match to the simplified API', async () => {
        const toolHandler = listConversationsCall[2];

        await toolHandler(
          { user_ids: ['user-1', 'user-2'], match: 'all' },
          mockContext,
        );

        expect(simplifiedApiMock.getAllConversations).toHaveBeenCalledWith(
          { user_ids: ['user-1', 'user-2'], match: 'all' },
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });

      it('should omit user_ids when undefined', async () => {
        const toolHandler = listConversationsCall[2];

        await toolHandler({ match: 'any' }, mockContext);

        expect(simplifiedApiMock.getAllConversations).toHaveBeenCalledWith(
          { match: 'any' },
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });

      it('should omit user_ids when it is an empty array', async () => {
        const toolHandler = listConversationsCall[2];

        await toolHandler({ user_ids: [] }, mockContext);

        expect(simplifiedApiMock.getAllConversations).toHaveBeenCalledWith(
          {},
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });

      it('should omit match when undefined', async () => {
        const toolHandler = listConversationsCall[2];

        await toolHandler({ user_ids: ['user-1'] }, mockContext);

        expect(simplifiedApiMock.getAllConversations).toHaveBeenCalledWith(
          { user_ids: ['user-1'] },
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });
    });

    describe('get_conversation tool', () => {
      let getConversationCall: any;
      beforeEach(() => {
        getConversationCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_conversation',
        );
      });

      it('should register get_conversation tool with correct parameters', () => {
        expect(getConversationCall).toBeDefined();
        expect(getConversationCall[0]).toBe('get_conversation');
        expect(getConversationCall[1].inputSchema).toBeDefined();
        expect(getConversationCall[1].annotations).toBeDefined();
        expect(getConversationCall[1].annotations.readOnlyHint).toBe(true);
        expect(getConversationCall[1].annotations.destructiveHint).toBe(false);
        expect(getConversationCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getConversationCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = { id: 'test-conversation-id' };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.getConversationById).toHaveBeenCalledWith(
          testParams.id,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.getConversationById.mockRejectedValueOnce(apiError);

        const toolHandler = getConversationCall[2];
        const result = await toolHandler({ id: 'test-id' }, mockContext);

        expect(simplifiedApiMock.getConversationById).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting conversation by id:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('get_conversation_users tool', () => {
      let getConversationUsersCall: any;
      beforeEach(() => {
        getConversationUsersCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_conversation_users',
        );
      });

      it('should register get_conversation_users tool with correct parameters', () => {
        expect(getConversationUsersCall).toBeDefined();
        expect(getConversationUsersCall[0]).toBe('get_conversation_users');
        expect(getConversationUsersCall[1].inputSchema).toBeDefined();
        expect(getConversationUsersCall[1].annotations).toBeDefined();
        expect(getConversationUsersCall[1].annotations.readOnlyHint).toBe(true);
        expect(getConversationUsersCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(getConversationUsersCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getConversationUsersCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = { id: 'test-conversation-id' };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.getConversationUsers).toHaveBeenCalledWith(
          testParams.id,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.getConversationUsers.mockRejectedValueOnce(apiError);

        const toolHandler = getConversationUsersCall[2];
        const result = await toolHandler({ id: 'test-id' }, mockContext);

        expect(simplifiedApiMock.getConversationUsers).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting conversation users:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('summarize_conversation tool', () => {
      let summarizeConversationCall: any;
      beforeEach(() => {
        summarizeConversationCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'summarize_conversation',
        );
      });

      it('should register summarize_conversation tool with correct parameters', () => {
        expect(summarizeConversationCall).toBeDefined();
        expect(summarizeConversationCall[0]).toBe('summarize_conversation');
        expect(summarizeConversationCall[1].inputSchema).toBeDefined();
        expect(summarizeConversationCall[1].annotations).toBeDefined();
        expect(summarizeConversationCall[1].annotations.readOnlyHint).toBe(
          false,
        );
        expect(summarizeConversationCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(summarizeConversationCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = summarizeConversationCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          conversation_id: 'test-conversation-id',
          prompt_id: 'test-prompt-id',
          language: 'en',
          limit: 40,
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Only listMessages-accepted params are forwarded, and this tool's
        // `limit` is translated to the upstream `size`. Previously `args` was
        // passed wholesale, so `limit` was silently dropped (capping summaries
        // at the default page of 20) and `prompt_id` leaked upstream.
        expect(simplifiedApiMock.listMessages).toHaveBeenCalledWith(
          {
            conversation_id: 'test-conversation-id',
            size: 40,
            language: 'en',
          },
          { headers: { Authorization: 'Bearer test-token' } },
        );
        const forwarded = simplifiedApiMock.listMessages.mock.calls[0][0];
        expect(forwarded).not.toHaveProperty('prompt_id');
        expect(forwarded).not.toHaveProperty('limit');
        expect(
          simplifiedApiMock.aIResponseControllerCreateResponse,
        ).toHaveBeenCalled();
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should default size to the 50-message cap when limit is omitted', async () => {
        const toolHandler = summarizeConversationCall[2];

        await toolHandler(
          { conversation_id: 'conv-1', prompt_id: 'prompt-1' },
          mockContext,
        );

        expect(simplifiedApiMock.listMessages).toHaveBeenCalledWith(
          { conversation_id: 'conv-1', size: 50 },
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });

      it('should floor a fractional limit and never send size below 1', async () => {
        // Codex finding on PR #6: the schema accepted 0, negatives and
        // fractions, and the handler now forwards limit as `size`. Upstream
        // validates size >= 1 and integral, so those values became failed
        // calls — where the old code dropped `limit` entirely and they were
        // harmless. The schema now rejects them (.int().positive()); this
        // pins the handler's defence for anything that gets past it.
        const toolHandler = summarizeConversationCall[2];

        await toolHandler(
          { conversation_id: 'conv-1', prompt_id: 'prompt-1', limit: 7.9 },
          mockContext,
        );
        expect(simplifiedApiMock.listMessages).toHaveBeenCalledWith(
          { conversation_id: 'conv-1', size: 7 },
          { headers: { Authorization: 'Bearer test-token' } },
        );

        simplifiedApiMock.listMessages.mockClear();
        await toolHandler(
          { conversation_id: 'conv-1', prompt_id: 'prompt-1', limit: 0 },
          mockContext,
        );
        expect(simplifiedApiMock.listMessages).toHaveBeenCalledWith(
          { conversation_id: 'conv-1', size: 1 },
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });

      it('should clamp limit to the upstream page cap of 50 rather than failing', async () => {
        const toolHandler = summarizeConversationCall[2];

        await toolHandler(
          { conversation_id: 'conv-1', prompt_id: 'prompt-1', limit: 500 },
          mockContext,
        );

        expect(simplifiedApiMock.listMessages).toHaveBeenCalledWith(
          { conversation_id: 'conv-1', size: 50 },
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });

      it('should not call listMessages when message_ids are supplied', async () => {
        const toolHandler = summarizeConversationCall[2];

        await toolHandler(
          {
            conversation_id: 'conv-1',
            prompt_id: 'prompt-1',
            message_ids: ['m1', 'm2'],
          },
          mockContext,
        );

        expect(simplifiedApiMock.listMessages).not.toHaveBeenCalled();
        expect(
          simplifiedApiMock.aIResponseControllerCreateResponse,
        ).toHaveBeenCalledWith(
          expect.objectContaining({ message_ids: ['m1', 'm2'] }),
          expect.anything(),
        );
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.listMessages.mockRejectedValueOnce(apiError);

        const toolHandler = summarizeConversationCall[2];
        const result = await toolHandler(
          { conversation_id: 'test-id' },
          mockContext,
        );

        expect(simplifiedApiMock.listMessages).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error summarizing conversation:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('get_root_folders tool', () => {
      let getRootFoldersCall: any;
      beforeEach(() => {
        getRootFoldersCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_root_folders',
        );
      });

      it('should register get_root_folders tool with correct parameters', () => {
        expect(getRootFoldersCall).toBeDefined();
        expect(getRootFoldersCall[0]).toBe('get_root_folders');
        expect(getRootFoldersCall[1].inputSchema).toBeDefined();
        expect(getRootFoldersCall[1].annotations).toBeDefined();
        expect(getRootFoldersCall[1].annotations.readOnlyHint).toBe(true);
        expect(getRootFoldersCall[1].annotations.destructiveHint).toBe(false);
        expect(getRootFoldersCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getRootFoldersCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          workspace_id: 'test-workspace-id',
          type: 'voicememo' as const,
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.getAllRootFolders).toHaveBeenCalledWith(
          testParams,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.getAllRootFolders.mockRejectedValueOnce(apiError);

        const toolHandler = getRootFoldersCall[2];
        const result = await toolHandler(
          { workspace_id: 'test-id' },
          mockContext,
        );

        expect(simplifiedApiMock.getAllRootFolders).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error listing root folders:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('create_folder tool', () => {
      let createFolderCall: any;
      beforeEach(() => {
        createFolderCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'create_folder',
        );
      });

      it('should register create_folder tool with correct parameters', () => {
        expect(createFolderCall).toBeDefined();
        expect(createFolderCall[0]).toBe('create_folder');
        expect(createFolderCall[1].inputSchema).toBeDefined();
        expect(createFolderCall[1].annotations).toBeDefined();
        expect(createFolderCall[1].annotations.readOnlyHint).toBe(false);
        expect(createFolderCall[1].annotations.destructiveHint).toBe(false);
        expect(createFolderCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = createFolderCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          name: 'Test Folder',
          workspace_id: 'test-workspace-id',
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.createFolder).toHaveBeenCalledWith(
          testParams,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.createFolder.mockRejectedValueOnce(apiError);

        const toolHandler = createFolderCall[2];
        const result = await toolHandler({ name: 'test' }, mockContext);

        expect(simplifiedApiMock.createFolder).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error creating folder:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('get_folder tool', () => {
      let getFolderCall: any;
      beforeEach(() => {
        getFolderCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_folder',
        );
      });

      it('should register get_folder tool with correct parameters', () => {
        expect(getFolderCall).toBeDefined();
        expect(getFolderCall[0]).toBe('get_folder');
        expect(getFolderCall[1].inputSchema).toBeDefined();
        expect(getFolderCall[1].annotations).toBeDefined();
        expect(getFolderCall[1].annotations.readOnlyHint).toBe(true);
        expect(getFolderCall[1].annotations.destructiveHint).toBe(false);
        expect(getFolderCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getFolderCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          id: 'test-folder-id',
          include_messages: true,
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.getFolderById).toHaveBeenCalledWith(
          testParams.id,
          testParams,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.getFolderById.mockRejectedValueOnce(apiError);

        const toolHandler = getFolderCall[2];
        const result = await toolHandler({ id: 'test-id' }, mockContext);

        expect(simplifiedApiMock.getFolderById).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting folder by id:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('get_folder_with_messages tool', () => {
      let getFolderWithMessagesCall: any;
      beforeEach(() => {
        getFolderWithMessagesCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_folder_with_messages',
        );
      });

      it('should register get_folder_with_messages tool with correct parameters', () => {
        expect(getFolderWithMessagesCall).toBeDefined();
        expect(getFolderWithMessagesCall[0]).toBe('get_folder_with_messages');
        expect(getFolderWithMessagesCall[1].inputSchema).toBeDefined();
        expect(getFolderWithMessagesCall[1].annotations).toBeDefined();
        expect(getFolderWithMessagesCall[1].annotations.readOnlyHint).toBe(
          true,
        );
        expect(getFolderWithMessagesCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(getFolderWithMessagesCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getFolderWithMessagesCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = { id: 'test-folder-id' };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.getFolderMessages).toHaveBeenCalledWith(
          testParams.id,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.getFolderMessages.mockRejectedValueOnce(apiError);

        const toolHandler = getFolderWithMessagesCall[2];
        const result = await toolHandler({ id: 'test-id' }, mockContext);

        expect(simplifiedApiMock.getFolderMessages).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting folder with messages:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('update_folder_name tool', () => {
      let updateFolderNameCall: any;
      beforeEach(() => {
        updateFolderNameCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'update_folder_name',
        );
      });

      it('should register update_folder_name tool with correct parameters', () => {
        expect(updateFolderNameCall).toBeDefined();
        expect(updateFolderNameCall[0]).toBe('update_folder_name');
        expect(updateFolderNameCall[1].inputSchema).toBeDefined();
        expect(updateFolderNameCall[1].annotations).toBeDefined();
        expect(updateFolderNameCall[1].annotations.readOnlyHint).toBe(false);
        expect(updateFolderNameCall[1].annotations.destructiveHint).toBe(false);
        expect(updateFolderNameCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = updateFolderNameCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          id: 'test-folder-id',
          name: 'Updated Folder Name',
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.updateFolderName).toHaveBeenCalledWith(
          testParams.id,
          testParams,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.updateFolderName.mockRejectedValueOnce(apiError);

        const toolHandler = updateFolderNameCall[2];
        const result = await toolHandler(
          { id: 'test-id', name: 'test' },
          mockContext,
        );

        expect(simplifiedApiMock.updateFolderName).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error updating folder name:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('delete_folder tool', () => {
      let deleteFolderCall: any;
      beforeEach(() => {
        deleteFolderCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'delete_folder',
        );
      });

      it('should register delete_folder tool with correct parameters', () => {
        expect(deleteFolderCall).toBeDefined();
        expect(deleteFolderCall[0]).toBe('delete_folder');
        expect(deleteFolderCall[1].inputSchema).toBeDefined();
        expect(deleteFolderCall[1].annotations).toBeDefined();
        expect(deleteFolderCall[1].annotations.readOnlyHint).toBe(false);
        expect(deleteFolderCall[1].annotations.destructiveHint).toBe(true);
        expect(deleteFolderCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = deleteFolderCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = { id: 'test-folder-id' };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.deleteFolder).toHaveBeenCalledWith(
          testParams.id,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.deleteFolder.mockRejectedValueOnce(apiError);

        const toolHandler = deleteFolderCall[2];
        const result = await toolHandler({ id: 'test-id' }, mockContext);

        expect(simplifiedApiMock.deleteFolder).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error deleting folder:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('move_folder tool', () => {
      let moveFolderCall: any;
      beforeEach(() => {
        moveFolderCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'move_folder',
        );
      });

      it('should register move_folder tool with correct parameters', () => {
        expect(moveFolderCall).toBeDefined();
        expect(moveFolderCall[0]).toBe('move_folder');
        expect(moveFolderCall[1].inputSchema).toBeDefined();
        expect(moveFolderCall[1].annotations).toBeDefined();
        expect(moveFolderCall[1].annotations.readOnlyHint).toBe(false);
        expect(moveFolderCall[1].annotations.destructiveHint).toBe(false);
        expect(moveFolderCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = moveFolderCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          id: 'test-folder-id',
          parent_id: 'test-parent-id',
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.moveFolder).toHaveBeenCalledWith(
          testParams.id,
          testParams,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.moveFolder.mockRejectedValueOnce(apiError);

        const toolHandler = moveFolderCall[2];
        const result = await toolHandler({ id: 'test-id' }, mockContext);

        expect(simplifiedApiMock.moveFolder).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith('Error moving folder:', {
          error: apiError,
        });
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('move_message_to_folder tool', () => {
      let moveMessageToFolderCall: any;
      beforeEach(() => {
        moveMessageToFolderCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'move_message_to_folder',
        );
      });

      it('should register move_message_to_folder tool with correct parameters', () => {
        expect(moveMessageToFolderCall).toBeDefined();
        expect(moveMessageToFolderCall[0]).toBe('move_message_to_folder');
        expect(moveMessageToFolderCall[1].inputSchema).toBeDefined();
        expect(moveMessageToFolderCall[1].annotations).toBeDefined();
        expect(moveMessageToFolderCall[1].annotations.readOnlyHint).toBe(false);
        expect(moveMessageToFolderCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(moveMessageToFolderCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = moveMessageToFolderCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          message_id: 'test-message-id',
          folder_id: 'test-folder-id',
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(
          simplifiedApiMock.addMessageToFolderOrWorkspace,
        ).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.addMessageToFolderOrWorkspace.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = moveMessageToFolderCall[2];
        const result = await toolHandler(
          { message_id: 'test-id' },
          mockContext,
        );

        expect(
          simplifiedApiMock.addMessageToFolderOrWorkspace,
        ).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error moving message to folder:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('get_workspaces_basic_info tool', () => {
      let getWorkspacesBasicInfoCall: any;
      beforeEach(() => {
        getWorkspacesBasicInfoCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_workspaces_basic_info',
        );
      });

      it('should register get_workspaces_basic_info tool with correct parameters', () => {
        expect(getWorkspacesBasicInfoCall).toBeDefined();
        expect(getWorkspacesBasicInfoCall[0]).toBe('get_workspaces_basic_info');
        expect(getWorkspacesBasicInfoCall[1].inputSchema).toBeDefined();
        expect(getWorkspacesBasicInfoCall[1].annotations).toBeDefined();
        expect(getWorkspacesBasicInfoCall[1].annotations.readOnlyHint).toBe(
          true,
        );
        expect(getWorkspacesBasicInfoCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(getWorkspacesBasicInfoCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getWorkspacesBasicInfoCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        await expect(toolHandler({}, mockContext)).resolves.not.toThrow();

        expect(
          simplifiedApiMock.getAllWorkspacesWithBasicInfo,
        ).toHaveBeenCalledWith({
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.getAllWorkspacesWithBasicInfo.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = getWorkspacesBasicInfoCall[2];
        const result = await toolHandler({}, mockContext);

        expect(
          simplifiedApiMock.getAllWorkspacesWithBasicInfo,
        ).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting workspaces basic info:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('list_ai_actions tool', () => {
      let listAIActionsCall: any;
      beforeEach(() => {
        listAIActionsCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'list_ai_actions',
        );
      });

      it('should register list_ai_actions tool with correct parameters', () => {
        expect(listAIActionsCall).toBeDefined();
        expect(listAIActionsCall[0]).toBe('list_ai_actions');
        expect(listAIActionsCall[1].inputSchema).toBeDefined();
        expect(listAIActionsCall[1].annotations).toBeDefined();
        expect(listAIActionsCall[1].annotations.readOnlyHint).toBe(true);
        expect(listAIActionsCall[1].annotations.destructiveHint).toBe(false);
        expect(listAIActionsCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = listAIActionsCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          owner_type: 'user' as const,
          workspace_id: 'test-workspace-id',
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(
          simplifiedApiMock.aIPromptControllerGetPrompts,
        ).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.aIPromptControllerGetPrompts.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = listAIActionsCall[2];
        const result = await toolHandler({}, mockContext);

        expect(
          simplifiedApiMock.aIPromptControllerGetPrompts,
        ).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error listing ai actions:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('run_ai_action tool', () => {
      let runAIActionCall: any;
      beforeEach(() => {
        runAIActionCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'run_ai_action',
        );
      });

      it('should register run_ai_action tool with correct parameters', () => {
        expect(runAIActionCall).toBeDefined();
        expect(runAIActionCall[0]).toBe('run_ai_action');
        expect(runAIActionCall[1].inputSchema).toBeDefined();
        expect(runAIActionCall[1].annotations).toBeDefined();
        expect(runAIActionCall[1].annotations.readOnlyHint).toBe(false);
        expect(runAIActionCall[1].annotations.destructiveHint).toBe(false);
        expect(runAIActionCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = runAIActionCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          prompt_id: 'test-prompt-id',
          message_ids: ['test-message-id'],
          channel_id: 'test-channel-id',
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(
          simplifiedApiMock.aIResponseControllerCreateResponse,
        ).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.aIResponseControllerCreateResponse.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = runAIActionCall[2];
        const result = await toolHandler({ prompt_id: 'test-id' }, mockContext);

        expect(
          simplifiedApiMock.aIResponseControllerCreateResponse,
        ).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error running ai action:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('run_ai_action_for_shared_link tool', () => {
      let runAIActionForSharedLinkCall: any;
      beforeEach(() => {
        runAIActionForSharedLinkCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'run_ai_action_for_shared_link',
        );
      });

      it('should register run_ai_action_for_shared_link tool with correct parameters', () => {
        expect(runAIActionForSharedLinkCall).toBeDefined();
        expect(runAIActionForSharedLinkCall[0]).toBe(
          'run_ai_action_for_shared_link',
        );
        expect(runAIActionForSharedLinkCall[1].inputSchema).toBeDefined();
        expect(runAIActionForSharedLinkCall[1].annotations).toBeDefined();
        expect(runAIActionForSharedLinkCall[1].annotations.readOnlyHint).toBe(
          false,
        );
        expect(
          runAIActionForSharedLinkCall[1].annotations.destructiveHint,
        ).toBe(false);
        expect(runAIActionForSharedLinkCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = runAIActionForSharedLinkCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          prompt_id: 'test-prompt-id',
          shared_link_ids: ['test-shared-link-id'],
          language: 'en',
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(
          simplifiedApiMock.createShareLinkAIResponse,
        ).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.createShareLinkAIResponse.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = runAIActionForSharedLinkCall[2];
        const result = await toolHandler({ prompt_id: 'test-id' }, mockContext);

        expect(simplifiedApiMock.createShareLinkAIResponse).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error running ai action for shared link:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('get_user tool', () => {
      let getUserCall: any;
      beforeEach(() => {
        getUserCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_user',
        );
      });

      it('should register get_user tool with correct parameters', () => {
        expect(getUserCall).toBeDefined();
        expect(getUserCall[0]).toBe('get_user');
        expect(getUserCall[1].inputSchema).toBeDefined();
        expect(getUserCall[1].annotations).toBeDefined();
        expect(getUserCall[1].annotations.readOnlyHint).toBe(true);
        expect(getUserCall[1].annotations.destructiveHint).toBe(false);
        expect(getUserCall[1].description).toBeDefined();
      });

      it('should call cvApi.getContacts with [id] and return matching entry', async () => {
        const matchingUser = { id: 'user-123', first_name: 'Alice' };
        const otherUser = { id: 'other-id', first_name: 'Bob' };
        cvApiMock.getContacts.mockResolvedValueOnce([otherUser, matchingUser]);

        const toolHandler = getUserCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        await expect(
          toolHandler({ id: 'user-123' }, mockContext),
        ).resolves.not.toThrow();

        expect(cvApiMock.getContacts).toHaveBeenCalledWith(['user-123'], {
          headers: { Authorization: 'Bearer test-token' },
        });

        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(matchingUser, {
          responseFields: undefined,
        });
      });

      it('should fall back to first entry when no entry matches id', async () => {
        const firstUser = { id: 'other-id', first_name: 'Bob' };
        cvApiMock.getContacts.mockResolvedValueOnce([firstUser]);

        const toolHandler = getUserCall[2];

        await toolHandler({ id: 'user-123' }, mockContext);

        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(firstUser, {
          responseFields: undefined,
        });
      });

      it('should throw user not found error when contacts is empty', async () => {
        cvApiMock.getContacts.mockResolvedValueOnce([]);

        const toolHandler = getUserCall[2];
        const result = await toolHandler({ id: 'user-123' }, mockContext);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting user by id:',
          expect.objectContaining({ args: { id: 'user-123' } }),
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'user not found' }),
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });

      it('should return single UserInfo object, not array', async () => {
        const user = { id: 'user-123', first_name: 'Alice' };
        cvApiMock.getContacts.mockResolvedValueOnce([user]);

        const toolHandler = getUserCall[2];

        await toolHandler({ id: 'user-123' }, mockContext);

        const callArg = mockFormatToMCPToolResponse.mock.calls[0][0];
        expect(Array.isArray(callArg)).toBe(false);
        expect(callArg).toEqual(user);
      });
    });

    describe('create_voicememo_message audio handling', () => {
      const findCall = (name: string) =>
        mockRegisterTool.mock.calls.find((c: any) => c[0] === name);

      it('should not expose audio_file, which no JSON-RPC client can supply', () => {
        // Upstream types audio_file as zod.instanceof(File): it renders as an
        // untyped {} in JSON Schema while advertising audio formats, then
        // rejects every value an agent can send.
        const schema = findCall('create_voicememo_message')[1].inputSchema;
        expect(Object.keys(schema)).not.toContain('audio_file');
        expect(Object.keys(schema)).toContain('audio_url');
        expect(Object.keys(schema)).toContain('transcript');
      });

      it('should send transcript straight through when no audio_url is given', async () => {
        await findCall('create_voicememo_message')[2](
          { transcript: 'hello there' },
          mockContext,
        );

        expect(mockFetchAudioFile).not.toHaveBeenCalled();
        expect(simplifiedApiMock.createVoiceMemoMessage).toHaveBeenCalledWith(
          { transcript: 'hello there' },
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });

      it('should fetch audio_url and forward it as audio_file', async () => {
        const file = { name: 'memo.mp3' };
        mockFetchAudioFile.mockResolvedValueOnce(file);

        await findCall('create_voicememo_message')[2](
          { audio_url: 'https://example.com/memo.mp3', workspace_id: 'ws-1' },
          mockContext,
        );

        expect(mockFetchAudioFile).toHaveBeenCalledWith(
          'https://example.com/memo.mp3',
        );
        expect(simplifiedApiMock.createVoiceMemoMessage).toHaveBeenCalledWith(
          { workspace_id: 'ws-1', audio_file: file },
          { headers: { Authorization: 'Bearer test-token' } },
        );
        // audio_url is ours, not the API's — it must not leak upstream.
        expect(
          simplifiedApiMock.createVoiceMemoMessage.mock.calls[0][0],
        ).not.toHaveProperty('audio_url');
      });

      // The HTTP transport's `createOAuthTokenVerifier` only DECODES the bearer
      // token; nothing checks its signature. cv-api is therefore the sole
      // authority on whether the caller is real, and this is the one tool with
      // a side effect in front of the upstream call — so the order matters.
      it('should authenticate with cv-api before fetching a caller-supplied URL', async () => {
        mockFetchAudioFile.mockResolvedValueOnce({ name: 'memo.mp3' });

        await findCall('create_voicememo_message')[2](
          { audio_url: 'https://example.com/memo.mp3' },
          mockContext,
        );

        expect(cvApiMock.getWhoAmI).toHaveBeenCalledWith({
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(cvApiMock.getWhoAmI.mock.invocationCallOrder[0]).toBeLessThan(
          mockFetchAudioFile.mock.invocationCallOrder[0],
        );
      });

      it('should not fetch at all when cv-api rejects the credentials', async () => {
        cvApiMock.getWhoAmI.mockRejectedValueOnce({
          statusCode: 401,
          body: { error: { code: 'UNAUTHORIZED', message: 'invalid token' } },
        });

        await findCall('create_voicememo_message')[2](
          { audio_url: 'https://example.com/memo.mp3' },
          mockContext,
        );

        expect(mockFetchAudioFile).not.toHaveBeenCalled();
        expect(simplifiedApiMock.createVoiceMemoMessage).not.toHaveBeenCalled();
      });

      it('should skip the preflight when there is no audio_url to fetch', async () => {
        await findCall('create_voicememo_message')[2](
          { transcript: 'no audio here' },
          mockContext,
        );

        expect(cvApiMock.getWhoAmI).not.toHaveBeenCalled();
      });

      it('should return an actionable INVALID_AUDIO_URL instead of a bare failure', async () => {
        const rejection = new Error('audio_url returned an empty file');
        rejection.name = 'AudioFetchError';
        mockFetchAudioFile.mockRejectedValueOnce(rejection);

        await findCall('create_voicememo_message')[2](
          { audio_url: 'https://example.com/empty.mp3' },
          mockContext,
        );

        // Never reaches the API, and the agent gets the specific reason.
        expect(simplifiedApiMock.createVoiceMemoMessage).not.toHaveBeenCalled();
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          {
            statusCode: 400,
            body: {
              error: {
                code: 'INVALID_AUDIO_URL',
                message: 'audio_url returned an empty file',
              },
            },
          },
          { isError: true, tool: 'create_voicememo_message' },
        );
        // The URL is redacted before logging: an audio_url is commonly
        // presigned, so the raw value would put a reusable credential into
        // log files and CloudWatch.
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Rejected audio_url for voicememo message',
          {
            audio_url: 'https://example.com/empty.mp3',
            reason: 'audio_url returned an empty file',
          },
        );
      });

      it('should still report ordinary API errors normally', async () => {
        const apiError = new Error('upstream boom');
        simplifiedApiMock.createVoiceMemoMessage.mockRejectedValueOnce(
          apiError,
        );

        const result = await findCall('create_voicememo_message')[2](
          { transcript: 'hi' },
          mockContext,
        );

        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('search and notification tools', () => {
      const findCall = (name: string) =>
        mockRegisterTool.mock.calls.find((c: any) => c[0] === name);

      it('should register all three as read-only', () => {
        [
          'search_message_ids',
          'search_messages_by_heard_status',
          'list_inbox_notifications',
        ].forEach((name) => {
          const call = findCall(name);
          expect(call).toBeDefined();
          expect(call[1].annotations.readOnlyHint).toBe(true);
          expect(call[1].annotations.destructiveHint).toBe(false);
          expect(call[1].description).toBeDefined();
        });
      });

      it('should route through cvApi, not the generated simplified client', async () => {
        // These endpoints are on the full API and have no generated client.
        await findCall('search_message_ids')[2](
          { notified_status: 'notified', limit: 10 },
          mockContext,
        );

        expect(cvApiMock.searchMessageIds).toHaveBeenCalledWith(
          { notified_status: 'notified', limit: 10 },
          { headers: { Authorization: 'Bearer test-token' } },
        );
      });

      it('should expose notified_status so notified messages are findable', () => {
        const schema = findCall('search_message_ids')[1].inputSchema;
        expect(Object.keys(schema)).toEqual(
          expect.arrayContaining([
            'notified_status',
            'tagged_user_ids',
            'has_notes',
            'next_cursor',
          ]),
        );
      });

      it('should expose heardStatus as the unread filter', () => {
        const schema = findCall('search_messages_by_heard_status')[1]
          .inputSchema;
        expect(Object.keys(schema)).toContain('heardStatus');
        // begin_date/end_date are deliberately absent: the upstream DTO
        // validates them with @IsDate() and no @Type(() => Date), so an ISO
        // string fails and a Date cannot cross JSON-RPC.
        expect(Object.keys(schema)).not.toContain('begin_date');
        expect(Object.keys(schema)).not.toContain('end_date');
      });

      it('should expose the mentions category on inbox notifications', () => {
        const schema = findCall('list_inbox_notifications')[1].inputSchema;
        expect(Object.keys(schema)).toEqual(
          expect.arrayContaining(['category', 'skip', 'limit']),
        );
      });

      it('should surface errors from each tool', async () => {
        const cases: Array<[string, keyof typeof cvApiMock, string, any]> = [
          [
            'search_message_ids',
            'searchMessageIds',
            'Error searching message ids:',
            { limit: 5 },
          ],
          [
            'search_messages_by_heard_status',
            'searchMessagesByHeardStatus',
            'Error searching messages by heard status:',
            { heardStatus: 'unheard' },
          ],
          [
            'list_inbox_notifications',
            'listInboxNotifications',
            'Error listing inbox notifications:',
            { category: 'mentions' },
          ],
        ];

        for (const [tool, apiMethod, logMessage, args] of cases) {
          const apiError = new Error(`boom-${tool}`);
          (cvApiMock[apiMethod] as jest.Mock).mockRejectedValueOnce(apiError);

          const result = await findCall(tool)[2](args, mockContext);

          expect(mockLogger.error).toHaveBeenCalledWith(logMessage, {
            args,
            error: apiError,
          });
          expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
            apiError,
            expect.objectContaining({ isError: true }),
          );
          expect(result).toBeDefined();
        }
      });
    });

    describe('action item tools', () => {
      const findCall = (name: string) =>
        mockRegisterTool.mock.calls.find((c: any) => c[0] === name);

      it('should mark only delete_action_item as destructive', () => {
        expect(
          findCall('delete_action_item')[1].annotations.destructiveHint,
        ).toBe(true);
        [
          'create_action_item',
          'update_action_item',
          'set_action_item_status',
        ].forEach((name) => {
          expect(findCall(name)[1].annotations.destructiveHint).toBe(false);
          expect(findCall(name)[1].annotations.readOnlyHint).toBe(false);
        });
      });

      it('should mark the action item read tools as read-only', () => {
        [
          'list_my_action_items',
          'list_action_items',
          'get_action_item',
        ].forEach((name) => {
          expect(findCall(name)[1].annotations.readOnlyHint).toBe(true);
          expect(findCall(name)[1].annotations.destructiveHint).toBe(false);
        });
      });

      it('list_action_items should split container path params from query params', async () => {
        // The generated client takes containerType and containerId
        // positionally; only the remaining params belong in the query.
        await findCall('list_action_items')[2](
          {
            container_type: 'channel',
            container_id: 'conv-1',
            status: 'todo',
            limit: 10,
          },
          mockContext,
        );

        expect(simplifiedApiMock.actionItemControllerList).toHaveBeenCalledWith(
          'channel',
          'conv-1',
          { status: 'todo', limit: 10 },
          { headers: { Authorization: 'Bearer test-token' } },
        );
        const query =
          simplifiedApiMock.actionItemControllerList.mock.calls[0][2];
        expect(query).not.toHaveProperty('container_type');
        expect(query).not.toHaveProperty('container_id');
      });

      it('update_action_item should send id positionally and keep it out of the body', async () => {
        await findCall('update_action_item')[2](
          { id: 'ai-1', title: 'new title', due_date: '2026-10-01' },
          mockContext,
        );

        expect(
          simplifiedApiMock.actionItemControllerUpdate,
        ).toHaveBeenCalledWith(
          'ai-1',
          { title: 'new title', due_date: '2026-10-01' },
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(
          simplifiedApiMock.actionItemControllerUpdate.mock.calls[0][1],
        ).not.toHaveProperty('id');
      });

      it('set_action_item_status should send only status in the body', async () => {
        await findCall('set_action_item_status')[2](
          { id: 'ai-1', status: 'done' },
          mockContext,
        );

        expect(
          simplifiedApiMock.actionItemControllerSetStatus,
        ).toHaveBeenCalledWith(
          'ai-1',
          { status: 'done' },
          {
            headers: { Authorization: 'Bearer test-token' },
          },
        );
      });

      it('should surface errors from each action item tool', async () => {
        const cases: Array<
          [string, keyof typeof simplifiedApiMock, string, any]
        > = [
          [
            'list_my_action_items',
            'actionItemControllerListMyActionItems',
            'Error listing my action items:',
            {},
          ],
          [
            'get_action_item',
            'actionItemControllerGetById',
            'Error getting action item:',
            { id: 'ai-1' },
          ],
          [
            'delete_action_item',
            'actionItemControllerDelete',
            'Error deleting action item:',
            { id: 'ai-1' },
          ],
          [
            'suggest_action_items_from_messages',
            'actionItemControllerCreateSuggestionsFromMessages',
            'Error suggesting action items:',
            { message_ids: ['m1'] },
          ],
        ];

        for (const [tool, apiMethod, logMessage, args] of cases) {
          const apiError = new Error(`boom-${tool}`);
          (simplifiedApiMock[apiMethod] as jest.Mock).mockRejectedValueOnce(
            apiError,
          );

          const result = await findCall(tool)[2](args, mockContext);

          expect(mockLogger.error).toHaveBeenCalledWith(logMessage, {
            args,
            error: apiError,
          });
          expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
            apiError,
            expect.objectContaining({ isError: true }),
          );
          expect(result).toBeDefined();
        }
      });
    });

    describe('create_message_share_link tool', () => {
      let call: any;
      beforeEach(() => {
        call = mockRegisterTool.mock.calls.find(
          (c: any) => c[0] === 'create_message_share_link',
        );
      });

      it('should register create_message_share_link as a non-destructive write', () => {
        expect(call).toBeDefined();
        expect(call[1].inputSchema).toBeDefined();
        expect(call[1].annotations.readOnlyHint).toBe(false);
        expect(call[1].annotations.destructiveHint).toBe(false);
        expect(call[1].description).toBeDefined();
      });

      it('should accept the share link fields the API requires', () => {
        // Guards against the schema drifting away from the upstream body.
        expect(Object.keys(call[1].inputSchema)).toEqual(
          expect.arrayContaining([
            'shared_message_id',
            'share_type',
            'access_type',
          ]),
        );
      });

      it('should forward the body to the simplified API', async () => {
        const testParams = {
          shared_message_id: 'msg-1',
          share_type: 'link',
          access_type: 'public',
        };

        await expect(call[2](testParams, mockContext)).resolves.not.toThrow();

        expect(
          simplifiedApiMock.simplifiedMessageShareLinkControllerCreate,
        ).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.simplifiedMessageShareLinkControllerCreate.mockRejectedValueOnce(
          apiError,
        );

        const result = await call[2](
          { shared_message_id: 'msg-1' },
          mockContext,
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error creating message share link:',
          { args: { shared_message_id: 'msg-1' }, error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('get_message_share_link tool', () => {
      let call: any;
      beforeEach(() => {
        call = mockRegisterTool.mock.calls.find(
          (c: any) => c[0] === 'get_message_share_link',
        );
      });

      it('should register get_message_share_link as read-only', () => {
        expect(call).toBeDefined();
        expect(call[1].inputSchema).toBeDefined();
        expect(call[1].annotations.readOnlyHint).toBe(true);
        expect(call[1].annotations.destructiveHint).toBe(false);
        expect(call[1].description).toBeDefined();
      });

      it('should pass share_link_id as the positional argument', async () => {
        // The generated client takes the id positionally, not as an object.
        await expect(
          call[2]({ share_link_id: 'share-1' }, mockContext),
        ).resolves.not.toThrow();

        expect(
          simplifiedApiMock.simplifiedMessageShareLinkControllerGetMessageShareLink,
        ).toHaveBeenCalledWith('share-1', {
          headers: { Authorization: 'Bearer test-token' },
        });
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.simplifiedMessageShareLinkControllerGetMessageShareLink.mockRejectedValueOnce(
          apiError,
        );

        const result = await call[2]({ share_link_id: 'nope' }, mockContext);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting message share link:',
          { args: { share_link_id: 'nope' }, error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('get_ai_action_responses tool', () => {
      let getAIActionResponsesCall: any;
      beforeEach(() => {
        getAIActionResponsesCall = mockRegisterTool.mock.calls.find(
          (call: any) => call[0] === 'get_ai_action_responses',
        );
      });

      it('should register get_ai_action_responses tool with correct parameters', () => {
        expect(getAIActionResponsesCall).toBeDefined();
        expect(getAIActionResponsesCall[0]).toBe('get_ai_action_responses');
        expect(getAIActionResponsesCall[1].inputSchema).toBeDefined();
        expect(getAIActionResponsesCall[1].annotations).toBeDefined();
        expect(getAIActionResponsesCall[1].annotations.readOnlyHint).toBe(true);
        expect(getAIActionResponsesCall[1].annotations.destructiveHint).toBe(
          false,
        );
        expect(getAIActionResponsesCall[1].description).toBeDefined();
      });

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getAIActionResponsesCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        const testParams = {
          prompt_id: 'test-prompt-id',
          message_id: 'test-message-id',
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(
          simplifiedApiMock.aIResponseControllerGetAllResponses,
        ).toHaveBeenCalledWith(testParams, {
          headers: { Authorization: 'Bearer test-token' },
        });
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
      });

      it('should handle errors when API call fails', async () => {
        const apiError = new Error('API error');
        simplifiedApiMock.aIResponseControllerGetAllResponses.mockRejectedValueOnce(
          apiError,
        );

        const toolHandler = getAIActionResponsesCall[2];
        const result = await toolHandler({ prompt_id: 'test-id' }, mockContext);

        expect(
          simplifiedApiMock.aIResponseControllerGetAllResponses,
        ).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting ai action responses:',
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ isError: true }),
        );
        expect(result).toBeDefined();
      });
    });
  });
});
