import { AxiosRequestConfig } from 'axios';

import { mutator } from './utils/axios-instance';

export const getCarbonVoiceAPI = () => {
  return {
    getWhoAmI: async (options?: AxiosRequestConfig): Promise<unknown> => {
      return mutator({ url: `/whoami`, method: 'GET' }, options);
    },
  };
};
