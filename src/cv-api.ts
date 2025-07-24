import { AxiosRequestConfig } from 'axios';

import { logger } from './utils';
import { mutator } from './utils/axios-instance';

export const getCarbonVoiceAPI = () => {
  return {
    getWhoAmI: async (options?: AxiosRequestConfig): Promise<unknown> => {
      return mutator({ url: `/whoami`, method: 'GET' }, options);
    },
  };
};

export const isCarbonVoiceApiWorking = async (): Promise<boolean> => {
  try {
    const response = await mutator<{
      status: string;
    }>({ url: `/health`, method: 'GET' });

    return response.status === 'ok';
  } catch (error) {
    logger.error('Error getting backend status:', error);
    return false;
  }
};
