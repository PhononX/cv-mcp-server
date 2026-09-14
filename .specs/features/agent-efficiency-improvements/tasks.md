# Tasks — Agent-Efficiency Improvements

> Companion to [`spec.md`](./spec.md) and [`design.md`](./design.md).
> Ordering follows the brief's own guidance: additive/low-risk first, schema changes last
> behind human review.
>
> **Nothing here is approved to implement yet.** Phase 0 gates everything.

Effort: **S** ≈ <½ day · **M** ≈ ½–1½ days · **L** ≈ 2–4 days

---

## Phase 0 — Decisions needed before any code (blocking)

| # | Task | Owner | Effort |
| --- | --- | --- | --- |
| 0.1 | Approve the hybrid description strategy (design D1): agent guidance in `server.ts`, factual constraint fixes in `cv-api` | Human | — |
| 0.2 | Approve param name `response_fields` (cannot be `fields` — collides on `get_message`, spec F3) | Human | — |
| 0.3 | Decide F1: `summarize_conversation`'s `limit` is silently dropped, capping summaries at 20 messages. Fix here (touches handler logic, brief says out of scope) or split to its own ticket? | Human | — |
| 0.4 | Decide F2: add `isError` to the error envelope? Prerequisite for ask #7 having any effect | Human | — |
| 0.5 | Decide D3 open question: extend projection to `create_*` response payloads too? | Human | — |
| 0.6 | Confirm actual upstream mutual-exclusivity rules for `move_message_to_folder` and `create_voicememo_message` against `cv-api` controllers (design D5 verification gap) | Eng | S |

**0.6 is a hard blocker on Phase 3 only** — Phases 1 and 2 can proceed without it.

---

## Phase 1 — Descriptions (ship first; no schema or behavior change)

Delivers brief asks #3, #4, #6, and — via response-shape docs — #2.

| # | Task | Effort |
| --- | --- | --- |
| 1.1 | Scaffold `src/docs/` — `types.ts`, `render-tool-doc.ts`, empty `tool-docs.ts` (design D2). Section order: purpose → when to use → when NOT to use → prerequisites → example → response shape → errors | S |
| 1.2 | **Delete `'Do not use unless the user explicitly requests it.'` from `list_ai_actions`** (`server.ts:875`) and replace with when-to-use guidance naming it as the source of `prompt_id`. *Highest-value single change in the whole brief* (spec Claim 6) | S |
| 1.3 | Author `ToolDoc` entries for the 4 AI-action tools: `list_ai_actions`, `run_ai_action`, `summarize_conversation`, `get_ai_action_responses`. Declare `prompt_id ← list_ai_actions.id` as a prerequisite on all three consumers | M |
| 1.4 | Author entries for the 6 message tools. Document `list_messages`' **existing** `total` / `results_count` / `has_next_page` / `page` / `size` response fields (spec Claim 2) | M |
| 1.5 | Author entries for the 5 user tools, wiring both disambiguation pairs: `get_current_user` ↔ `get_user`, and `search_user` ↔ `search_users` (the pair the brief missed) | M |
| 1.6 | Author entries for the 4 conversation tools | S |
| 1.7 | Author entries for the 7 folder tools, incl. `get_folder` ↔ `get_folder_with_messages` | M |
| 1.8 | Author entries for `get_workspaces_basic_info`, `add_attachments_to_message` | S |
| 1.9 | Document `run_ai_action_for_shared_link`'s dead end honestly: share-link IDs come from the Carbon Voice app/API, **not** from any MCP tool — so an agent stops instead of hunting for a producer (spec Claim 6) | S |
| 1.10 | Rewrite `get_current_user` (`server.ts:399`, currently `'Get the current user information. '`) to state what it returns, that it is large, and how to narrow it | S |
| 1.11 | Swap all 28 `description:` values to `renderToolDoc(TOOL_DOCS[name])` | S |
| 1.12 | Table-driven test over `TOOL_DOCS`: every registered tool has an entry; every entry has purpose/whenToUse/example/responseShape; every disambiguation pair names its counterpart; every declared prerequisite names a real tool. **A new tool registered without a doc entry must fail CI** | M |
| 1.13 | Assert the `tools/list` token budget in a test — per-tool rendered length ≤ agreed cap, total payload ≤ agreed cap (spec Part 3) | S |
| 1.14 | Update `readme.md` "Available Tools" (lines 239-285) to match | S |

**Exit:** `npm run test:unit` green (baseline 214 + new); `tools/list` within budget;
canonical task (spec criterion 1) completes without the `list_ai_actions` dead end.

**Ship this phase on its own.** It has no behavioral risk and delivers most of the value.

---

## Phase 2 — Projection (`response_fields`)

Delivers brief ask #1.

| # | Task | Effort |
| --- | --- | --- |
| 2.1 | `src/utils/project-response.ts` — dot-path allowlist projection. Rules per design D3: omitted ⇒ identity by reference; arrays traverse element-wise; pagination keys (`total`, `results_count`, `has_next_page`, `page`, `size`) always preserved; unknown paths ignored silently | M |
| 2.2 | Unit-test `project()` directly: identity on omission, nested paths, array traversal, pagination preservation, unknown paths, `null`/`undefined` payloads, deep nesting | M |
| 2.3 | Add optional `response_fields` to the 12 read tools' input schemas (design D3 list), via the local-wrapper pattern | M |
| 2.4 | Wire handlers: destructure `response_fields` out of args **before** forwarding upstream, project the result before `formatToMCPToolResponse`. The strip is mandatory — a leak breaks existing `toHaveBeenCalledWith(testParams, …)` assertions and sends an unknown query param upstream | M |
| 2.5 | Add `recommendedFields` to the `ToolDoc` entries and surface them in the rendered description, so agents project on the *first* call. E.g. `get_current_user` → `user.id`, `user.first_name`, `user.email_txt`, `user.workspace_guids` | S |
| 2.6 | Verify backward compatibility: full existing suite green **unmodified** — that's the proof omission is byte-identical | S |
| 2.7 | `scripts/measure-payloads.ts` over recorded fixtures (no live token, no user content in logs). Report the three numbers in design D6 | M |

