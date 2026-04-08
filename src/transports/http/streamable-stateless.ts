#!/usr/bin/env node
/**
 * Stateless HTTP MCP transport.
 *
 * Every POST creates a fresh transport, connects the MCP server to it,
 * handles the request, and closes.  No session store, no queue, no TTL
 * cleanup service.  Horizontal scaling (MaxSize > 1) is safe because there
 * is no shared in-process state between requests.
 *
 * Why stateless fixes the 120 s timeout cascade:
 *   In the session-based transport, all requests for the same session are
 *   serialized through a per-session queue.  If Cursor fires several RPCs
 *   concurrently (initialize + tools/list + tools/call), each one queues
 *   behind the previous one.  A 40 s tool call in slot 1 pushes slot 3 to
 *   ~120 s total wait → client timeout → MCP_TRANSPORT_SEND_ERROR cascade.
 *   In stateless mode every request runs concurrently at its natural speed.
 *
 * What is lost vs the session transport:
 *   • SSE server-to-client push (GET /) — not used by this server today.
 *   • Per-session request serialization — was causing the timeout cascade,
 *     so losing it is the desired outcome.
 */
import fs from 'fs';
import path from 'path';

import cors from 'cors';
import express, { Response } from 'express';
import helmet from 'helmet';
import { finished } from 'node:stream/promises';
import serveFavicon from 'serve-favicon';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

import { REQUIRED_SCOPES } from './constants';
import { ApiHealthStatus } from './interfaces';
import {
  addRequestIdMiddleware,
  authErrorLogger,
  logRequest,
  oauthAuthorizationServer,
  oauthProtectedResource,
  rateLimitMiddleware,
  requireBearerAuthWithAbsoluteMetadata,
  wellKnownCorsHeaders,
} from './middleware';
import { getTraceId, updateRequestContext } from './utils/request-context';

import { createOAuthTokenVerifier } from '../../auth';
import { AuthenticatedRequest } from '../../auth/interfaces';
import { env, isTestEnvironment } from '../../config';
import { getCarbonVoiceApiStatus } from '../../cv-api';
import { createMcpServer } from '../../server';
import { getProcessUptime, logger } from '../../utils';

const app = express();

app.set('x-powered-by', false);
// Trust proxy for rate limiting — only localhost and private networks
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

const faviconPath = path.join(process.cwd(), 'public', 'favicon.ico');
if (fs.existsSync(faviconPath)) {
  app.use(serveFavicon(faviconPath));
}

app.use(cors());
app.use(helmet());
app.use(rateLimitMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(addRequestIdMiddleware);
app.use(logRequest);

let carbonVoiceApiHealth: ApiHealthStatus = {
  isHealthy: isTestEnvironment() ? true : false,
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

// ── Health / info ─────────────────────────────────────────────────────────────

app.get('/health', (req, res: Response) => {
  const response = {
    status: carbonVoiceApiHealth.isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: getProcessUptime(),
    dependencies: {
      carbonVoiceApi: {
        status: carbonVoiceApiHealth.isHealthy ? 'healthy' : 'unhealthy',
        lastChecked: carbonVoiceApiHealth.lastChecked,
        ...(carbonVoiceApiHealth.error && { error: carbonVoiceApiHealth.error }),
      },
    },
  };

  const logLevel = carbonVoiceApiHealth.isHealthy ? 'info' : 'warn';
  logger[logLevel]('Health check', response);

  res.status(carbonVoiceApiHealth.isHealthy ? 200 : 503).json(response);
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

// ── OAuth well-known ──────────────────────────────────────────────────────────

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

// ── HEAD — capability discovery without auth ──────────────────────────────────

app.head('/', (req, res) => {
  const mcpProtocolVersion =
    req.headers['mcp-protocol-version'] || LATEST_PROTOCOL_VERSION;

  res
    .status(200)
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', String(mcpProtocolVersion))
    .end();
});

// ── POST — stateless MCP handler (one transport per request) ──────────────────

app.post(
  '/',
  authErrorLogger,
  authWithAbsoluteMetadata,
  async (req: AuthenticatedRequest, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: no mcp-session-id header emitted
      enableJsonResponse: true,
    });

    updateRequestContext({ userId: req.auth?.extra?.user?.id });

    const jsonRpcMethod = (req.body as { method?: string })?.method;
    const jsonRpcId = (req.body as { id?: number | string })?.id;
    const requestStartedAt = Date.now();

    logger.info('MCP_REQUEST_START', {
      event: 'MCP_REQUEST_START',
      jsonRpcMethod,
      jsonRpcId,
      toolName: (req.body as { params?: { name?: string } })?.params?.name,
      traceId: getTraceId(),
      userId: req.auth?.extra?.user?.id,
    });

    // Single-fire close guard so transport.close() is never called twice.
    let transportClosed = false;
    const closeTransport = () => {
      if (!transportClosed) {
        transportClosed = true;
        transport.close();
      }
    };

    // If the client disconnects before the response is ready (e.g. its own
    // 120 s timeout fires), close the transport immediately so the in-flight
    // tool call is aborted rather than continuing to completion and then
    // failing with MCP_TRANSPORT_SEND_ERROR.
    const onClientClose = () => {
      if (!res.headersSent) {
        logger.warn('MCP_CLIENT_DISCONNECTED', {
          event: 'MCP_CLIENT_DISCONNECTED',
          jsonRpcMethod,
          jsonRpcId,
          elapsedMs: Date.now() - requestStartedAt,
          traceId: getTraceId(),
          userId: req.auth?.extra?.user?.id,
        });
        closeTransport();
      }
    };
    req.on('close', onClientClose);

    const requestServer = createMcpServer();

    try {
      await requestServer.connect(transport);
      await transport.handleRequest(req, res, req.body);

      logger.info('MCP_REQUEST_DONE', {
        event: 'MCP_REQUEST_DONE',
        jsonRpcMethod,
        jsonRpcId,
        elapsedMs: Date.now() - requestStartedAt,
        traceId: getTraceId(),
        userId: req.auth?.extra?.user?.id,
      });
    } catch (error) {
      logger.error('❌ Error handling MCP request (stateless)', {
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        jsonRpcMethod,
        jsonRpcId,
        userId: req.auth?.extra?.user?.id,
        traceId: getTraceId(),
      });

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: jsonRpcId ?? null,
        });
      }
    } finally {
      req.off('close', onClientClose);
      // StreamableHTTPServerTransport.handlePostRequest() returns before the MCP
      // server calls transport.send(). enableJsonResponse mode sets Content-Type
      // inside send(). Closing the transport here immediately would end res early
      // with no body / no Content-Type → Cursor: "Unexpected content type: null".
      try {
        await finished(res);
      } catch {
        // Client may have aborted; response may already be torn down.
      }
      closeTransport();
    }
  },
);

