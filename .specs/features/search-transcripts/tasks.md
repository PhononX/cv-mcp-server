# Search Transcripts Tool Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/search-transcripts/design.md`
**Status**: Approved plan pending Frederico's Execute OK. Design DD-1 decided 2026-11-03: Option A (STT-22 removed, STT-18 names the budget exceptions).

**Rules for this branch** (from the Design prompt): worktree only, never `git stash`, never `npm run lint:fix`; ask Frederico before the FIRST commit; no push, PR, version or release without his OK; commits cite only `CV-14191`.

**Baseline (2026-11-03, `18fe45f`, after `npm ci`)**: unit 24 suites / 822 tests; integration 1 / 452; e2e 1 / 56; `npx eslint src` exit 0; `npm run build:check` exit 0; `tools/list` 42 tools / 70,023 bytes.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `jest.config.js` (global coverage threshold 80% branches/functions/lines/statements), `src/docs/types.ts` header (doc/prose consistency), test-file headers of `server.test.ts` (tool inventory + order), `mcp-protocol.test.ts` (wire contract, payload budget), `tool-docs.test.ts` (doc contract, 1,200-char budget). No AGENTS.md / CONTRIBUTING.md / repo CLAUDE.md test rules.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| zod input schema (`src/schemas/*`) | unit | Every STT-01 bound: one reject case each + accept cases for `Z` / `±HH:MM` | `tests/unit/schemas/*.test.ts` | `npm run test:unit` |
| API client (`src/cv-api.ts`) | unit | URL, method, body, options forwarded (STT-03); `mutator` mocked as in `cv-api.test.ts` | `tests/unit/cv-api.test.ts` | `npm run test:unit` |
| Domain logic (`src/utils/search-transcripts-fan-out.ts`) | unit | All branches; 1:1 to STT-06..17 + STT-27 summary line; spec edge cases (`exclude_message_ids` in every body, empty `basic-info`) | `tests/unit/utils/*.test.ts` | `npm run test:unit` |
| Tool handler + registration (`src/server.ts`) | unit | Happy path both modes + STT-02 + every error path; inventory/order tests stay green | `tests/unit/server/server.test.ts` | `npm run test:unit` |
| Tool docs (`src/docs/*`) | unit | Existing table-driven contract + STT-19..23 content checks | `tests/unit/docs/*.test.ts` | `npm run test:unit` |
| MCP wire contract | integration | Schema on the wire, annotations, example callable, projection end to end, payload budget | `tests/integration/mcp-protocol.test.ts` | `npm run test:integration` |
| Shared logging (`axios-instance.ts`, `log-request.middlware.ts`) | unit | Redaction for this route/tool + unchanged output for others | `tests/unit/utils/axios-instance.test.ts`, `tests/unit/transports/http/middleware/log-request.middleware.test.ts` | `npm run test:unit` |
| Privacy end to end (STT-26) | unit (real server + real logger, network faked) | Sentinel matrix from design (single × 5, fan-out × 4, middleware object + batch), zero hits, non-vacuous | `tests/unit/privacy/*.test.ts` | `npm run test:unit` |
| Response interfaces (`src/interfaces/*`) | none | — (build gate only) | — | `npm run build:check` |

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --- | --- | --- | --- |
| unit | Yes | Every dependency mocked per file (`jest.mock`), no network, `fs` mocked globally | `tests/setup.ts:24-30`, `server.test.ts:15-98` |
| integration | Yes | In-memory MCP transport, API doubles, no network | `mcp-protocol.test.ts:83-128` |
| e2e | No | Starts the HTTP transport on a fixed port (`PORT=3006`) | `tests/setup.ts:7`, `tests/e2e/http-transport.test.ts` |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm run test:unit` |
| Full | After tasks touching the wire contract or shared logging | `npm run test:unit && npm run test:integration` |
| Build | After the last task | `npm run build:check && npx eslint src && npm run test:unit && npm run test:integration && npm run test:e2e` |

`npx eslint src` is read-only (no `--fix`). Never run `npm run lint:fix`.

---

## Execution Plan

3 phases → executed inline, no sub-agent offer. The Verifier runs after T5 regardless.

### Phase 1: Foundation

```
T1 ──→ T2
```

### Phase 2: Core

```
T2 ──→ T3 ──→ T4
```

### Phase 3: Privacy

```
T4 ──→ T5
```

---

## Task Breakdown

### T1: Input schema `searchTranscriptsParams`

**What**: Add `ISO_OFFSET_SUFFIX`, `searchTranscriptsParams` (design Component 1, with terse `.describe()` on every field) and `SearchTranscriptsParams` to `src/schemas/search.ts`; export through `src/schemas/index.ts`.
**Where**: `src/schemas/search.ts`, `src/schemas/index.ts`, `tests/unit/schemas/search-transcripts.test.ts` (new)
**Depends on**: None
**Reuses**: `src/schemas/search.ts` style
**Requirement**: STT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Rejects: query missing, `''`, `'   '`, 501 chars; 51 `conversation_ids`; 51 `creator_ids`; 501 `exclude_message_ids`; `''` inside each list; dates `2026-10-01T10:00:00`, `2026-10-01T10:00:00+0300`; `limit` 0, 51, 2.5; `workspace_id: ''`
- [x] Accepts: dates ending `Z` and `-03:00`; 500-char query; 50 / 500 list entries; omitted optionals; `limit` absent stays absent (no default)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 822 + new tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(search): add search_transcripts input schema [CV-14191]`

