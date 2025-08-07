import {
  createRateLimitMiddleware,
  DEFAULT_RATE_LIMIT_CONFIG,
  RateLimitConfig,
} from '../../../../../src/transports/http/middleware/rate-limit.middleware';

describe('Rate Limit Middleware', () => {
  describe('DEFAULT_RATE_LIMIT_CONFIG', () => {
    it('should have correct default configuration', () => {
      expect(DEFAULT_RATE_LIMIT_CONFIG).toEqual({
        windowMs: 61 * 1000, // 1 minute
        max: 60, // 60 requests per minute
        standardHeaders: true,
      });
    });

    it('should validate windowMs is 60000 (1 minute)', () => {
      expect(DEFAULT_RATE_LIMIT_CONFIG.windowMs).toBe(60 * 1000);
    });

    it('should validate max is 60 (60 requests per minute)', () => {
      expect(DEFAULT_RATE_LIMIT_CONFIG.max).toBe(60);
    });

    it('should validate standardHeaders is true', () => {
      expect(DEFAULT_RATE_LIMIT_CONFIG.standardHeaders).toBe(true);
    });
  });

  describe('createRateLimitMiddleware', () => {
    it('should create middleware with default config when no config provided', () => {
      const middleware = createRateLimitMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should create middleware with custom config', () => {
      const customConfig: RateLimitConfig = {
        windowMs: 30 * 1000, // 30 seconds
        max: 30, // 30 requests per 30 seconds
        standardHeaders: false,
        legacyHeaders: true,
      };

      const middleware = createRateLimitMiddleware(customConfig);
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should validate required config properties', () => {
      const config: RateLimitConfig = {
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
      };

      expect(config.windowMs).toBeDefined();
      expect(config.max).toBeDefined();
      expect(config.standardHeaders).toBeDefined();
      expect(typeof config.windowMs).toBe('number');
      expect(typeof config.max).toBe('number');
      expect(typeof config.standardHeaders).toBe('boolean');
    });

    it('should allow optional legacyHeaders property', () => {
      const configWithoutLegacy: RateLimitConfig = {
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
      };

      const configWithLegacy: RateLimitConfig = {
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
      };

      expect(configWithoutLegacy).toBeDefined();
      expect(configWithLegacy).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should ensure windowMs is positive', () => {
      expect(DEFAULT_RATE_LIMIT_CONFIG.windowMs).toBeGreaterThan(0);
    });

    it('should ensure max is positive', () => {
      expect(DEFAULT_RATE_LIMIT_CONFIG.max).toBeGreaterThan(0);
    });

    it('should ensure windowMs is reasonable (between 1 second and 1 hour)', () => {
      const windowMs = DEFAULT_RATE_LIMIT_CONFIG.windowMs;
      expect(windowMs).toBeGreaterThanOrEqual(1000); // At least 1 second
      expect(windowMs).toBeLessThanOrEqual(3600000); // At most 1 hour
    });

    it('should ensure max is reasonable (between 1 and 10000 requests)', () => {
      const max = DEFAULT_RATE_LIMIT_CONFIG.max;
      expect(max).toBeGreaterThanOrEqual(1); // At least 1 request
      expect(max).toBeLessThanOrEqual(10000); // At most 10000 requests
    });

    it('should calculate requests per second correctly', () => {
      const requestsPerSecond =
        DEFAULT_RATE_LIMIT_CONFIG.max /
        (DEFAULT_RATE_LIMIT_CONFIG.windowMs / 1000);
      expect(requestsPerSecond).toBe(1); // 60 requests / 60 seconds = 1 request per second
    });
  });
});
