# ADR 0035: Human amend of saved manual outputs

Status: accepted in source. Date: 2026-11-12.

## Context

`submit` closed manual steps with no edit path. `revise` is agent-only and protects presented human decisions. `retry` applies only to agent steps. `parentRunId` starts a new cycle after a completed parent. Oscar needs mid-flight correction of a wrong saved answer without fabricating undo of external work. Spec/spike notes and Full Auto locked policy **C**.

## Decision

Add human command `amend` in the domain:

- Target: completed `manual` step; revalidated typed `outputs`; required `expectedRevision`, `commandId`, and reason `message`.
- Append-only history: prior outputs recorded on the `amend` event; no deletion of prior events.
- **Policy C:** when irreversible agent descendants exist (completed/failed or with artifacts), require `acknowledgeIrreversible: true`. Empty list: no acknowledge. Never auto-undo external effects. Reject while descendants are `running`. Reject terminal runs.
- Reopen derived agent (and stale completed downstream human) work analogously to recovery; keep attempt/artifact evidence.
- Distinct from `retry`, `revise`, and `parentRunId`. MCP agent tools do not expose `amend`.

## Consequences

Protocol and process-contract document the command. Canvas/Desktop expose **Corregir respuesta** with a required reason, typed DecisionForm `mode=amend`, and policy C acknowledge when irreversible descendants exist; ChatBubble must never send `amend` / `acknowledgeIrreversible`. Linked cycles remain the path after a completed run. Domain and e2e tests cover happy path, principal checks, revision/commandId, terminal rejection, policy C acknowledge, and the chat deny-list.
