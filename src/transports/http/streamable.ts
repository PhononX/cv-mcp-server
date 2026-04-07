#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

import cors from 'cors';
import express, { NextFunction, Response } from 'express';
import helmet from 'helmet';
import serveFavicon from 'serve-favicon';

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
  rateLimitMiddleware,
  requireBearerAuthWithAbsoluteMetadata,
  wellKnownCorsHeaders,
} from '.';
import { REQUIRED_SCOPES } from './constants';
import { ApiHealthStatus } from './interfaces';
import {
  Session,
  SessionCleanupService,
  SessionLogger,
  sessionService,
} from './session';
import { SessionConfig } from './session/session.config';
import { getOrCreateSessionId } from './utils';
import {
  getTraceId,
  updateRequestContext,
} from './utils/request-context';

import { createOAuthTokenVerifier } from '../../auth';
import { AuthenticatedRequest } from '../../auth/interfaces';
import { env, isTestEnvironment } from '../../config';
import { getCarbonVoiceApiStatus } from '../../cv-api';
import server from '../../server';
import { getProcessUptime, logger } from '../../utils';

const app = express();

app.set('x-powered-by', false);
// Trust proxy for rate limiting - only trust localhost and private networks
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Serve favicon
const faviconPath = path.join(process.cwd(), 'public', 'favicon.ico');
if (fs.existsSync(faviconPath)) {
  app.use(serveFavicon(faviconPath));
}

// app.use(standardHeaders);
app.use(cors());
// Security middlewares
app.use(helmet());
app.use(rateLimitMiddleware);
app.use(express.json({ limit: '1mb' }));

// Add request ID middleware
app.use(addRequestIdMiddleware);
// Request logging middleware (includes session metrics)
app.use(logRequest);

let carbonVoiceApiHealth: ApiHealthStatus = {
  isHealthy: isTestEnvironment() ? true : false, // Assume healthy in test mode
  lastChecked: new Date().toISOString(),
  apiUrl: env.CARBON_VOICE_BASE_URL,
};

const resourceMetadataUrl = env.MCP_RESOURCE_METADATA_URL;
const oauthTokenVerifier = createOAuthTokenVerifier();
const authWithAbsoluteMetadata = requireBearerAuthWithAbsoluteMetadata({
  verifier: oauthTokenVerifier,
  requiredScopes: REQUIRED_SCOPES,
  resourceMetadataUrl,
});

