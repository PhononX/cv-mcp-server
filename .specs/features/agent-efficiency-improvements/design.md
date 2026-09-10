# Design — Agent-Efficiency Improvements

> Companion to [`spec.md`](./spec.md). Read that first for the validation of the brief.

---

## D1 (blocking) — Where do descriptions live?

**This is the decision that shapes every other phase, and the brief doesn't mention it.**

All tool input schemas are **Orval-generated from the live OpenAPI spec**.
`orval.config.ts` pulls `${CARBON_VOICE_BASE_URL}/docs/simplified-json` and writes
`src/generated/` — 185 files including
`src/generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod.ts`.

So **any `.describe()` edited directly in `src/generated/` is destroyed by the next
`npm run generate:api`.** Every constraint and param description the brief wants to
improve currently lives there.

Two durable options:

| | **A — Override in `src/server.ts`** | **B — Fix `@ApiProperty` in `cv-api`** |
| --- | --- | --- |
| How | Local zod wrapper re-`.describe()`s params — the existing `list_conversations` pattern (`server.ts:419-431`) | Edit the DTO decorators; spec regenerates; re-run Orval |
| Survives regeneration | Yes | Yes (it *is* the source) |
| Speed | Immediate, one repo | Needs a `cv-api` merge + deploy before Orval picks it up |
| Benefits | MCP consumers only | Swagger, every SDK consumer, MCP |
| Cost | Text duplicated outside the source of truth; can drift | Cross-repo coordination |

**Decision: hybrid, split by *kind* of text.**

- **Agent-facing guidance → `src/server.ts` (option A).** When-to-use, when-not-to-use,
  counterpart pointers, prerequisites, example calls, response-shape sketches, error
  next-actions. This is MCP-specific advice about *tool selection* and has no business in
  a REST API spec — a Swagger reader doesn't need "call `search_users` first".
- **Factual constraint corrections → `cv-api` (option B).** The incoherent
  `create_voicememo_message.workspace_id` text and `get_folder.direction`'s missing
  `include_first_level_tree` gate are *wrong or incomplete facts about the API*. They
  should be fixed at the source so every consumer benefits. Small, safe, doc-only diffs.

Because option A is the primary path, it needs structure — 28 hand-rolled zod wrapper
objects inline in `server.ts` would be unmaintainable. See D2.

---

## D2 — A tool-documentation registry, not 28 inline strings

`src/server.ts` is already 1,005 lines. Appending six prose sections to each of 28
descriptions inline would roughly double it and guarantee inconsistency.

**Design:** a declarative registry, one entry per tool, rendered to a description string
by a single formatter.

```
src/docs/
  tool-docs.ts          # TOOL_DOCS: Record<ToolName, ToolDoc>
  render-tool-doc.ts    # ToolDoc -> string, one canonical section order
  types.ts              # ToolDoc interface
```

```ts
interface ToolDoc {
  purpose: string;              // one line
  whenToUse: string;
  whenNotToUse?: string;        // names the counterpart tool
  prerequisites?: Array<{ field: string; fromTool: string; fromField: string }>;
  example: Record<string, unknown>;   // a real, valid argument object
  responseShape: string;        // compact sketch, not a full schema
  recommendedFields?: string[]; // suggested `response_fields` for the common case
  commonErrors?: Array<{ code: string; meaning: string; nextAction: string }>;
}
```

Three properties this buys us:

1. **Uniform section order across all 28 tools**, so an agent learns the layout once.
   Selection guidance goes **first** (purpose → when to use → when not to use), because
   some clients truncate long descriptions and tool *choice* must survive truncation;
   examples and response shapes go last.
2. **Testability.** The table-driven test in acceptance criterion 4 iterates `TOOL_DOCS`
   and asserts completeness. A new tool registered without a doc entry fails CI.
3. **Measurability.** The rendered length per tool is computable, so the `tools/list`
   token budget (spec Part 3) can be asserted in a test rather than hoped for.

`registerTool` then takes `description: renderToolDoc(TOOL_DOCS.list_messages)`.

---

## D3 — Projection (`response_fields`)

**Param name:** `response_fields`. Not `fields` — that already exists on `get_message`
with the *opposite* meaning (spec F3).

**Placement:** merged into each read tool's input schema in `server.ts` via the same
local-wrapper pattern as D1/option A. Never sent upstream.

**Semantics:** an optional `string[]` of dot-paths forming an allowlist.
`["user.id", "user.first_name", "user.workspace_guids"]`.

```
handler:
  const { response_fields, ...upstreamParams } = args;   // MUST strip before forwarding
  const raw = await simplifiedApi.someCall(upstreamParams, auth);
  return formatToMCPToolResponse(project(raw, response_fields));
```

Four rules that matter:

1. **Omitted ⇒ identity.** `project(raw, undefined)` returns `raw` by reference. This is
   what makes the change non-breaking *and* keeps the existing test assertions
   (`expect(mockFormatToMCPToolResponse).toHaveBeenCalledWith(apiResponse)`) passing
   untouched.
2. **Strip before forwarding.** If `response_fields` leaks into `upstreamParams` the API
   receives an unknown query param, and the existing
   `expect(simplifiedApi.listMessages).toHaveBeenCalledWith(testParams, …)` assertions
   break. The destructure above is not optional.
