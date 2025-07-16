import { NextFunction, Request, Response } from 'express';

export const addRequestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestId = crypto.randomUUID();
  (req as Request & { id: string }).id = requestId;

  res.set('X-Request-ID', requestId);

  next();
};
