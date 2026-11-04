# Search Transcripts Validation

**Date**: 2026-11-04
**Spec**: `.specs/features/search-transcripts/spec.md` (STT-01..27; STT-22 removed by design DD-1)
**Diff range**: `origin/develop..e3f2b26` (7 commits). Code commits: `2443ab2` T1, `6187099` T2, `98ec09f` T3, `7200d8b` T4, `4681fec` T5. Fix commit for iteration 2: `e3f2b26` (tests + README only).
**Verifier**: independent sub-agent (author ≠ verifier). I re-derived everything from the spec and the code. I re-measured the author's claims rather than trusting them.
**Iteration**: 2 of 3 (fix → re-verify loop)

---

## Verdict: PASS ✅

- Gates: all 5 pass.
- Spec coverage: all 26 live ACs have `file:line` evidence whose asserted value matches the spec.
- Sensor: all 26 distinct behaviour mutants are killed in the current state, and the T5 red run reproduces exactly.
- What is left is cosmetic or spec wording only (see Ranked Gaps). None of it blocks the feature.

---

## History

| Iteration | HEAD | Verdict | Gates (unit / integ / e2e) | Sensor | Gaps |
| --- | --- | --- | --- | --- | --- |
| 1 | `4681fec` | FAIL ❌ | 942 / 466 / 56, all exit 0 | 19/22 killed. Survivors: M16 (string date compare), M20 (description not wired), M21 (STT-20 b/c/h inverted) | Major: STT-18 description wiring not asserted. Minor: STT-20 b/c/h markers weak; STT-02 lexical compare not caught. Cosmetic: STT-27 handler line not asserted; README rationale |
| 2 | `e3f2b26` | PASS ✅ | 947 / 466 / 56, all exit 0 | 13 re-run, 13 killed: M16, M20, M21b/c/h now killed, new M22 and M23 killed, M13–M15 and M17–M19 still killed. 13 carried forward (unchanged code and tests) | Cosmetic and spec wording only |

What fix commit `e3f2b26` changed, verified by reading the diff:

| Gap | Change | Proof |
| --- | --- | --- |
| Gap 1, STT-18 | `srv:2969-2975` asserts the registered description `toBe(renderToolDoc(TOOL_DOCS.search_transcripts))` | M20 killed |
| Gap 2, STT-20 b/c/h | `doc:286-297` adds 3 phrase markers; the old markers stay | M21b, M21c, M21h each killed on its own |
| Gap 3, STT-02 | `srv:3032-3047` adds start `10:00+05:00` (= 05:00Z) and end `08:00Z`. The API must be called, and the call must not be an error | M16 killed |
| Cosmetic, STT-27 | `srv:3175-3182` pins the handler log meta to exactly `{tool, status, code}` in all 3 rejection rows | `server.test.ts` alone now kills M14, M19 and M22 |
| Cosmetic, README | The note's reason now says "notification records and transcript search" | n/a |

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 schema | ✅ Done | `2443ab2` |
| T2 client | ✅ Done | `6187099` |
| T3 fan-out | ✅ Done | `98ec09f` |
| T4 registration / ToolDoc / readme | ✅ Done | `7200d8b`. The `readme.md` deviation is justified (see Deviations) |
| T5 log privacy | ✅ Done | `4681fec`. Red-run table reproduced (sensor R0) |
| Verifier fix round 1 | ✅ Done | `e3f2b26` touches tests and README only. `git show --stat` lists no `src/` file |

---

## Gate Check (re-run by Verifier on `e3f2b26`)

| Gate | Exit | Result |
| --- | --- | --- |
| `npm run build:check` | 0 | `tsc --noEmit` clean |
| `npx eslint src` (read-only) | 0 | empty output |
| `npm run test:unit` | 0 | 27 suites / **947 passed**, 0 failed, 0 skipped |
| `npm run test:integration` | 0 | 1 suite / **466 passed**, 0 failed, 0 skipped |
| `npm run test:e2e` | 0 | 1 suite / **56 passed**, 0 failed, 0 skipped |

- **Match with the author:** these equal the author's numbers (947 / 466 / 56).
- **Unit delta since iteration 1, +5:**
  - 1 STT-18 test
  - 1 STT-02 test
  - 3 STT-20 marker cases
  - The log assertion went into rows that already existed, so it adds no test.
