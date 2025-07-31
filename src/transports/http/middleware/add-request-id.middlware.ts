import { NextFunction, Request, Response } from 'express';

import {
  createRequestContext,
  generateTraceId,
  runWithContext,
} from '../utils/request-context';

export const addRequestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Generate trace ID that serves as both traceId and requestId
  const traceId = generateTraceId();
  (req as Request & { id: string }).id = traceId;

  // Set both headers for compatibility
  res.set('X-Request-ID', traceId);
  res.set('X-Trace-ID', traceId);

  // Create request context with trace ID
  const context = createRequestContext();

  // Run the rest of the middleware chain with context
  runWithContext(context, () => {
    next();
  });
};
