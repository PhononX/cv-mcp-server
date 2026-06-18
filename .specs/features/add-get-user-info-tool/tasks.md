# Merge `get_user_info` into `get_user` — Tasks

**Spec**: `.specs/features/add-get-user-info-tool/spec.md`
**Status**: Draft

---

## Gate Check Commands

| Gate  | Command                                    | When                   |
| ----- | ------------------------------------------ | ---------------------- |
| quick | `npm run build:check && npm run test:unit` | After T1               |
| full  | `npm test`                                 | After T2 (final check) |

---

## Execution Plan

```
T1 (server.ts changes) ──→ T2 (test changes) ──→ gate:full
```

Both tasks modify different sections of different files, but T2 depends on T1 being correct (tests must match the new tool name).

---

## Task Breakdown

### T1: Merge `get_user_info` into `get_user` in server.ts

**What**: In `src/server.ts`:
1. Delete the `get_user` registration block (the old one calling `simplifiedApi.getUserById`, lines ~337-360).
2. Rename the `get_user_info` registration to `get_user` (change the tool name string).
3. Update the description to the full-profile wording (remove "Prefer this tool over get_user…" sentence).
4. Update the error log message from `'Error getting user info by id:'` to `'Error getting user by id:'`.

**Where**: `src/server.ts`
**Depends on**: None
**Requirement**: USR-01, USR-02, USR-03

**Done when**:

- [ ] `get_user_info` registration is gone
- [ ] `get_user` registration calls `cvApi.getContacts([args.id], setCarbonVoiceAuthHeader(authInfo?.token))`
- [ ] `get_user` description = `"Get detailed information about a specific user by their ID. Returns the full user profile — name, languages, voice settings, workspace memberships and roles, notification preferences, and timestamps. This is richer than \`search_user\` (which only finds users by phone, email, or name). Use this when you already have a user ID and need their complete information."`
- [ ] `get_user` keeps `annotations: { readOnlyHint: true, destructiveHint: false }`
- [ ] Error log says `'Error getting user by id:'`
- [ ] Gate check passes: `npm run build:check`

**Tests**: none (T2 covers this)
**Gate**: build:check

**Commit**: `feat(server): replace get_user with contacts-backed implementation`

---

### T2: Update server tests — rename get_user_info → get_user

**What**: In `tests/unit/server/server.test.ts`:
1. Delete the old `'get_user tool'` describe block (~lines 786-860) — it tests `simplifiedApi.getUserById` which is now removed.
2. Rename the `'get_user_info tool'` describe block → `'get_user tool'`.
3. Inside that block, replace all `getUserInfoCall` variable references with `getUserCall`.
4. Replace all `'get_user_info'` string lookups (in `mock.calls.find`) with `'get_user'`.
5. Update log message assertion from `'Error getting user info by id:'` → `'Error getting user by id:'`.

**Where**: `tests/unit/server/server.test.ts`
**Depends on**: T1
**Requirement**: USR-04

**Done when**:

- [ ] No `get_user_info` describe block or string literal remains in the file
- [ ] `get_user tool` describe block tests match-by-id selection, fallback-to-first, not-found error, single-object unwrap, and tool registration
- [ ] Log message assertion updated
- [ ] Gate check passes: `npm test` (full suite, no regressions)
- [ ] Test count: same or higher than before (no silent deletions beyond the simplified-API tests being removed)

**Tests**: validates T1
**Gate**: full

**Commit**: `test(server): update get_user tests to match contacts-backed implementation`

---

## Requirement Coverage

| Requirement | Task(s) |
| ----------- | ------- |
| USR-01      | T1      |
| USR-02      | T1      |
| USR-03      | T1      |
| USR-04      | T2      |

**Coverage:** 4/4 ✅