- **Not checked by me:** the before-feature baseline the author reports (822 / 452 / 56). Re-running it would need a second checkout, and I worked only in this worktree. Instead, I checked test integrity from the diff:
  - No `it` or `describe` was removed.
  - The only removed assertion lines are the per-tool budget `it`, now override-aware at `tool-docs.test.ts:76-78`, and prettier re-wraps in `cv-api.test.ts` that keep the same assertions.

### Design-level claims

| Claim | Measured | Result |
| --- | --- | --- |
| Rendered `search_transcripts` ToolDoc ≤ 1,900 chars | **1,854**: `renderToolDoc(TOOL_DOCS.search_transcripts).length`, run with `ts-node` | ✅ |
| `tools/list` < 75,000 bytes | **73,494**: I set the budget to 1 for one run so the failure printed the `total`, then restored it. `e3f2b26` changes no `src/` file, so the number still holds | ✅ |
| The override exists only for `search_transcripts` | `tool-docs.test.ts:239`: `toEqual(['search_transcripts'])` | ✅ |

---

## Spec-Anchored Acceptance Criteria (line numbers as of `e3f2b26`)

Test file key:

| Key | File |
| --- | --- |
| `fan` | `tests/unit/utils/search-transcripts-fan-out.test.ts` |
| `srv` | `tests/unit/server/server.test.ts` |
| `sch` | `tests/unit/schemas/search-transcripts.test.ts` |
| `int` | `tests/integration/mcp-protocol.test.ts` |
| `doc` | `tests/unit/docs/tool-docs.test.ts` |
| `chain` | `tests/unit/docs/agent-task-chain.test.ts` |
| `api` | `tests/unit/cv-api.test.ts` |
| `priv` | `tests/unit/privacy/search-transcripts-log-sentinel.test.ts` |
| `ax` | `tests/unit/utils/axios-instance.test.ts` |
| `mw` | `tests/unit/transports/http/middleware/log-request.middleware.test.ts` |

