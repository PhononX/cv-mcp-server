# Spec — Capability Gaps: API Features Not Exposed as MCP Tools

> **Status:** Investigation complete. **Not approved to implement.**
> **Companion to** `.specs/features/agent-efficiency-improvements/` — that work improves
> *how* existing tools are described; this covers *what is missing entirely*.
> **Verified against** `cv-mcp-server@b05841d` (v2.9.0) and `cv-api` @ same session.

---

## Headline numbers

The generated Orval client exposes **57 API operations**. `src/server.ts` registers
**28 tools** covering **25** of them (plus 2 hand-rolled calls in `src/cv-api.ts` —
`/whoami`, `/contacts`).

**32 generated operations are not exposed at all.** On top of that, the *full* cv-api has
whole capability areas — search, inbox notifications — that never made it into the
simplified surface the client is generated from.

Note also: `carbon-voice-api.json` checked into the repo is **stale** (28 paths) relative
to the generated client (57 operations). It predates voicememo, `searchUsers`,
action-items and share-links. Anyone auditing from that file will reach wrong conclusions.

---

## Your three asks

### Ask 1 — "Create a voice memo via MCP with text or uploading audio"

**Text: already works. Audio: advertised but structurally impossible — and it fails in the
worst possible way.**

`create_voicememo_message` is registered (`src/server.ts:243`) and its schema includes
`audio_file: zod.instanceof(File)`
(`src/generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod.ts:1386`). The generated
client builds real `multipart/form-data` and appends the file
(`src/generated/carbon-voice-api.ts:660-692`), so the *upstream* endpoint genuinely
supports audio.

But MCP is JSON-RPC. An agent cannot construct a `File`. I probed the actual runtime
behavior rather than assuming:

```
JSON Schema the MCP client receives for audio_file:
  {"description":"Audio file upload on multipart requests. Supported Formats:
    .mp3, .m4a, .wav, .aac, .ogg, .flac, .wma, .opus, .webm. (Overwrites transcript)"}
  ^ no "type" key at all

safeParse({ transcript: 'hello' })                    -> success: true
safeParse({ audio_file: 'SUQzBAAAAA==' })             -> FAIL "Input not instance of File"
safeParse({ audio_file: 'https://example.com/a.mp3' })-> FAIL "Input not instance of File"
```

So the tool **advertises audio upload with a list of supported formats, publishes no type
constraint, and then rejects every value an agent is capable of sending.** `z.instanceof()`
becomes an untyped `{}` in JSON Schema, so nothing warns the agent off; the failure is a
fatal custom zod error with no recoverable next step. This is a guaranteed wasted call
that looks, to the agent, like it should have worked.

This is a **functional** gap, not a documentation one. Three options:

| Option | What it means | Assessment |
| --- | --- | --- |
| **A — audio by URL** (recommended) | Accept `audio_url: string`; the server fetches the bytes and forwards them as the multipart `audio_file`. | The only MCP-native design. Agents routinely have URLs and never have `File` objects. Needs an SSRF allowlist and a size cap. |
| **B — presigned upload flow** | cv-api already has `POST /v5/attachments/upload/signedurl` (`cv-api src/attachments/attachment.controller.ts:111-130`), returning a presigned S3 PUT per file. Expose it, let the agent (or host app) PUT the bytes, then reference the attachment. | Most faithful to how the product already uploads. But multi-step, and most MCP hosts can't perform an arbitrary binary PUT — so the agent often still can't complete it alone. |
| **C — remove `audio_file`** | Drop the param from the MCP schema; keep transcript-only. | Honest and 10 minutes of work. Strictly better than today even as an interim step, because today's version costs a failed call to learn the same thing. |

**Recommendation: C now, A next.** C stops the bleeding immediately; A is the real feature.
B is worth exposing anyway for non-audio attachments, but it doesn't solve this ask on its own.

### Ask 2 — "Create a sharelink for a voice memo"

