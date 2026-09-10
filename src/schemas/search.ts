import { z } from 'zod';

/**
 * Schemas for the full Carbon Voice API's search and inbox-notification
 * endpoints. These are NOT part of the simplified API, so they have no
 * generated client — they are hand-rolled in `src/cv-api.ts` the same way
 * `/whoami` and `/contacts` already are.
 *
 * Defaults here are deliberately eager rather than omitted. The upstream DTOs
 * declare several of these fields with `@IsEnum` / `@IsNumber` but WITHOUT
 * `@IsOptional`, and their class field initializers are wiped by the explicit
 * constructor that `plainToInstance` invokes with no arguments. Sending the
 * value every time avoids a validation rejection we would otherwise only
 * discover at runtime.
 */

const idList = (label: string) =>
  z
    .array(z.string())
    .max(50)
    .optional()
    .describe(`${label} Max 50 entries. Requires IDs, not names.`);

export const searchMessageIdsParams = z.object({
  notified_status: z
    .enum(['notified', 'not_notified', 'both'])
    .default('both')
    .describe(
      'Filter by whether you were notified about the message. ' +
        '`notified` = messages you were notified about, `not_notified` = the rest, `both` = no filter.',
    ),
  has_notes: z
    .enum(['yes', 'no', 'both'])
    .default('both')
    .describe('Filter by whether the message has notes attached.'),
  tagged_user_ids: idList(
    'Only messages where these users were tagged/mentioned.',
  ),
  creator_ids: idList('Only messages created by these users.'),
  conversation_ids: idList('Only messages in these conversations.'),
  workspace_ids: idList('Only messages in these workspaces.'),
  label_ids: idList('Only messages carrying these labels.'),
  created_or_updated_at: z
    .string()
    .datetime()
    .optional()
    .describe(
      'ISO timestamp anchor. Combined with `sort_direction` to page backwards or forwards from a point in time.',
    ),
  sort_direction: z
    .enum(['older', 'newer'])
    .default('newer')
    .describe('Direction to walk from the anchor.'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(100)
    .describe('Number of message IDs to return (max 100).'),
  next_cursor: z
    .string()
    .optional()
    .describe(
      'Pass the `next_cursor` from a previous response to fetch the next page.',
    ),
});

export const searchMessagesByHeardStatusParams = z.object({
  heardStatus: z
    .enum(['heard', 'unheard', 'any'])
    .default('unheard')
    .describe(
      'Filter by listened state. `unheard` = not yet listened to (your unread messages), `heard` = already listened to, `any` = no filter.',
    ),
  channel_guids: idList('Only messages in these conversations.'),
  user_guids: idList('Only messages created by these users.'),
  tagged_user_guids: idList(
    'Only messages where these users were tagged/mentioned.',
  ),
  label_guids: idList('Only messages carrying these labels.'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .describe('Number of messages to return (max 100).'),
});

export const listInboxNotificationsParams = z.object({
  category: z
    .enum(['workspace', 'mentions', 'carbonVoice', 'security', 'general'])
    .optional()
    .describe(
      'Notification category. `mentions` is the one to use for "where was I mentioned".',
    ),
  type: z
    .string()
    .optional()
    .describe(
      'Narrow to a single notification type (e.g. `channel.users.added`). Prefer `category` unless you know the exact type string.',
    ),
  date: z
    .number()
    .optional()
    .describe(
      'Anchor as a UNIX timestamp in MILLISECONDS (e.g. 1694313500106) — not an ISO string.',
    ),
  direction: z
    .enum(['older', 'newer'])
    .default('newer')
    .describe('Direction to walk from the anchor.'),
  skip: z
    .number()
    .min(0)
    .default(0)
    .describe('Offset for paging. This endpoint uses skip/limit, not cursors.'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .describe('Number of notifications to return (max 100).'),
});

export type SearchMessageIdsParams = z.infer<typeof searchMessageIdsParams>;
export type SearchMessagesByHeardStatusParams = z.infer<
  typeof searchMessagesByHeardStatusParams
>;
export type ListInboxNotificationsParams = z.infer<
  typeof listInboxNotificationsParams
>;
