import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { SessionService } from '../../../../../src/transports/http/session/session.service';
import { SessionConfig } from '../../../../../src/transports/http/session/session.config';
import { AuthenticatedRequest } from '../../../../../src/auth/interfaces';
import { UserNotFoundError } from '../../../../../src/transports/http/session/session.types';

// Mock dependencies
jest.mock('../../../../../src/transports/http/session/session-manager', () => ({
  sessionManager: {
    setSession: jest.fn(),
    getSession: jest.fn(),
    hasSession: jest.fn(),
    deleteSession: jest.fn(),
    getAllSessions: jest.fn(),
    getAllSessionIds: jest.fn(),
    getSessionCount: jest.fn(),
  },
}));

jest.mock('../../../../../src/transports/http/session/session.logger', () => ({
  SessionLogger: jest.fn().mockImplementation(() => ({
    logSessionCreated: jest.fn(),
    logSessionDestroyed: jest.fn(),
    logSessionTimeout: jest.fn(),
    logSessionError: jest.fn(),
    logSessionMetrics: jest.fn(),
    logSessionDebug: jest.fn(),
  })),
}));

// Mock setTimeout to prevent real timeouts
const originalSetTimeout = global.setTimeout;
beforeAll(() => {
  global.setTimeout = jest.fn(() => ({ _destroyed: false }) as any) as any;
});

afterAll(() => {
  global.setTimeout = originalSetTimeout;
});

import { sessionManager } from '../../../../../src/transports/http/session/session-manager';
import { SessionLogger } from '../../../../../src/transports/http/session/session.logger';

