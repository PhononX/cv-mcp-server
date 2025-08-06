import jwt from 'jsonwebtoken';
import { z, ZodObject } from 'zod';

import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

import { TokenIntrospectionResponse } from '../../src/auth/interfaces';

export interface MockAuthInfo extends AuthInfo {
  extra: {
    user: {
      id: string;
    };
  };
}

export const createMockIntrospectionResponse = (
  payload: Partial<TokenIntrospectionResponse> = {},
): TokenIntrospectionResponse => {
  return {
    sub: 'test-user-id',
    client_id: 'test-client-id',
    scope: 'read write',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
    ...payload,
  } as TokenIntrospectionResponse;
};

export const createMockToken = (
  payload: Partial<TokenIntrospectionResponse> = {},
): string => {
  return jwt.sign(createMockIntrospectionResponse(payload), 'test-secret');
};

export const createMockAuthInfo = (
  overrides: Partial<MockAuthInfo> = {},
): MockAuthInfo => {
  const token = createMockToken();

  return {
    token,
    clientId: 'test-client-id',
    scopes: ['read', 'write'],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    extra: {
      user: {
        id: 'test-user-id',
      },
    },
    ...overrides,
  };
};

export const createMockRequest = (overrides: any = {}) => {
  return {
    method: 'POST',
    url: '/',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${createMockToken()}`,
      'x-request-id': 'test-request-id',
      'x-session-id': 'test-session-id',
    },
    body: {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 1,
    },
    auth: createMockAuthInfo(),
    ...overrides,
  };
};

export const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.headersSent = false;
  return res;
};

export const createMockCarbonVoiceApiResponse = (data: any = {}) => {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
    },
  };
};

export const createMockError = (message: string, status: number = 500) => {
  const error = new Error(message);
  (error as any).status = status;
  (error as any).response = {
    status,
    data: { message },
  };
  return error;
};

export const mockZodSchema = <T>(data: T) => {
  return z.object({}).passthrough() as z.ZodType<T>;
};

export const waitForAsync = (ms: number = 100) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const createMockSession = (sessionId: string = 'test-session-id') => {
  return {
    id: sessionId,
    transport: {
      handleRequest: jest.fn(),
      close: jest.fn(),
      sessionId,
    },
    createdAt: new Date(),
    lastActivity: new Date(),
  };
};

export const createMockMessage = (overrides: any = {}) => {
  return {
    id: 'msg-123',
    conversation_id: 'conv-123',
    creator_id: 'user-123',
    transcript: 'Hello, this is a test message',
    type: 'voicememo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
};

export const createMockConversation = (overrides: any = {}) => {
  return {
    id: 'conv-123',
    name: 'Test Conversation',
    type: 'group',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
};

export const createMockFolder = (overrides: any = {}) => {
  return {
    id: 'folder-123',
    name: 'Test Folder',
    type: 'user',
    workspace_id: 'workspace-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
};

export const createMockUser = (overrides: any = {}) => {
  return {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
};

export const getZodSchemaAsJson = (
  schema: Record<string, any>,
): Record<string, any> => {
  return JSON.parse(JSON.stringify(schema));
};
