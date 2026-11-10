import { AxiosRequestConfig } from 'axios';

import { getCarbonVoiceAPI } from '../../src/cv-api';
import { mutator } from '../../src/utils/axios-instance';
import { UserInfo } from '../../src/interfaces';

jest.mock('../../src/utils/axios-instance', () => ({
  mutator: jest.fn(),
}));

const mockMutator = mutator as jest.MockedFunction<typeof mutator>;

const makeContact = (overrides: Record<string, unknown> = {}) => ({
  user_guid: 'user-123',
  created_at: '2024-01-01T00:00:00Z',
  first_name: 'John',
  last_name: 'Doe',
  image_url: 'https://example.com/avatar.jpg',
  languages: ['en'],
  voice_gender: 'M' as const,
  created_by: 'admin-guid',
  last_updated_at: '2024-06-01T00:00:00Z',
  workspace_guids: ['ws-1', 'ws-2'],
  workspace_roles: [
    {
      workspace_id: 'ws-1',
      role: 'admin',
      joined_at: '2024-01-01T00:00:00Z',
      sort_order: 0,
    },
  ],
  is_allowed_to_receive_notification: true,
  user_type: 'user' as const,
  ...overrides,
});

describe('getCarbonVoiceAPI().getContacts', () => {
  const api = getCarbonVoiceAPI();

  it('should throw before HTTP call when called with an empty array', async () => {
    await expect(api.getContacts([])).rejects.toThrow();
    expect(mockMutator).not.toHaveBeenCalled();
  });

  it('should issue POST /contacts with user_guids body', async () => {
    const contact = makeContact();
    mockMutator.mockResolvedValueOnce([contact]);

    await api.getContacts(['user-123']);

    expect(mockMutator).toHaveBeenCalledWith(
      { url: '/contacts', method: 'POST', data: { user_guids: ['user-123'] } },
      undefined,
    );
  });

  it('should forward auth options to mutator', async () => {
    const contact = makeContact();
    mockMutator.mockResolvedValueOnce([contact]);
    const options: AxiosRequestConfig = {
      headers: { Authorization: 'Bearer tok' },
    };

    await api.getContacts(['user-123'], options);

    expect(mockMutator).toHaveBeenCalledWith(
      { url: '/contacts', method: 'POST', data: { user_guids: ['user-123'] } },
      options,
    );
  });

  it('should rename user_guid to id and workspace_guids to workspace_ids', async () => {
    const contact = makeContact();
    mockMutator.mockResolvedValueOnce([contact]);

    const result = await api.getContacts(['user-123']);

    expect(result).toHaveLength(1);
    const userInfo = result[0];
    expect(userInfo.id).toBe('user-123');
    expect(userInfo.workspace_ids).toEqual(['ws-1', 'ws-2']);
    expect(
      (userInfo as unknown as Record<string, unknown>)['user_guid'],
    ).toBeUndefined();
    expect(
      (userInfo as unknown as Record<string, unknown>)['workspace_guids'],
    ).toBeUndefined();
  });

  it('should pass through all non-renamed fields', async () => {
    const contact = makeContact();
    mockMutator.mockResolvedValueOnce([contact]);

    const result = await api.getContacts(['user-123']);
    const userInfo = result[0];

    expect(userInfo.created_at).toBe(contact.created_at);
    expect(userInfo.first_name).toBe(contact.first_name);
    expect(userInfo.last_name).toBe(contact.last_name);
    expect(userInfo.image_url).toBe(contact.image_url);
    expect(userInfo.languages).toEqual(contact.languages);
    expect(userInfo.voice_gender).toBe(contact.voice_gender);
    expect(userInfo.created_by).toBe(contact.created_by);
    expect(userInfo.last_updated_at).toBe(contact.last_updated_at);
    expect(userInfo.workspace_roles).toEqual(contact.workspace_roles);
    expect(userInfo.is_allowed_to_receive_notification).toBe(
      contact.is_allowed_to_receive_notification,
    );
    expect(userInfo.user_type).toBe(contact.user_type);
  });

  it('should produce valid UserInfo when optional fields are absent', async () => {
    const contact = makeContact();
    const {
      last_name: _ln,
      image_url: _iu,
      ...contactWithoutOptionals
    } = contact;
    mockMutator.mockResolvedValueOnce([contactWithoutOptionals]);

    const result = await api.getContacts(['user-123']);
    const userInfo = result[0];

    expect(userInfo.last_name).toBeUndefined();
    expect(userInfo.image_url).toBeUndefined();
    expect(userInfo.first_name).toBe(contact.first_name);
  });

  it('should map multiple contacts to UserInfo[]', async () => {
    const contact1 = makeContact({ user_guid: 'user-1' });
    const contact2 = makeContact({
      user_guid: 'user-2',
      workspace_guids: ['ws-3'],
    });
    mockMutator.mockResolvedValueOnce([contact1, contact2]);

    const result = await api.getContacts(['user-1', 'user-2']);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('user-1');
    expect(result[1].id).toBe('user-2');
    expect(result[1].workspace_ids).toEqual(['ws-3']);
  });

  it('should propagate API errors', async () => {
    const apiError = new Error('API failure');
    mockMutator.mockRejectedValueOnce(apiError);

    await expect(api.getContacts(['user-123'])).rejects.toThrow('API failure');
  });
});

