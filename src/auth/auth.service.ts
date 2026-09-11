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

/**
 * cv-api recognises a Personal Access Token by this prefix
 * (`PatTokenStrategy`, matched case-insensitively). Used only to warn on a
 * value that will not be treated as a PAT — the API remains the authority.
 */
const PAT_PREFIX = 'cv_pat_';

/**
 * Builds the upstream auth header for one request.
 *
 * cv-api accepts six credential types (`TokenAuthenticationGuard` chains
 * stateless-jwt, access-token, pxtoken, api-key, pat-token, keycloak-bearer).
 * We deliberately emit only two shapes:
 *
 *  - `Authorization: Bearer <token>` — an OAuth access token on the HTTP
 *    transport, or a PAT on stdio. cv-api routes these by inspecting the
 *    value, so one header serves both.
 *  - `x-api-key: <key>` — the stdio fallback.
 *
 * Precedence: request token (HTTP) > PAT > API key.
 *
 * `x-api-key` is explicitly cleared on the Bearer paths. The axios instance
 * sets it as a default header, and cv-api tries `api-key` BEFORE `pat-token`
 * in its strategy chain — so leaving both on the request would let a valid API
 * key win and the request would silently authenticate as the long-lived key
 * instead of the PAT the operator configured. That defeats the point of the
 * PAT: its expiry, its revocability, and its own identity in the audit trail.
 * (Not its scopes — cv-api enforces those only in user-app.)
 */
export const setCarbonVoiceAuthHeader = (
  token?: string,
): { headers: Record<string, string | undefined> } => {
  if (!token && !env.CARBON_VOICE_PAT && !env.CARBON_VOICE_API_KEY) {
    throw new UnauthorizedException('No Bearer token, PAT or API key provided');
  }

  // http-transport: OAuth access token from the MCP auth context.
  if (token) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': undefined,
      },
    };
  }

  // stdio: prefer a PAT, which expires and is revocable — unlike the API key.
  // Its cv:read / cv:write scopes are not a restriction today: cv-api enforces
  // them only in user-app, so a cv:read PAT still writes. The precedence below
  // is about credential lifetime, not privilege.
  if (env.CARBON_VOICE_PAT) {
    if (!env.CARBON_VOICE_PAT.toLowerCase().startsWith(PAT_PREFIX)) {
      // Not fatal — the API decides — but a value without the prefix will not
      // be matched by PatTokenStrategy and will fail as an unknown bearer
      // token, which is a confusing way to learn about a typo.
      logger.warn(
        `CARBON_VOICE_PAT does not start with "${PAT_PREFIX}"; cv-api will not treat it as a PAT`,
      );
    }
    return {
      headers: {
        Authorization: `Bearer ${env.CARBON_VOICE_PAT}`,
        'x-api-key': undefined,
      },
    };
  }

  // stdio fallback: unscoped personal API key.
  return {
    headers: {
      'x-api-key': `${env.CARBON_VOICE_API_KEY}`,
    },
  };
};