---

### T2: Response interfaces and `cvApi.searchTranscripts`

**What**: Add `src/interfaces/transcript-search.interface.ts` (design Component 3, plus `TranscriptSearchBody`) exported from `src/interfaces/index.ts`; add `searchTranscripts(body, options)` to `src/cv-api.ts` (POST `/search/transcripts`, `data: body`).
**Where**: `src/interfaces/transcript-search.interface.ts` (new), `src/interfaces/index.ts`, `src/cv-api.ts`, `tests/unit/cv-api.test.ts`
**Depends on**: T1
**Reuses**: `searchMessagesByHeardStatus` in `src/cv-api.ts`
**Requirement**: STT-03 (client part)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `mutator` called once with `{ url: '/search/transcripts', method: 'POST', data: body }` and the given options
- [x] Resolved value returned unchanged; rejection propagates unchanged
- [x] `npm run build:check` exit 0
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: T1 total + new tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(search): add cvApi.searchTranscripts client [CV-14191]`

---

### T3: Fan-out `searchTranscriptsInAllWorkspaces`

**What**: Add `src/utils/search-transcripts-fan-out.ts` per design Component 4 (`FAN_OUT_DEFAULT_LIMIT`, `FanOutDeps`, `searchTranscriptsInAllWorkspaces`, `describeFailure`, the `SEARCH_TRANSCRIPTS_FAN_OUT` summary line); export from `src/utils/index.ts`.
**Where**: `src/utils/search-transcripts-fan-out.ts` (new), `src/utils/index.ts`, `tests/unit/utils/search-transcripts-fan-out.test.ts` (new)
**Depends on**: T2
**Reuses**: `handleAxiosError` envelope shape (`axios-instance.ts`), `logger` (`./logger`, not the barrel)
**Requirement**: STT-06, STT-07, STT-08, STT-09, STT-10, STT-11, STT-12, STT-14, STT-15, STT-16, STT-17, STT-27 (fan-out line)

**Tools**: MCP: NONE · Skill: `test-driven-development`

**Done when**:

- [ ] Spec Independent Test (A 2 rows, B 1, C 0, `personal` 403) gives `needs_workspace_choice: true`, `workspaces` ordered by `best_score`, `empty_workspaces: [C]`, `personal` nowhere; B as 429 moves to `skipped_workspaces` with `RATE_LIMITED`
- [ ] All N `search` calls issued before the first resolves (pending-promise fake)
- [ ] Bodies: per-workspace `workspace_id`, same other args, `limit` 10 by default / given value otherwise, same `exclude_message_ids` in every body
- [ ] `listWorkspaces` rejection rethrown as the same object; `search` never called
- [ ] Group fields: `result_count`, `best_score` = max score, `results` and `scope_capped` unchanged
- [ ] `needs_workspace_choice` false for 0 and 1 groups, true for 2
- [ ] Reasons: 429 → `RATE_LIMITED`, 503 → `SERVER_ERROR`, no response → `NETWORK_ERROR`, non-envelope → `UNKNOWN_ERROR`
- [ ] Whole-call: [503, 429] rejects with the 429 object; [403, 503, 500] with the 503 object; all 403 resolves `{false, [], [], []}`; `basic-info` `[]` resolves `{false, [], [], []}`
- [ ] Summary line: emitted once when any search rejects, with `tool`, `listed`, `succeeded`, `forbidden`, `skipped`, `failures[{workspace_id,status,code}]`; `warn` if skipped > 0, `info` if only 403; not emitted when none rejects
- [ ] `describeFailure` returns only `{status, code}` (no message, no details)
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: T2 total + new tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(search): fan out search_transcripts over every workspace [CV-14191]`

