import { NextFunction, Request, Response } from 'express';

import { AuthenticatedRequest } from '../../../auth';
import { logger } from '../../../utils';
import { getSessionId } from '../utils';

const ignorePaths = ['/health', '/favicon.ico'];

export const logRequest = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // Skip logging for certain routes
  if (ignorePaths.includes(req.url)) {
    return next();
  }

  // Log when response finishes
  res.on('finish', () => {
    const responseTime = Date.now() - start;

    logger.info(
      `HTTP ${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`,
      {
        userId: (req as AuthenticatedRequest).auth?.extra?.user?.id,
        sessionId: getSessionId(req as AuthenticatedRequest),
        requestId: (req as Request & { id: string }).id,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime: responseTime,
        body: req.body,
      },
    );
  });

  next();
};