**The API fully supports this, the client is already generated, and no MCP tool exposes
it. This is the cheapest high-value win in the whole review.**

| | |
| --- | --- |
| `POST /simplified/message-sharelinks` | `simplifiedMessageShareLinkControllerCreate` (`src/generated/carbon-voice-api.ts:991-1005`) — JSON body, no multipart |
| `GET /simplified/message-sharelinks/{shareLinkId}` | `simplifiedMessageShareLinkControllerGetMessageShareLink` (`:979-988`) |
| Request schema | `simplifiedMessageShareLinkControllerCreateBody` (`...zod.ts:2256-2266`) |
| Response schema | `...GetMessageShareLinkResponse` (`...zod.ts:2194+`) |

Request takes `shared_message_id`, `share_type` (`forward` \| `link`), `access_type`
(`public` \| `specified` \| `forward`), optional `specified_access[]` (scoped to channel /
workspace / workspace_group / user), optional `end_access_at`, and `message_id` (only when
`share_type: forward`).

The response includes **`id`** and **`link`** — the actual shareable URL — plus the full
embedded `shared_message`.

Two tools (`create_message_share_link`, `get_message_share_link`) are roughly 40 lines in
`server.ts` against an already-generated, already-typed client. No cv-api work.

**Bonus: this closes a dead end flagged in the other spec.** `run_ai_action_for_shared_link`
(`server.ts:926`) requires a share-link ID that **no current tool can produce** — an
unreachable tool. Exposing create/get makes that whole chain usable for the first time.

### Ask 3 — "Leverage search to find notified messages, etc."

**This exists and is richer than you'd expect — but it lives in the full cv-api, not the
simplified surface, so it isn't in the generated client at all.**

**`GET /search/message-ids`** (`cv-api src/search/search.controller.ts:56-70`,
params in `src/search/dto/MessageIdSearchParameters.ts`):

| Param | Values | Why it matters |
| --- | --- | --- |
| **`notified_status`** | `notified` \| `not_notified` \| `both` | **Exactly your ask.** (`src/search/enum/NotifiedStatus.ts`) |
| `has_notes` | `yes` \| `no` \| `both` | |
| `tagged_user_ids[]` | | "messages where I was mentioned" |
| `label_ids[]`, `creator_ids[]`, `conversation_ids[]`, `workspace_ids[]` | max 50 each | |
| `created_or_updated_at`, `sort_direction` | | |
| `limit`, **`next_cursor`** | default 100 | **Cursor pagination** — strictly better than `list_messages`' page/size |

Response `MessageIdSearchResults` returns `ids[]`, **`has_more`**, `next_cursor` — already
self-describing in exactly the way the efficiency brief wants, and ID-only, so it's cheap
in tokens. It pairs naturally with `get_message` for hydration.

**`POST /v3/search`** (`searchV2`, `search.controller.ts:41-54`, params in
`SearchParameters.ts`) offers a different axis:

- **`heardStatus`**: `heard` \| `unheard` \| `any` — **this is the unread filter that
  `catch_up_conversation` was blocked on.** That tool is commented out at
  `server.ts:568` with the TODO *"First we need to implement List messages filtered by
  unread messages."* **It already exists.** The TODO is stale.
- `label_guids[]`, `user_guids[]`, `tagged_user_guids[]`, `channel_guids[]`, date range.
- Response `SearchResultsV2` includes **`unheard_counts_by_channel`** — a per-conversation
  unread map, which is precisely what a "catch me up across my workspace" agent needs to
  prioritise without fetching anything.

**`GET /inbox-notifications`** (`cv-api src/inbox-notification/inbox-notification.controller.ts:53-70`)
is the notification-centre view, and it's a full CRUD surface:

- Filters: `skip`, `limit`, `direction`, `category`, `type`, `date`
  (`dto/inbox-notification.filter.dto.ts`)
