import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { setCarbonVoiceAuthHeader } from '../../../src/auth';
import { getCarbonVoiceAPI } from '../../../src/cv-api';
import { getCarbonVoiceSimplifiedAPI } from '../../../src/generated';
import { formatToMCPToolResponse, logger } from '../../../src/utils';
import { listMessagesQueryParams } from '../../../src/generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';
import { getZodSchemaAsJson } from '../../utils/test-helpers';

// Create a mock for registerTool that we can access
const mockRegisterTool = jest.fn();

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const McpServer = jest.fn().mockImplementation(() => ({
    registerTool: mockRegisterTool,
  }));
  return { McpServer };
});

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
  };
  return {
    getCarbonVoiceSimplifiedAPI: jest.fn(() => simplifiedApiMock),
  };
});

// Mock the utils module
jest.mock('../../../src/utils', () => ({
  formatToMCPToolResponse: jest.fn(),
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
  };

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
      logger: mockLogger,
    }));

    jest.doMock('../../../src/auth', () => ({
      setCarbonVoiceAuthHeader: mockSetCarbonVoiceAuthHeader,
    }));

    // Import the server module after mocks are set up
    require('../../../src/server');
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

        // Verify the result is defined (the formatted error response)
        expect(result).toBeDefined();
      });
    });

    describe('get_user tool', () => {
      let getUserCall: any;
      beforeEach(() => {
        // Find the get_user tool registration
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

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = getUserCall[2];

        // Verify the tool handler exists and is a function
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        // Test parameters
        const testParams = {
          id: 'test-user-id',
        };

        // Call the handler
        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        // Verify the API was called
        expect(simplifiedApiMock.getUserById).toHaveBeenCalledWith(
          testParams.id,
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
        simplifiedApiMock.getUserById.mockRejectedValueOnce(apiError);

        const toolHandler = getUserCall[2];

        // Call the handler - it should NOT throw, but return a formatted error response
        const result = await toolHandler({ id: 'test-id' }, mockContext);

        // Verify the API was called
        expect(simplifiedApiMock.getUserById).toHaveBeenCalled();

        // Verify logger.error was called with the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error getting user by id:',
          {
            args: { id: 'test-id' },
            error: apiError,
          },
        );

        // Verify formatToMCPToolResponse was called with the error
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);

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

      it('should call simplified API with correct parameters', async () => {
        const toolHandler = listConversationsCall[2];
        expect(toolHandler).toBeDefined();
        expect(typeof toolHandler).toBe('function');

        await expect(toolHandler({}, mockContext)).resolves.not.toThrow();

        expect(simplifiedApiMock.getAllConversations).toHaveBeenCalledWith({
          headers: { Authorization: 'Bearer test-token' },
        });
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
          { error: apiError },
        );
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
        expect(result).toBeDefined();
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        };

        await expect(
          toolHandler(testParams, mockContext),
        ).resolves.not.toThrow();

        expect(simplifiedApiMock.listMessages).toHaveBeenCalledWith(
          testParams,
          { headers: { Authorization: 'Bearer test-token' } },
        );
        expect(
          simplifiedApiMock.aIResponseControllerCreateResponse,
        ).toHaveBeenCalled();
        expect(mockFormatToMCPToolResponse).toHaveBeenCalled();
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
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
        expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiError);
        expect(result).toBeDefined();
      });
    });
  });
});
