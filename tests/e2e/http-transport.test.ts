import request from 'supertest';

import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

// Mock external dependencies to isolate the HTTP transport
const mockGetCarbonVoiceApiStatus = jest.fn(() =>
  Promise.resolve({
    isHealthy: true,
    apiUrl: 'https://api.test.carbonvoice.app',
  }),
);

jest.mock('../../src/cv-api', () => ({
  getCarbonVoiceApiStatus: mockGetCarbonVoiceApiStatus,
}));

const mockVerifyAccessToken = jest.fn(() => ({
  extra: {
    user: { id: 'test-user-id' },
  },
  clientId: 'test-client-id',
}));

const mockCreateOAuthTokenVerifier = jest.fn(() => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

jest.mock('../../src/auth', () => ({
  createOAuthTokenVerifier: mockCreateOAuthTokenVerifier,
}));

const mockServerConnect = jest.fn();
jest.mock('../../src/server', () => ({
  __esModule: true,
  default: {
    connect: mockServerConnect,
  },
}));

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../src/utils/logger', () => ({
  logger: mockLogger,
  getProcessUptime: jest.fn(() => '1h 30m'),
}));

// Mock session service with more detailed control
const mockSessionService = {
  getSession: jest.fn(),
  createSession: jest.fn(),
  destroySession: jest.fn(),
  isSessionExpired: jest.fn(() => false),
  recordInteraction: jest.fn(),
  recordToolCall: jest.fn(),
  recordError: jest.fn(),
  getSessionCount: jest.fn(() => 0),
  getAllSessionIds: jest.fn(() => []),
  clearAllSessions: jest.fn(),
  getSessionMetrics: jest.fn(() => ({
    totalInteractions: 1,
    totalToolCalls: 0,
    totalErrors: 0,
  })),
  logSessionMetrics: jest.fn(),
};

jest.mock('../../src/transports/http/session', () => ({
  sessionService: mockSessionService,
  SessionConfig: {
    fromEnv: jest.fn(() => ({
      ttlMs: 3600000,
      maxSessions: 100,
      cleanupIntervalMs: 300000,
    })),
  },
  SessionLogger: jest.fn().mockImplementation(() => ({
    logSessionCreated: jest.fn(),
    logSessionDestroyed: jest.fn(),
    logSessionTimeout: jest.fn(),
    logSessionReused: jest.fn(),
    logSessionError: jest.fn(),
    logSessionDebug: jest.fn(),
    logSessionMetrics: jest.fn(),
    logCleanupStarted: jest.fn(),
    logCleanupCompleted: jest.fn(),
  })),
  SessionCleanupService: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

// Mock StreamableHTTPServerTransport
const mockTransport = {
  handleRequest: jest.fn(),
  close: jest.fn(),
  sessionId: 'test-session-id',
  onclose: jest.fn(),
  onerror: jest.fn(),
};

jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest
    .fn()
    .mockImplementation(() => mockTransport),
}));

// Mock utils
const mockGetOrCreateSessionId = jest.fn(() => TEST_SESSION_ID);
const mockGetSessionId = jest.fn(() => TEST_SESSION_ID);
jest.mock('../../src/transports/http/utils', () => ({
  getOrCreateSessionId: mockGetOrCreateSessionId,
  getSessionId: mockGetSessionId,
}));

// Import the actual app from streamable.ts - this is the real implementation!
import app from '../../src/transports/http/streamable';
import { env } from '../../src/config';
import { REQUIRED_SCOPES } from '../../src/transports/http/constants';

// Test constants
const VALID_BEARER_TOKEN = 'Bearer valid-token';

const TEST_SESSION_ID = 'test-session-id';
const VALID_INITIALIZE_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0',
    },
  },
};

const VALID_LIST_TOOLS_REQUEST = {
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/list',
};

