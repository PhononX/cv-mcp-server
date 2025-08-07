import rateLimit from 'express-rate-limit';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  standardHeaders: boolean;
  legacyHeaders?: boolean;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
};

export function createRateLimitMiddleware(
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
) {
  return rateLimit(config);
}

export const rateLimitMiddleware = createRateLimitMiddleware(
  DEFAULT_RATE_LIMIT_CONFIG,
);
