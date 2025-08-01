import { NextFunction, Request, Response } from 'express';

import { AuthenticatedRequest } from '../../../auth/interfaces';
import { logger, timeToHuman } from '../../../utils';
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

    // Then log session metrics
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
  });

  next();
};
