import { formatBytesHuman } from './format-bytes-human';
import { logger } from './logger';
import { projectResponse } from './project-response';
import { withToolErrorHint } from './tool-error-hint';

import { McpToolResponse } from '../interfaces';
import { getTraceId } from '../transports/http/utils/request-context';

const isErrorWithDetails = (
  error: unknown,
): error is { code?: string; message?: string; details?: unknown } => {
  return typeof error === 'object' && error !== null;
};

export interface FormatOptions {
  /**
   * Marks the response as a failure so the agent can detect it without
   * parsing the body. Set it in a handler's catch block; the formatter cannot
   * tell an error payload from a successful one by inspection, and guessing
   * would couple it to the shape of every response.
   */
  isError?: boolean;
  /**
   * Tool name, used to look up a recovery hint for the error's code in
   * `TOOL_DOCS`. Only meaningful together with `isError`.
   */
  tool?: string;
  /**
   * Caller-supplied dot-path allowlist narrowing the payload. Omitted or empty
   * means the payload is passed through by reference, so behaviour is
   * identical to not having projection at all. Ignored for error responses:
   * an agent that mis-projects an error would lose the very message telling it
   * what went wrong.
   */
  responseFields?: string[];
}

export const formatToMCPToolResponse = (
  data: unknown,
  options: FormatOptions = {},
): McpToolResponse => {
  const traceId = getTraceId();
  const stringifyStart = Date.now();
  const payload = options.isError
    ? withToolErrorHint(data, options.tool)
    : projectResponse(data, options.responseFields);
  try {
    logger.info('MCP_RESPONSE_STRINGIFY_START', {
      event: 'MCP_RESPONSE_STRINGIFY_START',
      traceId,
      payloadType: Array.isArray(payload) ? 'array' : typeof payload,
    });

    const serializedData = JSON.stringify(payload);
    // JSON.stringify(undefined) returns undefined (non-throwing). Keep legacy response shape.
    const payloadBytes =
      serializedData === undefined
        ? 0
        : Buffer.byteLength(serializedData, 'utf8');
    const stringifyDurationMs = Date.now() - stringifyStart;

    logger.info('MCP_RESPONSE_STRINGIFY_DONE', {
      event: 'MCP_RESPONSE_STRINGIFY_DONE',
      traceId,
      payloadBytes,
      payloadSizeHuman: formatBytesHuman(payloadBytes),
      stringifyDurationMs,
    });

    return {
      content: [{ type: 'text', text: serializedData }],
      ...(options.isError ? { isError: true } : {}),
    };
  } catch (error: unknown) {
    // Keep legacy error log contract used by current tests and dashboards.
    logger.error('Error formatting response:', { data, error });
    logger.error('MCP_RESPONSE_STRINGIFY_FAILED', {
      event: 'MCP_RESPONSE_STRINGIFY_FAILED',
      traceId,
      stringifyDurationMs: Date.now() - stringifyStart,
      payloadType: Array.isArray(payload) ? 'array' : typeof payload,
      error,
    });

    let code = 'UNKNOWN_ERROR';
    let message = 'Error formatting response';
    let details;

    if (isErrorWithDetails(error)) {
      code = error?.code || code;
      message = error?.message || message;
      details = error?.details;
    }

    const fallbackSerializedError = JSON.stringify({
      error: {
        code,
        message,
        details,
        traceId,
      },
    });
    const fallbackPayloadBytes = Buffer.byteLength(
      fallbackSerializedError,
      'utf8',
    );

    logger.info('MCP_RESPONSE_STRINGIFY_FALLBACK_DONE', {
      event: 'MCP_RESPONSE_STRINGIFY_FALLBACK_DONE',
      traceId,
      payloadBytes: fallbackPayloadBytes,
      payloadSizeHuman: formatBytesHuman(fallbackPayloadBytes),
    });

    return {
      content: [
        {
          type: 'text',
          text: fallbackSerializedError,
        },
        {
          type: 'text',
          text: `--- Debug Info ---\nTrace ID: ${traceId || 'N/A'}\nFor support, include this Trace ID in your report.`,
        },
      ],
      // Serialization failed, so this is a failure regardless of what the
      // caller intended.
      isError: true,
    };
  }
};
