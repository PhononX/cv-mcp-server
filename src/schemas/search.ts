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
    // `{ offset: true }` because the bare `.datetime()` accepts only a `Z`
    // suffix. An agent resolving "since 8am" against the user's timezone
    // naturally produces `2026-09-14T08:00:00-04:00`, which is valid RFC 3339
    // and was rejected at the MCP boundary before ever reaching the API.
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      'ISO 8601 timestamp anchor; a UTC `Z` suffix or a numeric offset both work. ' +
        'Combined with `sort_direction` to page backwards or forwards from a point in time.',
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

// Same rule as cv-api TranscriptSearchRequest.ts ISO_OFFSET_SUFFIX.
// `.datetime({ offset: true })` alone also accepts `+0300`; this rejects it.
export const ISO_OFFSET_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/;

// Not `idList`: that one allows empty strings, which cv-api rejects.
const nonEmptyIds = (max: number, label: string) =>
  z
    .array(z.string().min(1))
    .max(max)
    .optional()
    .describe(`${label} Max ${max}.`);

const offsetDate = (label: string) =>
  z
    .string()
    .datetime({ offset: true })
    .regex(ISO_OFFSET_SUFFIX)
    .optional()
    .describe(`${label}, ISO 8601 with Z or ±HH:MM.`);

export const searchTranscriptsParams = z.object({
  // Code points, not `.max(500)`: zod counts UTF-16 units, so 300 emoji (600
  // units) failed here while cv-api's `@MaxLength(500)` (`validator.isLength`)
  // accepts them. Code points are never fewer than what `isLength` counts, so
  // this can only be as strict as the API, never looser.
  query: z
    .string()
    .regex(/\S/, 'query must not be blank')
    .refine((q) => [...q].length <= 500, 'query must be at most 500 characters')
    .describe('What to look for, in natural language (max 500 chars).'),
  workspace_id: z
    .string()
    .min(1)
    .optional()
    .describe('Workspace to search. Omit to search all of yours.'),
  conversation_ids: nonEmptyIds(
    50,
    'Only these conversations; skips voice memos. Send their workspace_id too.',
  ),
  creator_ids: nonEmptyIds(50, 'Only messages by these users.'),
  exclude_message_ids: nonEmptyIds(500, 'Message ids to leave out.'),
  start_date: offsetDate('Inclusive lower bound'),
  end_date: offsetDate('EXCLUSIVE upper bound'),
  // No default: single mode must send none (endpoint default 30), fan-out sends 10.
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(
      'Rows per workspace, 1-50. Default 30, or 10 per workspace when `workspace_id` is omitted ' +
        '(then at most 100 in total: lowest scores cut first, each workspace keeps its best).',
    ),
});

export type SearchMessageIdsParams = z.infer<typeof searchMessageIdsParams>;
export type SearchTranscriptsParams = z.infer<typeof searchTranscriptsParams>;
export type SearchMessagesByHeardStatusParams = z.infer<
  typeof searchMessagesByHeardStatusParams
>;
export type ListInboxNotificationsParams = z.infer<
  typeof listInboxNotificationsParams
>;
