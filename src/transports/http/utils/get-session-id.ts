import { Request } from 'express';

export const getSessionId = (req: Request) => {
  return req.headers['mcp-session-id'] as string | undefined;
};
