# ADR draft: orphan running lease / auto-fail

**Status:** Ready for Zeus review → Developer after accept.
**Proposed ADR id:** 0035 (next after 0034).
**After:** Preview 2026.10.26.0701 shipped (5894444 skill/MCP log+fail).
**Do not mutate** live run 908d1f95.

## Problem
Claude Computer Use Stopped while Hyperion left scan-and-build running (hollow Logs 1). Hosts may ignore skill/MCP; Hyperion cannot scrape Computer Use. Canvas then implies live work (En curso) with agentWaiting=false.

Primary fix remains harness log + fail (5894444). This ADR is the **safety net** when hosts ignore that contract.

## Decision (proposed)

Add a deterministic domain reconcile for **orphan agent attempts**:

When **all** of the following hold for an agent step, Hyperion records an automatic fail for the current attempt:

1. step.kind === "agent" and step.status === "running"
2. run.agentWaiting !== true (no active coordinator wait listeners on this run)
3. No durable continuation delivery in flight that owns this run agent turn (if continuation is delivering / leased — do not steal)
4. **Attempt stale:** wall time since **last progress** for this (stepId, attempt) exceeds the lease L, where last progress is the latest of:
   - the start event for this attempt
   - any log / complete / fail for this attempt
   - any artifact registration for this attempt
5. Run is active or paused (not terminal)

### Lease constant (v1)
- **L = 3 minutes (180s)** since last progress.
- Rationale: skill requires heartbeat log at least once per ~60s on long work; 3x margin avoids false fail during healthy scans (du, folder walk) that still heartbeat.
- Keep as named domain constant; document in protocol; do not make per-plan tunable in v1.

### Auto-fail semantics
- Same evidence rules as agent fail: nonempty public message, preserve prior logs/artifacts, bump revision, emit event.
- Suggested message: Attempt abandoned: no progress while no agent wait was active.
- Actor: system path — not a fabricated human. Prefer internal reconcile via domain transition rules in src/domain/.
- Does **not** cancel external Computer Use / shell; same honesty as Recuperar.
- After auto-fail, step is failed → human Reintentar or Copiar continuacion; canvas must not keep agent is working.

### When to run reconcile
Prefer lazy + light periodic, both calling the same pure domain helper:
1. On coordinator/human authenticated GET run / SSE snapshot projection
2. Optional server tick at most 1/min per active run with a running agent step

Do **not** put timers in the browser. Do **not** invent a parallel UI state machine.

## False-positive rules (must survive)

| Situation | Why not auto-fail |
|-----------|-------------------|
| Long scan with heartbeats every <=60s | Last progress refreshes; lease never elapses |
| agentWaiting === true | Host still holds hyperion_wait; may be mid-work between logs |
| Log/complete/fail/artifact within L | Progress exists |
| Continuation leased/delivering | Connector owns the turn |
| Step ready / failed / human waiting | Not orphan running |

**Known residual risk:** host works >L with zero logs (violates 5894444). Auto-fail is correct honesty; host must heartbeat or finish sooner.

## Non-goals
- Computer Use scrape / chat interception
- Inferring progress from edge animation or SSE alone
- Auto-retry or auto-start after fail
- Fabricating human answers

## Consequences
- Stronger Stop→canvas honesty when hosts ignore skill.
- Requires careful tests so heartbeat-compliant long work is never killed.
- Protocol + skill note: lease is safety net; harness fail remains mandatory.

## File targets

| Priority | File | Change |
|----------|------|--------|
| P0 | docs/decisions/0035-orphan-running-lease.md | Accepted ADR after Zeus sign-off |
| P0 | src/domain/workflow.ts or orphan.ts | Pure lastAttemptProgressAt + reconcileOrphanRunning |
| P0 | src/server/app.ts / store.ts | Invoke on GET/SSE and optional tick |
| P0 | tests/domain or orphan-running.test.ts | Heartbeat survives; stale fails; wait held survives |
| P1 | docs/protocol.md | Lease L, triggers, message |
| P1 | process-contract, SKILL.md, mcp.ts | One line: domain may auto-fail orphans |
| P1 | docs/site usar-el-flujo ES/EN | Failed after abandonment → Reintentar |
| P2 | Canvas i18n | Reuse failed + Reintentar |

## Acceptance

1. ADR 0035 written and accepted (or deferred with reason).
2. Domain: running + !agentWaiting + no progress >L → failed with abandonment message; history preserved.
3. Domain: log every 60s (or any progress within L) → never auto-fail.
4. Domain: agentWaiting true → never auto-fail even if silent >L.
5. Server invokes reconcile without UI timers; npm run check + targeted tests green.
6. No mutation of run 908d1f95 (synthetic fixtures only).

## Test plan

1. Unit: start → wait L+1s with !agentWaiting → failed.
2. Unit: start → log at T+50s → still running at T+180s from start (lease from log).
3. Unit: start → silent but agentWaiting true past L → still running.
4. Unit: artifact mid-attempt refreshes lease.
5. HTTP: GET run triggers reconcile once; idempotent second GET.
6. No e2e against Oscar live run.

## Open points for Zeus (recommend defaults)
1. **L = 180s** — accept? (alt 120s tighter; reject 300s — force heartbeats)
2. **Lazy GET/SSE-only first** vs add 1/min tick — recommend GET/SSE first.
3. **Distinct abandon event** vs plain fail — recommend distinct event reason for UI, status still failed.

## Do-nots
- Do not mutate 908d1f95.
- Do not scrape Claude.
- Do not auto-start after abandon.
- Do not treat decorative animation as progress.