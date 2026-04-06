import { NextFunction, Request, RequestHandler, Response } from 'express';

import {
  InsufficientScopeError,
  InvalidTokenError,
  OAuthError,
  ServerError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';

import { AuthenticatedRequest } from '../../../auth/interfaces';

type RequireBearerAuthWithAbsoluteMetadataOptions = {
  verifier: OAuthTokenVerifier;
  requiredScopes: string[];
  resourceMetadataUrl: string;
};

function getAbsoluteResourceMetadataUrl(
  req: Request,
  configuredResourceMetadataUrl: string,
): string {
  if (/^https?:\/\//i.test(configuredResourceMetadataUrl)) {
    return configuredResourceMetadataUrl;
  }

  // req.protocol honors Express trust proxy settings.
  // Avoid reading raw X-Forwarded-* headers directly.
  const protocol = req.protocol;
  const host = req.get('host');

  if (!host) {
    return configuredResourceMetadataUrl;
  }

  const normalizedPath = configuredResourceMetadataUrl.startsWith('/')
    ? configuredResourceMetadataUrl
    : `/${configuredResourceMetadataUrl}`;

  return `${protocol}://${host}${normalizedPath}`;
}

export function requireBearerAuthWithAbsoluteMetadata({
  verifier,
  requiredScopes,
  resourceMetadataUrl,
}: RequireBearerAuthWithAbsoluteMetadataOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        throw new InvalidTokenError('Missing Authorization header');
      }

      const [type, token] = authHeader.split(' ');
      if (type.toLowerCase() !== 'bearer' || !token) {
        throw new InvalidTokenError(
          "Invalid Authorization header format, expected 'Bearer TOKEN'",
        );
      }

      const authInfo = await verifier.verifyAccessToken(token);
      const hasAllScopes = requiredScopes.every((scope) =>
        authInfo.scopes.includes(scope),
      );

      if (!hasAllScopes) {
        throw new InsufficientScopeError('Insufficient scope');
      }

      if (typeof authInfo.expiresAt !== 'number' || isNaN(authInfo.expiresAt)) {
        throw new InvalidTokenError('Token has no expiration time');
      }

      if (authInfo.expiresAt < Date.now() / 1000) {
        throw new InvalidTokenError('Token has expired');
      }

      (req as AuthenticatedRequest).auth = authInfo;
      next();
    } catch (error) {
      const metadataUrl = getAbsoluteResourceMetadataUrl(req, resourceMetadataUrl);
      const getWwwAuthValue = (message: string, errorCode: string) =>
        `Bearer error="${errorCode}", error_description="${message}", resource_metadata="${metadataUrl}"`;

      if (error instanceof InvalidTokenError) {
        res.set(
          'WWW-Authenticate',
          getWwwAuthValue(error.message, error.errorCode),
        );
        res.status(401).json(error.toResponseObject());
        return;
      }

      if (error instanceof InsufficientScopeError) {
        res.set(
          'WWW-Authenticate',
          getWwwAuthValue(error.message, error.errorCode),
        );
        res.status(403).json(error.toResponseObject());
        return;
      }

      if (error instanceof ServerError) {
        res.status(500).json(error.toResponseObject());
        return;
      }

      if (error instanceof OAuthError) {
        res.status(400).json(error.toResponseObject());
        return;
      }

      const serverError = new ServerError('Internal Server Error');
      res.status(500).json(serverError.toResponseObject());
    }
  };
}
