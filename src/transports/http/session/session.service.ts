import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { SessionConfig } from './session.config';
import { SessionLogger } from './session.logger';
import {
  ISessionManager,
  ISessionService,
  Session,
  SessionMetrics,
  UserNotFoundError,
} from './session.types';
import { sessionManager } from './session-manager';

import { AuthenticatedRequest } from '../../../auth/interfaces';

export class SessionService implements ISessionService {
  private logger: SessionLogger;

  constructor(
    private sessionManager: ISessionManager,
    private config: SessionConfig = SessionConfig.fromEnv(),
  ) {
    this.logger = new SessionLogger();
    this.config.validate();
  }

  /**
   * Next idle window (ms) capped by optional max wall-clock lifetime from {@link SessionMetrics.createdAt}.
   */
  private computeEffectiveIdleTtlMs(
    createdAt: Date,
    requestedTtlMs: number,
  ): number {
    if (this.config.maxWallClockAgeMs <= 0) {
      return requestedTtlMs;
    }
    const deadline = createdAt.getTime() + this.config.maxWallClockAgeMs;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return 0;
    }
    return Math.min(requestedTtlMs, remaining);
  }

  /**
   * Resets the destroy timer (sliding idle TTL). Destroys the session if max wall-clock age is exceeded.
   */
  private refreshIdleTimer(
    sessionId: string,
    requestedTtlMs: number = this.config.ttlMs,
  ): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    const effectiveMs = this.computeEffectiveIdleTtlMs(
      session.metrics.createdAt,
      requestedTtlMs,
    );

    if (effectiveMs <= 0) {
      this.logger.logSessionTimeout();
      this.destroySession(sessionId);
      return false;
    }

    clearTimeout(session.timeout);

    const now = new Date();
    session.metrics.expiresAt = new Date(now.getTime() + effectiveMs);
    session.metrics.lastActivityAt = now;

    session.timeout = setTimeout(() => {
      this.logger.logSessionTimeout();
      this.destroySession(sessionId);
    }, effectiveMs);

    return true;
  }

  createSession(
    transport: StreamableHTTPServerTransport,
    req: AuthenticatedRequest,
    sessionId: string,
  ): string {
    // Validate inputs
    if (!req.auth?.extra?.user) {
      throw new UserNotFoundError();
    }

    if (!sessionId) {
      throw new Error('Session ID cannot be empty');
    }

    if (!transport) {
      throw new Error('Transport cannot be null or undefined');
    }

    // Check if session already exists
    if (this.sessionManager.hasSession(sessionId)) {
      throw new Error(`Session already exists: ${sessionId}`);
    }

    // Check session limits
    if (this.sessionManager.getSessionCount() >= this.config.maxSessions) {
      throw new Error(
        `Maximum sessions limit reached: ${this.config.maxSessions}`,
      );
    }

    const userId = req.auth.extra.user.id;
    const now = new Date();
    const initialIdleMs = this.computeEffectiveIdleTtlMs(now, this.config.ttlMs);
    if (initialIdleMs <= 0) {
      throw new Error(
        'Cannot create session: MCP_SESSION_MAX_AGE_MS does not allow any remaining lifetime',
      );
    }
    const expiresAt = new Date(now.getTime() + initialIdleMs);

    // Create enhanced metrics
    const metrics: SessionMetrics = {
      sessionId,
      userId,
      createdAt: now,
      expiresAt,
      totalInteractions: 0,
      totalToolCalls: 0,
      lastActivityAt: now,
      errorCount: 0,
      averageResponseTime: 0,
    };

    // Create session with idle timeout (sliding; extended on activity)
    const timeout = setTimeout(() => {
      this.logger.logSessionTimeout();
      this.destroySession(sessionId);
    }, initialIdleMs);

    const session: Session = {
      transport,
      timeout,
      userId,
      metrics,
    };

    // Store session
    this.sessionManager.setSession(sessionId, session);

    // Log session creation
    this.logger.logSessionCreated();

    return sessionId;
  }

  destroySession(sessionId: string): void {
    if (!sessionId) {
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return; // Session doesn't exist, nothing to destroy
    }

    if (session.destroying) {
      this.logger.logSessionDebug(
        `Session already being destroyed: ${sessionId}`,
      );
      return;
    }

    try {
      // Mark session as being destroyed to prevent recursive calls
      session.destroying = true;

      // Clear timeout
      clearTimeout(session.timeout);

      // Close transport
      session.transport.close();

      // Calculate duration
      const durationInSeconds =
        (new Date().getTime() - session.metrics.createdAt.getTime()) / 1000;

      // Log session destruction
      this.logger.logSessionDestroyed(durationInSeconds, session.metrics);

      // Remove from manager
      this.sessionManager.deleteSession(sessionId);
    } catch (error) {
      this.logger.logSessionError(error as Error, {
        action: 'destroySession',
        sessionId,
      });
      // Still try to remove from manager even if cleanup fails
      this.sessionManager.deleteSession(sessionId);
    }
  }

  getSession(sessionId: string): Session | undefined {
    if (!sessionId) {
      return undefined;
    }
    return this.sessionManager.getSession(sessionId);
  }

  hasSession(sessionId: string): boolean {
    if (!sessionId) {
      return false;
    }
    return this.sessionManager.hasSession(sessionId);
  }

  getAllSessions(): Map<string, Session> {
    return this.sessionManager.getAllSessions();
  }

  getAllSessionIds(): string[] {
    return this.sessionManager.getAllSessionIds();
  }

  getSessionCount(): number {
    return this.sessionManager.getSessionCount();
  }

  clearAllSessions(): void {
    const sessions = this.sessionManager.getAllSessions();
    for (const [sessionId] of sessions) {
      this.destroySession(sessionId);
    }
  }

  // Enhanced metrics tracking
  recordInteraction(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.metrics.totalInteractions++;
      this.refreshIdleTimer(sessionId);
    }
  }

  recordToolCall(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.metrics.totalToolCalls++;
      session.metrics.totalInteractions++; // Tool calls are also interactions
      this.refreshIdleTimer(sessionId);
    }
  }

  recordError(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.metrics.errorCount++;
      // Log metrics on every error since these are important for debugging
      this.logger.logSessionMetrics(session.metrics);
    }
  }

  // Additional utility methods
  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    const session = this.getSession(sessionId);
    return session?.metrics;
  }

  isSessionExpired(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return true;
    }
    return session.metrics.expiresAt < new Date();
  }

  extendSession(
    sessionId: string,
    additionalTtlMs: number = this.config.ttlMs,
  ): boolean {
    const ok = this.refreshIdleTimer(sessionId, additionalTtlMs);
    if (!ok) {
      return false;
    }
    const session = this.getSession(sessionId);
    if (session) {
      this.logger.logSessionMetrics(session.metrics);
    }
    return true;
  }

  // Public method to log session metrics
  logSessionMetrics(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      this.logger.logSessionMetrics(session.metrics);
    }
  }
}

// Singleton instance (idle TTL and caps from env)
export const sessionService = new SessionService(sessionManager);