app.get('/health', (req, res: Response) => {
  const response = {
    status: carbonVoiceApiHealth.isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: getProcessUptime(),
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
app.head('/', (req, res) => {
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
  try {
    const sessionId = getOrCreateSessionId(req);
    updateRequestContext({
      sessionId: sessionId || undefined,
      userId: req.auth?.extra?.user?.id,
    });

    if (!session) {
      logger.warn('Session not found for request', {
        sessionId,
      });
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

    // Record tool call for metrics only when actually executing tools
    if (req.body?.method === 'tools/call') {
      sessionService.recordToolCall(sessionId);
    }

    const isToolCall = req.body?.method === 'tools/call';
    const toolCallStart = isToolCall ? Date.now() : undefined;
    if (isToolCall) {
      logger.info('TOOL_CALL_TRANSPORT_START', {
        event: 'TOOL_CALL_TRANSPORT_START',
        toolName: req.body?.params?.name,
        jsonRpcId: req.body?.id,
        sessionId,
        userId: req.auth?.extra?.user?.id,
        traceId: getTraceId(),
      });
    }

    await session.transport.handleRequest(req, res, req.body);

    if (isToolCall && toolCallStart !== undefined) {
      logger.info('TOOL_CALL_TRANSPORT_AWAIT_RESOLVED', {
        event: 'TOOL_CALL_TRANSPORT_AWAIT_RESOLVED',
        toolName: req.body?.params?.name,
        jsonRpcId: req.body?.id,
        awaitDurationMs: Date.now() - toolCallStart,
        sessionId,
        userId: req.auth?.extra?.user?.id,
        traceId: getTraceId(),
      });
    }

    if (req.method === 'DELETE') {
      sessionService.destroySession(sessionId);
    }
  } catch (err) {
    const sessionId = getOrCreateSessionId(req);

    // Record error in session metrics
    if (sessionId) {
      sessionService.recordError(sessionId);
    }

    logger.error('❌ Error in handleSessionRequest', {
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      method: req.method,
      url: req.url,
      sessionId,
    });

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
}

app.post(
  '/',
  authErrorLogger,
  authWithAbsoluteMetadata,
  addMcpSessionId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sessionId = getOrCreateSessionId(req);
      const session = sessionService.getSession(sessionId);

      // Reuse existing session
      if (session) {
        // Check if session is expired
        if (sessionService.isSessionExpired(sessionId)) {
          logger.warn('Session expired, destroying and creating new one', {
            sessionId,
          });
          sessionService.destroySession(sessionId);
        } else {
          // Record interaction and reuse session
          // Don't record interaction for tool calls as they'll be recorded separately
          if (req.body?.method !== 'tools/call') {
            sessionService.recordInteraction(sessionId);
          }
          await handleSessionRequest(req, res, session);
          return;
        }
      }

      // Create New Session
      if (isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => getOrCreateSessionId(req),
          onsessioninitialized: (sessionId: string) => {
            logger.info('✅ New session initialized');

            try {
              sessionService.createSession(transport!, req, sessionId);
            } catch (error) {
              logger.error('❌ Failed to create session', {
                error: error instanceof Error ? error.message : String(error),
              });
              // Close transport if session creation fails
              transport.close();
            }
          },
          enableJsonResponse: true,
        });

        transport.onclose = () => {
          logger.debug('🔌 Transport closed', {
            event: 'MCP_TRANSPORT_CLOSED',
            sessionId: transport.sessionId,
          });
          if (transport.sessionId) {
            sessionService.destroySession(transport.sessionId);
          }
        };

        // Add error handling for the transport
        transport.onerror = (error) => {
          logger.error('🔴 Transport error', {
            event: 'MCP_TRANSPORT_ERROR',
            sessionId: transport.sessionId,
            error: {
              message: error.message,
              name: error.name,
            },
          });

          // Record error in session metrics
          if (transport.sessionId) {
            sessionService.recordError(transport.sessionId);
          }
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
  authWithAbsoluteMetadata,
  addMcpSessionId,
  handleSessionRequestGetDelete,
);
app.delete(
  '/',
  authErrorLogger,
  authWithAbsoluteMetadata,
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
      const isSseGet = req.method === 'GET';
      logger.warn(
        isSseGet
          ? 'MCP SSE GET: session not in store (404 — client should reinitialize)'
          : 'Session not in store (404)',
        {
          event: 'MCP_SSE_SESSION_GONE',
          reason: 'not_in_store',
          httpMethod: req.method,
          sessionId,
          userId: req.auth?.extra?.user?.id,
          traceId: getTraceId(),
          hint: isSseGet
            ? 'Idle TTL elapsed, max wall-clock age reached, cleanup, or never initialized.'
            : undefined,
        },
      );
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

    // Check if session is expired
    if (sessionService.isSessionExpired(sessionId)) {
      logger.warn('MCP session expired (metrics); destroying', {
        event: 'MCP_SSE_SESSION_GONE',
        reason: 'expired',
        httpMethod: req.method,
        sessionId,
        userId: req.auth?.extra?.user?.id,
        traceId: getTraceId(),
      });
      sessionService.destroySession(sessionId);
      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: 404,
          message: 'Session expired. Please reinitialize.',
        },
        id: null,
      });
      return;
    }

    updateRequestContext({
      sessionId: sessionId || undefined,
      userId: req.auth?.extra?.user?.id,
    });

    // Record interaction for metrics
    // Don't record interaction for tool calls as they'll be recorded separately
    if (req.body?.method !== 'tools/call') {
      sessionService.recordInteraction(sessionId);
    }

    await session.transport.handleRequest(req, res, req.body);

    if (req.method === 'DELETE') {
      sessionService.destroySession(sessionId);
    }
  } catch (err) {
    const sessionIdForErr = getOrCreateSessionId(req);

    // Record error in session metrics
    if (sessionIdForErr) {
      sessionService.recordError(sessionIdForErr);
    }

    logger.error('❌ Error in handleSessionRequestGetDelete', {
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      method: req.method,
      url: req.url,
      sessionId: sessionIdForErr,
    });

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
}

let heartbeatInterval: NodeJS.Timeout | undefined;

function shutdown() {
  logger.info('🛑 Shutting down HTTP MCP Server...');

  // Clear the heartbeat interval if it exists
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  // Clean up all sessions using the enhanced service
  const totalSessions = sessionService.getSessionCount();
  logger.info('Cleaning up sessions before shutdown', { totalSessions });

  sessionService.clearAllSessions();

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.once('SIGUSR2', () => {
  logger.info('SIGUSR2 received, shutting down...');
  shutdown();
  process.kill(process.pid, 'SIGUSR2');
});

// Only start the server and heartbeat when not in test environment
if (!isTestEnvironment()) {
  // Start server
  const PORT = env.PORT || 3005;
  const serverInstance = app.listen(PORT, async () => {
    // Initialize Carbon Voice API health status
    const status = await getCarbonVoiceApiStatus();
    carbonVoiceApiHealth = {
      ...status,
      lastChecked: new Date().toISOString(),
    };

    // Initialize and start session cleanup service
    const sessionConfig = SessionConfig.fromEnv();
    const sessionLogger = new SessionLogger();
    const sessionCleanupService = new SessionCleanupService(
      sessionService,
      sessionConfig,
      sessionLogger,
    );
    sessionCleanupService.start();

    logger.info('🚀 HTTP MCP Server started', {
      port: PORT,
      carbonVoiceApiHealth,
      sessionConfig: {
        ttlMs: sessionConfig.ttlMs,
        maxSessions: sessionConfig.maxSessions,
        cleanupIntervalMs: sessionConfig.cleanupIntervalMs,
        maxWallClockAgeMs: sessionConfig.maxWallClockAgeMs,
      },
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
  heartbeatInterval = setInterval(async () => {
    const status = await getCarbonVoiceApiStatus();
    // Update Carbon Voice API health cache
    carbonVoiceApiHealth = {
      isHealthy: status.isHealthy,
      apiUrl: status.apiUrl,
      lastChecked: new Date().toISOString(),
      ...(status.error && { error: status.error }),
    };
    const icon = carbonVoiceApiHealth.isHealthy ? '🟢' : '🔴';

    const logArgs = {
      totalSessions: sessionService.getAllSessionIds().length,
      isCarbonVoiceApiWorking: carbonVoiceApiHealth.isHealthy,
      uptime: getProcessUptime(),
      memoryUsage: process.memoryUsage(),
      carbonVoiceApiHealth,
    };

    logger.info(`💓 Server heartbeat ${icon}`, logArgs);
  }, 30000);
}

export default app;
