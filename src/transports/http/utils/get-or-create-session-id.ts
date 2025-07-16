import crypto from 'crypto';

import { AuthenticatedRequest } from '../../../auth';

const createSessionId = (req: AuthenticatedRequest): string => {
  if (!req?.auth?.token) {
    throw new Error('Cannot create session ID without a token');
  }

  const hash = crypto
    .createHash('md5')
    .update(req.auth.token)
    .digest('hex')
    .substring(0, 10);

  return `mcp_${hash}`;
};

export const getOrCreateSessionId = (req: AuthenticatedRequest) => {
  return (
    (req.headers['mcp-session-id'] as string | undefined) ||
    createSessionId(req)
  );
};

export const getSessionId = (req: AuthenticatedRequest) => {
  return req.headers['mcp-session-id'] as string | undefined;
};
