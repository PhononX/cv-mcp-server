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
  // Both bounds take `{ offset: true }` for the same reason as
  // `created_or_updated_at` in search.ts: a bare `.datetime()` refuses a
  // numeric offset, which is the form an agent produces when it resolves a
  // local time.
  start_date: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      'ISO 8601 lower bound on message age; a UTC `Z` suffix or a numeric offset ' +
        'both work. Ignored when `message_ids` is given.',
    ),
  end_date: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      'ISO 8601 upper bound on message age; a UTC `Z` suffix or a numeric offset ' +
        'both work. Ignored when `message_ids` is given.',
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(50)
    .describe(
      'How many recent messages to summarize when `message_ids` is omitted. ' +
        'Must be a positive integer; values above 50 are clamped to 50 (the ' +
        'upstream page limit). Ignored when `message_ids` is provided.',
    ),
});

export const catchUpConversationParams = z.object({
  ...summarizeConversationParams.shape,
  include_only_unread_messages: z.boolean().optional().default(true),
});
