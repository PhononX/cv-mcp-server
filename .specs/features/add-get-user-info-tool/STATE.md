# STATE — add-get-user-info-tool (Pivoted: merge into get_user)

> Last updated: 2026-06-17

## Pivot (2026-06-17)

Original direction: add `get_user_info` + deprecate `get_user`.
New direction: replace `get_user` in-place with the contacts-backed implementation; remove `get_user_info`.

**Rationale:** MCP clients auto-discover tools on reconnect — no formal contract is broken by renaming/removing a tool. One unified `get_user` returning `UserInfo` is cleaner than two tools.

## What Is Done

- `UserInfo` + `WorkspaceRole` interfaces — `src/interfaces/user-info.interface.ts` ✅
- `getContacts` method + unit tests — `src/cv-api.ts` + `tests/unit/cv-api.test.ts` ✅
- `get_user_info` tool implemented in `src/server.ts` (to be renamed to `get_user`) ✅
- OLD `get_user` marked `[DEPRECATED]` in description (to be replaced) ✅

## What Remains

| Task | File | Status |
| --- | --- | --- |
| T1: Replace `get_user` handler, remove `get_user_info`, update description | `src/server.ts` | Pending |
| T2: Rename `get_user_info` tests → `get_user`, remove simplified-API tests | `tests/unit/server/server.test.ts` | Pending |

## Decisions

- `simplifiedApi.getUserById` is left in `cv-api.ts` (generated code, not worth touching).
- `get_user` description: full-profile wording from `get_user_info` (no deprecation prefix, no "prefer this over" clause).
- Spec folder name kept as-is (`add-get-user-info-tool`) — renaming is churn.
