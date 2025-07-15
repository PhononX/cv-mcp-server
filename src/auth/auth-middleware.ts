import { Request } from 'express';
import jwt from 'jsonwebtoken';

import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

import { User } from './interfaces';

import { env } from '../config';
import { logger, removeLastChars, UnauthorizedException } from '../utils';

type ExtraAuthInfo = Record<string, unknown> & {
  user?: User;
};

interface AuthInfoWithUser extends AuthInfo {
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

// export const verifyAccessToken = (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   let token = undefined;
//   try {
//     const auth = req.headers.authorization;
//     if (!auth) {
//       throw new Error('No authorization header provided');
//     }

//     token = auth.split(' ')[1];
//     const decoded = jwt.decode(token) as TokenIntrospectionResponse;
//     // Validate expiration date
//     if (decoded.exp && decoded.exp < Date.now() / 1000) {
//       throw new Error('Token expired');
//     }
//     // Validate issuer
//     // FIXME: Uncomment this when we have a valid issuer
//     // if (decoded.iss !== env.OAUTH_SERVER_URL) {
//     //   throw new Error('Invalid issuer');
//     // }
//     const user: User = {
//       id: decoded.sub,
//     };

//     req.auth = {
//       token,
//       clientId: decoded.client_id,
//       scopes: decoded.scope?.split(' ') || [],
//       expiresAt: decoded.exp,
//       extra: {
//         user,
//       },
//     };

//     next();
//   } catch (error: unknown) {
//     logger.error('Error verifying access token', {
//       error: {
//         ...(error as Error),
//         error_message: (error as Error).message,
//         stack: (error as Error).stack,
//       },
//       token,
//     });

//     sendUnauthorizedErrorResponse(req, res);
//     return;
//   }
// };

// export const sendUnauthorizedErrorResponse = (req: Request, res: Response) => {
//   const protocol = req.get('X-Forwarded-Proto') || req.protocol;
//   const host =
//     req.get('X-Forwarded-Host') || req.get('host') || `localhost:${env.PORT}`;
//   const baseUrl = `${protocol}://${host}`;
//   const bearer = `Bearer realm="MCP Server", resource_metadata_uri="${baseUrl}/.well-known/oauth-protected-resource"`;

//   res.setHeader('WWW-Authenticate', bearer);
//   res.sendStatus(401);
//   return;
// };

// export async function verifyAccessTokenV2(token?: string): Promise<AuthInfo> {
//   if (!token) {
//     throw new InvalidTokenError('No token provided');
//   }

//   try {
//     const decoded = jwt.decode(token) as TokenIntrospectionResponse;

//     return {
//       token,
//       clientId: decoded.client_id!,
//       scopes: decoded.scope?.split(' ') || [],
//       expiresAt: decoded.exp,
//       extra: {
//         user: {
//           id: decoded.sub!,
//         },
//       },
//     };
//   } catch (error) {
//     logger.error('Error verifying access token', {
//       error: {
//         ...(error as Error),
//         error_message: (error as Error).message,
//         stack: (error as Error).stack,
//       },
//       token,
//     });

//     throw error;
//   }
// }

// export class VerifyAccessToken implements OAuthTokenVerifier {
//   async verifyAccessToken(token: string): Promise<AuthInfo> {
//     if (!token) {
//       throw new InvalidTokenError('No token provided');
//     }

//     try {
//       const decoded = jwt.decode(token) as TokenIntrospectionResponse;

//       return {
//         token,
//         clientId: decoded.client_id!,
//         scopes: decoded.scope?.split(' ') || [],
//         expiresAt: decoded.exp,
//         extra: {
//           user: {
//             id: decoded.sub!,
//           },
//         },
//       };
//     } catch (error) {
//       logger.error('Error verifying access token', {
//         error: {
//           ...(error as Error),
//           error_message: (error as Error).message,
//           stack: (error as Error).stack,
//         },
//         token,
//       });

//       throw error;
//     }
//   }
// }

// Simple function-based OAuthTokenVerifier
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

      // Validate issuer if configured
      if (
        env.CARBON_VOICE_BASE_URL &&
        decoded.iss !== env.CARBON_VOICE_BASE_URL
      ) {
        throw new InvalidTokenError('Invalid token issuer');
      }

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
