# Spec — Agent-Efficiency Improvements to the MCP Tool Interface

> **Status:** Validation complete, plan drafted. **Not approved to implement.**
> **Source:** External brief, "Improve the Carbon Voice MCP Tool Interface for Agent Consumption"
> (scored the interface ~4.5/10 on agent-efficiency).
> **Spans two repos:** `cv-mcp-server` (all phases) + `cv-api` (OpenAPI description fixes only).
> **Baseline verified:** `npm run test:unit` → 13 suites, 214 tests passing, at `b05841d` (v2.9.0).

---

## Part 1 — Validation of the brief's findings

Every claim was checked against the code at `b05841d`. Verdicts below; the brief's
*direction* is right, but roughly a third of its specific claims are already fixed,
overstated, or describe a different codebase.

There are **28 registered tools** in `src/server.ts` (registrations at lines 87, 126, 153,
183, 216, 243, 272, 307, 340, 368, 396, 433, 472, 497, 522, 620, 650, 678, 704, 730, 759,
786, 813, 844, 869, 900, 926, 956), plus 3 commented-out tools.

### Claim 1 — "Responses are enormous; `get_current_user` ~6,000 chars, ~95% waste"

**Verdict: AGREE.** Structurally confirmed.

`get_current_user` (`src/server.ts:396`) → `cvApi.getWhoAmI()` (`src/cv-api.ts:35`) →
`GET /whoami` → `cv-api src/auth/auth.controller.ts:71-105`, which returns
`{ success, user: UserDto, settings: WhoAmISettings }`.

`UserDto` (`cv-api src/auth/dto/User.dto.ts`, 42 `@ApiProperty` declarations) is passed
through whole and carries five unbounded arrays plus an open-ended map:

| Field | Type | Why it's heavy |
| --- | --- | --- |
| `workspace_guids` | `string[]` | one GUID per workspace, unbounded |
| `identities` | `UserIdentity[]` | one object per linked OAuth identity |
| `entries` | `UserEntryDto[]` | unbounded |
| `environments` | `UserEnvironment[]` | unbounded |
| `lifecycle_events` | `LifecycleEventDto[]` | unbounded |
| `notification_settings` | `NotificationSettings` | full nested object |
| `settings` | `{ [key: string]: string }` (`User.dto.ts:114-116`) | open string map — **this is the brief's "40+ empty string fields"** |

There is no projection mechanism anywhere in the server: every read tool passes the
upstream payload straight to `formatToMCPToolResponse` verbatim.

**Corrections to the brief's details** (they don't change the verdict, but the numbers
shouldn't be quoted as-is):
- There is **no `contacts` field** on the whoami response. The reviewer most likely
  read `entries: UserEntryDto[]`.
- `WhoAmISettings` (`cv-api src/auth/dto/WhoAmISettings.dto.ts`) is **6 fields**, not 40.
  The 40+ empty strings are `UserDto.settings`, a different object.
- The ~6,000-char figure is unverified — it needs a live token against a real account.
  The shape makes it entirely plausible, but we should measure rather than cite it.

### Claim 2 — "List responses don't tell the agent when to stop"

**Verdict: MOSTLY DISAGREE.** This is the weakest claim in the brief, and building what
it literally asks for would be wasted work.

