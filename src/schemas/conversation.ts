import { z } from 'zod';

export const summarizeConversationParams = z.object({
  conversation_id: z
    .string()
    .nonempty()
    .describe('Conversation to summarize, from `list_conversations`.'),
  prompt_id: z
    .string()
    .nonempty()
    .describe('AI Action ID, from `list_ai_actions` (its `id`).'),
  message_ids: z
    .array(z.string())
    .optional()
    .describe(
      'Specific messages to summarize. Omit to use the most recent messages, ' +
        'which is usually what you want — it saves a `list_messages` call.',
    ),
  language: z
    .string()
    .optional()
    .describe('Summary language. Defaults to the original message language.'),
  start_date: z
    .string()
    .datetime()
    .optional()
    .describe(
      'ISO 8601 lower bound on message age. Ignored when `message_ids` is given.',
    ),
  end_date: z
    .string()
    .datetime()
    .optional()
    .describe(
      'ISO 8601 upper bound on message age. Ignored when `message_ids` is given.',
    ),
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
