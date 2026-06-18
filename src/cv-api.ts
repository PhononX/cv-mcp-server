import { AxiosRequestConfig } from 'axios';

import { env } from './config';
import { UserInfo, WorkspaceRole } from './interfaces';
import { logger } from './utils';
import { mutator } from './utils/axios-instance';

interface Contact {
  user_guid: string;
  created_at: string;
  first_name: string;
  last_name?: string;
  image_url?: string;
  languages: string[];
  voice_gender: 'F' | 'M';
  created_by: string;
  last_updated_at: string;
  workspace_guids: string[];
  workspace_roles: WorkspaceRole[];
  is_allowed_to_receive_notification: boolean;
  user_type: 'user' | 'bot';
}

const mapContactToUserInfo = (contact: Contact): UserInfo => {
  const { user_guid, workspace_guids, ...rest } = contact;
  return {
    ...rest,
    id: user_guid,
    workspace_ids: workspace_guids,
  };
};

export const getCarbonVoiceAPI = () => {
  return {
    getWhoAmI: async (options?: AxiosRequestConfig): Promise<unknown> => {
      return mutator({ url: `/whoami`, method: 'GET' }, options);
    },

    getContacts: async (
      userIds: string[],
      options?: AxiosRequestConfig,
    ): Promise<UserInfo[]> => {
      if (userIds.length === 0) {
        throw new Error('getContacts requires at least one user ID');
      }
      const contacts = await mutator<Contact[]>(
        { url: '/contacts', method: 'POST', data: { user_guids: userIds } },
        options,
      );
      return contacts.map(mapContactToUserInfo);
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
