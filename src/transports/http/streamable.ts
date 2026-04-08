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

import { REQUIRED_SCOPES } from './constants';
import { createTransportSendDiagnostics } from './diagnostics/transport-send-diagnostics';
import { ApiHealthStatus } from './interfaces';
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
} from './middleware';
import {
  Session,
  SessionCleanupService,
  SessionLogger,
  sessionService,
  toolCallQueueService,
  ToolCallQueueTimeoutError,
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
// TODO: REMOVE THIS AFTER DEBUGGING
const transportDiagnostics = createTransportSendDiagnostics({
  enabled: env.MCP_TRANSPORT_DIAGNOSTICS_ENABLED,
});

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
      transportDiagnostics.trackToolCall(sessionId, req.body?.id, {
        toolName: req.body?.params?.name,
        traceId: getTraceId(),
        userId: req.auth?.extra?.user?.id,
      });

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
      toolCallQueueService.clearSession(sessionId);
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

/**
 * TEMPORARY INCIDENT MITIGATION (Phase 3 guardrail)
 *
 * Why this is in streamable.ts for now:
 * - This logic depends on request/response objects plus session/transport cleanup
 *   that currently live in this file.
 * - We are keeping the hotfix close to the route boundary while validating in prod.
 *
 * Planned follow-up:
 * - Extract this block into a dedicated transport orchestration module once production
 *   evidence confirms the incident is resolved.
 * - Keep behavior identical during extraction (no functional changes).
 */
const hasJsonRpcRequestId = (body: unknown): boolean => {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const candidate = body as { id?: unknown };
  return candidate.id !== undefined && candidate.id !== null;
};

const getJsonRpcMethod = (body: unknown): string | undefined => {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const candidate = body as { method?: unknown };
  return typeof candidate.method === 'string' ? candidate.method : undefined;
};

const destroySessionTransportState = (sessionId: string): void => {
  transportDiagnostics.clearSession(sessionId);
  toolCallQueueService.clearSession(sessionId);
  sessionService.destroySession(sessionId);
};

/**
 * TEMPORARY SAFETY TIMEOUT FOR REUSED SESSION TRANSPORT CALLS.
 *
 * Removes indefinite hangs when transport.handleRequest() never resolves under
 * high concurrency/race conditions. On timeout we fail deterministically and
 * clear session-bound transport state so the client can reinitialize.
 *
 * Remove after:
 * - Root cause is permanently fixed in transport/session lifecycle; and
 * - production can run without timeout-driven cleanup for a sustained window.
 */
const executeSessionRequestWithTimeout = async (
  req: AuthenticatedRequest,
  res: Response,
  session: Session,
  sessionId: string,
): Promise<void> => {
  const executionTimeoutMs = env.MCP_TRANSPORT_EXECUTION_TIMEOUT_MS;
  const jsonRpcMethod = getJsonRpcMethod(req.body);
  const jsonRpcId = hasJsonRpcRequestId(req.body)
    ? (req.body as { id?: number | string }).id
    : undefined;
  const executionStartedAt = Date.now();

  const handleRequestPromise = handleSessionRequest(req, res, session);

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timeoutHandle = setTimeout(() => resolve('timeout'), executionTimeoutMs);
  });

  // Detect client-side disconnect (e.g. the MCP client's ~120s HTTP timeout
  // fires before the server can respond). This lets us clean up immediately
  // instead of waiting for the server-side timeout and the subsequent
  // MCP_TRANSPORT_SEND_ERROR cascade.
  let removeDisconnectListener: (() => void) | undefined;
  const clientDisconnectedPromise = new Promise<'client_disconnected'>(
    (resolve) => {
      const onClose = () => resolve('client_disconnected');
      req.on('close', onClose);
      removeDisconnectListener = () => req.off('close', onClose);
    },
  );

  const outcome = await Promise.race([
    handleRequestPromise.then(() => 'completed' as const),
    timeoutPromise,
    clientDisconnectedPromise,
  ]);

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  removeDisconnectListener?.();

  if (outcome === 'completed') {
    return;
  }

  if (outcome === 'client_disconnected') {
    logger.warn('MCP_CLIENT_DISCONNECTED', {
      event: 'MCP_CLIENT_DISCONNECTED',
      sessionId,
      jsonRpcId,
      jsonRpcMethod,
      elapsedMs: Date.now() - executionStartedAt,
      traceId: getTraceId(),
      userId: req.auth?.extra?.user?.id,
    });

    sessionService.recordError(sessionId);
    destroySessionTransportState(sessionId);

    // Connection is already gone — no response can be sent.
    void handleRequestPromise.catch((error) => {
      logger.warn('MCP_CLIENT_DISCONNECTED_LATE_REJECTION', {
        event: 'MCP_CLIENT_DISCONNECTED_LATE_REJECTION',
        sessionId,
        jsonRpcId,
        jsonRpcMethod,
        traceId: getTraceId(),
        userId: req.auth?.extra?.user?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  logger.warn('MCP_TRANSPORT_EXECUTION_TIMEOUT', {
    event: 'MCP_TRANSPORT_EXECUTION_TIMEOUT',
    sessionId,
    jsonRpcId,
    jsonRpcMethod,
    executionTimeoutMs,
    elapsedMs: Date.now() - executionStartedAt,
    traceId: getTraceId(),
    userId: req.auth?.extra?.user?.id,
  });

  sessionService.recordError(sessionId);
  destroySessionTransportState(sessionId);

  if (!res.headersSent) {
    if (jsonRpcId !== undefined) {
      res.status(200).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'Request timed out while processing previous session transport work. Please retry.',
        },
        id: jsonRpcId,
      });
    } else {
      // Notifications are best-effort and do not require a JSON-RPC response.
      res.status(202).end();
    }
  }

  void handleRequestPromise.catch((error) => {
    logger.warn('MCP_TRANSPORT_EXECUTION_LATE_REJECTION', {
      event: 'MCP_TRANSPORT_EXECUTION_LATE_REJECTION',
      sessionId,
      jsonRpcId,
      jsonRpcMethod,
      traceId: getTraceId(),
      userId: req.auth?.extra?.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};

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
          transportDiagnostics.attach(session.transport);
          const shouldSerializeSessionRequest =
            req.method === 'POST' &&
            !isInitializeRequest(req.body);
          if (shouldSerializeSessionRequest) {
            const queueTimeoutMs = env.MCP_SESSION_REQUEST_QUEUE_TIMEOUT_MS;
            const jsonRpcMethod = getJsonRpcMethod(req.body);
            const jsonRpcId = hasJsonRpcRequestId(req.body)
              ? (req.body as { id?: number | string }).id
              : undefined;
            let releaseToolCallSlot: (() => void) | undefined;
            try {
              const { release, waitDurationMs } =
                await toolCallQueueService.acquire(sessionId, queueTimeoutMs);
              releaseToolCallSlot = release;

              logger.info('SESSION_REQUEST_QUEUE_ACQUIRED', {
                event: 'SESSION_REQUEST_QUEUE_ACQUIRED',
                sessionId,
                jsonRpcId,
                jsonRpcMethod,
                toolName: req.body?.params?.name,
                waitDurationMs,
                queueTimeoutMs,
                traceId: getTraceId(),
                userId: req.auth?.extra?.user?.id,
              });

              if (jsonRpcMethod === 'tools/call') {
                // Backward compatible event kept for existing dashboards.
                logger.info('TOOL_CALL_QUEUE_ACQUIRED', {
                  event: 'TOOL_CALL_QUEUE_ACQUIRED',
                  sessionId,
                  jsonRpcId,
                  toolName: req.body?.params?.name,
                  waitDurationMs,
                  queueTimeoutMs,
                  traceId: getTraceId(),
                  userId: req.auth?.extra?.user?.id,
                });
              }

              // Re-fetch the session after waiting in queue: the previous
              // request may have timed out and destroyed the session while
              // this request was waiting for its slot.
              const freshSession = sessionService.getSession(sessionId);
              if (!freshSession) {
                const jsonRpcId2 = hasJsonRpcRequestId(req.body)
                  ? (req.body as { id?: number | string }).id
                  : undefined;
                logger.warn('SESSION_DESTROYED_WHILE_QUEUED', {
                  event: 'SESSION_DESTROYED_WHILE_QUEUED',
                  sessionId,
                  jsonRpcId: jsonRpcId2,
                  jsonRpcMethod,
                  traceId: getTraceId(),
                  userId: req.auth?.extra?.user?.id,
                });
                if (!res.headersSent) {
                  if (jsonRpcId2 !== undefined) {
                    res.status(200).json({
                      jsonrpc: '2.0',
                      error: {
                        code: -32001,
                        message:
                          'Session was destroyed while request was queued. Please reinitialize.',
                      },
                      id: jsonRpcId2,
                    });
                  } else {
                    res.status(404).json({
                      jsonrpc: '2.0',
                      error: {
                        code: 404,
                        message: 'Session not found. Please reinitialize.',
                      },
                      id: null,
                    });
                  }
                }
                return;
              }
              await executeSessionRequestWithTimeout(req, res, freshSession, sessionId);
            } catch (error) {
              if (error instanceof ToolCallQueueTimeoutError) {
                logger.warn('SESSION_REQUEST_QUEUE_TIMEOUT', {
                  event: 'SESSION_REQUEST_QUEUE_TIMEOUT',
                  sessionId,
                  jsonRpcId,
                  jsonRpcMethod,
                  toolName: req.body?.params?.name,
                  queueTimeoutMs,
                  traceId: getTraceId(),
                  userId: req.auth?.extra?.user?.id,
                });

                if (jsonRpcMethod === 'tools/call') {
                  // Backward compatible event kept for existing dashboards.
                  logger.warn('TOOL_CALL_QUEUE_TIMEOUT', {
                    event: 'TOOL_CALL_QUEUE_TIMEOUT',
                    sessionId,
                    jsonRpcId,
                    toolName: req.body?.params?.name,
                    queueTimeoutMs,
                    traceId: getTraceId(),
                    userId: req.auth?.extra?.user?.id,
                  });
                }

                if (!res.headersSent) {
                  if (jsonRpcId !== undefined) {
                    res.status(200).json({
                      jsonrpc: '2.0',
                      error: {
                        code: -32001,
                        message:
                          'Request timed out while waiting for previous request in this session.',
                      },
                      id: jsonRpcId,
                    });
                  } else {
                    res.status(202).end();
                  }
                }
              } else {
                throw error;
              }
            } finally {
              releaseToolCallSlot?.();
            }
          } else {
            await handleSessionRequest(req, res, session);
          }
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
            transportDiagnostics.clearSession(transport.sessionId);
            toolCallQueueService.clearSession(transport.sessionId);
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

        transportDiagnostics.attach(transport);
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
      toolCallQueueService.clearSession(sessionId);
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
