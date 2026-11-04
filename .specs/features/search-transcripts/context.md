# Search Transcripts Tool Context

**Gathered:** 2026-11-03
**Spec:** `.specs/features/search-transcripts/spec.md`
**Status:** Spec gate passed (2026-11-03); ready for Design

---

## Feature Boundary

One MCP tool, `search_transcripts`, over cv-api `POST /search/transcripts` (PR #571). With `workspace_id` it is a thin call; without it, the tool searches every workspace of the caller and returns the hits grouped by workspace so the agent asks the user which one. No cv-api change.

---

## Implementation Decisions

### Ticket

- CV-14191, the same ticket as the endpoint: the cv-api spec names the MCP tools as its later step. Branch `feat/CV-14191-search-transcripts-tool`, worktree from `origin/develop`, PR base `develop`.

### Missing `workspace_id` → fan-out in the MCP

- The tool lists the caller's workspaces and calls the endpoint once per workspace, all in parallel, with the same arguments. Already the direction in cv-api `context.md` ("One workspace per call"), which moved the fan-out out of the endpoint.
- Response is GROUPED by workspace (`workspace_id`, `workspace_name`, `result_count`, `best_score`, `scope_capped`, `results`), plus `needs_workspace_choice`. With hits in 2+ workspaces the agent asks the user ("I found these messages in these workspaces — which one?"); with hits in exactly one, it carries on.
- Supersedes the "merge by score" wording in cv-api `context.md`.

### Partial failure

- 403 from one workspace: dropped silently (the workspace list includes `personal` and stale memberships that the search rejects).
- 429 / 5xx / network on one workspace: partial result, the workspace listed in `skipped_workspaces` with the error code.
- The call fails only when no workspace succeeded and at least one failed with a non-403 error.

### Rate-limit cost

- No cap on how many workspaces one call searches. The ToolDoc states the cost (one request per workspace, 20 per minute) and tells the agent to send `workspace_id` once known.

### Agent's Discretion

- None left open: every default in the spec's Assumptions table (tool name, `basic-info` as the workspace source, `limit: 10` per workspace in fan-out, `needs_workspace_choice` at 2+ workspaces, `empty_workspaces`, `conversation_ids` without `workspace_id`, pre-check of `start_date >= end_date`, annotations, release gate) was signed off by Frederico on 2026-11-03.

### Declined / Undiscussed Gray Areas → Assumptions

- Exposed parameters: all of the endpoint's (STT-01, STT-03). Date handling: no conversion, cv-api's offset rule (STT-01). `recommendedFields`: none (STT-22 removed, design DD-1, 2026-11-03). Annotations and release: Assumptions table.

---

## Specific References

- Pattern: `searchMessageIds` in `src/cv-api.ts`, the `search_message_ids` registration in `src/server.ts`, zod in `src/schemas/search.ts`.
- Privacy: cv-api STX-20 sentinel test pattern.

---

## Deferred Ideas

- Remove tool arguments from the shared HTTP/axios logs for every tool (spec D-3), as its own ticket.
- MCP elicitation to ask the user directly, if clients support it later.
- A workspace cap for the fan-out, if real users with many workspaces hit 429 often.
