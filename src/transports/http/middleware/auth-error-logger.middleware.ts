import { NextFunction, Request, Response } from 'express';

import { logger } from '../../../utils';
import { obfuscateAuthHeaders } from '../../../utils/obfuscate-auth-headers';
import { getSessionId } from '../utils';

// Standalone JSON rewrite middleware for logging auth errors
export const authErrorLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Override json method to intercept error responses
  const originalJson = res.json.bind(res);
  res.json = function (data: unknown) {
    // Only log if it's an error response
    if (
      res.statusCode >= 400 &&
      data &&
      typeof data === 'object' &&
      'error' in data
    ) {
      logger.error('Authentication error', {
        sessionId: getSessionId(req),
        url: req.url,
        method: req.method,
        statusCode: res.statusCode,
        headers: obfuscateAuthHeaders(req.headers),
        error: data,
      });
    }

    return originalJson(data);
  };

  next();
};
