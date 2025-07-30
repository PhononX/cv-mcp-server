import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { AuthenticatedRequest } from '../../../auth/interfaces';

// Session management
export type SessionMetrics = {
  sessionId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  totalInteractions: number;
  totalToolCalls: number;
  lastActivityAt: Date;
  errorCount: number;
  averageResponseTime: number;
};

export type Session = {
  transport: StreamableHTTPServerTransport;
  timeout: NodeJS.Timeout;
  userId: string;
  destroying?: boolean; // Flag to prevent recursive destruction
  metrics: SessionMetrics;
};

// Configuration
export interface SessionConfig {
  readonly ttlMs: number;
  readonly maxSessions: number;
  readonly cleanupIntervalMs: number;
}

// Service interfaces
export interface ISessionManager {
  getSession(sessionId: string): Session | undefined;
  setSession(sessionId: string, session: Session): void;
  deleteSession(sessionId: string): boolean;
  getAllSessions(): Map<string, Session>;
  getAllSessionIds(): string[];
  hasSession(sessionId: string): boolean;
  clearAllSessions(): void;
  getSessionCount(): number;
}

export interface ISessionService {
  createSession(
    transport: StreamableHTTPServerTransport,
    req: AuthenticatedRequest,
    sessionId: string,
  ): string;
  destroySession(sessionId: string): void;
  getSession(sessionId: string): Session | undefined;
  hasSession(sessionId: string): boolean;
  getAllSessions(): Map<string, Session>;
  getAllSessionIds(): string[];
  getSessionCount(): number;
  clearAllSessions(): void;
  recordInteraction(sessionId: string): void;
  recordToolCall(sessionId: string): void;
  recordError(sessionId: string): void;
}

// Error classes
export class SessionError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export class UserNotFoundError extends SessionError {
  constructor() {
    super('User not found in session creation', 'USER_NOT_FOUND');
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
  }
}

export class SessionAlreadyDestroyingError extends SessionError {
  constructor(sessionId: string) {
    super(
      `Session already being destroyed: ${sessionId}`,
      'SESSION_ALREADY_DESTROYING',
    );
  }
}
