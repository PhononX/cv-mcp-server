# Filter `list_conversations` by `user_ids` — Tasks

**Feature:** Filter Conversations by User IDs  
**Status:** Ready for implementation  
**Scope:** 5 sequential tasks, ~4h total estimate

---

## Dependency Graph

```
T1: Import generated zod schema
  ↓
T2: Update MCP tool inputSchema
  ↓
T3: Add parameter descriptions & emphasis
  ↓
T4: Implement MCP handler logic [PARALLEL with T3]
  ↓
T5: Unit tests + validation
```

---

## Task Breakdown

### T1: Import generated zod schema

**What:** Import `getAllConversationsQueryParams` from the generated zod file into `src/server.ts`.

**Where:** `src/server.ts` (around line 1-50, imports section)

**Depends on:** None

**Reuses:** `src/generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod.ts:1463-1466` (exported as `getAllConversationsQueryParams`)

**Done when:**
- [ ] `getAllConversationsQueryParams` is imported in `src/server.ts`
- [ ] Import statement is placed with other generated schema imports
- [ ] No syntax errors in build

**Tests:**
```bash
npm run build  # TypeScript compilation passes
```

**Gate:** Build must pass without errors

---

### T2: Update MCP tool inputSchema

**What:** Replace the `list_conversations` tool's current empty `inputSchema: z.object({}).shape` with `getAllConversationsQueryParams.shape`.

**Where:** `src/server.ts:418-442` (`list_conversations` tool handler)

**Depends on:** T1

**Reuses:** Generated schema from T1

**Done when:**
- [ ] `inputSchema` is set to `getAllConversationsQueryParams.shape`
- [ ] Tool still registers without errors
- [ ] `npm run build` passes

**Tests:**
```bash
npm run build  # No errors
npm run test   # Existing tests still pass (backward compat check)
```

**Gate:** Build passes + existing tests pass

---

### T3: Add parameter descriptions & emphasis ⭐ CRITICAL

**What:** Create a thin local zod schema that extends `getAllConversationsQueryParams.shape` with enhanced `.describe()` strings.

Purpose: Inject "IDs not usernames" emphasis into `user_ids` description, and enumerate `match` options + default in its description.

**Where:** `src/server.ts` (new schema definition, ~15 lines above the `list_conversations` tool)

**Depends on:** T1

**Reuses:**
- Canonical descriptions from spec (CONVFILT-05, CONVFILT-06):
  - `user_ids` → *"List of user IDs to filter conversations by. When omitted, all conversations for the caller are returned. **Note: Filter by user ID, not username/display name.**"*
  - `match` → *"Match mode: `any` (union, default) or `all` (intersection). `any` returns conversations with at least one of the given users; `all` returns conversations with all of them."*

**Done when:**
- [ ] New schema created with overridden descriptions
- [ ] `user_ids` description explicitly mentions "IDs, not usernames"
- [ ] `match` description lists both options + default + explains union/intersection
- [ ] Tool's `inputSchema` points to this new schema
- [ ] `npm run build` passes

**Tests:**
```bash
npm run build  # No errors
npm test       # Existing tests still pass
# Manual: Inspect tool in MCP server output for correct descriptions
```

**Gate:** Build passes + descriptions verified as correct

---

### T4: Implement MCP handler logic

**What:** Update the `list_conversations` tool handler to:
1. Accept `user_ids` and `match` parameters from the tool call
2. Normalize empty/undefined `user_ids` and missing `match` (omit them from forwarded params, per CONVFILT-01)
3. Forward cleaned params to `getAllConversations`
4. Return the response unchanged

**Where:** `src/server.ts:418-442` (handler function body)

**Depends on:** T2 (schema update) — T3 (descriptions) can run in parallel

**Reuses:**
- `getAllConversations(params?)` client function (already available)
- `formatToMCPToolResponse()` (existing error handler, unchanged)

**Implementation detail:**
```typescript
const params = {};
if (input.user_ids && input.user_ids.length > 0) {
  params.user_ids = input.user_ids;
}
if (input.match) {
  params.match = input.match;
}
const result = await getAllConversations(params);
```