- **`category`** includes `mentions`, `workspace`, `carbonVoice`, `security`, `general`
  (`enum/inbox-notification-category.enum.ts`)
- Response carries `total_results` and **`total_unread`** alongside `results` and the
  echoed `filters`
- Also: get one, mark read/unread (single **and** all), delete, create

**Architectural note — this one is not free.** These are full-API endpoints, so they are
outside the Orval-generated client and outside the "simplified API for third-party
integrations" surface. Two consequences:

1. **Reachability is fine.** `CARBON_VOICE_BASE_URL` is the API root
   (`https://api.carbonvoice.app`), cv-api uses URI versioning with `VERSION_NEUTRAL`
   default (`cv-api src/main.ts:86-88`), and there is **existing precedent**: `src/cv-api.ts`
   already hand-rolls `/whoami` and `/contacts` through the same `mutator`. So
   `/search/message-ids` and `/inbox-notifications` are reachable today; `/v3/search`
   needs the `/v3` prefix.
2. **But hand-rolled calls bypass the generated types**, and these endpoints carry no
   third-party contract guarantees — the simplified API exists precisely to be the stable
   external surface. **The cleaner long-term path is to promote the search filters we want
   into the simplified API** (a `cv-api` change), then regenerate. Worth an explicit
   decision rather than defaulting to hand-rolling three more endpoints.

Also note `POST /search` v1 is `@ApiExcludeEndpoint()` — deliberately hidden. Use v3.

---

## The biggest gap you didn't ask about: Action Items

**Ten generated operations, zero exposed.** Already typed, already in the client, no
cv-api work required:

| Operation | Endpoint |
| --- | --- |
| `actionItemControllerCreate` | `POST /action-items` |
| `actionItemControllerList` | `GET /action-items/{containerType}/{containerId}` |
| `actionItemControllerListIds` | `GET /action-items/{containerType}/{containerId}/ids` |
| `actionItemControllerGetByIds` | `POST /action-items/{containerType}/{containerId}/by-id` |
| `actionItemControllerListMyActionItems` | `GET /action-items/mine` |
| `actionItemControllerGetById` | `GET /action-items/{id}` |
| `actionItemControllerUpdate` | `PUT /action-items/{id}` |
| `actionItemControllerDelete` | `DELETE /action-items/{id}` |
| `actionItemControllerSetStatus` | `PATCH /action-items/{id}/status` |
| `actionItemControllerCreateSuggestionsFromMessages` | `POST /action-items/suggestions` |

Task extraction and follow-up tracking is one of the most natural things an agent does
with a voice product — *"what did I commit to in yesterday's messages?"*. And
`/action-items/suggestions` is an **AI-powered extract-tasks-from-messages** endpoint that
maps almost exactly onto that request. List endpoints already support cursor pagination
(`direction`, `limit` max 100, `date` anchor — `...zod.ts:413-425`).

This is the largest single capability area missing, and it's the same implementation cost
as the share-link tools.

---

## Full inventory of the other 20 unexposed operations