describe('Session Service', () => {
  let sessionService: SessionService;
  let mockTransport: jest.Mocked<StreamableHTTPServerTransport>;
  let mockRequest: AuthenticatedRequest;
  let mockSessionLogger: jest.Mocked<SessionLogger>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a new SessionService instance for each test
    sessionService = new SessionService(sessionManager as any);

    // Mock transport
    mockTransport = {
      handleRequest: jest.fn(),
      close: jest.fn(),
      sessionId: 'test-session-id',
    } as any;

    // Mock request
    mockRequest = {
      auth: {
        extra: {
          user: { id: 'test-user-id' },
        },
        clientId: 'test-client-id',
        token: 'test-token',
      },
      headers: {},
      method: 'POST',
      url: '/api/test',
    } as any;

    // Get the mocked logger instance from the SessionService
    mockSessionLogger = (sessionService as any).logger;
  });

  afterEach(() => {
    // Clear any remaining timeouts to prevent open handles
    jest.clearAllTimers();
  });

  describe('Session Creation', () => {
    it('should create a session successfully', () => {
      const sessionId = 'test-session';

      const result = sessionService.createSession(
        mockTransport,
        mockRequest,
        sessionId,
      );

      expect(result).toBe(sessionId);
      expect(sessionManager.setSession).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          transport: mockTransport,
          userId: 'test-user-id',
          metrics: expect.objectContaining({
            sessionId,
            userId: 'test-user-id',
            totalInteractions: 0,
            totalToolCalls: 0,
            errorCount: 0,
            createdAt: expect.any(Date),
            expiresAt: expect.any(Date),
            lastActivityAt: expect.any(Date),
            averageResponseTime: 0,
          }),
          timeout: expect.any(Object),
        }),
      );
      expect(mockSessionLogger.logSessionCreated).toHaveBeenCalled();
    });

    it('should throw UserNotFoundError when user is not in auth', () => {
      const requestWithoutUser = {
        ...mockRequest,
        auth: {
          extra: {},
          clientId: 'test-client-id',
          token: 'test-token',
        },
      } as AuthenticatedRequest;

      expect(() => {
        sessionService.createSession(
          mockTransport,
          requestWithoutUser,
          'test-session',
        );
      }).toThrow(UserNotFoundError);
    });

    it('should throw UserNotFoundError when auth is missing', () => {
      const requestWithoutAuth = {
        ...mockRequest,
        auth: undefined,
      } as AuthenticatedRequest;

      expect(() => {
        sessionService.createSession(
          mockTransport,
          requestWithoutAuth,
          'test-session',
        );
      }).toThrow(UserNotFoundError);
    });
  });

  describe('Session Destruction', () => {
    it('should destroy an existing session', () => {
      const sessionId = 'test-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 0,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
      (sessionManager.hasSession as jest.Mock).mockReturnValue(true);

      sessionService.destroySession(sessionId);

      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(mockTransport.close).toHaveBeenCalled();
      expect(sessionManager.deleteSession).toHaveBeenCalledWith(sessionId);
      expect(mockSessionLogger.logSessionDestroyed).toHaveBeenCalled();
    });

    it('should handle destroying non-existent session gracefully', () => {
      const sessionId = 'non-existent-session';

      (sessionManager.getSession as jest.Mock).mockReturnValue(undefined);

      expect(() => {
        sessionService.destroySession(sessionId);
      }).not.toThrow();

      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(sessionManager.deleteSession).not.toHaveBeenCalled();
    });

    it('should handle destroying session with empty sessionId', () => {
      expect(() => {
        sessionService.destroySession('');
      }).not.toThrow();

      expect(sessionManager.getSession).not.toHaveBeenCalled();
    });

    it('should prevent recursive destruction', () => {
      const sessionId = 'test-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        destroying: true, // Already being destroyed
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 0,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      sessionService.destroySession(sessionId);

      expect(mockSessionLogger.logSessionDebug).toHaveBeenCalledWith(
        expect.stringContaining('Session already being destroyed'),
      );
    });
  });

  describe('Session Retrieval', () => {
    it('should get an existing session', () => {
      const sessionId = 'test-session';
      const mockSession = { id: sessionId, data: 'test' };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      const result = sessionService.getSession(sessionId);

      expect(result).toBe(mockSession);
      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
    });

    it('should return undefined for non-existent session', () => {
      const sessionId = 'non-existent-session';

      (sessionManager.getSession as jest.Mock).mockReturnValue(undefined);

      const result = sessionService.getSession(sessionId);

      expect(result).toBeUndefined();
    });

    it('should return undefined for empty sessionId', () => {
      const result = sessionService.getSession('');

      expect(result).toBeUndefined();
      expect(sessionManager.getSession).not.toHaveBeenCalled();
    });

    it('should check if session exists', () => {
      const sessionId = 'test-session';

      (sessionManager.hasSession as jest.Mock).mockReturnValue(true);

      const result = sessionService.hasSession(sessionId);

      expect(result).toBe(true);
      expect(sessionManager.hasSession).toHaveBeenCalledWith(sessionId);
    });

    it('should return false for non-existent session', () => {
      const sessionId = 'non-existent-session';

      (sessionManager.hasSession as jest.Mock).mockReturnValue(false);

      const result = sessionService.hasSession(sessionId);

      expect(result).toBe(false);
    });
  });

  describe('Session Metrics', () => {
    it('should record interaction', () => {
      const sessionId = 'test-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 0,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      sessionService.recordInteraction(sessionId);

      expect(mockSession.metrics.totalInteractions).toBe(6);
      expect(mockSession.metrics.lastActivityAt).toBeInstanceOf(Date);
    });

    it('should record tool call', () => {
      const sessionId = 'test-session';
      const originalLastActivityAt = new Date(Date.now() - 5000); // 5 seconds ago
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: originalLastActivityAt,
          errorCount: 0,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      sessionService.recordToolCall(sessionId);

      expect(mockSession.metrics.totalToolCalls).toBe(3);
      expect(mockSession.metrics.totalInteractions).toBe(6); // Tool calls also increment interactions
      expect(mockSession.metrics.lastActivityAt).toBeInstanceOf(Date);
      // Verify that lastActivityAt was updated to a more recent time
      expect(mockSession.metrics.lastActivityAt.getTime()).toBeGreaterThan(
        originalLastActivityAt.getTime(),
      );
    });

    it('should record error and log metrics', () => {
      const sessionId = 'test-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 1,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      sessionService.recordError(sessionId);

      expect(mockSession.metrics.errorCount).toBe(2);
      expect(mockSessionLogger.logSessionMetrics).toHaveBeenCalledWith(
        mockSession.metrics,
      );
    });

    it('should handle metrics recording for non-existent session gracefully', () => {
      const sessionId = 'non-existent-session';

      (sessionManager.getSession as jest.Mock).mockReturnValue(undefined);

      expect(() => {
        sessionService.recordInteraction(sessionId);
        sessionService.recordToolCall(sessionId);
        sessionService.recordError(sessionId);
      }).not.toThrow();
    });
  });

  describe('Session Utilities', () => {
    it('should get all sessions', () => {
      const mockSessions = new Map([
        ['session1', { id: 'session1' }],
        ['session2', { id: 'session2' }],
      ]);

      (sessionManager.getAllSessions as jest.Mock).mockReturnValue(
        mockSessions,
      );

      const result = sessionService.getAllSessions();

      expect(result).toBe(mockSessions);
      expect(sessionManager.getAllSessions).toHaveBeenCalled();
    });

    it('should get all session IDs', () => {
      const mockSessionIds = ['session1', 'session2', 'session3'];

      (sessionManager.getAllSessionIds as jest.Mock).mockReturnValue(
        mockSessionIds,
      );

      const result = sessionService.getAllSessionIds();

      expect(result).toBe(mockSessionIds);
      expect(sessionManager.getAllSessionIds).toHaveBeenCalled();
    });

    it('should get session count', () => {
      const mockCount = 5;

      (sessionManager.getSessionCount as jest.Mock).mockReturnValue(mockCount);

      const result = sessionService.getSessionCount();

      expect(result).toBe(mockCount);
      expect(sessionManager.getSessionCount).toHaveBeenCalled();
    });

    it('should clear all sessions', () => {
      const mockTransport1 = {
        handleRequest: jest.fn(),
        close: jest.fn(),
        sessionId: 'test-session-id-1',
      } as any;

      const mockTransport2 = {
        handleRequest: jest.fn(),
        close: jest.fn(),
        sessionId: 'test-session-id-2',
      } as any;

      const mockSessions = new Map([
        ['session1', { id: 'session1' }],
        ['session2', { id: 'session2' }],
      ]);

      (sessionManager.getAllSessions as jest.Mock).mockReturnValue(
        mockSessions,
      );
      const sharedMockSession = {
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId: 'session1',
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 0,
          totalToolCalls: 0,
          lastActivityAt: new Date(),
          errorCount: 0,
          averageResponseTime: 0,
        },
      };

      // Mock getSession to return different sessions with different transports
      (sessionManager.getSession as jest.Mock)
        .mockReturnValueOnce({
          transport: mockTransport1,
          ...sharedMockSession,
        })
        .mockReturnValueOnce({
          transport: mockTransport2,
          ...sharedMockSession,
        });

      sessionService.clearAllSessions();

      expect(sessionManager.getAllSessions).toHaveBeenCalled();
      expect(mockTransport1.close).toHaveBeenCalledTimes(1);
      expect(mockTransport2.close).toHaveBeenCalledTimes(1);
    });

    it('should get session metrics', () => {
      const sessionId = 'test-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 1,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      const result = sessionService.getSessionMetrics(sessionId);

      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(result).toBe(mockSession.metrics);
    });

    it('should return undefined for session metrics of non-existent session', () => {
      const sessionId = 'non-existent-session';

      (sessionManager.getSession as jest.Mock).mockReturnValue(undefined);

      const result = sessionService.getSessionMetrics(sessionId);

      expect(result).toBeUndefined();
    });

    it('should check if session is expired', () => {
      const sessionId = 'expired-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
          expiresAt: new Date(Date.now() - 30000), // 30 seconds ago (expired)
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 0,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      const result = sessionService.isSessionExpired(sessionId);

      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(result).toBe(true);
    });

    it('should return false for non-expired session', () => {
      const sessionId = 'active-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(Date.now() - 60000), // 1 minute ago
          expiresAt: new Date(Date.now() + 30000), // 30 seconds in the future (not expired)
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 0,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      const result = sessionService.isSessionExpired(sessionId);

      expect(sessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(result).toBe(false);
    });

    it('should return true for non-existent session expiration check', () => {
      const sessionId = 'non-existent-session';

      (sessionManager.getSession as jest.Mock).mockReturnValue(undefined);

      const result = sessionService.isSessionExpired(sessionId);

      expect(result).toBe(true);
    });
  });

  describe('Session Extension', () => {
    it('should extend session successfully', () => {
      const sessionId = 'test-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 0,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      const result = sessionService.extendSession(sessionId, 60000); // 60 seconds

      expect(result).toBe(true);
      expect(mockSession.metrics.expiresAt.getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(mockSessionLogger.logSessionMetrics).toHaveBeenCalledWith(
        mockSession.metrics,
      );
    });

    it('should return false when extending non-existent session', () => {
      const sessionId = 'non-existent-session';

      (sessionManager.getSession as jest.Mock).mockReturnValue(undefined);

      const result = sessionService.extendSession(sessionId);

      expect(result).toBe(false);
    });
  });

  describe('Session Metrics Logging', () => {
    it('should log session metrics', () => {
      const sessionId = 'test-session';
      const mockSession = {
        transport: mockTransport,
        timeout: {} as any, // Mock timeout object
        userId: 'test-user-id',
        metrics: {
          sessionId,
          userId: 'test-user-id',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
          totalInteractions: 5,
          totalToolCalls: 2,
          lastActivityAt: new Date(),
          errorCount: 0,
          averageResponseTime: 100,
        },
      };

      (sessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      sessionService.logSessionMetrics(sessionId);

      expect(mockSessionLogger.logSessionMetrics).toHaveBeenCalledWith(
        mockSession.metrics,
      );
    });

    it('should handle logging metrics for non-existent session gracefully', () => {
      const sessionId = 'non-existent-session';

      (sessionManager.getSession as jest.Mock).mockReturnValue(undefined);

      expect(() => {
        sessionService.logSessionMetrics(sessionId);
      }).not.toThrow();

      expect(mockSessionLogger.logSessionMetrics).not.toHaveBeenCalled();
    });
  });
});