**Done when:**
- [ ] Handler accepts `user_ids` and `match` from input
- [ ] Empty/undefined `user_ids` is omitted from forwarded params
- [ ] Missing `match` is omitted from forwarded params
- [ ] `getAllConversations` is called with cleaned params
- [ ] Response is returned via `formatToMCPToolResponse`
- [ ] `npm run build` passes
- [ ] Existing tests still pass

**Tests:**
```bash
npm run build
npm run test   # Existing tests still pass (regression check)
```

**Gate:** Build passes + existing tests pass

---

### T5: Unit tests + validation

**What:** Create unit tests covering all acceptance criteria and edge cases. Verify the tool works end-to-end.

**Where:** `src/server.test.ts` or similar test file (check TESTING.md for conventions)

**Depends on:** T2, T4 (tool ready)

**Reuses:** Test patterns from existing `list_messages` tests (if available)

**Coverage checklist (from spec):**

- **CONVFILT-01** — Call with `user_ids: ["u1", "u2"]` → handler forwards it, `getAllConversations` invoked with those IDs
- **CONVFILT-02** — Call with no params → `getAllConversations` invoked with `{}` (or no params), behaves as today
- **CONVFILT-02 (edge)** — `user_ids: []` (empty array) → treated as "no filter", omitted from params
- **CONVFILT-03** — Call with `match: "all"` → forwarded to `getAllConversations`
- **CONVFILT-04** — Call with invalid `match` value (not `"any"` or `"all"`) → schema validation rejects it, no API call
- **CONVFILT-05** — Tool description contains "user IDs, not usernames"
- **CONVFILT-06** — Tool description lists `any` / `all` options and default
- **CONVFILT-07** — Tool description or response docs mention returned fields (`id`, `name`, `workspace_id`, `type`)

**Done when:**
- [ ] Unit tests cover all acceptance criteria above
- [ ] Tests pass: `npm run test`
- [ ] No TypeScript errors: `npm run build`
- [ ] Tool descriptions verified (manual inspection or test)
- [ ] Handler correctly normalizes params (verified in test mocks)
- [ ] Edge case: empty `user_ids` is omitted (verified in test)
- [ ] Edge case: invalid `match` is rejected (verified in test)

**Tests:**
```bash
npm run test   # All tests pass, including new ones
npm run build  # No errors
npm run lint   # Code style check (if applicable)
```

**Gate:** All tests pass + build succeeds + code review (linting/style)

---

## Verification Checklist (Feature-Level)

Before marking the feature Complete:

- [ ] **T1 complete:** Schema imported, build passes
- [ ] **T2 complete:** InputSchema updated, backward compat verified
- [ ] **T3 complete:** Descriptions enhanced with "IDs not names" emphasis
- [ ] **T4 complete:** Handler logic works, params normalized, tests pass
- [ ] **T5 complete:** Full unit test suite passes
- [ ] **Build check:** `npm run build` + `npm run test` pass
- [ ] **Regression:** Existing tool tests (if any) still pass
- [ ] **Documentation:** Tool description unambiguously states ID-based filtering + `match` options
- [ ] **Requirement traceability:** All 7 CONVFILT-* requirements mapped to tasks and verified

---

## Notes

- **Parallel execution possible:** T3 (descriptions) can run in parallel with T4 (handler logic) since they touch different parts of the tool definition.
- **Backward compatibility guaranteed:** Omitting params when empty/undefined ensures calling with no arguments behaves exactly as today.
- **Schema-driven validation:** Invalid `match` values are caught by the zod enum before any API call (CONVFILT-04).
- **No backend changes needed:** The backend (`cv-api`) already supports filtering; this is pure MCP wiring.

---

## Requirement Traceability

| Req ID | Task(s) | Status |
|--------|---------|--------|
| CONVFILT-01 | T4 | Pending |
| CONVFILT-02 | T4 | Pending |
| CONVFILT-03 | T4 | Pending |
| CONVFILT-04 | T2, T5 | Pending |
| CONVFILT-05 | T3, T5 | Pending |
| CONVFILT-06 | T3, T5 | Pending |
| CONVFILT-07 | T3, T5 | Pending |

