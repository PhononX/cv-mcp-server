# Design — Filter `list_conversations` by `user_ids`

> **Status:** Design only — approved to design, NOT to implement (decided 2026-06-30).
> **Spans two repos** (`cv-mcp-server` + `cv-api`).
> **Decisions (2026-06-30):** filter semantics = **ANY (union)**; scope = design only, review before any code.

## Goal

Let an MCP client pass `user_ids` to `list_conversations` so the result is narrowed to
conversations that include the given user(s) as members.

---

## Investigation — does the backend already support this?

**No.** The relevant endpoint takes zero filters today.

| Layer | What exists today |
| --- | --- |
| MCP tool `list_conversations` (`src/server.ts:418`) | `inputSchema: z.object({}).shape` — no params. Calls `simplifiedApi.getAllConversations()`. |
| Generated client (`src/generated/carbon-voice-api.ts:445`) | `getAllConversations()` → `GET /simplified/conversations/all`, **no query params**. |
| OpenAPI contract (`carbon-voice-api.json`) | `/simplified/conversations/all` → `parameters: []`. Response = `{ results_count, results: [{ id, name, workspace_id, type }] }`. |
| Backend controller (`cv-api .../simplified-conversation.controller.ts:31`) | `getAll(@CurrentUser user)` — current user only, no query DTO. |
| Backend service (`...simplified-conversation.service.ts:199`) | `getAll(user)` → `channelRepository.getAllUserChannelsActiveSinceSexMonthsAgo(user)`. |
| Backend repository (`channel.repository.ts:2401`) | Mongo query already filters `users: { $elemMatch: { user_id: user._id, status: Active } }`. **The member list lives on the Channel doc.** |

### Two facts that decide the architecture

1. **The list response carries no member data** — only `id`, `name`, `workspace_id`, `type`.
   So the MCP server *cannot* filter by user client-side without calling
   `get_conversation_users` once per conversation (up to 500 → N+1 fan-out). Not acceptable.

2. **The backend already has the data and the query primitive.** `Channel.users[]` holds every
   member's `user_id` + `status`, and the existing query already `$elemMatch`-es on it.
   Adding a filter for extra `user_ids` is a few lines in one Mongo query.

3. **Strong precedent already merged.** The sibling messages endpoint already exposes exactly this:
   `ListMessagesQuery.user_ids?: string[]` (`cv-api .../dto/ListMessagesQuery.dto.ts:57-65`,
   `@IsOptional @IsArray @ArrayMaxSize(50)`), and the message vector query applies it as
   `match: { any: user_ids }` (`qdrant.repository.ts:204`). We should mirror this shape and semantics.

---

## Recommendation

**Implement in the backend (`cv-api`), then regenerate the MCP client and pass the param through.**

Both repos change, but the split is lopsided and low-risk:

- **`cv-api`** — the *real* change: optional `user_ids` query param → extra `$elemMatch` on the
  channel query. ~1 DTO + 1 controller arg + 1 query branch. Mirrors the existing messages filter.
- **`cv-mcp-server`** — *mechanical*: `npm run` orval regen picks up the new query param, then widen
  the tool `inputSchema` and forward `user_ids` into the generated call.

Rejected alternative — **MCP-server-only filtering**: requires N+1 `get_conversation_users` calls
(up to 500), is slow, and bypasses the 30s server-side cache. Not viable.

---

## Proposed changes

### Backend (`cv-api`)

1. **New query DTO** `GetAllConversationsQuery` (mirror `ListMessagesQuery.user_ids`):
   ```ts
   export class GetAllConversationsQuery {
     @IsOptional() @IsArray() @ArrayMaxSize(50)
     @ApiPropertyOptional({ type: [String], description:
       'User IDs (optional). Return only conversations that include these users. If omitted, all of the current user\'s conversations are returned.' })
     user_ids?: string[];
   }
   ```
2. **Controller** `simplified-conversation.controller.ts` — add `@Query() query: GetAllConversationsQuery`,
   pass `query.user_ids` into `service.getAll(user, query.user_ids)`.
3. **Service** `getAll(user, userIds?)` — forward to repository; **include `user_ids` in the `cacheKey`**
   (current key is `simplified:AllConversationsResponse:user:${user._id}` — must become per-filter to
   avoid cache cross-talk).
4. **Repository** `getAllUserChannelsActiveSinceSexMonthsAgo(user, userIds?)` — when `userIds?.length`,
   add membership constraint(s) to the existing `query`. Semantics: see open question below.

### MCP server (`cv-mcp-server`)

5. Regenerate client + zod (`orval.config.ts` already points at `/docs/simplified-json`).
6. `src/server.ts:418` — replace `inputSchema: z.object({}).shape` with a schema exposing optional
   `user_ids: z.array(z.string()).optional()`; forward it into `getAllConversations`.
7. Update tool description to explain the filter.
8. Tests: `tests/unit/server/server.test.ts` — cover with-filter and without-filter paths.

---

## Resolved — filter semantics: ANY (union)

`user_ids: [A, B]` returns conversations whose members include **A OR B**. Matches the
messages-filter precedent (`match: { any }`). The current user stays an implicit member (the
existing `$elemMatch` on `user._id` is untouched), so `user_ids` constrains *additional* participants.

Concrete repository branch in `getAllUserChannelsActiveSinceSexMonthsAgo(user, userIds?)` — added to
the existing `query` object before the aggregate:

```ts
// existing constraint (unchanged): current user must be an active member
query.users = { $elemMatch: { user_id: user._id, status: UserMembershipStatus.Active } };

// NEW: when userIds provided, also require at least one of them to be a member (ANY / union)
if (userIds?.length) {
  query['users.user_id'] = { $in: userIds };
}
```

Notes:
- `query.users.$elemMatch` (current user) and `query['users.user_id'].$in` (filter set) are
  independent conditions on the same `users` array — Mongo ANDs them, which is what we want:
  "current user is a member **and** at least one filtered user is a member."
- An empty/absent `user_ids` → behaves exactly as today (no regression).
- Validation cap `@ArrayMaxSize(50)` mirrors `ListMessagesQuery`.

## Next step

Per decision, stop here. On approval, implement in this order: (1) `cv-api` DTO + controller +
service cache-key + repository branch, (2) deploy/point orval at it, (3) `cv-mcp-server` regen +
tool schema + tests. Promote this file into a `spec.md` + `tasks.md` at that point.
