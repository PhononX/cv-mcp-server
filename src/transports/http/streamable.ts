#!/usr/bin/env node

import express, { NextFunction, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';

import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { wellKnownCorsHeaders } from '.';

import type { AuthenticatedRequest } from '../../auth';
import { createOAuthTokenVerifier } from '../../auth/auth-middleware';
import { User } from '../../auth/interfaces';
import { env } from '../../config';
import { SERVICE_NAME, SERVICE_VERSION } from '../../constants';
import server from '../../server';
import { formatProcessUptime, logger } from '../../utils';

const app = express();
const SESSION_TTL_MS = 1000 * 60 * 60; // 1 hour
const REQUIRED_SCOPES = ['mcp:read', 'mcp:write'];

// Add this before your routes
// app.use(
//   cors({
//     origin: 'http://localhost:3005', // http://localhost:6274
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: [
//       'Content-Type',
//       'Authorization',
//       'WWW-Authenticate',
//       'MCP_PROXY_AUTH_TOKEN',
//       'mcp-session-id',
//       'X-Requested-With',
//     ],
//     credentials: true,
//   }),
// );

// Trust proxy for rate limiting - only trust localhost and private networks
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Security middlewares
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs (100 requests per minute)
    standardHeaders: true,
    // legacyHeaders: false, why??
  }),
);

// Session management
type Session = {
  transport: StreamableHTTPServerTransport;
  timeout: NodeJS.Timeout;
  user?: User;
};

const sessions = new Map<string, Session>();

function createSession(
  transport: StreamableHTTPServerTransport,
  user?: Session['user'],
): string {
  const sessionId = transport.sessionId || randomUUID();
  const isSameSessionIdFromTransport = sessionId === transport.sessionId;
  // Clean up after TTL
  const timeout = setTimeout(() => {
    logger.info('Session expired', { sessionId });
    destroySession(sessionId);
  }, SESSION_TTL_MS);

  sessions.set(sessionId, { transport, timeout, user });

  logger.info('🆕 Session created', {
    sessionId,
    isSameSessionIdFromTransport,
    userId: user?.id,
  });

  return sessionId;
}

function destroySession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) {
    clearTimeout(session.timeout);
    session.transport.close();
    sessions.delete(sessionId);
    logger.info('Session destroyed', { sessionId });
  }
}

app.get('/health', (req, res: Response) => {
  const response = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: formatProcessUptime(),
  };

  logger.info('Health check', response);

  res.status(200).json(response);
});

app.post(
  '/mcp',
  requireBearerAuth({
    verifier: createOAuthTokenVerifier(),
    requiredScopes: REQUIRED_SCOPES,
    resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    // Reuse existing session
    if (sessionId && sessions.has(sessionId)) {
      logger.info('Reusing session', { sessionId });

      await sessions
        .get(sessionId)!
        .transport!.handleRequest(req, res, req.body);

      return;
    }

    // Create New Session
    if (!sessionId && isInitializeRequest(req.body)) {
      const requestorHeaders = req.headers;
      // TODO: The place I can see info about client is: user-agent
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (transportSessionId: string) => {
          const user = req.auth?.extra?.user;

          logger.info('New session initialized', {
            sessionId: transportSessionId,
            requestorHeaders,
            userId: user?.id,
          });
          createSession(transport!, user);
        },
        enableJsonResponse: true,
      });
      transport.onclose = () => {
        if (transport!.sessionId) destroySession(transport!.sessionId);
      };

      await server.connect(transport);

      await transport.handleRequest(req, res, req.body);

      return;
    }
    // No session ID and no initialize request

    logger.warn('Bad request: No valid session ID provided', {
      sessionId,
      headers: req.headers,
    });

    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: 404,
        message:
          'Session Not Found or Expired. Please reinitialize with a new session ID.',
      },
      id: null,
    });
  },
);

// POST /mcp: client-to-server (with authentication)
// app.post(
//   '/mcpx',
//   async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
//     logger.warn('Verifying access token');
//     verifyAccessToken(req, res, next);
//     logger.warn('Access token verified');
//     try {
//       // if (req.headers) {
//       //   throw new UnauthorizedException();
//       // }

//       const sessionId = req.headers['mcp-session-id'] as string | undefined;
//       // Reuse existing session
//       if (sessionId && sessions.has(sessionId)) {
//         logger.info('Reusing session', { sessionId });

//         await sessions
//           .get(sessionId)!
//           .transport!.handleRequest(req, res, req.body);

//         return;
//       }