3. **Arrays traverse element-wise.** `results.id` projects `id` out of every element of
   `results`, rather than requiring an index.
4. **Pagination keys are always preserved**, even when not requested — `total`,
   `results_count`, `has_next_page`, `page`, `size`. Otherwise projection would strip
   exactly the "when to stop" signal the brief is trying to strengthen (spec Claim 2).
   This is a deliberate exception to the allowlist.

**Unknown paths:** ignore silently rather than erroring, so a mildly-wrong projection
degrades to a smaller payload instead of a failed call and a retry. The alternative —
rejecting unknown paths — costs a round trip, which is the thing we are optimising against.

**Rejected alternative:** hard-coding a slim `get_current_user` response. It gets the same
token win with no new param, but it is a breaking change for existing consumers, which the
brief explicitly forbids. Projection plus a documented `recommendedFields` gets there
opt-in, and the `recommendedFields` hint in the description is what makes agents use it on
the *first* call rather than discovering it later.

**Applies to** (12 read tools): `get_current_user`, `get_user`, `list_messages`,
`get_message`, `get_recent_messages`, `list_conversations`, `get_conversation`,
`get_conversation_users`, `get_root_folders`, `get_folder`, `get_folder_with_messages`,
`get_ai_action_responses`.

**Open question for review:** the brief says "read tools", but `create_*` handlers also
return full objects. Extending projection to write-tool responses is mechanically
identical and equally non-breaking. Recommend yes; needs a scope call.

---

## D4 — Error affordances

Two changes, both small, in dependency order:

1. **Add `isError`** to `McpToolResponse`
   (`src/interfaces/mcp-tool-response.interface.ts`) and set `isError: true` on the
   failure path of `formatToMCPToolResponse`. Without this, ask #7 is cosmetic — the agent
   has to parse the body to notice it failed at all (spec F2).
2. **Tool-aware `next_action` hints.** `handleAxiosError`
   (`src/utils/axios-instance.ts`) is generic and has no idea which tool it was serving,
   so the hint cannot live there. Instead attach it from the handler, driven by
   `TOOL_DOCS[tool].commonErrors` — e.g. a `BAD_REQUEST` on a tool that takes `prompt_id`
   yields *"invalid prompt_id — call `list_ai_actions` to get valid values"*.

**Two cautions:**

- `formatToMCPToolResponse` carries explicit "keep legacy error log contract used by
  current tests and dashboards" comments. The **log lines** (`MCP_RESPONSE_STRINGIFY_*`)
  must not change — Grafana depends on them. Only the returned envelope changes.
- Existing tests assert the exact current response shape and will need deliberate
  updating. That is expected work, not collateral damage.

---

## D5 — Schema constraints: describe now, refine only with approval

The brief's own sequencing note ("schema constraint changes carry breaking-change risk
and warrant a human review pass") is correct, and there's a second reason to be
conservative: **zod `.refine()` predicates do not serialize into JSON Schema.** An MCP
client never sees them. So a refinement buys the agent *nothing* it wouldn't get from a
clear description, while changing what the server accepts — a call that today reaches
upstream and returns a real API error would instead be rejected locally.

That inverts the cost/benefit: descriptions give the agent-visible benefit at zero
behavioral risk; refinements give behavioral enforcement at zero agent-visible benefit.

| Constraint | Phase 1 (describe) | Refinement |
| --- | --- | --- |
| `create_conversation_message` — transcript XOR links | Already in description; move into param describes | Candidate — needs approval |
| `move_message_to_folder` — exactly one of `folder_id`/`workspace_id` | Add to both param describes | **Blocked**: the actual upstream rule is unverified (see below) |
| `create_voicememo_message.workspace_id` — incoherent text | Fix in `cv-api` (D1/option B) | Decide after the text is correct |
| `get_folder.direction` — gated on `include_first_level_tree` | Fix in `cv-api` (D1/option B) | No — the silent no-op is upstream behavior, not ours to reject |

**Verification gap to close before any refinement lands:** I could not confirm from
`cv-mcp-server` alone whether the API genuinely rejects both-or-neither for
`move_message_to_folder`'s `folder_id`/`workspace_id`, or for
`create_voicememo_message`'s pair. The zod schemas mark both plain-optional and the
describes are unreliable (one is a copy-paste bug). **Confirm against the `cv-api`
controllers first** — a refinement built on a guessed rule will reject calls the API
would have accepted, which is a worse failure than the one we're fixing.

---

## D6 — What gets measured

The brief asks for before/after on `get_current_user` and `list_messages`. Build it as a
script (`scripts/measure-payloads.ts`) that runs each read tool against **recorded
fixtures**, not live traffic — so the number is reproducible in CI and doesn't need a
token or leak real user content into logs.

Three numbers to report:
1. Per-tool response bytes, with and without `recommendedFields`.
2. Total `tools/list` payload bytes, before vs. after Phase 1 (the budget in spec Part 3).
3. Round-trip count on the canonical task (spec acceptance criterion 1), before vs. after.

Note that (1) and (2) move in opposite directions. Reporting only (1) would let us claim
a win while making every session more expensive.
