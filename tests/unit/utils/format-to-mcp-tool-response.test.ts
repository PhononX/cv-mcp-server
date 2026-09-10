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

describe('formatToMCPToolResponse isError flag', () => {
  it('does not set isError on a success response', () => {
    const result = formatToMCPToolResponse({ ok: true });
    expect(result.isError).toBeUndefined();
  });

  it('sets isError when the caller marks the payload as a failure', () => {
    // Without this, a failure is byte-indistinguishable from a success and the
    // agent has to parse the body to notice anything went wrong.
    const result = formatToMCPToolResponse(
      { statusCode: 404, body: { error: { code: 'NOT_FOUND' } } },
      { isError: true },
    );
    expect(result.isError).toBe(true);
  });

  it('still serializes the payload unchanged when no hint applies', () => {
    const payload = { statusCode: 500, body: { error: { code: 'WAT' } } };
    const result = formatToMCPToolResponse(payload, {
      isError: true,
      tool: 'list_messages',
    });
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(
      payload,
    );
  });

  it('appends a tool-specific next_action for a known error code', () => {
    // run_ai_action documents BAD_REQUEST -> call list_ai_actions.
    const result = formatToMCPToolResponse(
      {
        statusCode: 400,
        body: { error: { code: 'BAD_REQUEST', message: 'nope' } },
      },
      { isError: true, tool: 'run_ai_action' },
    );

    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.body.error.next_action).toContain('list_ai_actions');
    expect(body.body.error.message).toBe('nope');
    expect(result.isError).toBe(true);
  });

  it('leaves a bare Error alone rather than inventing an envelope', () => {
    const result = formatToMCPToolResponse(new Error('boom'), {
      isError: true,
      tool: 'run_ai_action',
    });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).not.toContain(
      'next_action',
    );
  });

  it('does not add a hint for a tool with no documented error of that code', () => {
    const result = formatToMCPToolResponse(
      { statusCode: 400, body: { error: { code: 'BAD_REQUEST' } } },
      { isError: true, tool: 'get_workspaces_basic_info' },
    );
    expect((result.content[0] as { text: string }).text).not.toContain(
      'next_action',
    );
  });
});
