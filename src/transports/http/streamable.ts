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
  oauthAuthorizationServer,
  oauthProtectedResource,
  wellKnownCorsHeaders,
} from '.';
import { REQUIRED_SCOPES } from './constants';
import { getOrCreateSessionId } from './utils';

import type { AuthenticatedRequest } from '../../auth';
import { createOAuthTokenVerifier } from '../../auth/auth-middleware';
import { env } from '../../config';
import { SERVICE_NAME, SERVICE_VERSION } from '../../constants';
import { isCarbonVoiceApiWorking } from '../../cv-api';
import server from '../../server';
import {
  formatProcessUptime,
  formatTimeToHuman,
  logger,
  obfuscateAuthHeaders,
} from '../../utils';

const app = express();
const SESSION_TTL_MS = 1000 * 60 * 60 * 1; // 1 hour

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
// app.use(standardHeaders);
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

// app.use((req, res, next) => {
//   logger.info(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
//     headers: Object.keys(req.headers),
//     hasSessionId: !!req.headers['mcp-session-id'],
//     userAgent: req.headers['user-agent'],
//   });
//   next();
// });

// Session management
type SessionMetrics = {
  sessionId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  totalInteractions: number;
  totalToolCalls: number;
};

type Session = {
  transport: StreamableHTTPServerTransport;
  timeout: NodeJS.Timeout;
  userId: string;
  destroying?: boolean; // Flag to prevent recursive destruction
  metrics: SessionMetrics;
};

// Carbon Voice API health cache
type ApiHealthStatus = {
  isHealthy: boolean;
  lastChecked: string;
  error?: string;
};

let carbonVoiceApiHealth: ApiHealthStatus = {
  isHealthy: false,
  lastChecked: new Date().toISOString(),
};

const sessions = new Map<string, Session>();

function createSession(
  transport: StreamableHTTPServerTransport,
  req: AuthenticatedRequest,
  sessionId: string,
): string {
  // Should never happen
  if (!req.auth?.extra?.user) {
    throw new Error('User not found in session creation');
  }

  // const sessionId = getOrCreateSessionId(req);
  // Clean up after TTL
  const timeout = setTimeout(() => {
    logger.info('⏰ Session timeout triggered', { sessionId });
    destroySession(sessionId);
  }, SESSION_TTL_MS);
  const userId = req.auth?.extra?.user!.id;
  sessions.set(sessionId, {
    transport,
    timeout,
    userId,
    metrics: {
      sessionId,
      userId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      totalInteractions: 0,
      totalToolCalls: 0,
    },
  });

  logger.info('🆕 Session created', {
    sessionId,
    userId: req.auth?.extra?.user!.id,
  });

  return sessionId;
}

function destroySession(sessionId: string) {
  logger.info('🔚 Destroying session', { sessionId });
  const session = sessions.get(sessionId);

  if (session && !session.destroying) {
    // Mark session as being destroyed to prevent recursive calls
    session.destroying = true;

    const {} = session.metrics;
    clearTimeout(session.timeout);
    session.transport.close();
    sessions.delete(sessionId);
    const durationInSeconds =
      (new Date().getTime() - session.metrics.createdAt.getTime()) / 1000;
    logger.info('❌ Session destroyed', {
      sessionId,
      duration: formatTimeToHuman(durationInSeconds),
      createdAt: session.metrics.createdAt.toISOString(),
      expiresAt: session.metrics.expiresAt.toISOString(),
      totalInteractions: session.metrics.totalInteractions,
      totalToolCalls: session.metrics.totalToolCalls,
      userId: session.userId,
    });
  } else if (session?.destroying) {
    logger.debug('Session already being destroyed, skipping', { sessionId });
  }
}

