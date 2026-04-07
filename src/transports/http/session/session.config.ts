import { env } from '../../../config';

/** HTTP MCP session limits (idle TTL, capacity, cleanup, optional max wall-clock age). */
export class SessionConfig {
  constructor(
    public readonly ttlMs: number = 1000 * 60 * 60, // 1 hour idle
    public readonly maxSessions: number = 2000,
    public readonly cleanupIntervalMs: number = 1000 * 60 * 5, // 5 minutes
    public readonly maxWallClockAgeMs: number = 0,
  ) {}

  static fromEnv(): SessionConfig {
    return new SessionConfig(
      env.MCP_SESSION_TTL_MS,
      env.MCP_SESSION_MAX_SESSIONS,
      env.MCP_SESSION_CLEANUP_INTERVAL_MS,
      env.MCP_SESSION_MAX_AGE_MS,
    );
  }

  validate(): void {
    if (this.ttlMs <= 0) {
      throw new Error('Session TTL must be positive');
    }
    if (this.maxSessions <= 0) {
      throw new Error('Max sessions must be positive');
    }
    if (this.cleanupIntervalMs <= 0) {
      throw new Error('Cleanup interval must be positive');
    }
    if (this.maxWallClockAgeMs < 0) {
      throw new Error('Max wall-clock session age must be non-negative');
    }
  }
}
