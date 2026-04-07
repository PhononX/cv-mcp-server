# MCP server reliability plan (prod debugging follow-up)

This document captures the prioritized remediation plan after investigating Cursor + AWS production failures (streamable HTTP timeouts, client aborts, session expiry). Use it for dev → staging → prod rollout.

## Context (short)

- CloudWatch showed **Carbon Voice API calls succeeding** (e.g. `GET /simplified/conversations/all` ~775ms, 200) while **Cursor still reported timeouts/aborts**.
- Failures cluster around **streamable HTTP / SSE delivery** and **proxy limits** (e.g. `x-envoy-expected-rq-timeout-ms: 120000`).
- **Fixed 1h MCP session TTL** causes **404 / Session not found** on long-lived SSE when the server destroys the session; `extendSession` exists but was not wired to activity.

---

## Priority 1 — Observability

**Goal:** For each `tools/call`, logs must distinguish: transport start → upstream Carbon complete → HTTP response finished.

| Step | Status | Notes |
|------|--------|--------|
| 1.1 | Done | Structured logs: `TOOL_CALL_TRANSPORT_START`, `TOOL_CALL_TRANSPORT_AWAIT_RESOLVED` around `transport.handleRequest` for `tools/call`. |
| 1.2 | Done | `logRequest`: on response `finish` for `POST` + `tools/call`, log `TOOL_CALL_HTTP_COMPLETE` with tool name and JSON-RPC id. |
| 1.3 | Done | `transport.onerror` / context enrichment with `sessionId` where available. |
| 1.4 | Done | Axios response debug logs include `traceId`, `sessionId`, `userId` when request context is populated. |

**Dev verification**

- Run MCP locally or on dev; invoke a tool; confirm in logs the sequence: `TOOL_CALL_TRANSPORT_START` → Carbon `⬅️ API response` lines (with matching trace) → `TOOL_CALL_TRANSPORT_AWAIT_RESOLVED` → `TOOL_CALL_HTTP_COMPLETE`.

---

## Priority 2 — Transport / proxy timeouts

**Goal:** No layer between Cursor and Node closes the connection before streamable HTTP can complete.

| Step | Action |
|------|--------|
| 2.1 | Map the full path to the MCP host (App Runner, Envoy, CloudFront, etc.). |
| 2.2 | Raise **request / idle** timeouts for MCP routes to align with longest tool + SSE (≥120s where Envoy defaults to 120s). |
| 2.3 | Ensure **no buffering** on `text/event-stream` where configurable. |
| 2.4 | Document which knob produced **“upstream request timeout”** in runbooks. |

**Dev verification:** Put nginx (or similar) in front with a low proxy timeout, reproduce failure, then raise timeout and confirm recovery.

---

## Priority 3 — Session policy

**Goal:** Sessions expire on **idle**, not only wall-clock from connect; TTL configurable via env.

| Step | Action |
|------|--------|
| 3.1 | Wire **`MCP_SESSION_TTL_MS`** (and related limits) in `SessionConfig.fromEnv()`. |
| 3.2 | Call **`extendSession`** (or reset destroy timer) on **`recordInteraction`** / **`recordToolCall`** / activity paths. |
| 3.3 | Optional cap on maximum wall-clock session age if abuse-sensitive. |
| 3.4 | Clear logging when SSE `GET /` returns 404 after expiry. |

**Dev verification:** Short TTL + sliding activity keeps session alive with pings; true idle past TTL yields 404 until reinitialize.

---

## Priority 4 — Ops

| Step | Action |
|------|--------|
| 4.1 | **Minimum instances ≥ 1** for MCP in staging/prod if cold start hurts first tool. |
| 4.2 | Health checks only on fast routes. |
| 4.3 | Watch concurrency under parallel UI sub-requests (`listOfferingsForUI`). |

---

## Implementation order

1. **P1** — unblock measurement.  
2. **P3** — fixes real session/SSE 404 class.  
3. **P2** — tune using P1 evidence.  
4. **P4** — production hardening.

---

## QA checklist (dev)

| # | Check | Pass |
|---|--------|------|
| A | OAuth + initialize | Cursor connects to dev MCP. |
| B | Tool call | Tool completes; logs show start → upstream → await resolved → HTTP complete. |
| C | Idle + activity | With sliding TTL (once implemented), no premature 404 with occasional activity. |
| D | Forced expiry | After idle > TTL, 404 + re-init recoverable. |
| E | Through proxy | Same as B with production-like proxy timeouts. |
