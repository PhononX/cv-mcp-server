import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '../../../auth/interfaces';
import { logger } from '../../../utils';
import { sessionService } from '../session';
import { getOrCreateSessionId } from '../utils';

export const addMcpSessionId = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const sessionId = getOrCreateSessionId(req);
  const session = sessionService.getSession(sessionId);
  const requestHadSessionId = !!req.headers['mcp-session-id'];

  const logArgs = {
    action: 'addMcpSessionId',
    sessionId,
    userId: req.auth?.extra?.user?.id,
    requestHadSessionId,
    createdAt: session?.metrics.createdAt.toISOString(),
    expiresAt: session?.metrics.expiresAt.toISOString(),
    totalInteractions: session?.metrics.totalInteractions,
    totalToolCalls: session?.metrics.totalToolCalls,
    lastActivityAt: session?.metrics.lastActivityAt.toISOString(),
    errorCount: session?.metrics.errorCount,
  };

  // Only log when there are issues or when session ID is missing
  if (!requestHadSessionId) {
    logger.debug('Request missing session ID, adding one', logArgs);
    req.headers['mcp-session-id'] = sessionId;
  }

  if (!res.getHeader('mcp-session-id')) {
    logger.debug('Response missing session ID, adding one', logArgs);
    res.setHeader('mcp-session-id', sessionId!);
  }

  // Record interaction for metrics (but don't log every time)
  if (session) {
    sessionService.recordInteraction(sessionId);
  }

  next();
};