- **`list_messages` — FALSE.** The response already carries full pagination metadata:
  `page`, `size`, `sort_direction`, `total` ("Total number of records by applied
  filters"), `results_count`, `has_next_page` ("If there is more data available"), and
  an echoed `filters` object.
  (`src/generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod.ts:1268-1284`)
- **`get_recent_messages` — TRUE but immaterial.** Response is `{ results: [...] }` with no
  count (`...zod.ts:1018`), but the tool accepts no pagination params and is hard-capped
  at 10, which its description already states (`src/server.ts:156-158`).
- **`get_root_folders` — TRUE but immaterial.** No `total`/`has_next_page`
  (`...zod.ts:1639`), but also **no pagination params at all** (`...zod.ts:1629-1635`) —
  it returns the complete set, so there is no "more" to signal.
- **`list_conversations`** — has `results_count`, no pagination params (`...zod.ts:1468`).

**The real gap is documentation, not data.** An agent can't know `has_next_page` exists
until it makes a call, because no description documents a response shape. That is the
brief's own ask #4, and satisfying #4 closes this claim with zero new response plumbing.

**Decision: do not add pagination envelopes to non-paginated tools.** Document the
metadata `list_messages` already returns.

### Claim 3 — "Overlapping tools with no disambiguation"

**Verdict: AGREE**, with one pair already half-done.

| Pair | Status |
| --- | --- |
| `list_messages` / `get_recent_messages` | Confirmed — neither points at the other (`server.ts:87`, `:153`) |
| `get_folder` / `get_folder_with_messages` | Confirmed — "Get a folder by its ID." vs "Get a folder including its messages by its ID." (`:678`, `:704`) |
| `run_ai_action` / `summarize_conversation` | Confirmed — `summarize_conversation`'s entire description is "Summarize a conversation." (`:525`) |
| `get_current_user` / `get_user` | **Partly fixed already.** `get_user` (`:309-312`) explicitly contrasts itself against `search_user`. But it never mentions `get_current_user`, whose description is the bare `'Get the current user information. '` (`:399`). Still needs one pointer. |

**Add to scope (missed by the brief):** `search_user` vs `search_users` (`:340`, `:368`) —
a singular/plural pair with near-identical descriptions and the same defect.

**Note the in-repo exemplar:** `list_conversations`'s `user_ids` param
(`server.ts:419-431`) already does exactly what the brief wants — it names the
counterpart tool (`search_users`), names the field, gives an example argument, and says
what to do when the result is ambiguous. This, not the brief's `get_feedback_*` example,
is the pattern to copy.

### Claim 4 — "No tool includes an example call, and no tool documents its response shape"

**Verdict: AGREE, fully confirmed.** Zero of the 28 tools include either. Verified by
reading every registration. This is correctly identified as the highest-leverage change.

### Claim 5 — "Constraints exist only at runtime"

**Verdict: MIXED — two of four claims are false.** None of these constraints are
machine-enforced in the schema, which is the fair version of the complaint, but "invisible
before the call" is wrong for half of them.

| Constraint | Verdict |
| --- | --- |
| `create_conversation_message` requires transcript or attachment | **Already documented** in the tool description: "You must provide a transcript or attachment." (`server.ts:188`). Not schema-enforced. |
| `move_message_to_folder` only accepts voicememo/prerecorded | **FALSE.** Documented in *both* the tool description (`server.ts:815-816`) **and** the schema — `message_id.describe('Only allowed to add messages of type: voicememo,prerecorded')` (`...zod.ts:2031`). |
| `get_folder`'s `date`/`direction` silently no-op unless `include_first_level_tree` | **HALF TRUE.** `date` already carries "(must inform include_first_level_tree = true)" (`...zod.ts:1932`). **`direction` does not** (`...zod.ts:1931`) — real gap, narrower than claimed. |
| `create_voicememo_message` / `move_message_to_folder` mutually exclusive params | **TRUE, and worse than reported.** `move_message_to_folder`: `workspace_id` and `folder_id` are both plain-optional with no signal that exactly one is required (`...zod.ts:2030-2034`). `create_voicememo_message`: describes exist but one is **incoherent** — `workspace_id` reads *"not allowed when folder_id specified is different from the folder_id"* (`...zod.ts:1385`), a copy-paste bug in the upstream OpenAPI spec. |

### Claim 6 — "Broken and undocumented chains"

**Verdict: ONE STRONG HIT, ONE CONFIRMED, ONE FACTUALLY FALSE.**

- **`prompt_id` has no producer pointer — TRUE, and actively self-sabotaging.**
  `summarize_conversation` (`server.ts:522`) and `run_ai_action` (`:900`) both require
  `prompt_id` with no mention of `list_ai_actions`. Worse: `list_ai_actions`'s own
  description ends with **"Do not use unless the user explicitly requests it."**
  (`server.ts:875`). The server actively discourages the only tool that produces the
  `prompt_id` its AI-action tools require. **This is the single highest-value fix in the
  brief** and the brief didn't spot the cause.
- **`run_ai_action_for_shared_link` has no ID producer — TRUE.** Confirmed against the
  full 28-tool inventory: no tool creates a share link. `createShareLinkAIResponse`
  only consumes one.
- **"`get_feedback_comments` documents its dependency on `get_feedback_sources`" —
  FALSE.** Neither tool exists in this repo. `grep -ril feedback src/` returns nothing.
  The brief's "pattern we want everywhere" exemplar is from a different codebase, so
  don't go looking for it. Use `list_conversations.user_ids` instead (see Claim 3).

---

## Part 2 — Findings the review missed

All three are in or adjacent to the brief's scope and change what we should build.

### F1 — `summarize_conversation` silently caps at 20 messages (correctness bug)

Its schema declares `limit: z.number().optional().default(50)`
(`src/schemas/conversation.ts:10`), but the handler forwards `args` straight into
`simplifiedApi.listMessages(args, ...)` (`src/server.ts:540-543`), and
`listMessagesQueryParams` has **no `limit`** — only `page`/`size`, with `size` defaulting
to 20 (`...zod.ts:1251-1252`).

So `limit` is silently dropped: long conversations are summarized from 20 messages while
the schema promises 50. `prompt_id` is also forwarded as a stray query param.

This is a real bug behind an interface defect. **Fixing it changes handler logic, which
the brief puts out of scope** — needs explicit approval or a separate ticket.

### F2 — Error responses are not machine-detectable

`McpToolResponse` has no `isError` field
(`src/interfaces/mcp-tool-response.interface.ts`), and `formatToMCPToolResponse` returns
the same `{ content: [{ type: 'text', text }] }` envelope for success and for failure
(`src/utils/format-to-mcp-tool-response.ts:38-40` vs `:84-95`).

An agent cannot distinguish a failed call from a successful one without parsing the JSON
body looking for an `error` key. This is squarely the brief's principle 4 ("recover from
a bad call immediately") and it is the missing mechanism its ask #7 depends on.

The upstream error envelope itself is good — `handleAxiosError`
(`src/utils/axios-instance.ts`) already produces stable codes (`BAD_REQUEST`,
`NOT_FOUND`, `RATE_LIMITED`, …) with a `traceId`. It just isn't flagged as an error.

### F3 — `fields` is already taken, and means the opposite

`get_message` accepts `fields` (`...zod.ts:1133`), documented as *"Additional fields to
include in the response. Possible values: conversation, creator, labels."* — an
**expansion** param, not a projection.

It is the only `fields` in the entire spec (`grep -c '"fields"' carbon-voice-api.json` → 1).
So upstream offers no projection anywhere; it must be implemented server-side. And the new
projection param **must not be called `fields`** or it will mean "include more" on one
tool and "include less" on the rest.

---

## Part 3 — Agreed scope

We accept the brief's seven asks with these amendments:

| # | Brief's ask | Our position |
| --- | --- | --- |
| 1 | Field selection on read tools | **Accept.** Server-side projection, new param named `response_fields` (not `fields`, per F3). Omitted ⇒ byte-identical to today. |
| 2 | Self-describing list responses | **Accept, reframed.** Document the metadata `list_messages` already returns; do **not** add envelopes to tools that don't paginate (per Claim 2). |
| 3 | When-to-use / when-not-to-use in every description | **Accept**, plus the `search_user`/`search_users` pair the brief missed. |
| 4 | Example call + response shape in every description | **Accept.** Highest leverage. Subject to the token-budget constraint below. |
| 5 | Runtime constraints into the schema | **Accept for descriptions; gate refinements.** Two of the four cited constraints are already documented (Claim 5). Real work is `direction`'s missing gate, the incoherent `create_voicememo_message.workspace_id` text, and `move_message_to_folder`'s unsignalled exclusivity. |
| 6 | Declare prerequisites at the top of dependent tools | **Accept.** Starting with deleting the "Do not use unless…" line from `list_ai_actions`. |
| 7 | Document error conditions and next actions | **Accept**, and add `isError` (F2) as its prerequisite. |

### Constraint the brief does not acknowledge: the description token budget

Tool descriptions are paid on **every** request, in the `tools/list` payload that enters
the agent's context before any call is made. 28 tools × (purpose + when-to-use +
when-not-to-use + prerequisites + example + response shape + errors) can add several KB
to every single conversation.