app.get('/health', (req, res: Response) => {
  const response = {
    status: carbonVoiceApiHealth.isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: formatProcessUptime(),
    dependencies: {
      carbonVoiceApi: {
        status: carbonVoiceApiHealth.isHealthy ? 'healthy' : 'unhealthy',
        lastChecked: carbonVoiceApiHealth.lastChecked,
        ...(carbonVoiceApiHealth.error && {
          error: carbonVoiceApiHealth.error,
        }),
      },
    },
  };

  const logLevel = carbonVoiceApiHealth.isHealthy ? 'info' : 'warn';
  logger[logLevel]('Health check', response);

  const statusCode = carbonVoiceApiHealth.isHealthy ? 200 : 503;
  res.status(statusCode).json(response);
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
  oauthProtectedResource,
);
app.get(
  '/.well-known/oauth-authorization-server',
  wellKnownCorsHeaders,
  oauthAuthorizationServer,
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

// Single shared transport for all requests
// const sharedTransport = new StreamableHTTPServerTransport({
//   sessionIdGenerator: undefined, // Stateless
//   enableJsonResponse: true,
// });

// Add error handling
// sharedTransport.onerror = (error) => {
//   logger.error('🚨 Transport error', { error: error.message });
// };

// sharedTransport.onclose = () => {
//   logger.info('🔴 Transport closed for all requests');
// };

async function handleSessionRequest(
  req: AuthenticatedRequest,
  res: Response,
  session?: Session,
) {
  if (!session) {
    logger.warn('❌ Session ID not found', {
      sessionId: getOrCreateSessionId(req),
      userId: req.auth?.extra?.user?.id,
      headers: req.headers,
    });

    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: 404,
        message: 'Session ID not found. Please reinitialize.',
      },
      id: null,
    });

    return;
  }

  session.metrics.totalInteractions++;
  if (req.body?.method === 'tools/call') {
    session.metrics.totalToolCalls++;
  }

  logger.info('🔁 Reusing session', session.metrics);

  return session.transport.handleRequest(req, res, req.body);
}

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
      const session = sessions.get(sessionId);
      // Reuse existing session
      if (session) {
        // logger.info('🔁 Reusing session', { sessionId });

        // await sessions
        //   .get(sessionId)!
        //   .transport!.handleRequest(req, res, req.body);

        // return;
        await handleSessionRequest(req, res, session);
        return;
      }

      // Create New Session
      if (isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => getOrCreateSessionId(req),
          // sessionIdGenerator: undefined,
          onsessioninitialized: (sessionId: string) => {
            // const user = req.auth?.extra?.user;

            logger.info('🆕 New session initialized', {
              sessionId,
              requestorHeaders: obfuscateAuthHeaders(req.headers),
              userId: req.auth?.extra?.user?.id,
            });
            createSession(transport!, req, sessionId);
          },
          enableJsonResponse: true,
        });
        transport.onclose = () => {
          logger.info('🔴 Transport onclose triggered', {
            sessionId: transport!.sessionId,
            hasSessionId: !!transport!.sessionId,
          });
          if (transport.sessionId) destroySession(transport.sessionId);
        };

        // Add error handling for the transport
        transport.onerror = (error) => {
          logger.error('🚨 Transport error occurred', {
            sessionId: transport!.sessionId,
            sessionMetrics: sessions.get(transport!.sessionId!)?.metrics,
            error: {
              message: error.message,
              name: error.name,
              stack: error.stack,
            },
          });
        };

        await server.connect(transport);

        await transport.handleRequest(req, res, req.body);

        return;
        // const session = sessions.get(transport!.sessionId!);
        // await handleSessionRequest(req, res, session!);
      }

      // No session ID and no initialize request
      // Should never happen since we are gonna always have a session ID
      logger.warn('❌ Session ID not found', {
        sessionId,
        userId: req.auth?.extra?.user?.id,
        headers: req.headers,
      });

      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: 404,
          message: 'Session ID not found. Please reinitialize.',
        },
        id: null,
      });

      return;
      // await handleSessionRequest(req, res, sessions.get(sessionId));

      // await sharedTransport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('❌ Error in POST /mcp handler', {
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        method: req.method,
        url: req.url,
        sessionId: getOrCreateSessionId(req),
        hasInitializeRequest: isInitializeRequest(req.body),
        userId: req.auth?.extra?.user?.id,
      });
      next(error);
    }
  },
);

// GET/DELETE /mcp: server-to-client (SSE) and session termination

