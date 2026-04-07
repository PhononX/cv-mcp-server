import { logger } from './logger';

import { McpToolResponse } from '../interfaces';
import { getTraceId } from '../transports/http/utils/request-context';

const isErrorWithDetails = (
  error: unknown,
): error is { code?: string; message?: string; details?: unknown } => {
  return typeof error === 'object' && error !== null;
};

const formatBytesHuman = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

export const formatToMCPToolResponse = (data: unknown): McpToolResponse => {
  const traceId = getTraceId();
  const stringifyStart = Date.now();
  try {
    logger.info('MCP_RESPONSE_STRINGIFY_START', {
      event: 'MCP_RESPONSE_STRINGIFY_START',
      traceId,
      payloadType: Array.isArray(data) ? 'array' : typeof data,
    });

    const serializedData = JSON.stringify(data);
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
    };
  } catch (error: unknown) {
    // Keep legacy error log contract used by current tests and dashboards.
    logger.error('Error formatting response:', { data, error });
    logger.error('MCP_RESPONSE_STRINGIFY_FAILED', {
      event: 'MCP_RESPONSE_STRINGIFY_FAILED',
      traceId,
      stringifyDurationMs: Date.now() - stringifyStart,
      payloadType: Array.isArray(data) ? 'array' : typeof data,
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
    const fallbackPayloadBytes = Buffer.byteLength(fallbackSerializedError, 'utf8');

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
    };
  }
};
