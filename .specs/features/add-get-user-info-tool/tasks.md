# Add `get_user_info` Tool — Tasks

**Spec**: `.specs/features/add-get-user-info-tool/spec.md`
**Design**: none (inline — no architectural decisions; follows existing `cv-api.ts` / `server.ts` patterns)
**Status**: Draft

---

## Gate Check Commands

| Gate  | Command                                  | When                          |
| ----- | ---------------------------------------- | ----------------------------- |
| quick | `npm run build:check && npm run test:unit` | After code-layer tasks        |
| full  | `npm test`                               | After integration / tool task |
| build | `npm run build`                          | Final verification            |

> No `.specs/codebase/TESTING.md` exists. Test strategy (confirmed with user): **Jest unit tests** for T2 and T3, co-located by mirroring `src/` layout. There is no existing `cv-api` test file — T2 introduces the first (`tests/unit/cv-api.test.ts`). T3 extends `tests/unit/server/server.test.ts`. T1 is type-only (compile). T4 is metadata-only.

---

## Execution Plan

### Phase 1: Foundation (Sequential)

```
T1 (UserInfo interface) ──→ T2 (getContacts method)
```

### Phase 2: Tool wiring (Sequential — both modify src/server.ts)

```
T2 ──→ T3 (get_user_info tool) ──→ T4 (deprecate get_user)
```

T3 and T4 both edit `src/server.ts`, so they are **NOT** parallel-safe despite having no logical dependency.

---

## Task Breakdown

### T1: Define `UserInfo` + `WorkspaceRole` interfaces

**What**: Create the `UserInfo` and `WorkspaceRole` TypeScript interfaces mirroring the `/contacts` payload, and export them.
**Where**: `src/interfaces/user-info.interface.ts` (new) + `src/interfaces/index.ts` (add export)
**Depends on**: None
**Reuses**: `src/interfaces/` convention (e.g. `get-by-id.interface.ts`, `index.ts` barrel)
**Requirement**: USR-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `UserInfo` defined with all 14 fields from spec AC1 (required vs optional `?` preserved: `last_name?`, `image_url?` optional)
- [ ] `voice_gender: 'F' | 'M'` and `user_type: 'user' | 'bot'` as union literals
- [ ] `WorkspaceRole` defined: `workspace_id: string`, `role: string`, `joined_at: string`, `sort_order: number`
- [ ] Both exported via `src/interfaces/index.ts`
- [ ] Gate check passes: `npm run build:check`

**Tests**: none (pure type declaration — verified by compilation)
**Gate**: build:check

---

### T2: Add `getContacts` method to `getCarbonVoiceAPI()`

**What**: Add `getContacts(userIds, options?)` to the client in `cv-api.ts` — guards empty input, calls `POST /contacts` with `{ user_guids }` via `mutator`, maps each contact to `UserInfo`, returns `UserInfo[]`.
**Where**: `src/cv-api.ts` (modify) + `tests/unit/cv-api.test.ts` (new)
**Depends on**: T1
**Reuses**: `mutator` from `./utils/axios-instance`; `getWhoAmI` pattern in `cv-api.ts`; `UserInfo` from T1
**Requirement**: USR-01, USR-02, USR-03, USR-07 (mapping `user_guid`→`id`, `workspace_guids`→`workspace_ids`)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Empty / no-ID array throws a descriptive error **before** any HTTP call (USR-02)
- [ ] Issues `mutator({ url: '/contacts', method: 'POST', data: { user_guids } }, options)` forwarding auth options (USR-01)
- [ ] Maps each contact → `UserInfo` (renames `user_guid`→`id`, `workspace_guids`→`workspace_ids`; rest passthrough incl. `workspace_roles` 1:1) (USR-03, USR-07)
- [ ] Omitted optional fields (`last_name`, `image_url`) produce valid `UserInfo` without defaulting them
- [ ] API errors propagate (consistent with `getWhoAmI`)
- [ ] Unit tests cover: empty-array guard, mapping/rename correctness, optional-field omission
- [ ] Gate check passes: `npm run build:check && npm run test:unit`
- [ ] Test count: N tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T3: Add `get_user_info` tool

