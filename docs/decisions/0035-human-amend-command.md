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

Protocol and process-contract document the command. Canvas/Desktop amend UI and in-app chat remain later cuts. Linked cycles remain the path after a completed run. Domain tests cover happy path, principal checks, revision/commandId, terminal rejection, and policy C acknowledge.