| AC | Spec-defined outcome | Evidence (`file:line`: assertion) | Result |
| --- | --- | --- | --- |
| STT-01 | Every listed bound is rejected; no API request | `sch:14-49`: `safeParse(input).success).toBe(false)` for all 18 reject cases (query missing / '' / blank / 501; lists of 51 / 51 / 501; '' inside each list; no-offset and `+0300` on both dates; limit 0 / 51 / 2.5; `workspace_id ''`). Accept cases: `sch:54-86`. On the wire: `int:968` `rejects.toThrow(/Invalid arguments for tool search_transcripts/)`, and `int:969` shows the double was not called. Registered shape: `srv:2977-2989` | ✅ PASS |
| STT-02 | `BAD_REQUEST` tool error; no API request | `srv:2997-3027`: `toHaveBeenCalledWith({statusCode:400, body:{error:{code:'BAD_REQUEST',…}}}, {isError:true, tool:'search_transcripts'})`, and neither API is called. Covers the same instant with two offsets and a reversed window, in both modes. Instants vs strings: `srv:3032-3047` (start `10:00+05:00`, end `08:00Z`) gives `searchTranscripts` `toHaveBeenCalledTimes(1)` and no `isError` | ✅ PASS |
| STT-03 | One POST with the caller's token and unchanged args; no basic-info call; no `response_fields` sent | `srv:3071-3078`: `toHaveBeenCalledTimes(1)`, `toHaveBeenCalledWith(args, auth)` where auth is `Bearer test-token`, `not.toHaveProperty('response_fields')`, `not.toHaveProperty('limit')`, basic-info not called. Client: `api:222-226` `toHaveBeenCalledWith({url:'/search/transcripts', method:'POST', data: body}, options)` | ✅ PASS |
| STT-04 | `{results, scope_capped}` returned unchanged and projected | `srv:3079`: `toHaveBeenCalledWith(response, {responseFields:['results.message_id']})`. `api:236`: `resolves.toBe(response)`. `int:950-954`: the ToolDoc example returns `{results:[], scope_capped:false}` | ✅ PASS |
| STT-05 | Tool error with the `handleAxiosError` code and `tool` | `srv:3129-3184`, single-mode row: `toHaveBeenCalledWith(error, {isError:true, tool:'search_transcripts'})`. `api:246`: the rejection propagates, `toBe(envelope)` | ✅ PASS |
| STT-06 | basic-info called once; one POST per workspace including `personal`; calls run in parallel; same args | `fan:106-107`: `listWorkspaces` 1 call, `search` 4 calls including `personal`. `fan:179`: all 4 calls start before any resolves. `fan:211-215`: 3 bodies, each `{...fullArgs, workspace_id, limit:10}`. `srv:3103-3106`: the real fan-out through the handler | ✅ PASS |
| STT-07 | `limit: 10` by default; the given value otherwise | `fan:211-215` `limit: 10`; `fan:223-225` `[25,25,25]`; `srv:3103-3106` `limit: 10` | ✅ PASS |
| STT-08 | basic-info error code returned; no search made | `fan:235-238`: `rejects.toBe(error)`, and `search` is not called. `srv` basic-info row: `toHaveBeenCalledWith(error, {isError:true, tool})` | ✅ PASS |
| STT-09 | Grouped shape: `result_count`, `best_score` = max, `results` and `scope_capped` unchanged | `fan:108-132`: full `toEqual`. Workspace A has 2 rows, `best_score` 0.7 (max of 0.5 and 0.7), `scope_capped: true`. Workspace B has 1 row | ✅ PASS |
| STT-10 | Groups in descending `best_score` order | `fan:110-127`: B (0.9) comes before A (0.7) although A is listed first. `int:1013-1017`: Beta comes before Alpha | ✅ PASS |
| STT-11 | `true` for 2 or more groups; `false` for 0 or 1 | `fan:243-255`: `toBe(expected)` for 0, 1 and 2 groups | ✅ PASS |
| STT-12 | A 0-row workspace appears only in `empty_workspaces` | `fan:128-130`, `fan:148-150` | ✅ PASS |
| STT-13 | Projection applied to the grouped response | `int:1012-1018`: the real formatter output, `toEqual({needs_workspace_choice:true, workspaces:[{workspace_name, results:[{matched_chunk}]}…]})` | ✅ PASS |
| STT-14 | A 403 workspace is in no list, and the call does not fail | `fan:131-133`: `skipped_workspaces: []` and `JSON.stringify(result)).not.toContain('personal')`. Also `fan:158` | ✅ PASS |
| STT-15 | Any other failure goes to `skipped_workspaces` as `{id, name, reason}`; the other workspaces are still returned | `fan:151-157`: 429 → `RATE_LIMITED`. `fan:260-277`: 429, 503, no response and a non-envelope throw → `RATE_LIMITED`, `SERVER_ERROR`, `NETWORK_ERROR`, `UNKNOWN_ERROR`, and A is still returned | ✅ PASS |
| STT-16 | Whole-call error: `RATE_LIMITED` if any 429, else the first non-403 failure in basic-info order | `fan:288-290`: [503, 429] gives `rejects.toBe(rateLimited)`. `fan:301-303`: [403, 503, 500] gives `rejects.toBe(first)`. `srv` whole-fan-out row returns the 429 envelope as `isError` | ✅ PASS |
| STT-17 | Every search 403 → success, `false`, and three empty lists | `fan:319-321`: `resolves.toEqual({false, [], [], []})` | ✅ PASS |
| STT-18 | Description rendered from `TOOL_DOCS.search_transcripts`; name from `tool-names.ts`; doc tests pass; the 1,900 and 75,000 exceptions | Description: `srv:2969-2975` `findCall('search_transcripts')[1].description).toBe(renderToolDoc(TOOL_DOCS.search_transcripts))`. Name: `int:276` `toEqual([...TOOL_NAMES])`, and `srv:513-525` checks set and order. Budgets: `doc:26` and `doc:76-78`; `int:488` and `int:493-500` | ✅ PASS (was ❌ in iteration 1) |
| STT-19 | `whenToUse` says "by meaning, without date or conversation"; `whenNotToUse` names 3 tools and warns about exact strings | `doc:213-215`; `doc:256` once per tool; `doc:260-262` | ✅ PASS |
| STT-20 | The prose states items (a) to (h) | `doc:299`: `rendered.toContain(marker)` for 13 markers. Three of them pin the advice itself: `doc:288` (b) "ask the user which workspace (name, count, best `matched_chunk`), then call again with its id"; `doc:292` (c) "Next page: seen ids in `exclude_message_ids`"; `doc:296` (h) "tell the user; retry `RATE_LIMITED` ones later by id" | ✅ PASS (was ⚠️ in iteration 1) |
| STT-21 | `workspace_id` comes from `get_workspaces_basic_info.id`; every named tool exists | `doc:304-310`: `toEqual([objectContaining({field:'workspace_id', fromTool:'get_workspaces_basic_info', fromField:'id'})])`. `chain:149`: the tool pair, and the chain suite is green | ✅ PASS |
| STT-22 | Removed (DD-1) | `doc:314`: `recommendedFields` is `toBeUndefined()`, which guards the removal | n/a |
| STT-23 | Exactly 4 codes; the `RATE_LIMITED` step says wait about a minute, then retry with a single `workspace_id` | `doc:320-325`: `toEqual(['BAD_REQUEST','FORBIDDEN','RATE_LIMITED','SERVER_ERROR'])`. `doc:332-333`: `'about a minute'` and `'single \`workspace_id\`'` | ✅ PASS |
| STT-24 | The ToolDoc `example` can be called | `int:937-955`: `isError` is falsy, the payload matches `toEqual`, and the double is called once | ✅ PASS |
| STT-25 | `readOnlyHint` true, `destructiveHint` false, `openWorldHint` false | `srv:2990-2994`: `toEqual({readOnlyHint:true, destructiveHint:false, openWorldHint:false})`. `int:925-935`: the same on the wire | ✅ PASS |
| STT-26 | No log line, at any level, holds the query or a matched chunk. Applies to 4 log points, both modes, and every path (200, 400 echo, 403, 429, 5xx, network, basic-info failure) | Sentinel: `priv:197` `logger.level).toBe('debug')`; `priv:260` `hitsIn(lines)).toEqual([])` in 9 scenarios; `priv:304` for the middleware object and batch. Unit: `ax:304-308` (`data` is `'[REDACTED]'`; no `requestData`, `responseData` or `message`). `mw:269` and `mw:282`: `arguments: '[REDACTED]'`. `mw:291`: other tools logged unchanged. `mw:301`: `req.body` not mutated. `srv:3175-3182`: handler meta is exact, with no `args` and no `error` | ✅ PASS. Single-mode 403 is not a sentinel row, but it runs the same code path as single 429 and 503, and the fan-out mixed scenario covers a 403 |
| STT-27 | Error log keeps the tool and the status or code; the fan-out summary line carries listed, succeeded, forbidden and skipped | Summary line: `fan:351-368` checks the full payload at `warn` (listed 4, succeeded 1, forbidden 1, skipped 2, metadata-only failures); `fan:396-411` checks `info` when only 403s failed; `fan:422-423` checks the line is absent when nothing failed. Error lines: `srv:3175-3182` checks `toHaveBeenCalledWith('Error searching transcripts', {tool:'search_transcripts', status, code})` on all 3 rejection paths; `priv:264` checks `namesToolAndStatus(...)).toBe(true)` per scenario; `ax:310-315` checks `toMatchObject({url, method, status:400, error:{statusCode:400, body:{code:'BAD_REQUEST'}}})` | ✅ PASS |

