import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import {
  createOAuthTokenVerifier,
  setCarbonVoiceAuthHeader,
} from '../../../src/auth/auth.service';
import {
  createMockIntrospectionResponse,
  createMockToken,
} from '../../utils/test-helpers';
import jwt from 'jsonwebtoken';
import { logger } from '../../../src/utils/logger';
import { env } from '../../../src/config/env';
import { UnauthorizedException } from '../../../src/utils';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the config
jest.mock('../../../src/config/env', () => ({
  env: {
    CARBON_VOICE_API_KEY: 'test-api-key',
  },
}));

describe('Auth Service', () => {
  describe('createOAuthTokenVerifier', () => {
    const verifier = createOAuthTokenVerifier();

    describe('verifyAccessToken', () => {
      it('should successfully verify a valid token', async () => {
        const token = createMockToken();
        const tokenIntrospectionResponse = createMockIntrospectionResponse();
        const result = await verifier.verifyAccessToken(token);

        expect(result).toEqual({
          token,
          clientId: tokenIntrospectionResponse.client_id,
          scopes: tokenIntrospectionResponse.scope?.split(' '),
          expiresAt: tokenIntrospectionResponse.exp,
          extra: {
            user: {
              id: tokenIntrospectionResponse.sub,
            },
          },
        });
      });

      it('should log error when any error occurs', async () => {
        jest.spyOn(jwt, 'decode').mockImplementationOnce(() => {
          throw new Error('Any error that could occur');
        });

        await expect(verifier.verifyAccessToken('any-token')).rejects.toThrow();

        expect(logger.error).toHaveBeenCalledWith(
          'Error verifying access token',
          {
            error: {
              error_message: 'Any error that could occur',
              stack: expect.any(String),
            },
            token: 'any-<omitted>',
          },
        );
      });

      it('should throw InvalidTokenError when no token is provided', async () => {
        await expect(verifier.verifyAccessToken('')).rejects.toThrow(
          'No token provided',
        );
      });

      it('should throw InvalidTokenError for invalid token format', async () => {
        await expect(
          verifier.verifyAccessToken('invalid-token'),
        ).rejects.toThrow('Invalid token format');
      });

      it('should throw InvalidTokenError when any error occurs', async () => {
        jest.spyOn(jwt, 'decode').mockImplementationOnce(() => {
          throw new Error('Any error that could occur');
        });

        await expect(
          verifier.verifyAccessToken('any-token'),
        ).rejects.toBeInstanceOf(InvalidTokenError);
      });
    });
  });

  describe('setCarbonVoiceAuthHeader', () => {
    it('should return Bearer token header when token is provided', () => {
      const token = 'test-token';
      const result = setCarbonVoiceAuthHeader(token);

      expect(result).toEqual({
        headers: {
          Authorization: 'Bearer test-token',
        },
      });
    });

    it('should return API key header when no token is provided', () => {
      const result = setCarbonVoiceAuthHeader();

      expect(result).toEqual({
        headers: {
          'x-api-key': 'test-api-key',
        },
      });
    });

    it('should throw UnauthorizedException when no token is provided and no API key is set', () => {
      env.CARBON_VOICE_API_KEY = undefined;

      const error = () => setCarbonVoiceAuthHeader();
      expect(error).toThrow(UnauthorizedException);
      expect(error).toThrow('No Bearer token or API key provided');
    });
  });
});
