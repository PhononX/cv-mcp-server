import { z } from 'zod';

/**
 * `get_message_interactions`: path param of cv-api
 * `GET /v6/message/:message_id/interactions`. Hand-rolled like
 * `messages-by-ids.ts`: the endpoint is not in the simplified API.
 */
export const getMessageInteractionsParams = z.object({
  message_id: z.string().min(1).describe('Message id.'),
});

export type GetMessageInteractionsParams = z.infer<
  typeof getMessageInteractionsParams
>;

/**
 * Projection `get_message_interactions` applies when the caller sends no
 * `response_fields`. The v6 message carries `content.time_codes` (one entry
 * per word) and the transcript, none of which answers "who listened"; the
 * fields kept here are the ones the interaction rows are read against.
 */
export const GET_MESSAGE_INTERACTIONS_DEFAULT_FIELDS = [
  'message.id',
  'message.conversation_id',
  'message.creator_id',
  'message.created_at',
  'message.users_caught_up',
  'message.content.duration_ms',
  'interactions',
];
