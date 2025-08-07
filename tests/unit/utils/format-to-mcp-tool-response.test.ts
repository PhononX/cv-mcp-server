import { logger } from '../../../src/utils/logger';
import { formatToMCPToolResponse } from '../../../src/utils/format-to-mcp-tool-response';

// Mock the logger to prevent circular reference issues
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock getTraceId to return a predictable value
jest.mock('../../../src/transports/http/utils/request-context', () => ({
  getTraceId: jest.fn(() => 'test-trace-id-123'),
}));

describe('formatToMCPToolResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should format successful response', () => {
    const data = { message: 'success', id: 123 };
    const result = formatToMCPToolResponse(data);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(data),
        },
      ],
    });
  });

  it('should format error response', () => {
    const error = new Error('Test error');
    const result = formatToMCPToolResponse(error);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(error),
        },
      ],
    });
  });

  it('should log error when formatting error response', () => {
    const spy = jest.spyOn(logger, 'error');

    // Create an object that will cause JSON.stringify to fail
    const circularObject: any = {};
    circularObject.self = circularObject; // This creates a circular reference

    const result = formatToMCPToolResponse(circularObject);

    // Verify logger.error was called with the correct parameters
    expect(spy).toHaveBeenCalledWith('Error formatting response:', {
      data: circularObject,
      error: expect.any(Error),
    });

    // Verify the result contains error information
    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('text');
    expect(result.content[1].type).toBe('text');

    // Parse the error content to verify structure
    const errorContent = JSON.parse(
      (result.content[0] as { type: 'text'; text: string }).text,
    );
    expect(errorContent.error).toBeDefined();
    expect(errorContent.error.code).toBe('UNKNOWN_ERROR');
    expect(errorContent.error.message).toContain(
      'Converting circular structure to JSON',
    );
    expect(errorContent.error.traceId).toBe('test-trace-id-123');

    // Verify debug info contains trace ID
    expect(
      (result.content[1] as { type: 'text'; text: string }).text,
    ).toContain('Debug Info');
    expect(
      (result.content[1] as { type: 'text'; text: string }).text,
    ).toContain('Trace ID: test-trace-id-123');
  });

  it('should format string response', () => {
    const data = 'simple string';
    const result = formatToMCPToolResponse(data);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(data),
        },
      ],
    });
  });

  it('should format null response', () => {
    const result = formatToMCPToolResponse(null);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(null),
        },
      ],
    });
  });

  it('should format undefined response', () => {
    const result = formatToMCPToolResponse(undefined);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(undefined),
        },
      ],
    });
  });

  it('should format complex object response', () => {
    const data = {
      user: {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
      },
      metadata: {
        created: new Date('2023-01-01'),
        tags: ['test', 'example'],
      },
    };
    const result = formatToMCPToolResponse(data);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(data),
        },
      ],
    });
  });
});
