import { Request } from 'express';

import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

import { User } from '.';

type ExtraAuthInfo = Record<string, unknown> & {
  user?: User;
};

export interface AuthInfoWithUser extends AuthInfo {
  extra?: ExtraAuthInfo;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthInfoWithUser;
}

export interface TokenIntrospectionResponse {
  sub: string;
  client_id: string;
  scope: string;
  iat: number;
  exp: number;
  iss: string;
  [key: string]: unknown;
}

export interface UserInfoResponse {
  sub: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}
