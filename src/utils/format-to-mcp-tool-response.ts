import { logger } from './logger';

import { McpToolResponse } from '../interfaces';

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
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code,
              message,
              details,
            },
          }),
        },
      ],
    };
  }
};
