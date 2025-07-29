import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '../../../auth/interfaces';
import { logger } from '../../../utils';
import { sessionService } from '../session.service';
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
  };

  logger.debug('Session ID Middleware', logArgs);
  if (!requestHadSessionId) {
    logger.debug(
      '❗Request has no session ID, Adding one to the request',
      logArgs,
    );
    req.headers['mcp-session-id'] = sessionId;
  }

  if (!res.getHeader('mcp-session-id')) {
    logger.debug(
      '⬅️ Response has no session ID, Adding one to the response',
      logArgs,
    );
    res.setHeader('mcp-session-id', sessionId!);
  }

  next();
};