// GET/DELETE /mcp: server-to-client (SSE) and session termination
async function handleSessionRequestGetDelete(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const sessionId = getOrCreateSessionId(req);
    const session = sessions.get(sessionId);
    if (!session) {
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

    await session.transport.handleRequest(req, res, req.body);
    if (req.method === 'DELETE') {
      destroySession(sessionId);
    }
  } catch (err) {
    logger.error('❌ Error in handleSessionRequestGetDelete', {
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
  }
}

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
  handleSessionRequestGetDelete,
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
  handleSessionRequestGetDelete,
);

// app.get(
//   '/mcp',
//   authErrorLogger,
//   requireBearerAuth({
//     verifier: createOAuthTokenVerifier(),
//     requiredScopes: REQUIRED_SCOPES,
//     resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
//   }),
//   addMcpSessionId,
//   (req: AuthenticatedRequest, res: Response) => {
//     return handleSessionRequest(
//       req,
//       res,
//       sessions.get(getOrCreateSessionId(req)),
//     );
//   },
// );

// app.delete(
//   '/mcp',
//   authErrorLogger,
//   requireBearerAuth({
//     verifier: createOAuthTokenVerifier(),
//     requiredScopes: REQUIRED_SCOPES,
//     resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
//   }),
//   addMcpSessionId,
//   (req: AuthenticatedRequest, res: Response) => {
//     destroySession(getOrCreateSessionId(req));
//   },
// );

// For stateless servers, GET should return 405 Method Not Allowed
// app.get('/mcp', (req, res) => {
//   logger.warn('GET request to /mcp (not supported in stateless mode)');
//   res.writeHead(405, {
//     'Content-Type': 'application/json',
//     Allow: 'POST',
//   });
//   res.end(
//     JSON.stringify({
//       jsonrpc: '2.0',
//       error: {
//         code: -32601, // "Method not found"
//         message: 'GET not supported in stateless mode; use POST at /mcp',
//       },
//       id: null,
//     }),
//   );
//   return;
// });

// For stateless servers, DELETE should return 405 Method Not Allowed
// app.delete('/mcp', (req, res) => {
//   logger.warn('DELETE request to /mcp (not supported in stateless mode)');
//   res.status(405).json({
//     jsonrpc: '2.0',
//     error: {
//       code: -32000,
//       message: "Method not allowed. Stateless server doesn't support sessions.",
//     },
//     id: null,
//   });
// });

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
// async function handleSessionRequestWasWorking(
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction,
// ) {
//   try {
//     // const sessionId = getOrCreateSessionId(req);
//     // if (!sessionId || !sessions.has(sessionId)) {
//     //   logger.warn('Invalid or missing session ID', { sessionId });
//     //   res.status(404).json({
//     //     jsonrpc: '2.0',
//     //     error: {
//     //       code: 404,
//     //       message: 'Session not found. Please reinitialize.',
//     //     },
//     //     id: null,
//     //   });
//     //   return;
//     // }

//     // Add SSE-specific headers for GET requests (which are used for SSE)
//     if (req.method === 'GET') {
//       res.setHeader('Content-Type', 'text/event-stream');
//       res.setHeader('Cache-Control', 'no-cache');
//       res.setHeader('Connection', 'keep-alive');
//       res.setHeader('Access-Control-Allow-Origin', '*');
//       res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
//       res.setHeader('Access-Control-Allow-Credentials', 'true');
//     }

//     // const transport = sessions.get(sessionId)!.transport;
//     await sharedTransport.handleRequest(req, res, req.body);
//     // if (req.method === 'DELETE') {
//     //   // destroySession(sessionId);
//     // }
//   } catch (err) {
//     logger.error('❌ Error in handleSessionRequest', {
//       error: {
//         message: err instanceof Error ? err.message : String(err),
//         stack: err instanceof Error ? err.stack : undefined,
//       },
//       method: req.method,
//       url: req.url,
//       sessionId: getOrCreateSessionId(req),
//     });
//     next(err);
//   }
// }

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

  // Clear the heartbeat interval
  clearInterval(heartbeatInterval);

  // Clean up all sessions
  for (const sessionId of sessions.keys()) {
    destroySession(sessionId);
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.once('SIGUSR2', () => {
  logger.info('SIGUSR2 received, shutting down...');
  // shutdown();
  // After cleanup, re-emit the signal to let nodemon restart the process
  process.kill(process.pid, 'SIGUSR2');
});

// Start server
const PORT = env.PORT || 3005;
const serverInstance = app.listen(PORT, async () => {
  // Connect server once at startup
  // await server.connect(sharedTransport);

  // Initialize Carbon Voice API health status
  const isApiWorking = await isCarbonVoiceApiWorking();
  carbonVoiceApiHealth = {
    isHealthy: isApiWorking,
    lastChecked: new Date().toISOString(),
  };

  const logLevel = isApiWorking ? 'info' : 'warn';
  const icon = isApiWorking ? '✅ ' : '⚠️ ';

  logger[logLevel](`${icon} MCP HTTP Server started on port ${PORT}`, {
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    processId: process.pid,
    nodeVersion: process.version,
    totalSessions: sessions.size,
    carbonVoiceApiHealth,
  });
});

serverInstance.on('error', (error) => {
  logger.error('❌ Error on MCP HTTP Server', { error });
});

// Add additional process-level monitoring
process.on('uncaughtException', (error) => {
  logger.error('🚨 Uncaught Exception detected', {
    error: error.message,
    stack: error.stack,
    name: error.name,
    processId: process.pid,
    totalSessions: sessions.size,
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('🚨 Unhandled Promise Rejection detected', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString(),
    processId: process.pid,
    totalSessions: sessions.size,
  });
});

// Log every 30 seconds to show the server is alive
const heartbeatInterval = setInterval(async () => {
  try {
    const isApiWorking = await isCarbonVoiceApiWorking();

    // Update Carbon Voice API health cache
    carbonVoiceApiHealth = {
      isHealthy: isApiWorking,
      lastChecked: new Date().toISOString(),
      ...(carbonVoiceApiHealth.error && isApiWorking && { error: undefined }), // Clear error if now healthy
    };

    logger.info('💓 Server heartbeat', {
      totalSessions: sessions.size,
      isCarbonVoiceApiWorking: isApiWorking,
      uptime: formatProcessUptime(),
      memoryUsage: process.memoryUsage(),
    });
  } catch (error) {
    // Update cache with error information
    carbonVoiceApiHealth = {
      isHealthy: false,
      lastChecked: new Date().toISOString(),
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error checking API health',
    };

    logger.warn('💓 Server heartbeat - Carbon Voice API check failed', {
      totalSessions: sessions.size,
      isCarbonVoiceApiWorking: false,
      uptime: formatProcessUptime(),
      memoryUsage: process.memoryUsage(),
      error: carbonVoiceApiHealth.error,
    });
  }
}, 30000);
