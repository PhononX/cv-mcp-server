import { AxiosRequestConfig } from 'axios';

import { env } from './config';
import { UserInfo, WorkspaceRole } from './interfaces';
import {
  ListInboxNotificationsParams,
  SearchMessageIdsParams,
  SearchMessagesByHeardStatusParams,
} from './schemas';
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

    /**
     * `GET /search/message-ids` — the only endpoint that can filter messages by
     * notified state or by tagged user. Returns IDs plus cursor metadata, so it
     * is cheap in tokens; hydrate the ones you need with `get_message`.
     *
     * Not part of the simplified API, so there is no generated client for it.
     */
    searchMessageIds: async (
      params: SearchMessageIdsParams,
      options?: AxiosRequestConfig,
    ): Promise<unknown> => {
      return mutator(
        { url: '/search/message-ids', method: 'GET', params },
        options,
      );
    },

    /**
     * `POST /v3/search` — the only endpoint exposing listened/unheard state,
     * and the only one returning `unheard_counts_by_channel`.
     *
     * Deliberately omits the upstream `begin_date` / `end_date` params: their
     * DTO declares `@IsDate()` without `@Type(() => Date)`, so an ISO string
     * fails validation and there is no way to express a Date over JSON-RPC.
     * Date-filtered search goes through `searchMessageIds`, whose equivalent
     * field does carry `@Type`.
     */
    searchMessagesByHeardStatus: async (
      params: SearchMessagesByHeardStatusParams,
      options?: AxiosRequestConfig,
    ): Promise<unknown> => {
      return mutator(
        { url: '/v3/search', method: 'POST', data: params },
        options,
      );
    },

    /**
     * `GET /inbox-notifications` — the notification centre, including the
     * `mentions` category and a `total_unread` count.
     */
    listInboxNotifications: async (
      params: ListInboxNotificationsParams,
      options?: AxiosRequestConfig,
    ): Promise<unknown> => {
      return mutator(
        { url: '/inbox-notifications', method: 'GET', params },
        options,
      );
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
