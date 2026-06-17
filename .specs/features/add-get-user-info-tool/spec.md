# Merge `get_user_info` into `get_user` (Contacts-backed Implementation)

> **Pivot note (2026-06-17):** The original spec added `get_user_info` as a new tool and deprecated `get_user`. This direction was revised: instead of two tools, `get_user` is replaced in-place with the contacts-backed implementation. `get_user_info` is removed. MCP clients auto-discover the updated tool on reconnect — no breaking contract exists.

## Problem Statement

The branch currently ships two tools:

- `get_user_info` — new tool backed by `POST /contacts`, returns rich `UserInfo`
- `get_user` — original tool backed by `simplifiedApi.getUserById`, marked `[DEPRECATED]`

The desired end state is **one tool**, `get_user`, backed by `getContacts`, returning `UserInfo`. The `get_user_info` registration is removed. The old `simplifiedApi.getUserById` handler is removed from `server.ts` (the method itself is generated code and is left untouched in `cv-api.ts`).

## What Is Already Done (no change needed)

- `UserInfo` + `WorkspaceRole` interfaces — `src/interfaces/user-info.interface.ts` ✅
- `getContacts` method on `getCarbonVoiceAPI()` — `src/cv-api.ts` ✅
- `getContacts` unit tests — `tests/unit/cv-api.test.ts` ✅

## Goals

- [ ] Remove `get_user_info` registration from `src/server.ts`
- [ ] Replace `get_user` handler with the `getContacts`-backed logic (currently in `get_user_info`)
- [ ] Update `get_user` description to the full-profile wording (no deprecation prefix)
- [ ] Update `tests/unit/server/server.test.ts`: remove old simplified-API tests for `get_user`, rename `get_user_info` tests to `get_user`

## Out of Scope

| Feature | Reason |
| --- | --- |
| Removing `simplifiedApi.getUserById` from `cv-api.ts` | Generated code — left as-is |
| Changing `UserInfo`, `WorkspaceRole`, or `getContacts` | Already correct; no changes needed |
| Adding new tools or capabilities | Out of scope |

---

## User Stories

### P1: Replace `get_user` implementation ⭐ MVP

**User Story**: As an MCP client, I want `get_user` to return the full `UserInfo` shape (backed by `POST /contacts`) so that I get rich user data without needing a separate tool.

**Acceptance Criteria**:

1. WHEN `get_user` is invoked with `{ id }` THEN the system SHALL call `getCarbonVoiceAPI().getContacts([id], <auth>)`.
2. WHEN the contacts call returns results THEN the system SHALL return the single `UserInfo` matching the requested id (fallback to first entry).
3. WHEN the contacts call returns zero results THEN the system SHALL throw `"user not found"`, caught by try/catch → `formatToMCPToolResponse(error)`.
4. WHEN the contacts call throws THEN the system SHALL log and return `formatToMCPToolResponse(error)`.
5. The tool SHALL use the existing `getUserByIdParams` input schema and `setCarbonVoiceAuthHeader` auth pattern.
6. The tool SHALL keep `annotations: { readOnlyHint: true, destructiveHint: false }`.
7. The tool description SHALL be:
   > "Get detailed information about a specific user by their ID. Returns the full user profile — name, languages, voice settings, workspace memberships and roles, notification preferences, and timestamps. This is richer than `search_user` (which only finds users by phone, email, or name). Use this when you already have a user ID and need their complete information."

---

### P1: Remove `get_user_info` tool ⭐ MVP

**User Story**: As a developer, I want the `get_user_info` registration removed so there is exactly one user-lookup tool.

**Acceptance Criteria**:

1. WHEN the server initializes THEN `get_user_info` SHALL NOT appear in the registered tool list.
2. WHEN the server initializes THEN `get_user` SHALL appear and behave per the implementation story above.

---

## Field Mapping (unchanged from original spec)

`getContacts` maps the `/contacts` response:

| Source (Contact) | Target (`UserInfo`) | Note |
| --- | --- | --- |
| `user_guid` | `id` | **rename** |
| `workspace_guids` | `workspace_ids` | **rename** |
| all other fields | same | passthrough |

`get_user` selects `contacts.find(c => c.id === args.id) ?? contacts[0]`.

---

## Edge Cases

- WHEN `get_user` receives an id that matches no contact (empty array) THEN system SHALL throw `"user not found"` → `formatToMCPToolResponse(error)`.
- WHEN `/contacts` returns more entries than requested THEN `get_user` SHALL select the entry matching the requested id (fallback to first).

---

## Requirement Traceability

| Requirement ID | Story | Status |
| --- | --- | --- |
| USR-01 | Replace `get_user` handler with `getContacts` call | Pending |
| USR-02 | Remove `get_user_info` registration | Pending |
| USR-03 | Update `get_user` description (full-profile wording) | Pending |
| USR-04 | Update server tests: rename `get_user_info` → `get_user`, remove simplified-API tests | Pending |

**Coverage:** 4 requirements, 0 mapped to tasks yet.

---

## Success Criteria

- [ ] `get_user_info` is not registered; `get_user` is registered and returns `UserInfo`.
- [ ] `get_user` rejects unknown id with a "user not found" error.
- [ ] Project type-checks and all tests pass.