**Payload/conjunction rule**: ✅ All structured outputs are asserted on value, not only on whether a call happened:
- Grouped response: whole-object `toEqual` at `fan:108-132` and `srv:3107-3126`.
- `SEARCH_TRANSCRIPTS_FAN_OUT` line: full meta `toEqual` at `fan:351-368` and `fan:396-411`.
- Handler log meta: exact value at `srv:3175-3182`.
- Redacted axios meta: both the values and the absent fields, at `ax:304-315`.

### Edge cases

- [x] `exclude_message_ids` is sent in every fan-out body: `fan:211-215`.
- [x] The order of two groups with equal `best_score` is not specified, and no test asserts it. Correct.
- [x] Endpoint not deployed (404 → `NOT_FOUND`): handled by the generic error paths of STT-05, STT-15 and STT-16. No dedicated test, and none is needed.
- [x] `basic-info` returns `[]`: `fan:324-331`.

---

## Discrimination Sensor (expanded: privacy and rate-limit critical path)

Method:
- I copied each file to the scratchpad, applied the mutation in place, ran the targeted `npx jest`, then restored the file with `git checkout -- <file>`. I never used `git stash`.
- Iteration 2 re-ran every mutant on `src/server.ts` and `src/docs/tool-docs.ts`, because their test files changed. That is 13 runs.
- M1 to M12 target code whose tests `e3f2b26` did not change. Adding tests cannot make a killed mutant survive, so their iteration-1 results are carried forward.