---

### T4: Register `search_transcripts` (name, ToolDoc, handler)

Merged by necessity: `tool-docs.test.ts` requires every `TOOL_DOCS` key in `TOOL_NAMES`, and `server.test.ts` requires the registered set and order to equal `TOOL_NAMES`, so the three cannot land in separate green commits.

**What**: Append `'search_transcripts'` to `TOOL_NAMES`; add the `TOOL_DOCS.search_transcripts` entry (design ToolDoc, Option A); register the tool at the end of the Search & Notifications block in `src/server.ts` per design Component 5, with the repo-standard catch log `logger.error('Error searching transcripts:', { args, error })` (replaced in T5 — keeps the red run of T5 honest); apply DD-1's budget changes.
**Where**: `src/docs/tool-names.ts`, `src/docs/tool-docs.ts`, `src/server.ts`, `tests/unit/server/server.test.ts`, `tests/unit/docs/tool-docs.test.ts`, `tests/unit/docs/agent-task-chain.test.ts`, `tests/integration/mcp-protocol.test.ts`
**Depends on**: T3
**Reuses**: `search_message_ids` registration, `responseFieldsShape`, `INVALID_AUDIO_URL` envelope (`server.ts:487-497`), `formatToMCPToolResponse`
**Requirement**: STT-01 (wire), STT-02, STT-03, STT-04, STT-05, STT-08 (handler), STT-13, STT-16 (handler), STT-18, STT-19, STT-20, STT-21, STT-23, STT-24, STT-25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `server.test.ts`: cv-api mock gains `searchTranscripts`; utils mock gains `searchTranscriptsInAllWorkspaces` and `describeFailure` via `jest.requireActual`
- [ ] `server.test.ts`: registered `inputSchema` = `searchTranscriptsParams.shape` + `response_fields`; annotations read-only/closed
- [ ] `server.test.ts`: equal and reversed dates → `BAD_REQUEST` `isError`, no API call, both modes
- [ ] `server.test.ts`: with `workspace_id` → one `searchTranscripts(body, auth)`, body without `response_fields`, no `limit` key when not given, `getAllWorkspacesWithBasicInfo` not called; result passed with `{ responseFields }`
- [ ] `server.test.ts`: without `workspace_id` → `getAllWorkspacesWithBasicInfo` then `searchTranscripts` per workspace; grouped result passed with `{ responseFields }`
- [ ] `server.test.ts`: rejection (single, `basic-info`, whole fan-out) → `{ isError: true, tool: 'search_transcripts' }`; tool added to the "Error responses" table and `PROJECTED_TOOLS`
- [ ] `tool-docs.test.ts`: new `search_transcripts doc` block checks STT-19 tool names + exact-strings caveat, STT-20 (a)-(h) markers (incl. `offset` for f), STT-21 prerequisite, STT-23 four codes and the `RATE_LIMITED` step
- [ ] DD-1 (Option A): `tool-docs.test.ts` gets a per-tool cap of 1,900 chars for `search_transcripts` only, with a comment citing DD-1 and the measured size; `mcp-protocol.test.ts` `MAX_WIRE_BYTES` → 75,000 with the new measured total in the comment
- [ ] `agent-task-chain.test.ts`: `['search_transcripts', 'search_message_ids']` added to `PAIRS`
- [ ] `mcp-protocol.test.ts`: cv-api double gains `searchTranscripts`; `callTool` with the ToolDoc example returns non-error (STT-24); a no-offset date returns a protocol error and the double is not called (STT-01 wire); fan-out with `response_fields` narrows the grouped payload through the real formatter (STT-13); tool absent from `OPEN_WORLD_TOOLS` / `DESTRUCTIVE_TOOLS` (STT-25)
- [ ] Gate check passes: `npm run test:unit && npm run test:integration`
- [ ] Test count: unit T3 total + new; integration 452 + new (the `describe.each` over tools adds its per-tool cases)

**Tests**: unit, integration
**Gate**: full
**Commit**: `feat(search): register search_transcripts tool [CV-14191]`

---

### T5: Keep query and matched chunks out of every log

Cohesive by design: one AC (STT-26) whose sentinel must be red against all four log points before any of them changes.