**Exit:** byte-delta report for `get_current_user` and `list_messages` (spec criterion 2);
existing tests pass with **zero** modifications.

---

## Phase 3 — Schema constraints (human review before merge)

Delivers brief ask #5. **Blocked on 0.6.** Per design D5, descriptions carry the
agent-visible benefit; refinements are behavioral and separately approved.

| # | Task | Effort |
| --- | --- | --- |
| 3.1 | `cv-api`: add the `include_first_level_tree` gate to `get_folder`'s `direction` description (only `date` has it today) | S |
| 3.2 | `cv-api`: fix the incoherent `create_voicememo_message.workspace_id` text — currently *"not allowed when folder_id specified is different from the folder_id"*, a copy-paste bug | S |
| 3.3 | After 3.1/3.2 deploy: re-run `npm run generate:api`, verify the corrected text lands, commit the regenerated diff | S |
| 3.4 | Add param-level describes for `move_message_to_folder`'s `folder_id`/`workspace_id` exclusivity, per the rule confirmed in 0.6 | S |
| 3.5 | Move `create_conversation_message`'s transcript-or-attachment rule from the tool description into the `transcript`/`links` param describes | S |
| 3.6 | **Approval gate** — present the refinement candidates (3.7) with their behavior-change implications; do not merge without a decision | — |
| 3.7 | *If approved:* `.refine()` for `create_conversation_message` (transcript XOR links) and `move_message_to_folder` (exactly one target). Note these are invisible to MCP clients — JSON Schema drops zod refinements — so the win is server-side rejection only | M |

---

## Phase 4 — Error affordances

Delivers brief ask #7. **Gated on 0.4.**

| # | Task | Effort |
| --- | --- | --- |
| 4.1 | Add `isError?: boolean` to `McpToolResponse`; set `isError: true` on the failure path of `formatToMCPToolResponse` | S |
| 4.2 | Update the tests asserting the current exact response shape. **Do not touch the `MCP_RESPONSE_STRINGIFY_*` log lines** — the file's own comments flag them as a dashboard contract | M |
| 4.3 | Add `commonErrors` to `ToolDoc` entries; render a compact error line per tool | M |
| 4.4 | Attach tool-aware `next_action` hints from the handler, driven by `TOOL_DOCS[tool].commonErrors`. Cannot live in `handleAxiosError` — it has no tool context (design D4) | M |
| 4.5 | Tests: a `BAD_REQUEST` from a `prompt_id`-taking tool surfaces a hint naming `list_ai_actions` | S |

---

## Phase 5 — Acceptance validation

| # | Task | Effort |
| --- | --- | --- |
| 5.1 | Script the canonical task as a repeatable eval: `get_workspaces_basic_info` → `list_messages(workspace_id, start_date, end_date)` → `list_ai_actions` → `summarize_conversation`. Assert zero failed/wasted calls (spec criterion 1) | M |
| 5.2 | Publish the before/after report: response bytes, `tools/list` bytes, round-trip count (design D6) | S |
| 5.3 | Confirm all 6 acceptance criteria in `spec.md` Part 4 | S |

---

## Deferred / separate tickets

| Item | Why separate |
| --- | --- |
| **F1** — `summarize_conversation` silently caps at 20 messages while its schema promises `limit: 50` (`schemas/conversation.ts:10` vs `server.ts:540-543`) | Real correctness bug, but a handler fix; brief puts handler logic out of scope. Gated on 0.3. |
| `summarize_conversation` forwards `prompt_id` as a stray `listMessages` query param | Same handler, fold into the F1 ticket |
| No tool produces a share link ID for `run_ai_action_for_shared_link` | Closing the chain needs a **new capability** — explicitly out of scope. 1.9 only documents the gap. |
| 3 commented-out tools in `server.ts` (`catch_up_conversation` :568, `get_workspace_folders_and_message_counts` :600) | Dead code; unrelated cleanup |

---

## Risk register

| Risk | Mitigation |
| --- | --- |
| **Description bloat costs more tokens than projection saves** — `tools/list` is paid every session, on every request | Tasks 1.13 + 5.2 measure both directions; budget asserted in CI |
| Regenerating the API client wipes hand-edited generated descriptions | Design D1: never edit `src/generated/`; overrides in `server.ts`, facts in `cv-api` |
| `response_fields` leaking upstream breaks existing tests and sends unknown query params | Task 2.4 destructures before forwarding; 2.6 proves it with an unmodified suite |
| Projection strips pagination metadata, undoing ask #2 | Design D3 rule 4: pagination keys always preserved; covered by test 2.2 |
| Refinements reject calls the API would accept | Task 0.6 confirms real rules first; 3.6 is a hard approval gate |
| Phase 4 changes the response envelope for existing consumers | `isError` is additive; body unchanged; gated on 0.4 |
