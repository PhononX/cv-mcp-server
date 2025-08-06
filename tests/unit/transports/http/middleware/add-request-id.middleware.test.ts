import { addRequestIdMiddleware } from '../../../../../src/transports/http/middleware/add-request-id.middlware';

// Mock the request context utilities
jest.mock('../../../../../src/transports/http/utils/request-context', () => ({
  createRequestContext: jest.fn(() => ({})),
  generateTraceId: jest.fn(() => 'test-trace-id'),
  runWithContext: jest.fn((context, fn) => fn()),
}));

describe('Add Request ID Middleware', () => {
  it('should add request ID and set headers', () => {
    const req: any = {
      headers: {},
    };
    const res: any = {
      set: jest.fn(),
    };
    const next = jest.fn();

    addRequestIdMiddleware(req, res, next);

    expect(req.id).toBe('test-trace-id');
    expect(res.set).toHaveBeenCalledWith('X-Request-ID', 'test-trace-id');
    expect(res.set).toHaveBeenCalledWith('X-Trace-ID', 'test-trace-id');
    expect(next).toHaveBeenCalled();
  });

  it('should work with existing request ID', () => {
    const req: any = {
      headers: {
        'x-request-id': 'existing-request-123',
      },
    };
    const res: any = {
      set: jest.fn(),
    };
    const next = jest.fn();

    addRequestIdMiddleware(req, res, next);

    // Should still generate new trace ID and set headers
    expect(req.id).toBe('test-trace-id');
    expect(res.set).toHaveBeenCalledWith('X-Request-ID', 'test-trace-id');
    expect(res.set).toHaveBeenCalledWith('X-Trace-ID', 'test-trace-id');
    expect(next).toHaveBeenCalled();
  });

  it('should handle different header cases', () => {
    const req: any = {
      headers: {
        'X-Request-ID': 'existing-request-456',
      },
    };
    const res: any = {
      set: jest.fn(),
    };
    const next = jest.fn();

    addRequestIdMiddleware(req, res, next);

    expect(req.id).toBe('test-trace-id');
    expect(res.set).toHaveBeenCalledWith('X-Request-ID', 'test-trace-id');
    expect(res.set).toHaveBeenCalledWith('X-Trace-ID', 'test-trace-id');
    expect(next).toHaveBeenCalled();
  });

  it('should generate unique IDs for different requests', () => {
    const {
      generateTraceId,
    } = require('../../../../../src/transports/http/utils/request-context');

    // Mock different trace IDs for different calls
    generateTraceId
      .mockReturnValueOnce('trace-id-1')
      .mockReturnValueOnce('trace-id-2');

    const req1: any = { headers: {} };
    const req2: any = { headers: {} };
    const res: any = { set: jest.fn() };
    const next = jest.fn();

    addRequestIdMiddleware(req1, res, next);
    addRequestIdMiddleware(req2, res, next);

    expect(req1.id).toBe('trace-id-1');
    expect(req2.id).toBe('trace-id-2');
  });

  it('should handle null headers', () => {
    const req: any = {
      headers: null,
    };
    const res: any = {
      set: jest.fn(),
    };
    const next = jest.fn();

    addRequestIdMiddleware(req, res, next);

    expect(req.id).toBe('test-trace-id');
    expect(res.set).toHaveBeenCalledWith('X-Request-ID', 'test-trace-id');
    expect(res.set).toHaveBeenCalledWith('X-Trace-ID', 'test-trace-id');
    expect(next).toHaveBeenCalled();
  });
});
