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
    { workspace_id: 'ws-1', role: 'admin', joined_at: '2024-01-01T00:00:00Z', sort_order: 0 },
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
    const options: AxiosRequestConfig = { headers: { Authorization: 'Bearer tok' } };

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
    expect((userInfo as unknown as Record<string, unknown>)['user_guid']).toBeUndefined();
    expect((userInfo as unknown as Record<string, unknown>)['workspace_guids']).toBeUndefined();
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
    expect(userInfo.is_allowed_to_receive_notification).toBe(contact.is_allowed_to_receive_notification);
    expect(userInfo.user_type).toBe(contact.user_type);
  });

  it('should produce valid UserInfo when optional fields are absent', async () => {
    const contact = makeContact();
    const { last_name: _ln, image_url: _iu, ...contactWithoutOptionals } = contact;
    mockMutator.mockResolvedValueOnce([contactWithoutOptionals]);

    const result = await api.getContacts(['user-123']);
    const userInfo = result[0];

    expect(userInfo.last_name).toBeUndefined();
    expect(userInfo.image_url).toBeUndefined();
    expect(userInfo.first_name).toBe(contact.first_name);
  });

  it('should map multiple contacts to UserInfo[]', async () => {
    const contact1 = makeContact({ user_guid: 'user-1' });
    const contact2 = makeContact({ user_guid: 'user-2', workspace_guids: ['ws-3'] });
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
