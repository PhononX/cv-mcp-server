#!/usr/bin/env node
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  isInitializeRequest,
  LATEST_PROTOCOL_VERSION,
} from '@modelcontextprotocol/sdk/types.js';

import {
  addMcpSessionId,
  addRequestIdMiddleware,
  authErrorLogger,
  logRequest,
  wellKnownCorsHeaders,
} from '.';
import { getOrCreateSessionId } from './utils';

import type { AuthenticatedRequest } from '../../auth';
import { createOAuthTokenVerifier } from '../../auth/auth-middleware';
import { User } from '../../auth/interfaces';
import { env } from '../../config';
import { SERVICE_NAME, SERVICE_VERSION } from '../../constants';
import server from '../../server';
import { formatProcessUptime, logger, obfuscateAuthHeaders } from '../../utils';

const app = express();
const SESSION_TTL_MS = 1000 * 60 * 60; // 1 hour
const REQUIRED_SCOPES = ['mcp:read', 'mcp:write'];

/**
 * Sets standard headers for all requests.
 * @param _req - The request.
 * @param res - The response.
 * @param next - The next handler.
 */
function standardHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Disables all caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');

  // if (getConfig().baseUrl.startsWith('https://')) {
  //   // Only connect to this site and subdomains via HTTPS for the next two years
  //   // and also include in the preload list
  //   res.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // }

  // Set Content Security Policy
  // As an API server, block everything
  // See: https://stackoverflow.com/a/45631261/2051724
  res.set(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';",
  );

  // Disable browser features
  res.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  );

  // Never send the Referer header
  res.set('Referrer-Policy', 'no-referrer');

  // Prevent browsers from incorrectly detecting non-scripts as scripts
  res.set('X-Content-Type-Options', 'nosniff');

  // Disallow attempts to iframe site
  res.set('X-Frame-Options', 'DENY');

  // Block pages from loading when they detect reflected XSS attacks
  res.set('X-XSS-Protection', '1; mode=block');
  next();
}

app.set('x-powered-by', false);
// Trust proxy for rate limiting - only trust localhost and private networks
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
app.use(standardHeaders);
app.use(cors());
// Security middlewares
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs (100 requests per minute)
    standardHeaders: true,
    // legacyHeaders: false, why??
  }),
);
app.use(express.json({ limit: '1mb' }));

// Add request ID middleware
app.use(addRequestIdMiddleware);
// Request logging middleware
app.use(logRequest);

// Session management
type Session = {
  transport: StreamableHTTPServerTransport;
  timeout: NodeJS.Timeout;
  user?: User;
};

const sessions = new Map<string, Session>();

function createSession(
  transport: StreamableHTTPServerTransport,
  req: AuthenticatedRequest,
): string {
  const sessionId = getOrCreateSessionId(req);
  // Clean up after TTL
  const timeout = setTimeout(() => {
    logger.info('Session expired', { sessionId });
    destroySession(sessionId);
  }, SESSION_TTL_MS);

  sessions.set(sessionId, { transport, timeout });

  logger.info('🆕 Session created', {
    sessionId,
    userId: req.auth?.extra?.user?.id,
  });

  return sessionId;
}

function destroySession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) {
    clearTimeout(session.timeout);
    session.transport.close();
    sessions.delete(sessionId);
    logger.info('Session destroyed', { sessionId, userId: session?.user?.id });
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

app.get('/info', (req, res: Response) => {
  logger.info('Info', {
    ENV_VARS: {
      CARBON_VOICE_BASE_URL: env.CARBON_VOICE_BASE_URL,
      LOG_LEVEL: env.LOG_LEVEL,
      PORT: env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      LOG_TRANSPORT: env.LOG_TRANSPORT,
    },
  });

  res.status(200).send('OK');
});

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

// Handle HEAD requests without auth
app.head('/mcp', logRequest, (req, res) => {
  const mcpProtocolVersion =
    req.headers['mcp-protocol-version'] || LATEST_PROTOCOL_VERSION;

  res
    .status(200)
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', mcpProtocolVersion)
    .end();
});

app.post(
  '/mcp',
  authErrorLogger,
  requireBearerAuth({
    verifier: createOAuthTokenVerifier(),
    requiredScopes: REQUIRED_SCOPES,
    resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
  }),
  addMcpSessionId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sessionId = getOrCreateSessionId(req);
      // Reuse existing session
      if (sessions.has(sessionId)) {
        logger.info('Reusing session', { sessionId });

        await sessions
          .get(sessionId)!
          .transport!.handleRequest(req, res, req.body);

        return;
      }

      // Create New Session
      if (isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => getOrCreateSessionId(req),
          onsessioninitialized: (transportSessionId: string) => {
            const user = req.auth?.extra?.user;

            logger.info('New session initialized', {
              sessionId: transportSessionId,
              requestorHeaders: obfuscateAuthHeaders(req.headers),
              userId: user?.id,
            });
            createSession(transport!, req);
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
      // Should never happen since we are gonna always have a session ID
      logger.warn('Bad request: No valid session ID provided', {
        sessionId,
        userId: req.auth?.extra?.user?.id,
        headers: req.headers,
      });

      throw new Error('No session ID provided');
    } catch (error) {
      next(error);
    }
  },
);

// GET/DELETE /mcp: server-to-client (SSE) and session termination
app.get(
  '/mcp',
  authErrorLogger,
  requireBearerAuth({
    verifier: createOAuthTokenVerifier(),
    requiredScopes: REQUIRED_SCOPES,
    resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
  }),
  addMcpSessionId,
  handleSessionRequest,
);
app.delete(
  '/mcp',
  authErrorLogger,
  requireBearerAuth({
    verifier: createOAuthTokenVerifier(),
    requiredScopes: REQUIRED_SCOPES,
    resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
  }),
  addMcpSessionId,
  handleSessionRequest,
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

//       const sessionId = getOrCreateSessionId(req);
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
    const sessionId = getOrCreateSessionId(req);
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

// Add error handlers for unhandled exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception - Server will continue', {
    error: error.message,
    stack: error.stack,
    name: error.name,
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection - Server will continue', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString(),
  });
});

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
