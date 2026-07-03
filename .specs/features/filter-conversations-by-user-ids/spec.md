# Filter `list_conversations` by `user_ids` — Specification

> **Status:** Specify (approved to specify). Supersedes the assumptions in
> [`design.md`](./design.md) where they conflict — see note below.
> **Scope:** `cv-mcp-server` only. The backend (`cv-api`) work is **already done and
> deployed**, and the API client in this repo has **already been regenerated** with the new
> query parameters. This feature is the *mechanical* MCP-side wiring + documentation.

## Problem Statement

The `list_conversations` MCP tool currently exposes **no parameters** (`inputSchema:
z.object({}).shape`) and always returns every conversation the caller belongs to. Users cannot
narrow the list to conversations involving specific people. The backend now supports filtering
the conversation list by user, but the MCP tool does not surface that capability, so clients
(and the LLM driving them) cannot use it.

## Goals

- [ ] Expose the already-implemented `user_ids` filter on the `list_conversations` MCP tool.
- [ ] Expose the already-implemented `match` mode (`any` | `all`) controlling how `user_ids` is applied.
- [ ] Document the parameters unambiguously in the tool definition so the LLM understands that
      filtering is by **user ID** (not username / display name) and understands the `match` semantics.
- [ ] Preserve full backward compatibility: calling the tool with no arguments behaves exactly as today.

## Ground Truth (verified in the regenerated client)

The generated code is the source of truth for this feature (not `carbon-voice-api.json` — see Out of Scope):

| Artifact | Location | Detail |
| --- | --- | --- |
| Params type | `src/generated/models/GetAllConversationsParams.ts:54-63` | `{ user_ids?: string[]; match?: ConversationMatch }` |
| Match enum | `src/generated/models/ConversationMatch.ts:57-60` | `{ any: 'any', all: 'all' }` |
| Zod query schema | `src/generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod.ts:1463-1466` | Exported as `getAllConversationsQueryParams`; `user_ids: array(string).optional()`, `match: enum(['any','all']).optional()`. Reuse via `.shape` (same as `list_messages`). |
| Response schema | `src/generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod.ts:1468-1475` | `getAllConversationsResponse`: `results_count`, `results[]` with `id`, `name`, `workspace_id`, `type` (enum: `directMessage` \| `customerConversation` \| `namedConversation` \| `asyncMeeting`). |
| Client fn | `src/generated/carbon-voice-api.ts:743-751` | `getAllConversations(params?, options?)` → `GET /simplified/conversations/all` |
| Current tool | `src/server.ts:418-442` | `inputSchema: z.object({}).shape`, passes `{}` to `getAllConversations` |
| Wiring precedent | `src/server.ts:85-122` (`list_messages`) | `inputSchema: listMessagesQueryParams.shape` (imported from the generated zod file), forwards `params` straight through |

**Canonical generated descriptions** (reuse verbatim so tool docs stay in sync with the contract):

- `user_ids` — *"List of user IDs to filter conversations by. When omitted, all conversations for the caller are returned."*
- `match` — *"Match mode: any (union) or all (intersection). Defaults to any."*

**Semantics (resolved by the shipped API — no ambiguity):**

- `match: "any"` (default) → **union**: return conversations that include **at least one** of the given `user_ids`.
- `match: "all"` → **intersection**: return conversations that include **every** one of the given `user_ids`.
- The caller is always an implicit member; `user_ids` constrains *additional* participants.

> **Note vs `design.md`:** the design assumed ANY-only semantics and a two-repo change. The backend
> actually shipped **both** `any` and `all` via a `match` param, and the client is already regenerated.
> This spec reflects the shipped reality.

**Resolved decisions (removing implementation ambiguity):**

1. **Empty / absent `user_ids` is normalized MCP-side.** The tool handler SHALL omit `user_ids` from
   the params passed to `getAllConversations` when it is `undefined` **or** an empty array `[]`.
   This makes the "no filter" behavior (CONVFILT-02) guaranteed and testable *in this repo*, without
   depending on unverified backend handling of `[]`. Same treatment for `match`: omit when absent so
   an empty call forwards `{}` exactly as today.
2. **"IDs not usernames" emphasis lives at the tool/description layer, not in generated code.** The
   generated `.describe()` strings already say "user IDs" but do not say "not usernames." Because
   `src/generated/**` is do-not-edit, the extra emphasis (CONVFILT-05) SHALL be added either in the
   tool's top-level `description` string or via a thin local schema that overrides the descriptions —
   never by editing the generated file. Reusing `getAllConversationsQueryParams.shape` for validation
   remains the baseline.

## Out of Scope

| Item | Reason |
| --- | --- |
| Backend (`cv-api`) changes | Already implemented, deployed, and client regenerated. Nothing to do here. |
| Resolving usernames → user IDs | The API filters strictly by `user_id`. Name lookup is a separate concern; not part of this tool. |
| Updating stale `carbon-voice-api.json` | Its `/simplified/conversations/all` still shows `"parameters": []` (`carbon-voice-api.json:699`), inconsistent with the regenerated client. Flagged to the contract owners; not a blocker for MCP wiring. |
| Pagination / sorting of conversations | The endpoint exposes only `user_ids` + `match`. No other filters added. |
| Client-side filtering fallback | Rejected in design (N+1 fan-out). Filtering is fully server-side. |

---

## User Stories

### P1: Filter conversations by user IDs ⭐ MVP

