import { NextFunction, Request, Response } from 'express';

import { getOrCreateSessionId } from '../utils';

export const addMcpSessionId = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.headers['mcp-session-id']) {
    const deviceId = getOrCreateSessionId(req);
    req.headers['mcp-session-id'] = deviceId;
  }

  next();
};
