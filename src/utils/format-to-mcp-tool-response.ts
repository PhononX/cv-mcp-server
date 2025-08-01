import { logger } from './logger';

import { McpToolResponse } from '../interfaces';
import { getTraceId } from '../transports/http/utils/request-context';

const isErrorWithDetails = (
  error: unknown,
): error is { code?: string; message?: string; details?: unknown } => {
  return typeof error === 'object' && error !== null;
};

export const formatToMCPToolResponse = (data: unknown): McpToolResponse => {
  try {
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
    };
  } catch (error: unknown) {
    logger.error('Error formatting response:', { data, error });

    let code = 'UNKNOWN_ERROR';
    let message = 'Error formatting response';
    let details;

    if (isErrorWithDetails(error)) {
      code = error?.code || code;
      message = error?.message || message;
      details = error?.details;
    }
    const traceId = getTraceId();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code,
              message,
              details,
              traceId,
            },
          }),
        },
        {
          type: 'text',
          text: `--- Debug Info ---\nTrace ID: ${traceId || 'N/A'}\nFor support, include this Trace ID in your report.`,
        },
      ],
    };
  }
};