// ── GET / DELETE — not applicable in stateless mode ───────────────────────────

const sseNotSupported = (req: AuthenticatedRequest, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message:
        'This server runs in stateless mode. ' +
        'SSE and session termination are not supported. Use POST for all MCP requests.',
    },
    id: null,
  });
};

app.get('/', authErrorLogger, authWithAbsoluteMetadata, sseNotSupported);
app.delete('/', authErrorLogger, authWithAbsoluteMetadata, sseNotSupported);

// ── Shutdown ──────────────────────────────────────────────────────────────────

let heartbeatInterval: NodeJS.Timeout | undefined;

function shutdown() {
  logger.info('🛑 Shutting down HTTP MCP Server (stateless)...');
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.once('SIGUSR2', () => {
  logger.info('SIGUSR2 received, shutting down...');
  shutdown();
  process.kill(process.pid, 'SIGUSR2');
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (!isTestEnvironment()) {
  const PORT = env.PORT || 3005;
  const serverInstance = app.listen(PORT, async () => {
    const status = await getCarbonVoiceApiStatus();
    carbonVoiceApiHealth = {
      ...status,
      lastChecked: new Date().toISOString(),
    };

    logger.info('🚀 HTTP MCP Server started (stateless mode)', {
      port: PORT,
      mode: 'stateless',
      carbonVoiceApiHealth,
    });
  });

  serverInstance.on('error', (error) => {
    logger.error('❌ Error on MCP HTTP Server', { error });
  });

  process.on('uncaughtException', (error) => {
    logger.error('🚨 Uncaught Exception detected', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      processId: process.pid,
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('🚨 Unhandled Promise Rejection detected', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
      processId: process.pid,
    });
  });

  heartbeatInterval = setInterval(async () => {
    const status = await getCarbonVoiceApiStatus();
    carbonVoiceApiHealth = {
      isHealthy: status.isHealthy,
      apiUrl: status.apiUrl,
      lastChecked: new Date().toISOString(),
      ...(status.error && { error: status.error }),
    };

    const icon = carbonVoiceApiHealth.isHealthy ? '🟢' : '🔴';
    logger.info(`💓 Server heartbeat ${icon} (stateless)`, {
      isCarbonVoiceApiWorking: carbonVoiceApiHealth.isHealthy,
      uptime: getProcessUptime(),
      memoryUsage: process.memoryUsage(),
      carbonVoiceApiHealth,
      mode: 'stateless',
    });
  }, 30000);
}

export default app;
