# 0035 — Orphan running lease / auto-fail

## Problem

Hosts may ignore the skill/MCP contract that requires live `log` heartbeats and `fail` on permission or host timeout. Hyperion cannot scrape Computer Use or chat panes. An agent step can remain `running` with hollow Logs while `agentWaiting` is false, so the canvas still implies live work after the chat has stopped.

Harness log and fail remain mandatory (preview instruction pass). This decision is the deterministic safety net when that contract is ignored.

## Decision

Add a pure domain reconcile for orphan agent attempts. When **all** of the following hold, Hyperion records an automatic abandonment of the current attempt:

1. `step.kind === "agent"` and `step.status === "running"`
2. `agentWaiting` is not true (no active coordinator wait listeners)
3. No durable continuation owns the turn (`waiting` / `queued` / `leased` / `delivered` / `uncertain`)
4. Wall time since **last progress** for this attempt exceeds lease **L = 180 seconds**
5. Run status is `active` or `paused` (not terminal)

**Progress** for the attempt is the latest of: the attempt `start`, any `log` / `complete` / `fail` / `artifact` / prior `abandon` for that step at or after `startedAt`, and artifacts with the matching attempt number.

**Auto-fail semantics:** step status becomes `failed` with public message `Attempt abandoned: no progress while no agent wait was active.`; prior logs and artifacts are preserved; revision bumps; event type is distinct `abandon` (actor `hyperion`), not a plain agent `fail`. External tools are not cancelled. Humans use **Reintentar** / **Copiar continuación**; there is no auto-start after abandon.

**When reconcile runs (v1):** on authenticated GET run, GET runs list, wait read, and SSE snapshot projection. No browser timers and no 1/min background tick in this release. The same pure helper (`reconcileOrphanRunning`) is the only transition path.

Constants live in `src/domain/orphan-running.ts`; the server persists via `Store.reconcileOrphans` only when the revision changes.

## Consequences

- Stronger honesty when a host stops without failing the step.
- Heartbeat-compliant long work (progress within L, including ≤60s logs) is never abandoned.
- Active waits and in-flight continuations survive silence past L.
- Residual risk: a host that works longer than L with zero logs is abandoned correctly; it must heartbeat or finish sooner.
- Protocol, skill, MCP instructions and user guides document the lease as a safety net; harness fail remains required.

## Evidence

Unit and HTTP tests cover stale abandon, heartbeat survival, `agentWaiting` protection, artifact lease refresh, continuation protection, and idempotent GET reconcile. Synthetic fixtures only; live production runs are not mutated by this change.
