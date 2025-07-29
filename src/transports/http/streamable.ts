#!/usr/bin/env node
import cors from 'cors';
import express, { NextFunction, Response } from 'express';
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
import { ApiHealthStatus, Session } from './interfaces';
import { SessionService } from './session.service';
import { sessionManager } from './session-manager';
import { getOrCreateSessionId } from './utils';

import { createOAuthTokenVerifier } from '../../auth';
import { AuthenticatedRequest } from '../../auth/interfaces';
import { env } from '../../config';
import { SERVICE_NAME, SERVICE_VERSION } from '../../constants';
import { isCarbonVoiceApiWorking } from '../../cv-api';
import server from '../../server';
import { formatProcessUptime, logger, obfuscateAuthHeaders } from '../../utils';

const app = express();

// Create session service instance
const sessionService = new SessionService(sessionManager);

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

let carbonVoiceApiHealth: ApiHealthStatus = {
  isHealthy: false,
  lastChecked: new Date().toISOString(),
};

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
      ENVIRONMENT: env.ENVIRONMENT,
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
app.head('/', logRequest, (req, res) => {
  const mcpProtocolVersion =
    req.headers['mcp-protocol-version'] || LATEST_PROTOCOL_VERSION;

  res
    .status(200)
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', mcpProtocolVersion)
    .end();
});

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
  '/',
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
      const session = sessionService.getSession(sessionId);
      // Reuse existing session
      if (session) {
        await handleSessionRequest(req, res, session);
        return;
      }

      // Create New Session
      if (isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => getOrCreateSessionId(req),
          onsessioninitialized: (sessionId: string) => {
            logger.info('🆕 New session initialized', {
              sessionId,
              requestorHeaders: obfuscateAuthHeaders(req.headers),
              userId: req.auth?.extra?.user?.id,
            });
            sessionService.createSession(transport!, req, sessionId);
          },
          enableJsonResponse: true,
        });
        transport.onclose = () => {
          logger.info('🔴 Transport onclose triggered', {
            sessionId: transport!.sessionId,
            hasSessionId: !!transport!.sessionId,
          });
          if (transport.sessionId)
            sessionService.destroySession(transport.sessionId);
        };

        // Add error handling for the transport
        transport.onerror = (error) => {
          logger.error('🚨 Transport error occurred', {
            sessionId: transport!.sessionId,
            sessionMetrics: sessionService.getSession(transport!.sessionId!)
              ?.metrics,
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
      }

      // No session ID and no initialize request
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
    } catch (error) {
      logger.error('❌ Error in POST  handler', {
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

// GET/DELETE : server-to-client (SSE) and session termination
app.get(
  '/',
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
  '/',
  authErrorLogger,
  requireBearerAuth({
    verifier: createOAuthTokenVerifier(),
    requiredScopes: REQUIRED_SCOPES,
    resourceMetadataUrl: 'mcp', // FIXME: Add dynamic resource!
  }),
  addMcpSessionId,
  handleSessionRequestGetDelete,
);

// GET/DELETE : server-to-client (SSE) and session termination
async function handleSessionRequestGetDelete(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const sessionId = getOrCreateSessionId(req);
    const session = sessionService.getSession(sessionId);
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
      sessionService.destroySession(sessionId);
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

// Graceful shutdown
function shutdown() {
  logger.info('Shutting down server...');

  // Clear the heartbeat interval
  clearInterval(heartbeatInterval);

  // Clean up all sessions
  for (const sessionId of sessionService.getAllSessionIds()) {
    sessionService.destroySession(sessionId);
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.once('SIGUSR2', () => {
  logger.info('SIGUSR2 received, shutting down...');
  shutdown();
  process.kill(process.pid, 'SIGUSR2');
});

// Start server
const PORT = env.PORT || 3005;
const serverInstance = app.listen(PORT, async () => {
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
    totalSessions: sessionService.getAllSessionIds().length,
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
    totalSessions: sessionService.getAllSessionIds().length,
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('🚨 Unhandled Promise Rejection detected', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString(),
    processId: process.pid,
    totalSessions: sessionService.getAllSessionIds().length,
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
      totalSessions: sessionService.getAllSessionIds().length,
      isCarbonVoiceApiWorking: isApiWorking,
      uptime: formatProcessUptime(),
      memoryUsage: process.memoryUsage(),
    });
  } catch (error) {
    // Update cache with error information
    carbonVoiceApiHealth = {
      isHealthy: false,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };

    logger.warn('💓 Server heartbeat - Carbon Voice API check failed', {
      totalSessions: sessionService.getAllSessionIds().length,
      isCarbonVoiceApiWorking: false,
      uptime: formatProcessUptime(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}, 30000);
