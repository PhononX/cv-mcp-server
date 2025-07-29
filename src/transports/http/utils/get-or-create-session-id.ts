import crypto from 'crypto';

import { AuthenticatedRequest } from '../../../auth/interfaces';

const createSessionId = (): string => {
  return `mcp_${crypto.randomUUID()}`;
};

export const getOrCreateSessionId = (req: AuthenticatedRequest) => {
  return (
    (req.headers['mcp-session-id'] as string | undefined) || createSessionId()
  );
};

export const getSessionId = (req: AuthenticatedRequest) => {
  return req.headers['mcp-session-id'] as string | undefined;
};
