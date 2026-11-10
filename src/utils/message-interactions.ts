import {
  GetMessageInteractionsResponse,
  MessageInteractionsV6Response,
  UserInfo,
} from '../interfaces';

/** The audio duration of a v6 message, or undefined for a text-only one. */
const durationMsOf = (
  message: MessageInteractionsV6Response['message'],
): number | undefined => {
  const content = message.content as { duration_ms?: unknown } | undefined;
  return typeof content?.duration_ms === 'number'
    ? content.duration_ms
    : undefined;
};

const displayName = (contact: UserInfo): string | undefined => {
  const name = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || undefined;
};

/**
 * Shapes a v6 interactions response for an agent:
 *  - drops the creator's own row (cv-api lists every channel member, the
 *    creator included), matching the app's engagement screen;
 *  - adds `heard_percent` so the agent does not divide by a duration it has
 *    to dig out of `message.content`;
 *  - adds `name` from `contacts`, so "who" needs no per-user `get_user` call.
 */
export const toMessageInteractionsResponse = (
  response: MessageInteractionsV6Response,
  contacts: UserInfo[],
): GetMessageInteractionsResponse => {
  const { message } = response;
  const durationMs = durationMsOf(message);
  const names = new Map(contacts.map((c) => [c.id, displayName(c)]));
  const creatorId = message.creator_id as string | undefined;

  return {
    message,
    interactions: response.interactions
      .filter((row) => row.user_id !== creatorId)
      .map((row) => {
        const name = names.get(row.user_id);
        return {
          user_id: row.user_id,
          ...(name ? { name } : {}),
          heard_ms: row.heard_ms,
          heard_percent:
            durationMs && durationMs > 0
              ? Math.min(100, Math.round((row.heard_ms / durationMs) * 100))
              : null,
          is_notified: row.is_notified,
          reaction_ids: row.reaction_ids,
        };
      }),
  };
};
