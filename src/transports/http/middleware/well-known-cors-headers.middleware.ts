import { NextFunction, Request, Response } from 'express';

/**
 * Set CORS headers for the response for .well-know routes
 * @param req - The request object
 * @param res - The response object
 * @param next - The next function
 */
export const wellKnownCorsHeaders = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Expose-Headers', 'WWW-Authenticate');
  next();
};
