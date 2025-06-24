import { z } from 'zod';

export const summarizeConversationParams = z.object({
  conversation_id: z.string().nonempty(),
  prompt_id: z.string().nonempty(),
  message_ids: z.array(z.string()).optional(),
  language: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  limit: z.number().optional().default(50),
});

export const catchUpConversationParams = z.object({
  ...summarizeConversationParams.shape,
  include_only_unread_messages: z.boolean().optional().default(true),
});