**User Story**: As an MCP client, I want to pass `user_ids` to `list_conversations` so that the
result is narrowed to conversations that include the specified user(s).

**Why P1**: This is the core capability requested and the whole reason the backend filter exists.

**Acceptance Criteria**:

1. WHEN the tool is called with `user_ids: ["u1", "u2"]` THEN the system SHALL forward `user_ids`
   to `getAllConversations` and return only conversations matching the filter (per `match` mode).
2. WHEN the tool is called with **no** `user_ids` THEN the system SHALL behave exactly as today
   (return all of the caller's conversations) with no regression.
3. WHEN `user_ids` is provided but contains IDs present in no conversation THEN the system SHALL
   return an empty (or reduced) result set without error.
4. WHEN `user_ids` is an empty array `[]` THEN the system SHALL treat it as "no filter" by omitting it
   from the forwarded params (MCP-side normalization — same observable behavior as omitted).

**Independent Test**: Call the tool with a known `user_ids` and assert `getAllConversations` is
invoked with those `user_ids`; call with none and assert it is invoked with no `user_ids`.

---

### P1: Control match semantics with `match` (any / all) ⭐ MVP

**User Story**: As an MCP client, I want a `match` parameter so I can choose whether results
include conversations with **any** of the users (union) or only conversations with **all** of
them (intersection).

**Why P1**: The user explicitly requires both "any conversation where either is present" and
"conversations where all are present." The API ships both; omitting `match` would hide half the capability.

**Acceptance Criteria**:

1. WHEN `match: "any"` (or omitted) THEN the system SHALL return conversations including **at least
   one** of the given `user_ids`.
2. WHEN `match: "all"` THEN the system SHALL return conversations including **every** given `user_id`.
3. WHEN `match` is any value other than `"any"` or `"all"` THEN the system SHALL reject the input
   via schema validation (the generated zod enum), before any API call.
4. WHEN `match` is provided without `user_ids` THEN the system SHALL forward it harmlessly (no
   filter applied, since there are no IDs to match).

**Independent Test**: Call with `match: "all"` and assert it is forwarded; call with an invalid
`match` and assert a validation error is raised without hitting the API.

---

### P1: Unambiguous, ID-based tool documentation ⭐ MVP

**User Story**: As the LLM driving this tool, I want the tool description and parameter docs to
make crystal-clear that filtering is by **user ID** (not username/display name) and to explain the
`match` options, so I don't pass names and I pick the right mode.

**Why P1**: The user emphasized this repeatedly. Ambiguous docs would cause the model to pass
usernames (which the API does not accept) and misuse `match`.

**Acceptance Criteria**:

1. WHEN a client inspects the tool THEN the `user_ids` parameter description SHALL state it accepts
   **user IDs**, explicitly NOT usernames/display names, and that omitting it returns all conversations.
2. WHEN a client inspects the tool THEN the `match` parameter description SHALL enumerate the allowed
   values `any` / `all`, define union vs intersection, and state the default (`any`).
3. WHEN a client inspects the tool description THEN it SHALL describe the returned fields available
   on each conversation (`id`, `name`, `workspace_id`, `type`) so callers know what they get back.
4. The parameter descriptions SHALL stay consistent with the generated schema descriptions (reuse
   the canonical strings, extended only to add the "IDs not names" emphasis).

**Independent Test**: Inspect the registered tool's `inputSchema`/description and assert the
`user_ids` doc contains an explicit "user IDs, not usernames" clause and the `match` doc lists `any`/`all` + default.

---

## Edge Cases

- WHEN `user_ids` is omitted or `[]` THEN system SHALL omit it from the forwarded params and return all conversations (no filter, no regression).
- WHEN `match` is omitted THEN system SHALL default to `any` semantics (as the backend does).
- WHEN `match` is an invalid enum value THEN system SHALL fail schema validation before the API call.
- WHEN `user_ids` contains duplicates THEN system SHALL forward them as-is (backend handles dedupe).
- WHEN the filter matches zero conversations THEN system SHALL return an empty result set, not an error.
- WHEN the upstream API errors THEN system SHALL return the error via `formatToMCPToolResponse` (existing behavior, unchanged).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CONVFILT-01 | P1: Filter by user_ids | Specify | Pending |
| CONVFILT-02 | P1: Backward compat (no params) | Specify | Pending |
| CONVFILT-03 | P1: `match` any/all forwarding | Specify | Pending |
| CONVFILT-04 | P1: Invalid `match` rejected by schema | Specify | Pending |
| CONVFILT-05 | P1: `user_ids` documented as IDs, not usernames | Specify | Pending |
| CONVFILT-06 | P1: `match` options + default documented | Specify | Pending |
| CONVFILT-07 | P1: Response fields documented | Specify | Pending |

**ID format:** `CONVFILT-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 7 total, 0 mapped to tasks yet.

---

## Success Criteria

- [ ] `list_conversations` accepts optional `user_ids: string[]` and `match: "any" | "all"` and forwards them to `getAllConversations`.
- [ ] Calling with no arguments returns identical results to the pre-change behavior (verified by test).
- [ ] Invalid `match` values are rejected by schema validation without an API call (verified by test).
- [ ] Tool documentation explicitly states filtering is by user ID (not username) and explains `any`/`all` + default.
- [ ] Unit tests cover: with-`user_ids`, with-`match: all`, no-params, empty-array, invalid-`match`.
- [ ] `npm run build` / typecheck and existing test suite pass.
