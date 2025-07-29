import { Session } from './interfaces';

export class SessionManager {
  private sessions = new Map<string, Session>();

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  setSession(sessionId: string, session: Session): void {
    this.sessions.set(sessionId, session);
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  getAllSessions(): Map<string, Session> {
    return this.sessions;
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
}

// Singleton instance
export const sessionManager = new SessionManager();