| # | File:line | Mutation | It. 1 | It. 2 | Killed by (latest) |
| --- | --- | --- | --- | --- | --- |
| R0 | `axios-instance.ts`, `log-request.middlware.ts`, `server.ts` | T5 reverted (files restored from `7200d8b`) | ✅ 12 failed / 9 passed, the exact count in the `tasks.md` T5 red run | not re-run (no `src/` change) | Every sentinel scenario, basic-info STT-27, and the middleware object + batch |
| M1 | `search-transcripts-fan-out.ts:41` | 403 not recognised (`=== -1`) | ✅ | carried | `fan` Independent Test, STT-16, STT-17 |
| M2 | `…fan-out.ts:115` | `RATE_LIMITED` precedence removed | ✅ | carried | `fan` [503, 429] |
| M3 | `…fan-out.ts:15` | Default limit 10 → 30 | ✅ | carried | `fan` STT-07, `srv` fan-out |
| M3b | `…fan-out.ts:55` | Given `limit` ignored | ✅ | carried | `fan` "sends the given limit" |
| M4 | `…fan-out.ts:121` | `needs_workspace_choice` `>= 2` → `>= 1` | ✅ | carried | `fan` STT-11 and STT-15, `srv` |
| M5 | `…fan-out.ts:119` | Sort ascending | ✅ | carried | `fan` Independent Test, `int` STT-13 |
| M6 | `…fan-out.ts:81` | `best_score` = first row | ✅ | carried | `fan` Independent Test |
| M7 | `…fan-out.ts:111` | All-403 call throws | ✅ | carried | `fan` STT-17 |
| M8 | `…fan-out.ts:99` | Summary line always at `info` | ✅ | carried | `fan` STT-27 (2 tests) |
| M9 | `axios-instance.ts:66` | `CONTENT_REDACTED_ROUTES` matches nothing | ✅ | carried | `priv` 9 scenarios, `ax` |
| M10 | `axios-instance.ts:345` | Error-log `message` kept on the redacted route | ✅ | carried | `priv` single 400 echo, `ax` |
| M11 | `log-request.middlware.ts:37` | Batch arrays not mapped | ✅ | carried | `priv` batch, `mw` batch |
| M12 | `log-request.middlware.ts:29` | Redaction mutates `req.body` | ✅ | carried | `mw` "never mutates req.body" |
| M13 | `server.ts:2063` | Handler log back to `{ args, error }` | ✅ | ✅ | `priv` (10 fail) |
| M14 | `server.ts:2063-2066` | Handler log drops status and code | ✅ | ✅ | `priv` basic-info STT-27; `srv` 3 rejection rows |
| M15 | `server.ts:2032` | Date guard `>=` → `>` | ✅ | ✅ | `srv` equal dates (2 tests) |
| M16 | `server.ts:2032` | Date guard compares strings (`start_date >= end_date`) | ❌ survived | ✅ **killed** | `srv` "accepts a window whose start sorts after its end as text…" |
| M17 | `server.ts:2058` | `responseFields` not passed | ✅ | ✅ | `srv` (2 tests), `int` STT-13 |
| M18 | `server.ts:2051` | Single mode sends `response_fields` in the body | ✅ | ✅ | `srv` STT-03 |
| M19 | `server.ts:2063` | Handler error log deleted | ✅ | ✅ | `priv` basic-info STT-27; `srv` 3 rejection rows |
| M20 | `server.ts:2010` | Description is a fixed string, not `renderToolDoc(TOOL_DOCS.search_transcripts)` | ❌ survived | ✅ **killed** | `srv` "registers the description rendered from TOOL_DOCS.search_transcripts" |
| M21b | `tool-docs.ts:574` | STT-20 (b) inverted to "ask the user nothing; pick the first" | ❌ survived (inside M21) | ✅ **killed** | `doc` "b: then call again with the chosen workspace id" |
| M21h | `tool-docs.ts:575` | STT-20 (h) inverted to "never retry them" | ❌ survived (inside M21) | ✅ **killed** | `doc` "h: tell the user and retry RATE_LIMITED later by id" |
| M21c | `tool-docs.ts:576` | STT-20 (c) inverted to "`exclude_message_ids` is unused" | ❌ survived (inside M21) | ✅ **killed** | `doc` "c: page by sending the ids already seen" |
| M22 | `server.ts:2063-2066` | Handler log also carries `args` (new) | n/a | ✅ | `srv` exact meta; `priv` (9 fail) |
| M23 | `server.ts:2030` | Date guard disabled (new) | n/a | ✅ | `srv` equal and reversed dates, both modes (4 tests) |

