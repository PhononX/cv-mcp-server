import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { Session } from './interfaces';
import { sessionManager } from './session-manager';
import { SessionManager } from './session-manager';

import { AuthenticatedRequest } from '../../auth/interfaces';
import { formatTimeToHuman, logger } from '../../utils';

export class SessionService {
  private readonly SESSION_TTL_MS = 1000 * 60 * 60 * 1; // 1 hour

  constructor(private sessionManager: SessionManager) {}

  createSession(
    transport: StreamableHTTPServerTransport,
    req: AuthenticatedRequest,
    sessionId: string,
  ): string {
    // Should never happen
    if (!req.auth?.extra?.user) {
      throw new Error('User not found in session creation');
    }

    // Clean up after TTL
    const timeout = setTimeout(() => {
      logger.info('⏰ Session timeout triggered', { sessionId });
      this.destroySession(sessionId);
    }, this.SESSION_TTL_MS);

    const userId = req.auth?.extra?.user!.id;
    const session: Session = {
      transport,
      timeout,
      userId,
      metrics: {
        sessionId,
        userId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.SESSION_TTL_MS),
        totalInteractions: 0,
        totalToolCalls: 0,
      },
    };

    this.sessionManager.setSession(sessionId, session);

    logger.info('🆕 Session created', {
      sessionId,
      userId: req.auth?.extra?.user!.id,
    });

    return sessionId;
  }

  destroySession(sessionId: string): void {
    logger.info('🔚 Destroying session', { sessionId });
    const session = this.sessionManager.getSession(sessionId);

    if (session && !session.destroying) {
      // Mark session as being destroyed to prevent recursive calls
      session.destroying = true;

      clearTimeout(session.timeout);
      session.transport.close();
      this.sessionManager.deleteSession(sessionId);

      const durationInSeconds =
        (new Date().getTime() - session.metrics.createdAt.getTime()) / 1000;

      logger.info('❌ Session destroyed', {
        sessionId,
        duration: formatTimeToHuman(durationInSeconds),
        createdAt: session.metrics.createdAt.toISOString(),
        expiresAt: session.metrics.expiresAt.toISOString(),
        totalInteractions: session.metrics.totalInteractions,
        totalToolCalls: session.metrics.totalToolCalls,
        userId: session.userId,
      });
    } else if (session?.destroying) {
      logger.debug('Session already being destroyed, skipping', { sessionId });
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  hasSession(sessionId: string): boolean {
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
    this.sessionManager.clearAllSessions();
  }
}

// Singleton instance
export const sessionService = new SessionService(sessionManager);
