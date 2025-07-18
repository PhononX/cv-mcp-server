import { NextFunction, Request, Response } from 'express';

import { logger } from '../../../utils';
import { getOrCreateSessionId } from '../utils';

export const addMcpSessionId = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let sessionId = req.headers['mcp-session-id'] as string | undefined;
  const requestHadSessionId = !!sessionId;
  if (!requestHadSessionId) {
    logger.debug('❗Request has no session ID, Adding one to the request');
    sessionId = getOrCreateSessionId(req);
    req.headers['mcp-session-id'] = sessionId;
  }

  if (!res.getHeader('mcp-session-id')) {
    logger.debug('⬅️ Response has no session ID, Adding one to the response');
    res.setHeader('mcp-session-id', sessionId!);
  }

  logger.debug('Session ID Middleware', {
    sessionId,
    requestHadSessionId,
  });
  next();
};