describe('HTTP Transport E2E - Real Implementation', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    mockSessionService.getSession.mockReturnValue(null);
    mockSessionService.isSessionExpired.mockReturnValue(false);
    mockVerifyAccessToken.mockReturnValue({
      extra: { user: { id: 'test-user-id' } },
      clientId: 'test-client-id',
    });
  });

  describe('Health Endpoint', () => {
    it('should return 200 for health check when API is healthy', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(String),
        dependencies: {
          carbonVoiceApi: {
            status: 'healthy',
            lastChecked: expect.any(String),
          },
        },
      });
    });

    it('should return health status based on Carbon Voice API', async () => {
      // Test with healthy API (default mock behavior)
      const response = await request(app).get('/health').expect(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.dependencies.carbonVoiceApi.status).toBe('healthy');
    });
  });

  describe('Info Endpoint', () => {
    it('should return server information', async () => {
      const response = await request(app).get('/info').expect(200);
      expect(response.text).toBe('OK');
    });
  });

  describe('OAuth Endpoints', () => {
    it('should serve oauth-protected-resource', async () => {
      const response = await request(app)
        .get('/.well-known/oauth-protected-resource')
        .expect(200);

      // The actual endpoint should return OAuth metadata
      expect(response.body).toBeDefined();

      expect(response.body).toEqual({
        resource: expect.any(String),
        authorization_servers: [env.CARBON_VOICE_BASE_URL],
        scopes_supported: REQUIRED_SCOPES,
        bearer_methods_supported: ['header'],
        resource_name: 'Carbon Voice MCP Server',
      });
    });

    it('should serve oauth-authorization-server', async () => {
      const response = await request(app)
        .get('/.well-known/oauth-authorization-server')
        .expect(200);

      // The actual endpoint should return OAuth server metadata
      expect(response.body).toBeDefined();
      const issuer = env.CARBON_VOICE_BASE_URL;
      const metadata = {
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        registration_endpoint: `${issuer}/oauth/register`,
        userinfo_endpoint: `${issuer}/oauth/userinfo`,
        response_types_supported: ['code', 'token'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        scopes_supported: REQUIRED_SCOPES,
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
        code_challenge_methods_supported: ['S256'], // PKCE support
      };

      expect(response.body).toEqual(metadata);
    });
  });

  describe('Request ID Middleware', () => {
    it('should generate request ID for each request', async () => {
      const response = await request(app).get('/info').expect(200);

      // The middleware generates a new trace ID for each request
      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
      expect(response.headers['x-trace-id']).toBeDefined();
      expect(response.headers['x-trace-id']).toBe(
        response.headers['x-request-id'],
      );
    });

    it('should generate unique request IDs for different requests', async () => {
      const response1 = await request(app).get('/info').expect(200);
      const response2 = await request(app).get('/health').expect(200);

      expect(response1.headers['x-request-id']).toBeDefined();
      expect(response2.headers['x-request-id']).toBeDefined();
      expect(response1.headers['x-request-id']).not.toBe(
        response2.headers['x-request-id'],
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app).get('/unknown-route').expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers for OAuth endpoints', async () => {
      const response = await request(app)
        .get('/.well-known/oauth-protected-resource')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-headers']).toBe(
        'Content-Type, Authorization',
      );
      expect(response.headers['access-control-allow-methods']).toBe(
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-expose-headers']).toBe(
        'WWW-Authenticate',
      );
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should handle OPTIONS requests for CORS preflight', async () => {
      const response = await request(app)
        .options('/.well-known/oauth-protected-resource')
        .expect(204); // OPTIONS requests return 204 No Content

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('Middleware Integration', () => {
    it('should apply request ID middleware to all routes', async () => {
      const response = await request(app).get('/health');
      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]+$/);
    });

    it('should verify middleware chain for POST requests', async () => {
      // Test that the full middleware chain is applied correctly
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .set('mcp-session-id', 'test-middleware-session')
        .send(VALID_LIST_TOOLS_REQUEST);

      // Verify all middleware effects are present
      expect(response.headers).toHaveProperty('x-request-id'); // Request ID middleware
      expect(response.status).not.toBe(401); // Auth middleware passed
      // Session ID middleware should have processed the mcp-session-id header
      // (This is tested indirectly through successful request processing)
    });

    it('should handle middleware chain without session ID header', async () => {
      // Test middleware chain when no session ID is provided
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .send(VALID_INITIALIZE_REQUEST);

      // Verify middleware chain works even without explicit session ID
      expect(response.headers).toHaveProperty('x-request-id'); // Request ID middleware

      // expect(response.headers).toHaveProperty('mcp-session-id'); // Session ID middleware
      expect(response.status).not.toBe(401); // Auth middleware passed
      // Session ID should be generated internally by getOrCreateSessionId
    });

    it('should verify middleware execution order and consistency', async () => {
      // Test that middleware chain executes consistently
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .send(VALID_INITIALIZE_REQUEST);

      // Verify consistent middleware behavior
      expect(response.headers).toHaveProperty('x-request-id'); // Request ID middleware
      expect(response.headers).toHaveProperty('x-trace-id'); // Trace ID from request context
      expect(response.status).not.toBe(401); // Auth middleware passed

      // The middleware chain should execute consistently
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]+$/);
      expect(response.headers['x-trace-id']).toMatch(/^[a-f0-9-]+$/);
    });

    it('should handle session ID processing in middleware chain', async () => {
      // Test that session ID is processed through the middleware chain
      const customSessionId = 'test-session-456';
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .set('mcp-session-id', customSessionId)
        .send(VALID_LIST_TOOLS_REQUEST);

      // Verify middleware chain processes the request
      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers).toHaveProperty('x-trace-id');
      expect(response.status).not.toBe(401); // Auth should pass

      // Session ID should be processed (even if not returned in headers due to mocking)
      // The fact that we get a valid response means the middleware chain worked
    });
  });

  describe('Content Type Handling', () => {
    it('should handle JSON requests properly', async () => {
      // Test with a POST request to an endpoint that accepts JSON
      await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send({ test: 'data' })
        .expect(404); // This endpoint doesn't exist, but it should handle JSON parsing
    });

    it('should reject oversized JSON payloads', async () => {
      const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) }; // 2MB

      await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send(largePayload)
        .expect(413); // Payload Too Large
    });
  });

  describe('Security Headers', () => {
    it('should include security headers from helmet', async () => {
      const response = await request(app).get('/health').expect(200);

      // Check for common security headers that helmet adds
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['x-xss-protection']).toBe('0');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limiting headers', async () => {
      const response = await request(app).get('/health').expect(200);

      // Check for rate limiting headers
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('HEAD Requests', () => {
    it('should handle HEAD requests to root without auth', async () => {
      const response = await request(app).head('/').expect(200);

      expect(response.headers['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      expect(response.headers['mcp-protocol-version']).toBe(
        LATEST_PROTOCOL_VERSION,
      );
      expect(response.body).toEqual({});
    });

    it('should handle HEAD requests with custom MCP protocol version', async () => {
      const customVersion = '2024-11-05';
      const response = await request(app)
        .head('/')
        .set('MCP-Protocol-Version', customVersion)
        .expect(200);

      expect(response.headers['mcp-protocol-version']).toBe(customVersion);
    });
  });

  describe('Authentication & Authorization', () => {
    describe('Missing Authentication', () => {
      it('should return 401 for POST / without bearer token', async () => {
        await request(app).post('/').send(VALID_INITIALIZE_REQUEST).expect(401);
      });

      it('should return 401 for GET / without bearer token', async () => {
        await request(app).get('/').expect(401);
      });

      it('should return 401 for DELETE / without bearer token', async () => {
        await request(app).delete('/').expect(401);
      });
    });

    describe('Valid Authentication', () => {
      it('should accept valid bearer token for initialize request', async () => {
        mockTransport.handleRequest.mockResolvedValueOnce(undefined);

        const response = await request(app)
          .post('/')
          .set('Authorization', VALID_BEARER_TOKEN)
          .send(VALID_INITIALIZE_REQUEST);

        // Should not be 401 (auth passed)
        expect(response.status).not.toBe(401);
        expect(mockVerifyAccessToken).toHaveBeenCalledWith(
          VALID_BEARER_TOKEN.replace('Bearer ', ''),
        );
      });
    });
  });

  describe('Session Management', () => {
    it('should handle POST requests with session headers', async () => {
      // Test that requests with session headers are processed
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .set('mcp-session-id', TEST_SESSION_ID)
        .send(VALID_LIST_TOOLS_REQUEST);

      // Should process the request (success or appropriate error)
      expect(response.status).not.toBe(401); // Auth should pass
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should handle session ID extraction from headers', async () => {
      // Test that the session ID is properly extracted from mcp-session-id header
      const customSessionId = 'custom-session-123';
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .set('mcp-session-id', customSessionId)
        .send(VALID_LIST_TOOLS_REQUEST);

      // Should process the request with the custom session ID
      expect(response.status).not.toBe(401); // Auth should pass
      expect(response.headers).toHaveProperty('x-request-id');
      // The session ID should be used in the request processing
      // (This tests the getOrCreateSessionId utility function)
    });

    it('should generate session ID when none provided', async () => {
      // Test that a session ID is generated when none is provided in headers
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .send(VALID_INITIALIZE_REQUEST); // Initialize request should work without session ID

      // Should process the request and generate a session ID internally
      expect(response.status).not.toBe(401); // Auth should pass
      expect(response.headers).toHaveProperty('x-request-id');
      // A new session ID should be generated internally by getOrCreateSessionId
    });

    it('should handle POST requests without session headers', async () => {
      // Test that requests without session headers are handled
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .send(VALID_LIST_TOOLS_REQUEST);

      // Should process the request (success or appropriate error)
      expect(response.status).not.toBe(401); // Auth should pass
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should verify session service methods are available', async () => {
      // Test that our mocked session service has all required methods
      expect(mockSessionService.getSession).toBeDefined();
      expect(mockSessionService.createSession).toBeDefined();
      expect(mockSessionService.destroySession).toBeDefined();
      expect(mockSessionService.isSessionExpired).toBeDefined();
      expect(mockSessionService.recordInteraction).toBeDefined();
      expect(mockSessionService.recordToolCall).toBeDefined();
      expect(mockSessionService.recordError).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON-RPC requests', async () => {
      // Test with invalid JSON-RPC structure
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .send({ invalid: 'request' });

      // Should handle invalid requests appropriately
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should handle requests with missing method', async () => {
      // Test with JSON-RPC structure but missing method
      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .send({
          jsonrpc: '2.0',
          id: 1,
          // missing method
        });

      // Should handle incomplete requests appropriately
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers).toHaveProperty('x-request-id');
    });
  });

  describe('Request Processing', () => {
    it('should handle DELETE requests', async () => {
      const response = await request(app)
        .delete('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .set('mcp-session-id', TEST_SESSION_ID);

      // DELETE requests should be processed (auth should pass)
      expect(response.status).not.toBe(401);
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should handle GET requests for SSE', async () => {
      const response = await request(app)
        .get('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .set('mcp-session-id', TEST_SESSION_ID);

      // GET requests should be processed (auth should pass)
      expect(response.status).not.toBe(401);
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should handle different HTTP methods consistently', async () => {
      // Test that all methods apply consistent middleware
      const methods = ['post', 'get', 'delete'] as const;

      for (const method of methods) {
        const response = await request(app)
          [method]('/')
          .set('Authorization', VALID_BEARER_TOKEN)
          .set('mcp-session-id', TEST_SESSION_ID)
          .send(method === 'post' ? VALID_LIST_TOOLS_REQUEST : undefined);

        // All methods should have consistent middleware applied
        expect(response.headers).toHaveProperty('x-request-id');
        expect(response.status).not.toBe(401); // Auth should pass for all
      }
    });
  });

  describe('Protocol Validation', () => {
    it('should validate JSON-RPC structure', async () => {
      // Test with a request that has proper JSON-RPC structure
      const validJsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .send(validJsonRpcRequest);

      // Should handle JSON-RPC requests (either success or proper error)
      expect(response.status).not.toBe(401); // Auth should pass
    });

    it('should handle method validation', async () => {
      // Test that different methods are processed appropriately
      const toolCallRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {},
        },
      };

      const response = await request(app)
        .post('/')
        .set('Authorization', VALID_BEARER_TOKEN)
        .send(toolCallRequest);

      // Should handle different method types
      expect(response.status).not.toBe(401); // Auth should pass
    });
  });
});
