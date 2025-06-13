import { McpToolResponse } from '../interfaces';
import { logger } from './logger';

export const formatToMCPToolResponse = (data: unknown): McpToolResponse => {
  try {
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
    };
  } catch (error: any) {
    logger.error('Error formatting response:', { data, error });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code: error?.code || 'UNKNOWN_ERROR',
              message: error?.message || 'Error formatting response',
              details: error?.details,
            },
          }),
        },
      ],
    };
  }
};