**What**: (1) Write the sentinel test (design "Sentinel test") and run it — it MUST fail; paste the hit list (which log line, which point a/b/c/d) into this task's Notes. (2) Add `CONTENT_REDACTED_ROUTES` in `axios-instance.ts` (request `data` → `'[REDACTED]'`; error log drops `requestData`, `responseData`, `error.body.message`). (3) Add `REDACTED_ARGUMENT_TOOLS` in `log-request.middlware.ts` (logged copy only, objects and batch arrays). (4) Replace the T4 handler log with `{ tool: 'search_transcripts', ...describeFailure(error) }`. (5) Re-run: green.
**Where**: `src/utils/axios-instance.ts`, `src/transports/http/middleware/log-request.middlware.ts`, `src/server.ts`, `tests/unit/privacy/search-transcripts-log-sentinel.test.ts` (new), `tests/unit/utils/axios-instance.test.ts`, `tests/unit/transports/http/middleware/log-request.middleware.test.ts`
**Depends on**: T4
**Reuses**: `NOT_LOG_ROUTES` idiom, `describeFailure` (T3), `InMemoryTransport` setup from `mcp-protocol.test.ts`, exported `customAxios`
**Requirement**: STT-26, STT-27

**Tools**: MCP: NONE · Skill: `test-driven-development`

**Done when**:

- [ ] Red run recorded in Notes, with at least one hit at each of points a, b, c, d
- [ ] Sentinel green: zero captured lines contain the query or chunk sentinel across the design matrix (single × 200/400-echo/429/503/network; fan-out × all-200/mixed/all-503/`basic-info`-503; middleware object + batch)
- [ ] Sentinel non-vacuous: `logger.level === 'debug'`; every scenario captured ≥ 1 line naming `/search/transcripts` or `search_transcripts` with its status/code (STT-27)
- [ ] `axios-instance.test.ts`: another route still logs `data`, `requestData`, `responseData`
- [ ] `log-request.middleware.test.ts`: `search_transcripts` arguments → `'[REDACTED]'` (object and batch); another tool's body logged unchanged; `req.body` not mutated
- [ ] Gate check passes (Build): `npm run build:check && npx eslint src && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: unit T4 total + new; integration and e2e unchanged from T4

**Tests**: unit
**Gate**: build
**Commit**: `fix(logging): keep search_transcripts query and chunks out of logs [CV-14191]`

**Notes**: _(red-run evidence goes here during Execute)_

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 ──→ T2

Phase 2 (Sequential):
  T2 ──→ T3 ──→ T4

Phase 3 (Sequential):
  T4 ──→ T5
```

No `[P]` tasks: each task consumes the previous one's exports (types → client → fan-out → registration → logging around the registered tool).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Input schema | 1 schema + barrel export | ✅ Granular |
| T2: Interfaces + client | 1 type file + 1 method | ⚠️ 2 related things, cohesive (the method's return type) |
| T3: Fan-out | 1 module (2 functions) | ✅ Granular |
| T4: Register tool | name + doc + handler, coupled by 2 existing guards | ⚠️ Forced merge (see task header); cannot be green split |
| T5: Log privacy | 3 small log changes under one red→green sentinel | ⚠️ Cohesive by AC (see task header) |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | start of Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | zod input schema | unit | unit | ✅ OK |
| T2 | API client + interfaces | unit (+ none) | unit | ✅ OK |
| T3 | Domain logic | unit | unit | ✅ OK |
| T4 | Handler/registration, docs, wire contract | unit + integration | unit, integration | ✅ OK |
| T5 | Shared logging + privacy | unit | unit | ✅ OK |

## Requirement → Task

| Requirement | Task(s) |
| --- | --- |
| STT-01 | T1, T4 (wire) |
| STT-02, STT-03, STT-04, STT-05 | T4 (STT-03 client: T2) |
| STT-06 … STT-12, STT-14, STT-15, STT-17 | T3 |
| STT-08, STT-16 | T3 (logic), T4 (handler) |
| STT-13 | T4 |
| STT-18 … STT-21, STT-23 … STT-25 | T4 |
| STT-22 | removed (DD-1) |
| STT-26 | T5 |
| STT-27 | T3 (fan-out line), T5 (handler line + sentinel) |

## Manual check (after Execute, by Frederico)

See design "Manual Stage Check". Not a task: it needs a stage URL and a stage PAT this repo does not hold, and stage reads prod data.
