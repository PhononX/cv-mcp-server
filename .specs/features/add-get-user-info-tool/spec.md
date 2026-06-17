# Add `get_user_info` Tool (Contacts-backed UserInfo) + Deprecate `get_user` Specification

> **Tool name note:** the tool is named `get_user_info` (not `get_contact`) so the name describes the *agent's intent* ("get a user's information by ID") rather than the backend's "contact" nomenclature, aligns with the `UserInfo` return type, and reads as the natural successor to the deprecated `get_user`.

## Problem Statement

The `get_user` MCP tool returns the simplified-API `User` shape via `simplifiedApi.getUserById`. We want to expose a richer, normalized `UserInfo` shape (the contact-style "full API" representation), sourced from the full-API `POST /contacts` endpoint (which accepts a list of user IDs).

To avoid breaking existing MCP clients that depend on the current `get_user` output shape, we will **not** change `get_user`'s behavior. Instead we:

- Add a new `get_user_info` tool that returns a single `UserInfo` (a contact, phrased as a user, fetched by ID).
- Mark `get_user` as **deprecated** (via its description text — MCP has no formal `deprecated` annotation), pointing clients to `get_user_info`.
- Leave `get_user`'s implementation and its `simplifiedApi.getUserById` call untouched.

## Goals

- [ ] Add a `getContacts` method to `getCarbonVoiceAPI()` in [cv-api.ts](src/cv-api.ts#L7-L13) that calls `POST /contacts` with `{ user_guids: string[] }`, requires at least one ID, maps the response, and returns a **typed** `UserInfo[]`.
- [ ] Define a `UserInfo` (and `WorkspaceRole`) interface that exactly matches the backend `/contacts` payload contract (required vs. optional preserved).
- [ ] Map the `/contacts` response into `UserInfo[]`.
- [ ] Add a new `get_user_info` tool ([server.ts](src/server.ts#L304-L328) area, near `get_user`) that calls `getContacts([id])` and returns a single `UserInfo`.
- [ ] Mark `get_user`'s description as `[DEPRECATED]`, directing clients to `get_user_info`. Do not change its behavior.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Changing `get_user` behavior or output shape | Intentionally preserved to avoid breaking existing clients; only its description is updated (deprecation note). |
| Removing/altering generated `simplifiedApi.getUserById` | Generated code; `get_user` continues to use it. |
| `search_user` / `search_users` tools | Out of this scope. |
| Pagination / batching of `user_guids` | `get_user_info` passes exactly one ID; multi-ID batching is not exercised by any tool yet. |
| Caching of contact lookups | Not requested. |

---

## User Stories

### P1: Contacts-backed lookup method ⭐ MVP

**User Story**: As the MCP server, I want a `getContacts(userIds)` method on the full Carbon Voice API client so that I can fetch contact records by a list of user IDs and receive them as typed `UserInfo` objects.

**Why P1**: Every other piece depends on this method existing and returning the mapped shape.

**Acceptance Criteria**:

1. WHEN `getContacts` is called with one or more user IDs THEN the system SHALL issue `POST /contacts` with body `{ user_guids: <ids> }` via `mutator`, forwarding the provided auth options.
2. WHEN `getContacts` is called with an empty array (or no IDs) THEN the system SHALL reject before making the HTTP call (the method requires ≥1 ID) with a descriptive error.
3. WHEN the API responds successfully THEN the system SHALL map each returned contact into a `UserInfo` object and return a typed `UserInfo[]`.
4. WHEN the API returns an error THEN the system SHALL propagate the error (consistent with existing `mutator`-based methods like `getWhoAmI`).

**Independent Test**: Call `getCarbonVoiceAPI().getContacts(['<known-id>'], authOptions)` and assert the returned array contains one object conforming to `UserInfo`.

---

### P1: `UserInfo` interface ⭐ MVP

**User Story**: As a developer, I want a `UserInfo` interface that exactly mirrors the backend `/contacts` payload so that the mapped response is type-safe and self-documenting.

**Why P1**: The mapping target must exist to compile and to define the contract.

**Acceptance Criteria**:

1. WHEN `UserInfo` is defined THEN it SHALL mirror the backend contract — fields the backend always returns are required; fields the backend may omit are optional (`?`). Target fields:
   - `id: string` (from `user_guid`)
   - `created_at: string` (ISO datetime)
   - `first_name: string`
   - `last_name?: string` (optional — backend may omit)
   - `image_url?: string` (optional — backend may omit)
   - `languages: string[]`
   - `voice_gender: 'F' | 'M'`
   - `created_by: string`
   - `last_updated_at: string` (ISO datetime)
   - `workspace_ids: string[]` (from `workspace_guids`)
   - `workspace_roles: WorkspaceRole[]`
   - `is_allowed_to_receive_notification: boolean`
   - `user_type: 'user' | 'bot'`
2. WHEN `WorkspaceRole` is defined THEN it SHALL contain: `workspace_id: string`, `role: string`, `joined_at: string`, `sort_order: number`.
3. The interface(s) SHALL live under `src/interfaces/` and be exported via `src/interfaces/index.ts` (matching existing convention).

> Note: exact required/optional split for each field should be confirmed against the backend schema during implementation; the list above marks `last_name` and `image_url` optional per the known edge case. Adjust others only if the backend contract dictates.

**Independent Test**: TypeScript compiles; a literal of the target JSON is assignable to `UserInfo`.

---

### P1: `get_user_info` tool ⭐ MVP

**User Story**: As an MCP client, I want a `get_user_info` tool that returns a single `UserInfo` so that I get the normalized contact-style shape for one user by ID.

**Why P1**: This is the user-facing capability that motivates the feature.

**Acceptance Criteria**:

1. WHEN `get_user_info` is invoked with `{ id }` THEN the system SHALL call `getCarbonVoiceAPI().getContacts([id], <auth>)`.
2. WHEN the contacts call returns results THEN the system SHALL return the single `UserInfo` matching the requested id (unwrapped from the array), not an array.
3. WHEN the contacts call returns zero results for the given id THEN the system SHALL return a graceful response (see Edge Cases).
4. WHEN the contacts call throws THEN the system SHALL log and return `formatToMCPToolResponse(error)` (existing error pattern preserved).
5. The tool SHALL reuse the existing `get_user` input schema (`getUserByIdParams`) and auth pattern (`setCarbonVoiceAuthHeader`).
6. The tool SHALL set `annotations: { readOnlyHint: true, destructiveHint: false }`.
7. The tool description SHALL make clear this returns the **full user information** (not the lightweight `search_user` result), and that it is used when a user ID is already known. Proposed description:
   > "Get detailed information about a specific user by their ID. Returns the full user profile — name, languages, voice settings, workspace memberships and roles, notification preferences, and timestamps. This is richer than `search_user` (which only finds users by phone, email, or name). Use this when you already have a user ID and need their complete information."

**Independent Test**: Invoke `get_user_info` with a valid id and assert the MCP response payload is a single `UserInfo` object.

---

### P1: Deprecate `get_user` ⭐ MVP

**User Story**: As an MCP client, I want `get_user` to clearly signal it is deprecated in favor of `get_user_info` so that I can migrate, while existing integrations keep working.

**Why P1**: The whole reason for adding `get_user_info` rather than refactoring is to preserve `get_user`.

**Acceptance Criteria**:

1. WHEN `get_user`'s description is rendered THEN it SHALL be prefixed/marked `[DEPRECATED]` and direct clients to use `get_user_info`. Proposed description:
   > "[DEPRECATED] Use `get_user_info` instead, which returns the full user information. Get a User by their ID."
2. WHEN `get_user` is invoked THEN its behavior, output shape, and `simplifiedApi.getUserById` call SHALL remain unchanged.

**Independent Test**: Inspect the registered `get_user` tool description and confirm the deprecation note; invoke it and confirm the legacy `User` shape is unchanged.

---

### P1: Field mapping (Contact → UserInfo) ⭐ MVP

**Source shape** (`POST /contacts` returns an **array** of):

```jsonc
{
  "user_guid": "string",          // → id
  "image_url": "string",          // optional
  "first_name": "string",
  "last_name": "string",          // optional
  "languages": ["string"],
  "voice_gender": "F",            // "F" | "M"
  "created_by": "string",
  "created_at": "ISO datetime",
  "last_updated_at": "ISO datetime",
  "workspace_guids": ["string"],  // → workspace_ids
  "workspace_roles": [{ "workspace_id": "string", "role": "admin", "joined_at": "ISO", "sort_order": 0 }],
  "is_allowed_to_receive_notification": true,
  "user_type": "user"             // "user" | "bot"
}
```

**Mapping rules** (only two fields are renamed; the rest pass through 1:1):

| Source (Contact) | Target (`UserInfo`) | Note |
| --- | --- | --- |
| `user_guid` | `id` | **rename** |
| `workspace_guids` | `workspace_ids` | **rename** |
| `image_url`, `first_name`, `last_name`, `languages`, `voice_gender`, `created_by`, `created_at`, `last_updated_at`, `workspace_roles`, `is_allowed_to_receive_notification`, `user_type` | same | passthrough |

`workspace_roles` items map 1:1 (`workspace_id`, `role`, `joined_at`, `sort_order`) — no rename.

**Acceptance Criteria**:

1. WHEN a contact is mapped THEN `UserInfo.id` SHALL equal source `user_guid` and `UserInfo.workspace_ids` SHALL equal source `workspace_guids`.
2. WHEN multiple contacts are returned for `get_user_info` THEN the tool SHALL select the entry whose `user_guid` matches the requested id; if no exact match is found, fall back to the first entry.

---

## Edge Cases

- WHEN `get_user_info` receives an id that matches no contact (empty array) THEN system SHALL **throw a "user not found" error**, caught by the existing try/catch and surfaced via `formatToMCPToolResponse(error)`.
- WHEN `getContacts` is called with an empty list THEN system SHALL throw/reject before the HTTP call with a descriptive error.
- WHEN the `/contacts` response omits optional fields (e.g. `last_name`, `image_url`) THEN the mapper SHALL produce a valid `UserInfo` with those fields absent (they are optional, not defaulted).
- WHEN `/contacts` returns more entries than requested THEN `get_user_info` SHALL select the entry matching the requested id (per Field-mapping AC2).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| USR-01 | P1: `getContacts` method | Pending | Pending |
| USR-02 | P1: empty-list guard (≥1 id required) | Pending | Pending |
| USR-03 | P1: map response → typed `UserInfo[]` | Pending | Pending |
| USR-04 | P1: `UserInfo` + `WorkspaceRole` interfaces (enums + optional fields) | Pending | Pending |
| USR-05 | P1: add `get_user_info` tool returning single `UserInfo` | Pending | Pending |
| USR-06 | P1: deprecate `get_user` (description only; behavior unchanged) | Pending | Pending |
| USR-07 | P1: field mapping (`user_guid`→`id`, `workspace_guids`→`workspace_ids`, match-by-id) | Pending | Pending |

**Coverage:** 7 total, 0 mapped to tasks, 7 unmapped ⚠️ (mapping happens in Tasks phase)

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

---

## Open Items (resolve before Design)

| Item | Owner | Status |
| --- | --- | --- |
| ~~Source `/contacts` response schema~~ | User | ✅ Provided (array of Contact; see Field mapping) |
| ~~`voice_gender` / `user_type` as string vs. union literal~~ | User | ✅ `voice_gender: 'F' \| 'M'`; `user_type: 'user' \| 'bot'` |
| ~~Not-found behavior when array is empty~~ | User | ✅ Throw "user not found" → caught by try/catch → `formatToMCPToolResponse(error)` |
| ~~`get_user` breaking change~~ | User | ✅ Do not change `get_user`; add new `get_user_info` tool and mark `get_user` deprecated |
| ~~Selection when multiple/extra entries returned~~ | User | ✅ Match by `user_guid === id`, fallback to first |
| Per-field required/optional split beyond `last_name`/`image_url` | Design | Confirm against backend schema during implementation |

---

## Success Criteria

- [ ] `get_user_info` returns a single object matching `UserInfo` (verified against a real id).
- [ ] `getContacts` rejects empty input before any HTTP call.
- [ ] `get_user` is unchanged in behavior and marked `[DEPRECATED]` pointing to `get_user_info`.
- [ ] Project type-checks and existing tests/build pass.
