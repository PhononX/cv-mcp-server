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
    private config: SessionConfig = new SessionConfig(),
  ) {
    this.logger = new SessionLogger();
    this.config.validate();
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
    const expiresAt = new Date(now.getTime() + this.config.ttlMs);

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

    // Create session with timeout
    const timeout = setTimeout(() => {
      this.logger.logSessionTimeout(sessionId);
      this.destroySession(sessionId);
    }, this.config.ttlMs);

    const session: Session = {
      transport,
      timeout,
      userId,
      metrics,
    };

    // Store session
    this.sessionManager.setSession(sessionId, session);

    // Log session creation
    this.logger.logSessionCreated(sessionId, userId);

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
        sessionId,
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
      this.logger.logSessionDestroyed(
        sessionId,
        durationInSeconds,
        session.metrics,
      );

      // Remove from manager
      this.sessionManager.deleteSession(sessionId);
    } catch (error) {
      this.logger.logSessionError(sessionId, error as Error, {
        operation: 'destroySession',
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
      session.metrics.lastActivityAt = new Date();
      // Only log metrics every 10 interactions to reduce noise
      if (session.metrics.totalInteractions % 10 === 0) {
        this.logger.logSessionMetrics(sessionId, session.metrics);
      }
    }
  }

  recordToolCall(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.metrics.totalToolCalls++;
      session.metrics.lastActivityAt = new Date();
      // Log metrics on every tool call since these are significant events
      this.logger.logSessionMetrics(sessionId, session.metrics);
    }
  }

  recordError(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.metrics.errorCount++;
      // Log metrics on every error since these are important for debugging
      this.logger.logSessionMetrics(sessionId, session.metrics);
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
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    // Clear existing timeout
    clearTimeout(session.timeout);

    // Extend expiration
    const newExpiresAt = new Date(Date.now() + additionalTtlMs);
    session.metrics.expiresAt = newExpiresAt;

    // Set new timeout
    session.timeout = setTimeout(() => {
      this.logger.logSessionTimeout(sessionId);
      this.destroySession(sessionId);
    }, additionalTtlMs);

    this.logger.logSessionMetrics(sessionId, session.metrics);
    return true;
  }
}

// Singleton instance
export const sessionService = new SessionService(sessionManager);
