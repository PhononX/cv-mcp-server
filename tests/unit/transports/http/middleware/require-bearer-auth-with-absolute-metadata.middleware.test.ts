import {
  InvalidRequestError,
  ServerError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

import { requireBearerAuthWithAbsoluteMetadata } from '../../../../../src/transports/http/middleware/require-bearer-auth-with-absolute-metadata.middleware';

const testAbsoluteResourceMetadataUrl =
  process.env.TEST_MCP_RESOURCE_METADATA_URL ||
  'https://mcp.example.test/.well-known/oauth-protected-resource';

type MockRequest = {
  headers: Record<string, string | undefined>;
  protocol: string;
  get: jest.Mock<string | undefined, [string]>;
  auth?: unknown;
};

type MockResponse = {
  set: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
};

const createMockReq = (
  overrides?: Partial<Pick<MockRequest, 'headers' | 'protocol'>>,
): MockRequest => {
  const req: MockRequest = {
    headers: overrides?.headers || {},
    protocol: overrides?.protocol || 'http',
    get: jest.fn((header: string) => {
      if (header.toLowerCase() === 'host') {
        return 'localhost:3005';
      }
      return undefined;
    }),
  };

  return req;
};

const createMockRes = (): MockResponse => {
  const res: MockResponse = {
    set: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);
  return res;
};

describe('requireBearerAuthWithAbsoluteMetadata middleware', () => {
  const requiredScopes = ['mcp:read', 'mcp:write'];
  const verifier = {
    verifyAccessToken: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should attach auth and call next for valid token', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq({
      headers: {
        authorization: 'Bearer valid-token',
      },
    });
    const res = createMockRes();
    const next = jest.fn();

    verifier.verifyAccessToken.mockResolvedValue({
      clientId: 'client-1',
      token: 'valid-token',
      scopes: requiredScopes,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { user: { id: 'user-1' } },
    });

    await middleware(req as any, res as any, next);

    expect(verifier.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(req.auth).toBeDefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header is missing', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq();
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req as any, res as any, next);

    expect(res.set).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining(
        'resource_metadata="http://localhost:3005/.well-known/oauth-protected-resource"',
      ),
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'invalid_token',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header format is invalid', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq({
      headers: {
        authorization: 'Basic abc123',
      },
    });
    const res = createMockRes();

    await middleware(req as any, res as any, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'invalid_token',
      }),
    );
  });

  it('should return 403 when token has insufficient scopes', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq({
      headers: {
        authorization: 'Bearer token-with-limited-scope',
      },
    });
    const res = createMockRes();

    verifier.verifyAccessToken.mockResolvedValue({
      clientId: 'client-1',
      token: 'token-with-limited-scope',
      scopes: ['mcp:read'],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { user: { id: 'user-1' } },
    });

    await middleware(req as any, res as any, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'insufficient_scope',
      }),
    );
  });

  it('should return 401 when token has no expiration', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq({
      headers: {
        authorization: 'Bearer token-without-exp',
      },
    });
    const res = createMockRes();

    verifier.verifyAccessToken.mockResolvedValue({
      clientId: 'client-1',
      token: 'token-without-exp',
      scopes: requiredScopes,
      extra: { user: { id: 'user-1' } },
    });

    await middleware(req as any, res as any, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'invalid_token',
      }),
    );
  });

  it('should return 401 when token is expired', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq({
      headers: {
        authorization: 'Bearer expired-token',
      },
    });
    const res = createMockRes();

    verifier.verifyAccessToken.mockResolvedValue({
      clientId: 'client-1',
      token: 'expired-token',
      scopes: requiredScopes,
      expiresAt: Math.floor(Date.now() / 1000) - 60,
      extra: { user: { id: 'user-1' } },
    });

    await middleware(req as any, res as any, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'invalid_token',
      }),
    );
  });

  it('should use configured absolute metadata URL as-is', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: testAbsoluteResourceMetadataUrl,
    });
    const req = createMockReq();
    const res = createMockRes();

    await middleware(req as any, res as any, jest.fn());

    expect(res.set).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining(
        `resource_metadata="${testAbsoluteResourceMetadataUrl}"`,
      ),
    );
  });

  it('should fall back to configured relative metadata URL when host is unavailable', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq();
    req.get.mockReturnValue(undefined);
    const res = createMockRes();

    await middleware(req as any, res as any, jest.fn());

    expect(res.set).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining(
        'resource_metadata="/.well-known/oauth-protected-resource"',
      ),
    );
  });

  it('should map OAuthError to 400 response', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq({
      headers: {
        authorization: 'Bearer any-token',
      },
    });
    const res = createMockRes();

    verifier.verifyAccessToken.mockRejectedValue(
      new InvalidRequestError('Malformed token request'),
    );

    await middleware(req as any, res as any, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'invalid_request',
      }),
    );
  });

  it('should map ServerError to 500 response', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq({
      headers: {
        authorization: 'Bearer any-token',
      },
    });
    const res = createMockRes();

    verifier.verifyAccessToken.mockRejectedValue(
      new ServerError('Verifier failure'),
    );

    await middleware(req as any, res as any, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'server_error',
      }),
    );
  });

  it('should map unexpected errors to generic 500 response', async () => {
    const middleware = requireBearerAuthWithAbsoluteMetadata({
      verifier,
      requiredScopes,
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    });
    const req = createMockReq({
      headers: {
        authorization: 'Bearer any-token',
      },
    });
    const res = createMockRes();

    verifier.verifyAccessToken.mockRejectedValue(new Error('Unexpected crash'));

    await middleware(req as any, res as any, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'server_error',
        error_description: 'Internal Server Error',
      }),
    );
  });
});
