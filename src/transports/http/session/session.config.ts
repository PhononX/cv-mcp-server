export class SessionConfig {
  constructor(
    public readonly ttlMs: number = 1000 * 60 * 60, // 1 hour
    public readonly maxSessions: number = 2000,
    public readonly cleanupIntervalMs: number = 1000 * 60 * 5, // 5 minutes
  ) {}

  static fromEnv(): SessionConfig {
    return new SessionConfig(
      1000 * 60 * 60, // 1 hour TTL
      2000, // Default max sessions
      1000 * 60 * 5, // 5 minutes cleanup interval
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
  }
}