describe('getCarbonVoiceAPI().createActionItemSuggestionsFromMessage', () => {
  const api = getCarbonVoiceAPI();

  it('should issue POST to the synchronous single-message suggestions route', async () => {
    mockMutator.mockResolvedValueOnce([{ id: 'ai-1' }]);

    const result = await api.createActionItemSuggestionsFromMessage('msg-1');

    expect(mockMutator).toHaveBeenCalledWith(
      { url: '/action-items/suggestions/msg-1', method: 'POST' },
      undefined,
    );
    expect(result).toEqual([{ id: 'ai-1' }]);
  });

  // The id goes into the path, so anything path-significant in it has to be
  // encoded rather than allowed to change which route is hit.
  it('should encode the message id into the path', async () => {
    mockMutator.mockResolvedValueOnce([]);

    await api.createActionItemSuggestionsFromMessage('msg/../../whoami');

    expect(mockMutator).toHaveBeenCalledWith(
      {
        url: '/action-items/suggestions/msg%2F..%2F..%2Fwhoami',
        method: 'POST',
      },
      undefined,
    );
  });

  it('should forward auth options to mutator', async () => {
    mockMutator.mockResolvedValueOnce([]);
    const options: AxiosRequestConfig = {
      headers: { Authorization: 'Bearer tok' },
    };

    await api.createActionItemSuggestionsFromMessage('msg-1', options);

    expect(mockMutator).toHaveBeenCalledWith(expect.anything(), options);
  });

  it('should propagate API errors', async () => {
    mockMutator.mockRejectedValueOnce(new Error('API failure'));

    await expect(
      api.createActionItemSuggestionsFromMessage('msg-1'),
    ).rejects.toThrow('API failure');
  });
});

describe('getCarbonVoiceAPI().searchTranscripts', () => {
  const api = getCarbonVoiceAPI();
  const body = {
    query: 'launch date decision',
    workspace_id: 'ws-1',
    exclude_message_ids: ['m-1'],
    limit: 5,
  };
  const options: AxiosRequestConfig = {
    headers: { Authorization: 'Bearer tok' },
  };

  // STT-03: one POST /search/transcripts with the body unchanged. STT-26:
  // the request carries the log-redaction flag, whatever the URL text.
  it('should issue one POST /search/transcripts with the body, options and redaction flag', async () => {
    mockMutator.mockResolvedValueOnce({ results: [], scope_capped: false });

    await api.searchTranscripts(body, options);

    expect(mockMutator).toHaveBeenCalledTimes(1);
    expect(mockMutator).toHaveBeenCalledWith(
      { url: '/search/transcripts', method: 'POST', data: body },
      { ...options, redactLogContent: true },
    );
  });

  it('should set the redaction flag when no options are given', async () => {
    mockMutator.mockResolvedValueOnce({ results: [], scope_capped: false });

    await api.searchTranscripts(body);

    expect(mockMutator).toHaveBeenCalledWith(expect.anything(), {
      redactLogContent: true,
    });
  });

  it('should return the resolved value unchanged', async () => {
    const response = {
      results: [{ message_id: 'm-2', score: 0.9, matched_chunk: 'x' }],
      scope_capped: true,
    };
    mockMutator.mockResolvedValueOnce(response);

    await expect(api.searchTranscripts(body, options)).resolves.toBe(response);
  });

  it('should propagate the rejection unchanged', async () => {
    const envelope = {
      statusCode: 429,
      body: { error: { code: 'RATE_LIMITED' } },
    };
    mockMutator.mockRejectedValueOnce(envelope);

    await expect(api.searchTranscripts(body, options)).rejects.toBe(envelope);
  });
});

describe('getCarbonVoiceAPI().getMessagesByIds', () => {
  const api = getCarbonVoiceAPI();

  it('should issue one POST /v6/messages/by-ids with the body and options, unredacted', async () => {
    const body = { message_ids: ['m-1', 'm-2'], language: 'es' };
    const options: AxiosRequestConfig = {
      headers: { Authorization: 'Bearer tok' },
    };
    const response = [{ id: 'm-1', status: 'active' }];
    mockMutator.mockResolvedValueOnce(response);

    await expect(api.getMessagesByIds(body, options)).resolves.toBe(response);

    expect(mockMutator).toHaveBeenCalledTimes(1);
    expect(mockMutator).toHaveBeenCalledWith(
      { url: '/v6/messages/by-ids', method: 'POST', data: body },
      options,
    );
  });
});

describe('getCarbonVoiceAPI().getMessageInteractions', () => {
  const api = getCarbonVoiceAPI();

  it('should issue one GET /v6/message/{id}/interactions with the options', async () => {
    const options: AxiosRequestConfig = {
      headers: { Authorization: 'Bearer tok' },
    };
    const response = {
      message: { id: 'm-1', status: 'active' },
      interactions: [],
    };
    mockMutator.mockResolvedValueOnce(response);

    await expect(api.getMessageInteractions('m-1', options)).resolves.toBe(
      response,
    );

    expect(mockMutator).toHaveBeenCalledTimes(1);
    expect(mockMutator).toHaveBeenCalledWith(
      { url: '/v6/message/m-1/interactions', method: 'GET' },
      options,
    );
  });

  it('should encode the id so it cannot change the path', async () => {
    mockMutator.mockResolvedValueOnce({ message: {}, interactions: [] });

    await api.getMessageInteractions('../m 1');

    expect(mockMutator).toHaveBeenCalledWith(
      { url: '/v6/message/..%2Fm%201/interactions', method: 'GET' },
      undefined,
    );
  });
});
