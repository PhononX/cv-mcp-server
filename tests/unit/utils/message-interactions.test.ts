import {
  MessageInteractionsV6Response,
  UserInfo,
} from '../../../src/interfaces';
import { toMessageInteractionsResponse } from '../../../src/utils/message-interactions';

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  status: 'active',
  creator_id: 'creator',
  content: { duration_ms: 10_000 },
  ...overrides,
});

const row = (user_id: string, heard_ms: number, is_notified = false) => ({
  user_id,
  heard_ms,
  is_notified,
  reaction_ids: [],
});

const contact = (id: string, first_name: string, last_name?: string) =>
  ({ id, first_name, last_name }) as UserInfo;

describe('toMessageInteractionsResponse', () => {
  it('keeps the message as-is and leaves the creator out of the rows', () => {
    const response: MessageInteractionsV6Response = {
      message: message(),
      interactions: [row('creator', 10_000), row('u-1', 5_000)],
    };

    const result = toMessageInteractionsResponse(response, []);

    expect(result.message).toBe(response.message);
    expect(result.interactions.map((r) => r.user_id)).toEqual(['u-1']);
  });

  it('adds heard_percent from content.duration_ms, rounded and capped at 100', () => {
    const response: MessageInteractionsV6Response = {
      message: message(),
      interactions: [
        row('u-0', 0, true),
        row('u-1', 3_333),
        row('u-2', 10_000),
        // heard_ms can run past the duration (seek to the end, replays).
        row('u-3', 12_500),
      ],
    };

    const result = toMessageInteractionsResponse(response, []);

    expect(result.interactions.map((r) => r.heard_percent)).toEqual([
      0, 33, 100, 100,
    ]);
  });

  it.each([
    ['no content', { content: undefined }],
    ['no duration', { content: { transcript: 'hi' } }],
    ['a zero duration', { content: { duration_ms: 0 } }],
  ])('sets heard_percent to null for %s', (_label, overrides) => {
    const response: MessageInteractionsV6Response = {
      message: message(overrides),
      interactions: [row('u-1', 0)],
    };

    const [first] = toMessageInteractionsResponse(response, []).interactions;

    expect(first.heard_percent).toBeNull();
  });

  it('names each row from contacts and omits name when it is unknown', () => {
    const response: MessageInteractionsV6Response = {
      message: message(),
      interactions: [row('u-1', 0), row('u-2', 0), row('u-3', 0)],
    };

    const result = toMessageInteractionsResponse(response, [
      contact('u-1', 'Ada', 'Lovelace'),
      contact('u-2', 'Grace'),
    ]);

    expect(result.interactions).toEqual([
      expect.objectContaining({ user_id: 'u-1', name: 'Ada Lovelace' }),
      expect.objectContaining({ user_id: 'u-2', name: 'Grace' }),
      expect.not.objectContaining({ name: expect.anything() }),
    ]);
  });

  it('passes is_notified and reaction_ids through', () => {
    const response: MessageInteractionsV6Response = {
      message: message(),
      interactions: [
        {
          user_id: 'u-1',
          heard_ms: 0,
          is_notified: true,
          reaction_ids: ['like'],
        },
      ],
    };

    const [first] = toMessageInteractionsResponse(response, []).interactions;

    expect(first).toEqual({
      user_id: 'u-1',
      heard_ms: 0,
      heard_percent: 0,
      is_notified: true,
      reaction_ids: ['like'],
    });
  });
});
