import jwt from 'jsonwebtoken';

import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

import { TokenIntrospectionResponse } from './interfaces';

import { env } from '../config';
import { logger, removeLastChars, UnauthorizedException } from '../utils';

export const createOAuthTokenVerifier = (): OAuthTokenVerifier => ({
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (!token) {
      throw new InvalidTokenError('No token provided');
    }

    try {
      const decoded = jwt.decode(token) as TokenIntrospectionResponse;

      // Basic validation
      if (!decoded) {
        throw new InvalidTokenError('Invalid token format');
      }

      if (!decoded.sub || !decoded.client_id) {
        throw new InvalidTokenError('Token missing required claims');
      }

      // Check expiration
      // We don't need, since it's validate in requireBearerAuth middleware
      // if (decoded.exp && decoded.exp < Date.now() / 1000) {
      //   throw new InvalidTokenError('Token expired');
      // }

      return {
        token,
        clientId: decoded.client_id,
        scopes: decoded.scope?.split(' ') || [],
        expiresAt: decoded.exp,
        extra: {
          user: {
            id: decoded.sub,
          },
        },
      };
    } catch (error) {
      logger.error('Error verifying access token', {
        error: {
          error_message: (error as Error).message,
          stack: (error as Error).stack,
        },
        token: removeLastChars(token),
      });

      if (error instanceof InvalidTokenError) {
        throw error;
      }

      throw new InvalidTokenError('Token verification failed');
    }
  },
});

export const setCarbonVoiceAuthHeader = (
  token?: string,
): { headers: Record<string, string> } => {
  if (!token && !env.CARBON_VOICE_API_KEY) {
    throw new UnauthorizedException('No Bearer token or API key provided');
  }

  // http-transport
  if (token) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  // Default to API key for Stdio transport
  return {
    headers: {
      'x-api-key': `${env.CARBON_VOICE_API_KEY}`,
    },
  };
};
