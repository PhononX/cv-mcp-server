import { NextFunction, Request, Response } from 'express';

import { AuthenticatedRequest } from '../../../auth/interfaces';
import { env } from '../../../config';
import { formatBytesHuman, logger, timeToHuman } from '../../../utils';
import { sessionService } from '../session';
import { getSessionId } from '../utils';
import { extractClientInfo } from '../utils/extract-client-info';

const ignorePaths = ['/health', '/favicon.ico'];

export const logRequest = (req: Request, res: Response, next: NextFunction) => {
  // Skip logging for certain routes
  if (ignorePaths.includes(req.url)) {
    return next();
  }

  const start = Date.now();
  const reqWithId = req as Request & { id?: string };
  const isToolCallRequest = req.method === 'POST' && req.body?.method === 'tools/call';

  if (isToolCallRequest) {
    const originalEnd = res.end.bind(res);
    res.end = ((...args: unknown[]) => {
      const chunk = args[0];
      const responseBytes =
        typeof chunk === 'string'
          ? Buffer.byteLength(chunk, 'utf8')
          : Buffer.isBuffer(chunk)
            ? chunk.length
            : chunk instanceof Uint8Array
              ? chunk.byteLength
              : undefined;

      logger.info('MCP_RESPONSE_WRITE_START', {
        event: 'MCP_RESPONSE_WRITE_START',
        toolName: req.body?.params?.name,
        jsonRpcId: req.body?.id,
        sessionId: getSessionId(req as AuthenticatedRequest),
        userId: (req as AuthenticatedRequest).auth?.extra?.user?.id,
        traceId: reqWithId.id,
        statusCode: res.statusCode,
        headersSent: res.headersSent,
        writableEnded: res.writableEnded,
        ...(responseBytes !== undefined && {
          responseBytes,
          responseSizeHuman: formatBytesHuman(responseBytes),
        }),
      });

      return originalEnd(...(args as Parameters<Response['end']>));
    }) as Response['end'];
  }

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const url = req.url;
    const statusCode = res.statusCode;
    const durationText = timeToHuman(duration, 'ms');
    const clientInfo = extractClientInfo(req as AuthenticatedRequest);
    logger.info(`HTTP ${method} ${url} ${statusCode} ${durationText}`, {
      method,
      url,
      statusCode,
      duration,
      clientInfo,
      body: req.body,
    });

    if (method === 'POST' && req.body?.method === 'tools/call') {
      const sessionId = getSessionId(req as AuthenticatedRequest);
      logger.info('TOOL_CALL_HTTP_COMPLETE', {
        event: 'TOOL_CALL_HTTP_COMPLETE',
        toolName: req.body?.params?.name,
        jsonRpcId: req.body?.id,
        durationMs: duration,
        statusCode,
        sessionId,
        userId: (req as AuthenticatedRequest).auth?.extra?.user?.id,
        traceId: reqWithId.id,
        clientInfo,
      });
    }

    // Log session metrics (skipped when MCP_SESSION_LOGS_ENABLED=false,
    // e.g. when running the stateless transport).
    if (env.MCP_SESSION_LOGS_ENABLED) {
      const sessionId = getSessionId(req as AuthenticatedRequest);
      if (sessionId) {
        if (req.body?.method === 'tools/call') {
          sessionService.logSessionMetrics(sessionId);
        } else {
          // Log metrics for regular interactions every 10 interactions
          const metrics = sessionService.getSessionMetrics(sessionId);
          if (metrics && metrics.totalInteractions % 10 === 0) {
            sessionService.logSessionMetrics(sessionId);
          }
        }
      }
    }
  });

  next();
};