**Sensor depth**: expanded. 26 distinct mutants (iteration 1's single M21 is split into M21b, M21h and M21c here), plus 1 revert reproduction (R0).
**Result (current state)**: 26 of 26 killed, 0 survived. **PASS** ✅

**T5 red-run claim**: credible.
- Reverting only the three T5 source files reproduces `Tests: 12 failed, 9 passed, 21 total`, with the same scenarios as the table in the T5 Notes.
- Each log point is also caught by its own mutant: point a by M13 and M22, points b and c by M9, the point-c message by M10, point d by M11.

---

## Spec-Precision Gaps (wording only; the tests now pin the behaviour)

1. **STT-02** says "`start_date >= end_date`" without saying the dates are compared as instants. `srv:3032-3047` now pins instant comparison, so only the spec wording is missing.
2. **STT-27** says "the error log SHALL carry the tool name". The sentinel helper `namesToolAndStatus` still accepts the route `/search/transcripts` in place of the tool name. `srv:3175-3182` now pins the handler line exactly, so the risk is closed; only the helper is looser than the spec.
3. **STT-20** lists eight obligations but gives no testable phrase for each one. The tests now pin the advice text for (b), (c) and (h).

## Deviations

- **`readme.md` changed in T4 outside the task's Where list (SPEC_DEVIATION): justified.**
  - The existing guard at `int:785-830` (`readme tool inventory`) requires every `TOOL_NAMES` entry in the README's Available Tools section, and every "N tools" count to match.
  - T4 could not reach green without editing the README, and the author recorded this in the T4 Notes.
  - `e3f2b26` fixed the note's reason so it now covers transcript search ✅.
- **`tests/unit/cv-api.test.ts`**: prettier re-wrapped existing `getContacts` lines in T2. The assertions are the same; it is diff noise only. The author decided to keep it.
- **`srv:2967`**: the comment `// STT-01 (registered shape), STT-25.` now sits above the new STT-18 test instead of the test it describes. Cosmetic.
- **Outside this feature, noted only**: `src/utils/format-to-mcp-tool-response.ts:96` logs `{ data }` if `JSON.stringify` throws. With JSON parsed by axios this cannot happen (no cycles, no BigInt), and the code predates this feature.

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code, no scope creep | ✅ The fan-out is 126 lines. Logging changes are scoped to one route and one tool. D-3 is left for its own ticket, as the spec says |
| Surgical changes | ⚠️ `cv-api.test.ts` reformat noise (cosmetic) |
| Matches existing patterns | ✅ Reuses the `NOT_LOG_ROUTES` idiom, `responseFieldsShape`, `formatToMCPToolResponse`, and an envelope in the `INVALID_AUDIO_URL` style |
| Spec-anchored outcome check | ✅ |
| Per-layer coverage (domain logic 1:1 with ACs; handler covers happy, edge and error paths) | ✅ |
| Every new test maps to an AC, an edge case or a Done-when item | ✅ |
| Project guidelines | ✅ Followed: the `jest.config.js` thresholds, the `src/docs/types.ts` header, and the guard tests named in `tasks.md` |

## Ranked Gaps (iteration 2)

None of these blocks the feature. All are optional:

1. **[Cosmetic] STT-27, `priv:188-194`**: `namesToolAndStatus` accepts the route in place of the tool name. The exact handler-line assertion at `srv:3175-3182` already closes the risk.
2. **[Cosmetic] `srv:2967`**: the `STT-01 / STT-25` comment is misplaced.
3. **[Spec wording]** STT-02 ("compared as instants"), STT-20 (one phrase per item), STT-27 ("tool name or route"). These are edits to `spec.md`, at the author's discretion.

## Requirement Traceability Update (proposed; the Verifier did not edit `spec.md`)

| Requirement | New status |
| --- | --- |
| STT-01 to STT-21, STT-23 to STT-27 | ✅ Verified |
| STT-22 | Removed (DD-1) |

## Summary

**Overall**: ✅ Ready (iteration 2 of 3).
**Spec-anchored check**: 26 of 26 live ACs match the spec outcome. 3 spec-wording notes remain.
**Sensor**: 26 of 26 distinct mutants killed. The T5 red run reproduces exactly.
**Gate**: build 0, eslint 0, unit 947/947, integration 466/466, e2e 56/56.
