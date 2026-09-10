# STATE — agent-efficiency-improvements

> Last updated: 2026-09-10

## Phase 0 decisions — RESOLVED (2026-09-10)

All five gating questions answered by @travis. Phases 1, 2 and 4 are unblocked.

| # | Question | Decision |
| --- | --- | --- |
| 0.1 | Where do descriptions live? | **MCP-side only.** Rejected the hybrid — no cv-api dependency. All tool and param descriptions are authored in `cv-mcp-server`, including local overrides of upstream text that is wrong. |
| 0.2 | Projection param name | **`response_fields`** confirmed. |
| 0.3 | Fix `summarize_conversation`'s dropped `limit`? | **Yes — fix it, entirely MCP-side.** No API change. |
| 0.4 | Add `isError` to error responses? | **Yes.** |
| 0.5 | Extend projection to write-tool responses? | **Yes**, per the D3 recommendation. |

### 0.1 rationale and accepted cost

The decisive argument is stronger than the one originally in `design.md`: `orval.config.ts`
pulls from a **live** URL (`${CARBON_VOICE_BASE_URL}/docs/simplified-json`), so an upstream
description edit can silently change our tool descriptions between two builds with no diff
in this repo. Authoring MCP-side makes tool text deterministic and reviewable here.

**Accepted cost:** the two genuinely-incorrect upstream strings are now *overridden*
locally rather than fixed at source, so they stay wrong in Swagger and for every other
API consumer:

- `create_voicememo_message.workspace_id` — "not allowed when folder_id specified is
  different from the folder_id" (a copy-paste bug; `...zod.ts:1385`)
- `get_folder.direction` — missing the `include_first_level_tree` gate that `date`
  documents (`...zod.ts:1931`)

These should still be reported to the cv-api owners as a doc bug, tracked separately from
this work. **Supersedes `design.md` D1 option B**; tasks 3.1-3.3 are re-scoped from
"fix in cv-api + regenerate" to "override in `server.ts`".

### 0.3 scope note — one sub-decision taken

The bug is entirely local: `limit` is declared in our own hand-written schema
(`src/schemas/conversation.ts:10`, not generated) and forwarded into a `listMessages`
query that only accepts `page`/`size`. So the fix needs no API change, as directed.

Upstream caps page `size` at 50 (`...zod.ts:1252`), but our `limit` declares no maximum —
an agent can ask for 200. Two ways to honor that:

- **(a) clamp to 50 and document it** — chosen. Minimal, no change to request volume.
- (b) paginate transparently until `limit` is reached — rejected for now: it silently
  multiplies upstream calls and latency behind a single tool call, which cuts against the
  efficiency goals this work exists to serve. Reconsider if agents actually need >50.

Also forwarding only the params `listMessages` accepts, instead of the whole `args` object
(which currently leaks `prompt_id` upstream as a stray query param).

## What Is Done

Nothing implemented yet. Validation and planning only:

- `spec.md` — claim-by-claim validation of the external brief ✅
- `design.md` — architecture decisions D1-D6 ✅
- `tasks.md` — phased task breakdown ✅
- Phase 0 decisions resolved ✅

## What Remains

Phase 1 (descriptions), Phase 2 (projection), Phase 3 (constraint descriptions, re-scoped
per 0.1), Phase 4 (error affordances), Phase 5 (measurement). See `tasks.md`.

Baseline to preserve: `npm run test:unit` → 214 tests passing at `b05841d`.
