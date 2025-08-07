import { Request, Response, NextFunction } from 'express';

import { logRequest } from '../../../../../src/transports/http/middleware/log-request.middlware';
import { AuthenticatedRequest } from '../../../../../src/auth/interfaces';

// Mock dependencies
jest.mock('../../../../../src/utils', () => ({
  logger: {
    info: jest.fn(),
  },
  timeToHuman: jest.fn((duration: number) => `${duration}ms`),
}));

jest.mock('../../../../../src/transports/http/session', () => ({
  sessionService: {
    logSessionMetrics: jest.fn(),
    getSessionMetrics: jest.fn(),
  },
}));

jest.mock('../../../../../src/transports/http/utils', () => ({
  getSessionId: jest.fn(),
}));

jest.mock(
  '../../../../../src/transports/http/utils/extract-client-info',
  () => ({
    extractClientInfo: jest.fn(() => ({
      userAgent: 'test-agent',
      clientId: 'test-client-id',
    })),
  }),
);

import { logger, timeToHuman } from '../../../../../src/utils';
import { sessionService } from '../../../../../src/transports/http/session';
import { getSessionId } from '../../../../../src/transports/http/utils';
import { extractClientInfo } from '../../../../../src/transports/http/utils/extract-client-info';

describe('Log Request Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockResOn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockResOn = jest.fn();
    mockReq = {
      method: 'GET',
      url: '/api/test',
      headers: {
        'user-agent': 'test-agent',
        'x-forwarded-for': '192.168.1.1',
      },
      body: { test: 'data' },
      auth: {
        extra: {
          user: { id: 'test-user-id' },
        },
        clientId: 'test-client-id',
      },
      ip: '192.168.1.1',
    } as unknown as AuthenticatedRequest;

    mockRes = {
      statusCode: 200,
      on: mockResOn,
    } as Partial<Response>;

    mockNext = jest.fn();
  });

  it('should call next immediately', () => {
    logRequest(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should set up finish event listener', () => {
    logRequest(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should log request details when response finishes', () => {
    // Mock timeToHuman to return a specific value
    (timeToHuman as jest.Mock).mockReturnValue('100ms');

    logRequest(mockReq as Request, mockRes as Response, mockNext);

    // Get the finish callback and call it
    const finishCallback = mockResOn.mock.calls[0][1];
    finishCallback();

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('HTTP GET /api/test 200 100ms'),
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
        statusCode: 200,
        duration: expect.any(Number),
        clientInfo: expect.any(Object),
        body: { test: 'data' },
      }),
    );
  });

  it('should extract client info', () => {
    logRequest(mockReq as Request, mockRes as Response, mockNext);

    const finishCallback = mockResOn.mock.calls[0][1];
    finishCallback();

    expect(extractClientInfo).toHaveBeenCalledWith(mockReq);
  });

  it('should handle session metrics for tools/call method', () => {
    mockReq.body = { method: 'tools/call' };
    (getSessionId as jest.Mock).mockReturnValue('test-session-id');

    logRequest(mockReq as Request, mockRes as Response, mockNext);

    const finishCallback = mockResOn.mock.calls[0][1];
    finishCallback();

    expect(sessionService.logSessionMetrics).toHaveBeenCalledWith(
      'test-session-id',
    );
  });

  it('should handle session metrics for regular interactions', () => {
    (getSessionId as jest.Mock).mockReturnValue('test-session-id');
    (sessionService.getSessionMetrics as jest.Mock).mockReturnValue({
      totalInteractions: 10, // Multiple of 10
    });

    logRequest(mockReq as Request, mockRes as Response, mockNext);

    const finishCallback = mockResOn.mock.calls[0][1];
    finishCallback();

    expect(sessionService.getSessionMetrics).toHaveBeenCalledWith(
      'test-session-id',
    );
    expect(sessionService.logSessionMetrics).toHaveBeenCalledWith(
      'test-session-id',
    );
  });

  it('should not log session metrics when totalInteractions is not multiple of 10', () => {
    (getSessionId as jest.Mock).mockReturnValue('test-session-id');
    (sessionService.getSessionMetrics as jest.Mock).mockReturnValue({
      totalInteractions: 7, // Not multiple of 10
    });

    logRequest(mockReq as Request, mockRes as Response, mockNext);

    const finishCallback = mockResOn.mock.calls[0][1];
    finishCallback();

    expect(sessionService.getSessionMetrics).toHaveBeenCalledWith(
      'test-session-id',
    );
    expect(sessionService.logSessionMetrics).not.toHaveBeenCalled();
  });

  it('should handle missing session ID', () => {
    (getSessionId as jest.Mock).mockReturnValue(null);

    logRequest(mockReq as Request, mockRes as Response, mockNext);

    const finishCallback = mockResOn.mock.calls[0][1];
    finishCallback();

    expect(sessionService.getSessionMetrics).not.toHaveBeenCalled();
    expect(sessionService.logSessionMetrics).not.toHaveBeenCalled();
  });

  it('should handle different HTTP methods', () => {
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    methods.forEach((method) => {
      jest.clearAllMocks();
      mockReq.method = method;

      logRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });
  });

  it('should handle different status codes', () => {
    const statusCodes = [200, 201, 400, 401, 404, 500];

    statusCodes.forEach((statusCode) => {
      jest.clearAllMocks();
      mockRes.statusCode = statusCode;

      logRequest(mockReq as Request, mockRes as Response, mockNext);

      const finishCallback = mockResOn.mock.calls[0][1];
      finishCallback();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`${statusCode}`),
        expect.any(Object),
      );
    });
  });

  // Test that the middleware processes ALL requests (since ignore paths are commented out)
  it('should not process health endpoint requests', () => {
    mockReq.url = '/health';

    logRequest(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.on).not.toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should not process favicon requests', () => {
    mockReq.url = '/favicon.ico';

    logRequest(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.on).not.toHaveBeenCalledWith('finish', expect.any(Function));
  });
});
