# `get_message_interactions` tool

## Problem Statement

An agent cannot answer "who listened to my message, and how much of it?". The
MCP server exposes only the caller's own heard state (`heard_ms` on a message,
`search_messages_by_heard_status`) and aggregates (`total_heard_ms`,
`users_caught_up: all | some | none`). The per-person breakdown the Carbon
Voice app shows on its engagement screen comes from a cv-api endpoint the MCP
server does not call.

## Decision

Expose cv-api `GET /v6/message/:message_id/interactions` as a new tool,
`get_message_interactions`.

| Decision | Choice | Why |
| --- | --- | --- |
| Endpoint | v6, not the app's deprecated `GET /v3/message/:id/interactions` | v6 is the current contract: the message comes back access-checked, read fresh (so `users_caught_up` is current) and in the `MessageV6` shape `get_messages` already uses. |
| Transport | Hand-rolled in `src/cv-api.ts` | Not in the simplified API; same pattern as `getMessagesByIds`. The user's token already reaches v6 routes. |
| Names | One `POST /contacts` for the whole audience | Without it "who" costs one `get_user` per row. Best effort: a failed lookup drops `name`, not the call. |
| `heard_percent` | Computed from `message.content.duration_ms`, rounded, capped at 100; null without audio | Saves the agent digging the duration out of the message and dividing. |
| Creator | Left out of `interactions` | cv-api lists every channel member, creator included; matches the app's engagement screen. |
| Default projection | `message.{id, conversation_id, creator_id, created_at, users_caught_up, content.duration_ms}` + `interactions` | A full `MessageV6` carries the transcript and per-word `time_codes`, none of which answers the question. |
| Tool position | Appended last in `TOOL_NAMES` | Keeps every existing tool's position in the cached `tools/list` prefix. |

## Out of Scope

| Item | Reason |
| --- | --- |
| Moving other tools to v6 | cv-api v6 covers messages only; search, contacts and whoami have no v6 route. |
| A simplified-API endpoint for interactions | Slower path for the same data; revisit if third parties need it. |
| Changing the Flutter app's v3 call | Not part of this change. |

## Acceptance Criteria

1. WHEN `get_message_interactions` is called with `{ message_id }` THEN the
   server SHALL call `GET /v6/message/{message_id}/interactions` once, with the
   id URL-encoded and the caller's auth header.
2. WHEN the response has rows THEN the server SHALL call `POST /contacts` once
   with the distinct non-creator user ids, and add `name` to each row it resolves.
3. WHEN the contacts call fails THEN the tool SHALL still succeed, without names.
4. Each returned row SHALL carry `user_id`, `heard_ms`, `heard_percent`,
   `is_notified` and `reaction_ids`; the creator's row SHALL be omitted.
5. WHEN `response_fields` is omitted THEN the response SHALL be narrowed to the
   default projection above.
6. WHEN cv-api answers without a `message` or an `interactions` array THEN the
   tool SHALL return an `UNKNOWN_ERROR` tool error.
7. WHEN cv-api answers 404 / 403 THEN the tool SHALL return `NOT_FOUND` /
   `FORBIDDEN`, each documented with a no-retry next step.
8. The tool SHALL be read-only, non-destructive and closed-world, and the
   `tools/list` payload SHALL stay under its 78,000-byte budget (77,324 measured).
