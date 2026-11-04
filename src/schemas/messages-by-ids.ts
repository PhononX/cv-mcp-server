import { z } from 'zod';

/**
 * `get_messages`: body of cv-api `POST /v6/messages/by-ids`
 * (`GetMessagesByIdsV5Payload`). Hand-rolled like `search.ts`: the endpoint
 * is not in the simplified API. `presigned_url` and `fresh` are left out.
 */
export const getMessagesParams = z.object({
  message_ids: z
    .array(z.string().min(1))
    .min(1)
    .max(500)
    .describe('Message ids to fetch, 1-500. Results keep this order.'),
  conversation_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Only messages of this conversation, which you must have access to.',
    ),
  language: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Language of transcript and summary (e.g. `es`). Original when omitted.',
    ),
});

export type GetMessagesParams = z.infer<typeof getMessagesParams>;