**What**: Register a `get_user_info` MCP tool that calls `cvApi.getContacts([id], auth)`, selects the entry matching `id` (fallback first), throws "user not found" on empty, returns the single `UserInfo`.
**Where**: `src/server.ts` (modify, near `get_user` ~L304-328)
**Depends on**: T2
**Reuses**: `cvApi` (`getCarbonVoiceAPI()` instance, L70), `getUserByIdParams`, `setCarbonVoiceAuthHeader`, `formatToMCPToolResponse`, existing `get_user` registration shape
**Requirement**: USR-05, USR-07 (match-by-id), Edge Cases (not-found)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tool registered with `getUserByIdParams.shape` input schema and `annotations: { readOnlyHint: true, destructiveHint: false }`
- [ ] Calls `cvApi.getContacts([args.id], setCarbonVoiceAuthHeader(authInfo?.token))`
- [ ] Selects entry where `user_guid`/`id === args.id`, falls back to first (USR-07 AC2)
- [ ] Empty result → throws "user not found", caught by try/catch → `formatToMCPToolResponse(error)`
- [ ] Returns a single `UserInfo` object (unwrapped), not an array
- [ ] Description matches spec P1 `get_user_info` proposed wording
- [ ] Errors logged + returned via `formatToMCPToolResponse(error)`
- [ ] Unit tests extend `tests/unit/server/server.test.ts` covering: tool registered, match-by-id selection (with fallback-to-first), not-found → error path, single-object unwrap
- [ ] Gate check passes: `npm test`
- [ ] Test count: N tests pass (no silent deletions)

**Tests**: unit (extend `tests/unit/server/server.test.ts`)
**Gate**: full

**Commit**: `feat(server): add get_user_info tool backed by /contacts`

---

### T4: Deprecate `get_user` (description only)

**What**: Prefix `get_user`'s description with `[DEPRECATED]` pointing to `get_user_info`. No behavior/implementation/`simplifiedApi.getUserById` change.
**Where**: `src/server.ts` (modify, `get_user` registration ~L308)
**Depends on**: T3 (same file — sequential to avoid edit conflict)
**Reuses**: existing `get_user` registration
**Requirement**: USR-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `get_user` description = spec P1 wording: `"[DEPRECATED] Use \`get_user_info\` instead, which returns the full user information. Get a User by their ID."`
- [ ] Handler body, `simplifiedApi.getUserById` call, schema, and annotations unchanged
- [ ] Gate check passes: `npm test`
- [ ] Test count: N tests pass (no silent deletions)

**Tests**: none (metadata-only; verified by inspection + existing suite stays green)
**Gate**: full

**Commit**: `chore(server): mark get_user as deprecated in favor of get_user_info`

---

## Pre-Approval Validation

### Check 1: Granularity

| Task | Scope                                      | Status     |
| ---- | ------------------------------------------ | ---------- |
| T1   | 1 interface file + barrel export           | ✅ Granular |
| T2   | 1 method + its unit test                   | ✅ Granular |
| T3   | 1 tool registration                        | ✅ Granular |
| T4   | 1 description string change                | ✅ Granular |

### Check 2: Diagram–Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status   |
| ---- | ----------------- | ------------- | -------- |
| T1   | None              | start         | ✅ Match  |
| T2   | T1                | T1 → T2       | ✅ Match  |
| T3   | T2                | T2 → T3       | ✅ Match  |
| T4   | T3                | T3 → T4       | ✅ Match  |

No `[P]` tasks (T3/T4 share `src/server.ts`). No parallelism violations.

### Check 3: Test Co-location

| Task | Code Layer            | Inferred Requirement | Task Says     | Status |
| ---- | --------------------- | -------------------- | ------------- | ------ |
| T1   | interface (types)     | none (compile)       | none          | ✅ OK   |
| T2   | api client method     | unit                 | unit          | ✅ OK   |
| T3   | MCP tool (server)     | unit                 | unit (full)   | ✅ OK   |
| T4   | tool metadata         | none (compile)       | none          | ✅ OK   |

> No TESTING.md → scope confirmed with user: unit tests for T2 + T3.

---

## Requirement Coverage

| Requirement | Task(s) |
| ----------- | ------- |
| USR-01      | T2      |
| USR-02      | T2      |
| USR-03      | T2      |
| USR-04      | T1      |
| USR-05      | T3      |
| USR-06      | T4      |
| USR-07      | T2 (mapping), T3 (match-by-id) |

**Coverage:** 7/7 requirements mapped. ✅
