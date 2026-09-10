# STATE — agent-efficiency-improvements

> Last updated: 2026-09-10
> Branch: `claude/clever-lovelace-yjjk6w`

## Phase 0 decisions — RESOLVED (2026-09-10)

| # | Question | Decision |
| --- | --- | --- |
| 0.1 | Where do descriptions live? | **MCP-side only.** No cv-api dependency. Corrections to wrong upstream text are overridden locally. |
| 0.2 | Projection param name | **`response_fields`** (not `fields` — taken on `get_message`, where it means the opposite). |
| 0.3 | Fix `summarize_conversation`'s dropped `limit`? | **Yes, entirely MCP-side.** Clamp to the upstream page cap of 50 rather than paginating. |
| 0.4 | Add `isError`? | **Yes.** |
| 0.5 | Extend projection to write responses? | **Yes**, where the response is substantial. |
| 0.6 | Confirm the real mutual-exclusivity rules | **Done** — read out of the cv-api handlers. Findings below. |

### 0.1 rationale and accepted cost

`orval.config.ts` pulls from a **live** URL, so an upstream description edit can
change our tool text between two builds with no diff in this repo. Authoring
MCP-side makes tool text deterministic and reviewable here.

**Accepted cost:** two genuinely-incorrect upstream strings are overridden
locally rather than fixed at source, so they remain wrong in Swagger and for
every other API consumer. **Both should be reported to the cv-api owners as a
doc bug, tracked separately:**

- `create_voicememo_message.workspace_id` — "not allowed when folder_id
  specified is different from the folder_id": a copy-paste of the `folder_id`
  text, describing a rule the handler does not implement.
- `get_folder.direction` — missing the `include_first_level_tree` gate that its
  sibling `date` documents.

### 0.6 findings (read from cv-api, not inferred)

**`move_message_to_folder`** — `FolderService.addMessageToFolderOrWorkspace`
and `validateMessageToBeAddedToFolder`:

- Exactly one of `folder_id`/`workspace_id`. Both → *"Only one of folder_id or
  workspace_id is allowed"*; neither → *"Either folder_id or workspace_id is
  required"*. Enforced twice (DTO `@ValidateIf` **and** service).
- The caller must be the message's creator (403 otherwise).
- **The message type must match the destination folder's type** — a
  `voicememo` cannot go into a `prerecorded` folder. Undocumented anywhere
  before this work.

**`create_voicememo_message`** — `SimplifiedMessageService.createVoiceMemoMessage`:

- Requires one of `transcript`, `links`, `audio_file`.
- `transcript` is 2–5000 chars; `links` max 100, each a valid URL. None
  surfaced before.
- **No mutual-exclusivity rule on `folder_id`/`workspace_id` exists.** The
  upstream description claiming one is wrong, so it was replaced rather than
  reworded.

**Bonus:** cv-api declares `audio_file` correctly as
`{type: 'string', format: 'binary'}`. It is **Orval's zod generator** that
turns that into `zod.instanceof(File)` — the thing that made audio upload
unreachable over JSON-RPC. The spec was never wrong; the codegen was.

## What Is Done

| Phase | Status | Commit |
| --- | --- | --- |
| 0 — decisions | ✅ | `9c71de0` |
| 1 — descriptions (all 41 tools) | ✅ | `a01c595`, `cdbefc6` |
| 2 — `response_fields` projection | ✅ | `dad6329` |
| 3 — constraint descriptions | ✅ (refinements still gated) | `219d005` |
| 4 — `isError` + error hints | ✅ | `a76caca` |
| 5 — acceptance validation | ✅ | this commit |

Capability additions from the sibling spec, delivered alongside:

| Capability | Commit |
| --- | --- |
| Message share links (2 tools) | `81e5a2c` |
| Action items (8 tools) | `f2784c5` |
| Search / unread / inbox notifications (3 tools) | `3a52f6f` |
| Voice memo `audio_url` (replaces unusable `audio_file`) | `1dda9e7` |

**28 tools → 41 tools.** Tests: **214 → 598** unit, 56 e2e.

## Measured results

Run `npm run measure:payloads` to reproduce (fixtures, no token needed).

**Response size, with the descriptions' recommended projection:**

| Tool | Full | Narrowed |
| --- | --- | --- |
| `get_current_user` | 8,447 B | 2,050 B (**75.7% smaller**) |
| `list_messages` (20 results) | 21,947 B | 4,629 B (**78.9% smaller**) |

Omitting `response_fields` returns the payload **by reference** — verified, and
the reason only 4 of ~40 pre-existing assertions needed changing.

**`tools/list` description payload — the cost side, which moved the other way:**

| | Tools | Total | Mean | Max |
| --- | --- | --- | --- | --- |
| Before (`b05841d`) | 28 | 4,472 chars | 160 | — |
| After | 41 | 30,233 chars | 737 | 1,166 |

That is ~26 KB more context **per session, before any tool is called**. It is
the deliberate trade the brief asks for, and the per-tool 1,200-char cap is
asserted in CI so it cannot drift further unnoticed. Reporting only the
response shrinkage would have hidden it.

## Acceptance criteria

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Canonical multi-step task completable with no wasted call | ✅ `tests/unit/docs/agent-task-chain.test.ts` walks `get_workspaces_basic_info → list_messages → list_ai_actions → summarize_conversation`, asserting each hop's value names its producer and no step discourages its own use. It caught a real gap: `list_messages` never said where a `workspace_id` comes from. |
| 2 | Byte-delta on `get_current_user` and `list_messages` | ✅ above, via `npm run measure:payloads` |
| 3 | `tools/list` size measured before/after, within budget | ✅ above; cap asserted in CI |
| 4 | Every description answers the five questions | ✅ table-driven over `TOOL_DOCS`; a tool registered without an entry fails CI |
| 5 | No integration breaks — new params optional, omission preserves behaviour | ✅ projection returns by reference; 4 assertion updates, all schema-key or formatter-arg |
| 6 | Existing suite passes | ✅ 598 unit + 56 e2e |

## What Remains

- **Task 3.7 — zod `.refine()` predicates: still gated, and recommended
  against.** Refinements do not serialize into JSON Schema, so an MCP client
  never sees them: the agent-visible benefit already comes from the
  descriptions, while a refinement would change what the server accepts. The
  rules are now verified (0.6) if someone wants them anyway.
- **Report the two upstream doc bugs to cv-api** (see 0.1). Not done here,
  since decision 0.1 scoped this work out of that repo.
- **`summarize_conversation` >50 messages.** Clamped, not paginated (0.3).
  Revisit only if agents actually need more.
- **Three commented-out registrations** in `server.ts` (`catch_up_conversation`
  at ~line 647, `get_workspace_folders_and_message_counts` at ~line 679). The
  `catch_up_conversation` TODO is now **stale**: it waits on an unread filter
  that `search_messages_by_heard_status` provides. Cleanup or revival is
  unrelated to this work.
