import jwt from 'jsonwebtoken';

import { TokenIntrospectionResponse } from '../auth/auth-middleware';

/**
 * Try to get the user ID from the token (Only possible with bearer token)
 * @param token - The token to get the user ID from
 * @returns The user ID
 */
export const getUserIdFromToken = (token?: string) => {
  if (!token) {
    return null;
  }

  const decoded = jwt.decode(token) as TokenIntrospectionResponse;

  return decoded.sub;
};
