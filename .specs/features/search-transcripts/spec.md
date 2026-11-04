# Search Transcripts Tool Specification

**Ticket:** CV-14191 (cv-mcp-server part: the `search_transcripts` tool)
**Scope:** Complex (new hand-rolled endpoint + cross-workspace fan-out + privacy in shared logging)
**Decisions:** [context.md](context.md)
**Upstream contract:** cv-api PR #571, `.specs/features/search-transcripts/spec.md` (STX-01..24), `src/search/dto/TranscriptSearch{Request,Response}.ts`, `SEARCH_TRANSCRIPTS_DESCRIPTION` in `src/search/search.controller.ts`. When this spec and those files disagree on the endpoint's behaviour, the cv-api files win.

## Problem Statement

An LLM agent using the Carbon Voice MCP can only find messages by metadata (notified state, tags, labels, creator, heard state, plain history). It cannot answer "where did we discuss X?" without already knowing the conversation or the date. cv-api now has `POST /search/transcripts` (semantic search, ONE workspace per call); this feature exposes it as an MCP tool, and makes the tool search every workspace of the caller when the agent does not know which one, so the agent can then ask the user which workspace they meant.

## Goals

- [ ] An agent can find messages by meaning in one tool call, with or without knowing the workspace.
- [ ] When hits come from 2+ workspaces, the tool says so explicitly, so the agent asks the user instead of guessing.
- [ ] No log line written by cv-mcp-server carries the query text or any matched chunk text.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Any change to cv-api | Rule of this journey; endpoint gaps are recorded under Dependencies |
| A batch `get_messages` tool (`POST /v6/messages/by-ids`) | Separate later feature of CV-14191 (cv-api context.md), with its own rule that a status other than `active` goes to `missing_ids` (cv-api context.md, soft-delete gap). This tool points to the existing `get_message`; the `get_messages` PR updates STT-20(g) to prefer it for several ids (`agent-task-chain.test.ts` forbids naming a tool before it exists) |
| One merged cross-workspace list sorted by score | Replaced by the grouped response (decided 2026-11-03, context.md) |
| Asking the user through MCP elicitation | The agent asks the user; client support for elicitation varies and no tool here uses it |
| Capping how many workspaces one fan-out call searches | Decided: no cap, documented cost instead (context.md) |
| Converting dates without an offset | The schema rejects them (STT-01, cv-api's offset rule); guessing a timezone is worse than a clear error |
| Removing user content from logs of OTHER tools | Pre-existing, repo-wide (see Dependencies D-3); separate ticket |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Tool name | `search_transcripts` | Same name the cv-api spec and context.md already use for this tool; reads next to `search_message_ids` / `search_messages_by_heard_status` | y |
| `workspace_id` | Optional. Given → one call (single mode). Omitted → fan-out over every workspace of the caller | Frederico, 2026-11-03; cv-api context.md already moved the fan-out to the MCP | y |
| Source of the workspace list | `GET /simplified/workspaces/basic-info` (the call behind `get_workspaces_basic_info`) | Returns `{id, name}` for every `workspace_guids` entry and always appends `personal` (`simplified-workspace.service.ts:25-35`), so names come for free | y |
| Fan-out response | Grouped by workspace, plus `needs_workspace_choice` | Frederico, 2026-11-03 | y |
| When `needs_workspace_choice` is true | When 2 or more workspaces returned at least one row; no score threshold | A mechanical rule is testable; the agent shows names, counts and best snippet and lets the user pick | y |
| Workspaces with 0 rows | Not in `workspaces`; listed in `empty_workspaces` | Keeps `workspaces` short and still lets the agent say "nothing in the others" | y |
| `limit` in fan-out mode | Applies per workspace; default **10** when not given (single mode keeps the endpoint default, 30) | Payload: up to 30 rows × ~500-word chunks × N workspaces is too large for an agent; fan-out is for finding the workspace, then the agent re-calls in single mode | y |
| 403 from one workspace in fan-out | Silently left out of every list; not an error | `basic-info` lists `personal` even when `workspace_guids` lacks it, and lists removed memberships that `workspace_guids` still holds; both answer 403 (`transcript-search.service.ts:135-151`) and are not the user's fault. Frederico, 2026-11-03 | y |
| Any other per-workspace failure in fan-out | Partial result; the workspace goes to `skipped_workspaces` with the error code | Frederico, 2026-11-03 | y |
| Whole-call failure in fan-out | Only when no workspace call succeeded AND at least one failed with a non-403 error | Same decision | y |
| Fan-out concurrency | All workspace calls in parallel, no cap | Frederico, 2026-11-03 (cost documented in the ToolDoc) | y |
| `conversation_ids` without `workspace_id` | Allowed; fans out like any other call (workspaces that do not hold those conversations return 0 rows) | No extra rule to build; the ToolDoc tells the agent to send `workspace_id` when it already has it | y |
| `start_date >= end_date` | Rejected by the tool before any API call | In fan-out mode the backend would answer N identical 400s, each costing a rate-limit slot | y |
| Annotations | `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false` | Read-only, reaches only the caller's own account and workspaces, same as the other searches | y |
| Release | Tested by hand against stage; MCP released only after cv-api PR #571 is deployed to prod (merged into `main` 2026-11-03) | The endpoint does not exist in prod before that deploy | y |

**Open questions:** none — every row resolved and signed off by Frederico in the spec gate (2026-11-03).

---

## Dependencies

- **D-1** cv-api PR #571 is merged into `main` (2026-11-03T18:51Z, `6c6b29b`). The MCP release still waits until that commit is deployed to prod.
- **D-2** The 20 requests/minute/user limit is per pod in cv-api (`UserThrottlerGuard`). A fan-out over N workspaces spends N of them. No cv-api change asked.
- **D-3 (finding, outside this feature)** Shared logging writes tool arguments for EVERY tool: `log-request.middlware.ts:63-70` logs `body: req.body` at `info` on every HTTP request, and `axios-instance.ts:254-258` logs `data: config.data` at `debug`. `iac/scripts/deploy-apprunner.sh:6` sets `LOG_LEVEL="debug"` before the prod branch's `if [ -z "$LOG_LEVEL" ]` check, so that script deploys prod at `debug`. This feature closes the leak for `search_transcripts` only (STT-26); the other tools need their own ticket.

---

## User Stories

### P1: Search one known workspace by meaning ⭐ MVP

**User Story**: As an MCP agent acting for a Carbon Voice user, I want to send a natural-language query for a workspace I already know and get the best-matching messages with the chunk that matched, so that I can find where a topic was discussed without knowing the date or the conversation.

**Why P1**: It is the base call; fan-out reuses it.

**Acceptance Criteria**:

Input

1. **STT-01** WHEN the tool is called with arguments outside these bounds THEN the MCP input schema SHALL reject the call and no API request SHALL be made: `query` missing, blank (no non-whitespace character) or longer than 500 characters (Unicode code points, as cv-api `isLength` counts, not UTF-16 units: PR #9 review); `conversation_ids` or `creator_ids` with more than 50 entries; `exclude_message_ids` with more than 500 entries; an empty string inside any of these three lists; `start_date` / `end_date` not an ISO 8601 date-time ending in `Z` or `±HH:MM` (the same rule as cv-api's `ISO_OFFSET_SUFFIX`, so `+0300` is rejected here, not by N backend 400s); `limit` not an integer in 1..50; `workspace_id` present but empty.
2. **STT-02** WHEN both `start_date` and `end_date` are given and `start_date >= end_date` THEN the tool SHALL return a tool error with code `BAD_REQUEST` and SHALL make no API request.

Single mode

3. **STT-03** WHEN `workspace_id` is given THEN the tool SHALL make exactly one `POST /search/transcripts` request, with the caller's token in the auth header and a JSON body holding `query`, `workspace_id` and every other given search argument unchanged, and SHALL NOT call `/simplified/workspaces/basic-info`. `response_fields` SHALL NOT be sent.
4. **STT-04** WHEN the single-mode request succeeds THEN the tool SHALL return the endpoint's `{ results, scope_capped }` unchanged, after applying `response_fields` when given.
5. **STT-05** WHEN the single-mode request fails THEN the tool SHALL return a tool error with the code `handleAxiosError` emits (`BAD_REQUEST`, `FORBIDDEN`, `RATE_LIMITED`, `SERVER_ERROR`, …) and `tool: 'search_transcripts'`.

**Independent Test**: With the API mocked, a call with `workspace_id: 'w1'` makes one POST to `/search/transcripts` with the expected body and auth header, and returns the mocked `{results, scope_capped}`.

---

### P1: Search every workspace when the agent does not know which ⭐ MVP

**User Story**: As an MCP agent whose user did not say which workspace, I want the tool to search all of their workspaces at once and tell me when the hits are spread over several, so that I ask the user which workspace they meant instead of guessing.

**Why P1**: Frederico's requirement; without it the agent must guess a workspace or make N calls itself.

**Acceptance Criteria**:

Calls

6. **STT-06** WHEN `workspace_id` is omitted THEN the tool SHALL call `GET /simplified/workspaces/basic-info` once, and then make one `POST /search/transcripts` per workspace it returned (`personal` included), all started without waiting for each other, each with that workspace's `id` as `workspace_id` and the same other search arguments.
7. **STT-07** WHEN `workspace_id` is omitted and `limit` is not given THEN each per-workspace request SHALL carry `limit: 10`; WHEN `limit` is given THEN each per-workspace request SHALL carry that value. In both cases the per-workspace value SHALL be lowered to `floor(100 / workspace count)` (never below 1) when that is smaller, so one fan-out returns at most 100 rows (PR #9 review).
8. **STT-08** WHEN the `basic-info` request fails THEN the tool SHALL return a tool error with that request's error code and SHALL make no `POST /search/transcripts` request.

Grouped response

9. **STT-09** WHEN at least one per-workspace request succeeds THEN the tool SHALL return `{ needs_workspace_choice, workspaces, empty_workspaces, skipped_workspaces }`, where `workspaces` holds one group per workspace that returned 1 or more rows: `{ workspace_id, workspace_name, result_count, best_score, scope_capped, results }`. `result_count` is the number of rows in that group's `results`; `best_score` is the highest `score` in it; `results` and `scope_capped` are that workspace's response, unchanged.
10. **STT-10** WHEN groups are returned THEN `workspaces` SHALL be in descending `best_score` order.
11. **STT-11** WHEN 2 or more groups are in `workspaces` THEN `needs_workspace_choice` SHALL be `true`; WHEN 0 or 1 groups are in it THEN it SHALL be `false`.
12. **STT-12** WHEN a per-workspace request succeeds with 0 rows THEN that workspace SHALL appear in `empty_workspaces` as `{ workspace_id, workspace_name }` and not in `workspaces`.
13. **STT-13** WHEN `response_fields` is given in fan-out mode THEN the projection SHALL be applied to the grouped response, and the top-level `needs_workspace_choice`, `skipped_workspaces` and (single mode) `scope_capped` SHALL be kept even when not requested, like the paging keys (PR #9 review: dropping `skipped_workspaces` made a partial search read as complete).

Partial failure

14. **STT-14** WHEN a per-workspace request fails with 403 THEN that workspace SHALL appear in none of `workspaces`, `empty_workspaces` or `skipped_workspaces`, and the call SHALL NOT fail because of it.
15. **STT-15** WHEN a per-workspace request fails with any error other than 403 (429, 5xx, network, timeout) and at least one other per-workspace request succeeds THEN that workspace SHALL appear in `skipped_workspaces` as `{ workspace_id, workspace_name, reason }`, `reason` being the code `handleAxiosError` emits (e.g. `RATE_LIMITED`, `SERVER_ERROR`, `NETWORK_ERROR`), and the successful workspaces SHALL still be returned.
16. **STT-16** WHEN no per-workspace request succeeds and at least one failed with an error other than 403 THEN the tool SHALL return a tool error whose code is `RATE_LIMITED` if any of them was a 429, otherwise the code of the first non-403 failure in `basic-info` order.
17. **STT-17** WHEN every per-workspace request fails with 403 THEN the tool SHALL succeed with `needs_workspace_choice: false` and `workspaces`, `empty_workspaces`, `skipped_workspaces` all `[]`.

**Independent Test**: With the API mocked to list 4 workspaces (A: 2 rows, B: 1 row, C: 0 rows, `personal`: 403), a call without `workspace_id` makes 1 `basic-info` + 4 search requests and returns `needs_workspace_choice: true`, `workspaces` = [A, B] or [B, A] by `best_score`, `empty_workspaces` = [C], and no `personal` anywhere. Making B answer 429 instead moves B to `skipped_workspaces` with `RATE_LIMITED`.

---

### P1: An agent that has never seen Carbon Voice uses the tool right ⭐ MVP

**User Story**: As an LLM agent reading only the tool description, I want it to tell me when to use this tool, what each field means and what to do next, so that I neither misuse it nor waste rate-limit slots.

**Why P1**: The ToolDoc is how the tool gets used; wrong prose gives wrong answers (`src/docs/types.ts` header).

**Acceptance Criteria**:

18. **STT-18** WHEN the tool is registered THEN its description SHALL be rendered from a `TOOL_DOCS.search_transcripts` entry and its name SHALL come from `src/docs/tool-names.ts`, and the existing doc tests (`tool-docs.test.ts`, `agent-task-chain.test.ts`) SHALL pass with it, with the two budget exceptions settled in design DD-1 (Frederico, 2026-11-03): a description cap of 1,900 chars for `search_transcripts` only in `tool-docs.test.ts`, and `MAX_WIRE_BYTES` 75,000 in `mcp-protocol.test.ts`.
19. **STT-19** WHEN the ToolDoc is read THEN `whenToUse` SHALL say the tool finds where a topic was discussed, by meaning, without knowing the date or the conversation; and `whenNotToUse` SHALL name `search_message_ids` (notified, mentions/tags, labels), `list_messages` (plain history), `search_messages_by_heard_status` (unread), and SHALL say exact names, URLs and ticket numbers may be missed.
20. **STT-20** WHEN the ToolDoc is read THEN its prose SHALL state each of these, consistent with cv-api: (a) `workspace_id` is optional, omitting it searches every workspace and costs one request per workspace out of 20 per minute, so send it when known; (b) when `needs_workspace_choice` is `true`, ask the user which workspace (showing `workspace_name`, `result_count` and the best `matched_chunk`) and call again with that `workspace_id`; (c) page by sending the ids already seen in `exclude_message_ids`; (d) `conversation_id: null` is the caller's own voice memo; (e) `scope_capped: true` means not all conversations were searched, so narrow with `conversation_ids` or dates; (f) the date window is `[start_date, end_date)` and both need an offset; (g) `get_message` with a `message_id` returns the full message; (h) a workspace in `skipped_workspaces` was NOT searched, so tell the user and, for `RATE_LIMITED`, retry it later with its `workspace_id`.
21. **STT-21** WHEN the ToolDoc is read THEN `prerequisites` SHALL map `workspace_id` to `get_workspaces_basic_info.id`, and every tool it names SHALL exist (agent-task-chain test).
22. **STT-22** Removed (Frederico, 2026-11-03, design DD-1 option A): the ToolDoc has no `recommendedFields`. Any valid projection keeps `matched_chunk`, the bulk of the payload, so the list saved almost nothing and cost ~480 description chars per session. `response_fields` stays (STT-04, STT-13).
23. **STT-23** WHEN the ToolDoc is read THEN `commonErrors` SHALL hold one entry per code `BAD_REQUEST`, `FORBIDDEN`, `RATE_LIMITED`, `SERVER_ERROR`, `NOT_FOUND`, each with a concrete next step; the `RATE_LIMITED` step SHALL say to wait a minute or retry with one `workspace_id`; the `NOT_FOUND` step (endpoint not deployed) SHALL say not to retry.
24. **STT-24** WHEN the integration suite runs THEN the ToolDoc `example` SHALL be callable (`mcp-protocol.test.ts`).
25. **STT-25** WHEN the tool is listed THEN its annotations SHALL be `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.

**Independent Test**: The doc unit tests pass, including the STT-19, STT-20, STT-21 and STT-23 content checks.

---

### P1: Search text never reaches the logs ⭐ MVP

**User Story**: As the team operating cv-mcp-server, I want no log line to carry what the user searched for or what was found, so that a semantic search does not copy private transcript text into our log storage.

**Why P1**: Same rule cv-api enforces (STX-20); without it, the MCP re-leaks what cv-api keeps out.

**Acceptance Criteria**:

26. **STT-26** WHEN `search_transcripts` runs, in single and in fan-out mode, on the success path and on every error path (400, 403, 429, 5xx, network, `basic-info` failure), at every log level including `debug`, THEN no log line written by cv-mcp-server SHALL contain the `query` value or any `matched_chunk` value. This covers at least: the tool handler's error log, the axios request log (`config.data`), the axios error log (`requestData`, `responseData` — a cv-api 400 may echo the input back), and the HTTP request log (`req.body`). Verified by a sentinel test: a unique query string and a unique chunk string, every logger level captured, zero hits.
27. **STT-27** WHEN an API request made by `search_transcripts` fails THEN the error log SHALL still carry the tool name and that request's HTTP status (or error code when there is no response); WHEN a fan-out call ends with any failed workspace request THEN one log line SHALL carry the number of workspaces listed, succeeded, answered 403 and skipped.

**Independent Test**: The sentinel test (STT-26) against mocked 200, 400 (with input echoed in the body), 429 and 503 responses, in both modes, with `LOG_LEVEL=debug`.

---

## Edge Cases

- WHEN `exclude_message_ids` is given in fan-out mode THEN every per-workspace request carries the same list (message ids are global).
- WHEN two groups have the same `best_score` THEN their relative order is not specified.
- WHEN the endpoint is not deployed (prod before D-1) THEN every request fails (404 → `NOT_FOUND`), handled by STT-05 / STT-15 / STT-16.

---

## Implicit-Requirement Dimensions Sweep

| Dimension | Covered by |
| --- | --- |
| Input validation & bounds | STT-01, STT-02 |
| Failure / partial-failure states | STT-05, STT-08, STT-14, STT-15, STT-16, STT-17 |
| Idempotency / retry / duplicate handling | N/A because the tool is read-only: a retry is always safe; the ToolDoc retry advice is STT-23 |
| Auth boundaries & rate limits | STT-03 (caller token), STT-14 (403 per workspace), STT-20a and STT-23 (rate-limit cost and recovery); access itself is enforced by cv-api (STX-02..06) |
| Concurrency / ordering | STT-06 (parallel calls), STT-10 (group order); row order inside a group is the endpoint's (STX-07) |
| Data lifecycle / expiry | N/A because the tool stores nothing; deleted or edited messages are handled by cv-api (STX-06, STX-13) |
| Observability | STT-26 (no content), STT-27 (what is still logged) |
| External-dependency failure | STT-05, STT-08, STT-15, STT-16 (cv-api errors, 503 when search is off) |
| State-transition integrity | N/A because the tool changes no state |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| STT-01 | P1: Single workspace | T1, T4 | Pending |
| STT-02 | P1: Single workspace | T4 | Pending |
| STT-03 | P1: Single workspace | T2, T4 | Pending |
| STT-04 | P1: Single workspace | T4 | Pending |
| STT-05 | P1: Single workspace | T4 | Pending |
| STT-06 | P1: Fan-out | T3 | Pending |
| STT-07 | P1: Fan-out | T3 | Pending |
| STT-08 | P1: Fan-out | T3, T4 | Pending |
| STT-09 | P1: Fan-out | T3 | Pending |
| STT-10 | P1: Fan-out | T3 | Pending |
| STT-11 | P1: Fan-out | T3 | Pending |
| STT-12 | P1: Fan-out | T3 | Pending |
| STT-13 | P1: Fan-out | T4 | Pending |
| STT-14 | P1: Fan-out | T3 | Pending |
| STT-15 | P1: Fan-out | T3 | Pending |
| STT-16 | P1: Fan-out | T3, T4 | Pending |
| STT-17 | P1: Fan-out | T3 | Pending |
| STT-18 | P1: ToolDoc | T4 | Pending |
| STT-19 | P1: ToolDoc | T4 | Pending |
| STT-20 | P1: ToolDoc | T4 | Pending |
| STT-21 | P1: ToolDoc | T4 | Pending |
| STT-22 | P1: ToolDoc | Removed (DD-1) | Removed |
| STT-23 | P1: ToolDoc | T4 | Pending |
| STT-24 | P1: ToolDoc | T4 | Pending |
| STT-25 | P1: ToolDoc | T4 | Pending |
| STT-26 | P1: Privacy | T5 | Pending |
| STT-27 | P1: Privacy | T3, T5 | Pending |

**Coverage:** 27 IDs, 26 mapped to tasks (`tasks.md`), STT-22 removed by design DD-1

---

## Success Criteria

- [ ] Every STT requirement has a passing test; the privacy sentinel (STT-26) is shown red against the current logging before it goes green.
- [ ] A manual run against stage (`CARBON_VOICE_BASE_URL` = stage) returns hits in single mode and a grouped answer in fan-out mode for a user with 2+ workspaces.
- [ ] The MCP version is not released before cv-api PR #571 is in prod (D-1).