//       // Create New Session
//       if (!sessionId && isInitializeRequest(req.body)) {
//         const requestorHeaders = req.headers;
//         // TODO: The place I can see info about client is: user-agent
//         const transport = new StreamableHTTPServerTransport({
//           sessionIdGenerator: () => randomUUID(),
//           onsessioninitialized: (transportSessionId: string) => {
//             logger.info('New session initialized', {
//               sessionId: transportSessionId,
//               requestorHeaders,
//               userId: req.auth?.extra?.user?.id,
//             });
//             const sessionId = createSession(transport!, req.auth?.extra?.user);
//             if (req.auth?.extra?.user) {
//               setUserContext(sessionId, req.auth?.extra?.user);
//             }
//           },
//           enableJsonResponse: true,
//         });
//         transport.onclose = () => {
//           if (transport!.sessionId) destroySession(transport!.sessionId);
//         };

//         await server.connect(transport);

//         await transport.handleRequest(req, res, req.body);

//         return;
//       }
//       // No session ID and no initialize request

//       logger.warn('Bad request: No valid session ID provided', {
//         sessionId,
//         headers: req.headers,
//       });

//       res.status(404).json({
//         jsonrpc: '2.0',
//         error: {
//           code: 404,
//           message:
//             'Session Not Found or Expired. Please reinitialize with a new session ID.',
//         },
//         id: null,
//       });
//     } catch (err) {
//       logger.error('Error handling request', { error: err });
//       return next(err);
//     }
//   },
// );

// GET/DELETE /mcp: server-to-client (SSE) and session termination
async function handleSessionRequest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      logger.warn('Invalid or missing session ID', { sessionId });
      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: 404,
          message: 'Session not found. Please reinitialize.',
        },
        id: null,
      });
      return;
    }
    const transport = sessions.get(sessionId)!.transport;
    await transport.handleRequest(req, res, req.body);
    if (req.method === 'DELETE') {
      destroySession(sessionId);
    }
  } catch (err) {
    next(err);
  }
}

// GET/DELETE /mcp: server-to-client (SSE) and session termination
app.get(
  '/mcp',
  requireBearerAuth({
    verifier: createOAuthTokenVerifier(),
    requiredScopes: REQUIRED_SCOPES,
    resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
  }),
  handleSessionRequest,
);
app.delete(
  '/mcp',
  requireBearerAuth({
    verifier: createOAuthTokenVerifier(),
    requiredScopes: REQUIRED_SCOPES,
    resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
  }),
  handleSessionRequest,
);

// Protected resource metadata (OAuth 2.1 RFC9728 compliant)
app.get(
  '/.well-known/oauth-protected-resource',
  wellKnownCorsHeaders,
  (req, res) => {
    logger.info('OAuth Protected Resource metadata requested', {
      url: req.url,
      method: req.method,
    });
    const protocol = req.get('X-Forwarded-Proto') || req.protocol;
    const host =
      req.get('X-Forwarded-Host') || req.get('host') || `localhost:${env.PORT}`;
    const baseUrl = `${protocol}://${host}`;

    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [env.CARBON_VOICE_BASE_URL],
      scopes_supported: REQUIRED_SCOPES,
      bearer_methods_supported: ['header'],
      resource_name: 'Carbon Voice - HTTP',
    });
  },
);

app.get(
  '/.well-known/oauth-authorization-server',
  wellKnownCorsHeaders,
  (req, res) => {
    logger.info('OAuth Authorization Server metadata requested', {
      url: req.url,
      method: req.method,
    });

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

    res.json(metadata);
  },
);

// app.get('/oauth/authorize', (req, res) => {
//   logger.info('OAuth authorize!!!', {
//     url: req.url,
//     method: req.method,
//     headers: req.headers,
//   });

//   throw new Error('Not implemented');
// });

// Error handler middleware

// app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
//   if (err instanceof HttpError) {
//     res.status(err.status).json({
//       jsonrpc: '2.0',
//       error: { code: err.status, message: err.message },
//       id: null,
//     });

//     return;
//   }

//   logger.error('Unhandled error', {
//     error: { ...err, stack: err.stack },
//     errorMessage: err.message,
//     url: req.url,
//     method: req.method,
//   });

//   if (!res.headersSent) {
//     res.status(500).json({
//       jsonrpc: '2.0',
//       error: { code: -32603, message: 'Internal server error' },
//       id: null,
//     });
//   }
// });

// Graceful shutdown
function shutdown() {
  logger.info('Shutting down server...');
  for (const sessionId of sessions.keys()) {
    destroySession(sessionId);
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
const PORT = env.PORT || 3005;
const serverInstance = app.listen(PORT, () => {
  logger.info(`MCP HTTP Server listening on port ${PORT}`, {
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
  });
});

serverInstance.on('error', (error) => {
  logger.error('Error starting MCP HTTP Server', { error });
});
