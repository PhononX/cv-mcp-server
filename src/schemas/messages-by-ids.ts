import { z } from 'zod';

import { MessageStatus } from '../generated/models';

/**
 * `get_messages`: body of cv-api `POST /v6/messages/by-ids`
 * (`GetMessagesByIdsV5Payload`). Hand-rolled like `search.ts`: the endpoint
 * is not in the simplified API.
 *
 * Narrower than cv-api on purpose:
 * - 100 ids, not 500, so one response stays readable by an agent.
 * - No `conversation_id`: with it cv-api silently drops the ids of other
 *   conversations, so `missing_ids` could not say why an id is missing.
 * - No `presigned_url` or `fresh`.
 */
export const getMessagesParams = z.object({
  message_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .describe('Message ids to fetch, 1-100. Results keep this order.'),
  language: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Language of transcript and summary (e.g. `es`). Original when omitted.',
    ),
});

export type GetMessagesParams = z.infer<typeof getMessagesParams>;

/**
 * Projection `get_messages` applies when the caller sends no
 * `response_fields`. A full MessageV6 carries `content.time_codes` (one entry
 * per word), attachments and reactions; 100 of those can fill an agent's
 * context. `status` stays because a message that is not ready yet comes back
 * in `results`.
 */
export const GET_MESSAGES_DEFAULT_FIELDS = [
  'results.id',
  'results.conversation_id',
  'results.creator_id',
  'results.created_at',
  'results.status',
  'results.content.transcript',
  'results.content.ai_summary',
];

/**
 * Statuses `get_messages` treats as gone: listed in `missing_ids`, never
 * returned, because cv-api does not filter by status. Any other status
 * (`processing`, `failed`, ...) is a message that exists, so it stays in
 * `results` and its `status` says why it may have no transcript yet.
 */
export const GET_MESSAGES_GONE_STATUSES: ReadonlySet<string> = new Set([
  MessageStatus.deleted,
  MessageStatus.canceled,
  MessageStatus['account-deleted'],
]);
