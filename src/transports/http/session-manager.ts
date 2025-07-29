import { Session } from './interfaces';

class SessionManager {
  private sessions = new Map<string, Session>();

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  setSession(sessionId: string, session: Session): void {
    this.sessions.set(sessionId, session);
  }

  createSession(sessionId: string, session: Session): void {
    this.sessions.set(sessionId, session);
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && !session.destroying) {
      // Mark session as being destroyed to prevent recursive calls
      session.destroying = true;
      clearTimeout(session.timeout);
      session.transport.close();
      this.sessions.delete(sessionId);
    }
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