| Area | Operations | Worth exposing? |
| --- | --- | --- |
| **AI prompt authoring** | `aIPromptControllerCreatePrompt`, `UpdatePrompt`, `DeletePrompt` | **Yes, medium.** Today agents can only run *existing* AI actions. Creating one unlocks ad-hoc prompts instead of forcing a match against `list_ai_actions`. Note write/destructive semantics. |
| **AI response retrieval** | `aIResponseControllerGetResponseById`, `GetResponseByIds`, `GetLatestTenAIResponseByPrompt`, `DeletePrompt` (delete response) | **Partly.** `GetResponseById`/`ByIds` are the natural follow-up to `run_ai_action` — currently an agent can only re-query the broad `get_ai_action_responses` list. |
| **Public system prompts** | `getSystemAIPrompts`, `getAiSystemPromptResponse` | **Yes, cheap.** Unauthenticated discovery of built-in prompts + a sample response — a good low-cost way for an agent to pick a `prompt_id` and preview output before committing. |
| **Conversation membership** | `addUsersToConversation` (`POST /simplified/conversations/{id}/users`) | **Yes.** We can read conversation users but never add them — the read/write asymmetry is odd. Note: no *create conversation* op exists in the simplified surface, so agents can't start a conversation either. |
| **Folder counts** | `getCountsGroupedByWorkspace` | **Yes, cheap.** Per-workspace folder/message counts + "not in any folder" breakdown. **Already written and commented out** at `server.ts:600-620`. Ideal cheap orientation call before a listing sweep. |
| **User by ID (simplified)** | `getUserById` (`GET /simplified/users/{id}`) | **Investigate.** `get_user` deliberately uses `cvApi.getContacts` (`/contacts`) instead (`server.ts:307-338`). Worth confirming that was intentional — if the simplified endpoint returns less, it's a better default under the token-efficiency goal. |
| **Languages** | `languageControllerGetAll` | **Low.** Many tools take a `language` param with no way to enumerate valid values, so it prevents a class of guessed-value errors — but a static enum in the description is cheaper than a tool. |
| **Developer platform / apps** | `getMyApps`, `subscribeUserIntoApp`, `subscribeUserImplicitClient`, `unsubscribeUserFromApp`, `unsubscribeSpecificSubscriptionFromApp`, `listOwnedSubscriptions`, `updateSubscription` (7 ops) | **No.** OAuth app/subscription administration, not agent work. Deliberate omission; leave out. |

---

## Suggested priority

| Tier | Items | Cost | Rationale |
| --- | --- | --- | --- |
| **1 — do now** | `create_message_share_link` + `get_message_share_link`; **remove or fix `audio_file`** | ~1 day total | Your ask #2, already-generated client. Share links also make `run_ai_action_for_shared_link` reachable for the first time. The `audio_file` fix stops an actively misleading schema. |
| **2 — high value, no cv-api work** | Action Items (start with `mine`, `list`, `create`, `set_status`, `suggestions`); uncomment `get_workspace_folders_and_message_counts`; `addUsersToConversation` | ~3-4 days | Biggest missing capability area; all typed and generated already. |
| **3 — your ask #3, needs an architecture decision** | `search_message_ids` (`notified_status`, `tagged_user_ids`, cursor); unread search / `unheard_counts_by_channel`; `list_inbox_notifications` (category `mentions`, `total_unread`) | ~1 week + decision | Decide first: hand-roll in `cv-api.ts` (fast, untyped, unstable contract) vs. promote into the simplified API and regenerate (slower, correct). **Also retires the stale `catch_up_conversation` TODO** at `server.ts:568`. |
| **4 — audio, properly** | `audio_url` on `create_voicememo_message` (option A), plus presigned-upload exposure | ~1 week | Needs SSRF allowlist + size caps. Real feature work. |
| **5 — opportunistic** | AI prompt create/update/delete; response-by-id; public system prompts; languages | ~2-3 days | Fills in the AI-action chain end to end. |
| **Never** | The 7 apps/subscription ops | — | Platform administration, not agent surface. |

---

## Open questions

1. **Ask #3 architecture:** hand-roll the search/notification endpoints in `src/cv-api.ts`
   (precedent exists), or promote the needed filters into the simplified API first? This
   is the decision that gates tier 3.
2. **`audio_file` interim:** ship option C (remove) immediately, or wait and ship option A
   (audio by URL) in one go? Removing first is strictly better than the status quo.
3. **Action Items scope:** all 10 operations, or the read + status subset first?
4. **`get_user` / `getUserById`:** was routing through `/contacts` instead of the
   simplified user endpoint deliberate? Affects the projection work in the sibling spec.
5. **Missing entirely from the API surface:** no operation *creates* a conversation, and
   none revokes a share link (the response has `revoked_at`/`revoked_by`, so the concept
   exists). Both are product gaps rather than exposure gaps — worth confirming.
