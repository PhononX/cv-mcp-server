import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '../../../auth/interfaces';
import { logger } from '../../../utils';
import { sessionService } from '../session';
import { getOrCreateSessionId } from '../utils';
import { getTraceId, updateRequestContext } from '../utils/request-context';

export const addMcpSessionId = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const sessionId = getOrCreateSessionId(req);
  const userId = req.auth?.extra?.user?.id;

  // Update request context with session and user info
  updateRequestContext({
    sessionId,
    userId,
  });

  // Check if session ID was missing from request
  const requestHadSessionId = !!req.headers['mcp-session-id'];

  // Add session ID to request headers
  req.headers['mcp-session-id'] = sessionId;

  // Add session ID to response headers for client tracking
  res.setHeader('mcp-session-id', sessionId);

  // Add trace ID to response headers for client tracking
  res.setHeader('X-Trace-ID', getTraceId() || 'N/A');

  // Record interaction for metrics
  sessionService.recordInteraction(sessionId);

  // Only log when session ID was missing from request
  if (!requestHadSessionId) {
    logger.debug('🔗 Session ID added to request', {
      event: 'SESSION_ID_ADDED',
      requestHadSessionId: Boolean(requestHadSessionId),
    });
  }

  next();
};
