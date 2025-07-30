import { AxiosRequestConfig } from 'axios';

import { env } from './config';
import { logger } from './utils';
import { mutator } from './utils/axios-instance';

export const getCarbonVoiceAPI = () => {
  return {
    getWhoAmI: async (options?: AxiosRequestConfig): Promise<unknown> => {
      return mutator({ url: `/whoami`, method: 'GET' }, options);
    },
  };
};

export const getCarbonVoiceApiStatus = async (): Promise<{
  isHealthy: boolean;
  apiUrl: string;
  error?: string;
}> => {
  try {
    const response = await mutator<{
      status: string;
    }>({ url: `/health`, method: 'GET' });

    return {
      isHealthy: response.status === 'ok',
      apiUrl: env.CARBON_VOICE_BASE_URL,
    };
  } catch (error) {
    logger.error('Error getting backend status:', error);
    return {
      isHealthy: false,
      apiUrl: env.CARBON_VOICE_BASE_URL,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
};
