import { ISessionManager, Session } from './session.types';

export class SessionManager implements ISessionManager {
  private sessions = new Map<string, Session>();

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  setSession(sessionId: string, session: Session): void {
    if (!sessionId) {
      throw new Error('Session ID cannot be empty');
    }
    if (!session) {
      throw new Error('Session cannot be null or undefined');
    }
    this.sessions.set(sessionId, session);
  }

  deleteSession(sessionId: string): boolean {
    if (!sessionId) {
      return false;
    }
    return this.sessions.delete(sessionId);
  }

  getAllSessions(): Map<string, Session> {
    return new Map(this.sessions);
  }

  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  clearAllSessions(): void {
    this.sessions.clear();
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  // Additional utility methods
  getSessionsByUserId(userId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.userId === userId,
    );
  }

  getExpiredSessions(now: Date = new Date()): Session[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.metrics.expiresAt < now,
    );
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
