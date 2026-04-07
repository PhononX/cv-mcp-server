# Production MCP Timeout Execution Plan

## Objective

Stop production `upstream request timeout` failures quickly, validate whether per-session request serialization fully resolves the issue, and only then decide on deeper transport changes.

## Key Evidence Already Confirmed

- The external API completes quickly while failures happen after response formatting (`stringify` done, then no send/write completion markers).
- The likely fault zone is the HTTP transport response emission lifecycle under overlapping requests/cancellations in the same session.
- Relevant implementation points:
  - [`/Users/fredericoalmeida/Dev/phononx/cv-mcp-server/src/transports/http/streamable.ts`](/Users/fredericoalmeida/Dev/phononx/cv-mcp-server/src/transports/http/streamable.ts)
  - [`/Users/fredericoalmeida/Dev/phononx/cv-mcp-server/src/transports/http/diagnostics/transport-send-diagnostics.ts`](/Users/fredericoalmeida/Dev/phononx/cv-mcp-server/src/transports/http/diagnostics/transport-send-diagnostics.ts)
  - [`/Users/fredericoalmeida/Dev/phononx/cv-mcp-server/src/config/env.ts`](/Users/fredericoalmeida/Dev/phononx/cv-mcp-server/src/config/env.ts)
  - Existing incident doc: [`/Users/fredericoalmeida/Dev/phononx/cv-mcp-server/docs/mcp-reliability-plan.md`](/Users/fredericoalmeida/Dev/phononx/cv-mcp-server/docs/mcp-reliability-plan.md)

## Execution Phases

### Phase 1: Production-safe mitigation (first deploy)

- Add per-session single-flight queue for `tools/call` so only one tool request executes at a time per `sessionId`.
- Add explicit queue wait timeout and return deterministic JSON-RPC timeout error (fast-fail) instead of letting request hang.
- Keep transport diagnostics enabled during validation window.

### Phase 2: Evidence gates (24h minimum)

- Verify every tool call logs full lifecycle markers (`SEND_START`, `SEND_DONE`, write/start, complete).
- Validate across real traffic (target at least 100 tool calls across multiple users/sessions).
- Decision:
  - If timeouts drop to near-zero and lifecycle is complete: keep queue as guardrail.
  - If timeouts persist despite complete serialization: escalate to Phase 3.

### Phase 3: Durable redesign (only if needed)

- Introduce explicit in-flight request tracker per session with robust cleanup on cancel/close/error.
- Reduce reliance on transport private internals for operational behavior.
- Add regression tests covering overlapping tool calls and cancellation races.
- Roll out behind feature flag/canary.

### Phase 4: Infrastructure alignment (parallel)

- Verify timeout chain across edge/proxy/App Runner is greater than app worst-case with margin.
- Validate buffering/stream behavior does not conflict with streamable MCP responses.
- Ensure service warm capacity (minimum instances) is set to avoid cold-path instability.

## Validation & Exit Criteria

- No reproducible reconnect loops in canary and normal usage windows.
- Near-zero `upstream request timeout` rate after mitigation deployment.
- Log evidence shows request lifecycle completion on successful calls and deterministic fast-fail on overloaded/blocked calls.
- Incident diagnostics removed after closure; only minimal permanent observability remains.

## Risks & Controls

- Risk: session-level queue can reduce per-session throughput.
  - Control: cap queue wait, expose metrics (`queueWaitMs`, timeout count), and keep scope limited to `tools/call`.
- Risk: mitigation masks deeper transport bug.
  - Control: enforce evidence gate before declaring closure and keep Phase 3 ready if failures continue.
