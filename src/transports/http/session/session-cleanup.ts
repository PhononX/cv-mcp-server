import { SessionConfig } from './session.config';
import { SessionLogger } from './session.logger';
import { ISessionService } from './session.types';

export class SessionCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private sessionService: ISessionService,
    private config: SessionConfig,
    private logger: SessionLogger,
  ) {}

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupIntervalMs);

    // Log cleanup start
    this.logger.logCleanupStarted(this.sessionService.getSessionCount());
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
  }

  private cleanupExpiredSessions(): void {
    try {
      const now = new Date();
      const sessions = this.sessionService.getAllSessions();
      let cleanedCount = 0;

      for (const [sessionId, session] of sessions) {
        if (session.metrics.expiresAt < now) {
          // Log session timeout
          this.logger.logSessionTimeout();
          this.sessionService.destroySession(sessionId);
          cleanedCount++;
        }
      }

      const remainingCount = this.sessionService.getSessionCount();
      // Log cleanup completion
      this.logger.logCleanupCompleted(cleanedCount, remainingCount);
    } catch (error) {
      // Log cleanup error
      this.logger.logSessionError(error as Error, {
        context: 'cleanup-service',
        sessionId: 'N/A', // No sessionId available here
      });
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
