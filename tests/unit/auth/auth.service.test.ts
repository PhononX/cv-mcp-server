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
    CARBON_VOICE_PAT: undefined,
  },
}));

describe('Auth Service', () => {
  describe('createOAuthTokenVerifier', () => {
    const verifier = createOAuthTokenVerifier();

    describe('verifyAccessToken', () => {
      it('should successfully verify a valid token', async () => {
        // Derive the token FROM the expected payload rather than building each
        // independently: both helpers compute `exp` from Date.now(), so two
        // separate calls straddling a second boundary produce `exp` values one
        // apart and this assertion fails intermittently.
        const tokenIntrospectionResponse = createMockIntrospectionResponse();
        const token = createMockToken(tokenIntrospectionResponse);
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
    beforeEach(() => {
      env.CARBON_VOICE_API_KEY = 'test-api-key';
      env.CARBON_VOICE_PAT = undefined;
    });

    it('should return Bearer token header when token is provided', () => {
      const result = setCarbonVoiceAuthHeader('test-token');

      expect(result).toEqual({
        headers: {
          Authorization: 'Bearer test-token',
          // Cleared so the axios instance default cannot ride along; see below.
          'x-api-key': undefined,
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

    it('should send a PAT as a bearer token, which is what cv-api reads', () => {
      // cv-api's PatTokenStrategy only inspects `Authorization: Bearer`, so a
      // PAT placed in the x-api-key header would never be matched.
      env.CARBON_VOICE_PAT = 'cv_pat_example';

      expect(setCarbonVoiceAuthHeader()).toEqual({
        headers: {
          Authorization: 'Bearer cv_pat_example',
          'x-api-key': undefined,
        },
      });
    });

    it('should prefer a PAT over an API key and suppress x-api-key entirely', () => {
      // THE IMPORTANT CASE. cv-api tries `api-key` BEFORE `pat-token` in its
      // strategy chain, so sending both headers would let a valid API key win
      // and silently discard the PAT's scopes — the opposite of why someone
      // configured a PAT.
      env.CARBON_VOICE_PAT = 'cv_pat_example';
      env.CARBON_VOICE_API_KEY = 'test-api-key';

      const result = setCarbonVoiceAuthHeader();
      expect(result.headers.Authorization).toBe('Bearer cv_pat_example');
      expect(result.headers['x-api-key']).toBeUndefined();
    });

    it('should let an HTTP access token outrank a configured PAT', () => {
      env.CARBON_VOICE_PAT = 'cv_pat_example';

      expect(
        setCarbonVoiceAuthHeader('oauth-token').headers.Authorization,
      ).toBe('Bearer oauth-token');
    });

    it('should warn but still send a PAT without the cv_pat_ prefix', () => {
      // Not fatal — the API decides — but without the prefix cv-api will not
      // match it as a PAT, and an unexplained 401 is a poor way to discover a
      // typo.
      env.CARBON_VOICE_PAT = 'missing-prefix';

      const result = setCarbonVoiceAuthHeader();
      expect(result.headers.Authorization).toBe('Bearer missing-prefix');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('does not start with'),
      );
    });

    it('should not warn for a correctly prefixed PAT', () => {
      env.CARBON_VOICE_PAT = 'cv_pat_example';
      setCarbonVoiceAuthHeader();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should accept the prefix case-insensitively, as cv-api does', () => {
      env.CARBON_VOICE_PAT = 'CV_PAT_UPPER';
      setCarbonVoiceAuthHeader();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should throw when no token, PAT or API key is available', () => {
      env.CARBON_VOICE_API_KEY = undefined;
      env.CARBON_VOICE_PAT = undefined;

      const error = () => setCarbonVoiceAuthHeader();
      expect(error).toThrow(UnauthorizedException);
      expect(error).toThrow('No Bearer token, PAT or API key provided');
    });
  });
});
