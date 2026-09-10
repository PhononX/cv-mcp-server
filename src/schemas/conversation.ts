import { z } from 'zod';

export const summarizeConversationParams = z.object({
  conversation_id: z.string().nonempty(),
  prompt_id: z.string().nonempty(),
  message_ids: z.array(z.string()).optional(),
  language: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  limit: z
    .number()
    .optional()
    .default(50)
    .describe(
      'How many recent messages to summarize when `message_ids` is omitted. ' +
        'Values above 50 are clamped to 50 (the upstream page limit). Ignored when `message_ids` is provided.',
    ),
});

export const catchUpConversationParams = z.object({
  ...summarizeConversationParams.shape,
  include_only_unread_messages: z.boolean().optional().default(true),
});