That trades directly against ask #1. So Phase 1 must **measure `tools/list` size before
and after** and hold per-tool descriptions to a terse structured budget (target
~600–900 chars) rather than prose. A description that saves one discovery call but costs
2 KB on every session is a net loss.

### Out of scope (unchanged from the brief)

- Handler logic, upstream API calls, auth, data models — except F1 and F2, both flagged
  for an explicit decision.
- Renaming or removing existing params/tools.
- New endpoints or capabilities.

---

## Part 4 — Acceptance criteria

1. **Canonical multi-step task completes with no wasted call.** Scripted, not eyeballed:
   *"find the messages in workspace X from last week and summarize them"* →
   `get_workspaces_basic_info` → `list_messages(workspace_id, start_date, end_date)` →
   `list_ai_actions` (obtain `prompt_id`) → `summarize_conversation`.
   Every hop is currently under-documented and the third is actively discouraged, so this
   task fails today. It is the canonical smoke test.
2. **Byte-delta report** for `get_current_user` and `list_messages`, with and without
   `response_fields`.
3. **`tools/list` payload size** measured before and after Phase 1, within budget.
4. **Every tool description answers all five questions** — enforced by a table-driven
   test over the registration list, not by review.
5. **No integration breaks** — every new param optional, omission byte-identical to
   current behavior.
6. **`npm run test:unit` stays green** (baseline: 214 tests).
