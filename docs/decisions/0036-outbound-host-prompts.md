# ADR 0036 — Outbound host prompts (send connector / outbox)

Status: **accepted in source** (PR1: `continuation_prompt` domain/store/HTTP + synthetic tests). UI Enviar wiring, `linked_cycle_prompt`, and native provider send connectors remain follow-up.
Date: 2026-10-26.

Parents: Phase 0 notes `1e160c0f`, `42fab25a`, Architect gate `ffcdba70`; product design `027c9591`.
Related: [ADR 0022](0022-durable-continuations.md) (durable human-answer resume), [ADR 0033](0033-artifacts-and-linked-cycles.md) (linked cycles).

## Context

Phase 0 ships honest CTAs: **Copiar** is always available; **Enviar** stays hidden unless a host-configured `ResumeConnector` satisfies `connectorSchema` (`id`, harness, real `sessionId`, `capabilities.resume` + `idempotentDelivery`). Connections inventory “configured”, `run.continuation` alone, or a provider name must not enable Send. Copy must not claim the chat was notified. MCP alone does not wake a closed chat.

Oscar still wants Hyperion to **send** a human-authored prompt into the connected host when a real send path exists (same-run continuation text after the chat ended, or a linked-cycle “new beginning” draft). ADR 0022’s queue delivers **saved human answers** into an active run so a connector can start a turn that continues ready agent work. It does **not** mean “push an arbitrary canvas draft into Claude/Cursor as a new host message,” and it must not silently create a child run.

## Decision

Add a separate **outbound host-prompt outbox**, additive to ADR 0022, with the same trust model: trusted local connector code configured outside model-generated plans; coordinator-owned HTTP; SQLite durability; claim / lease / settle; reconcile before resend on ambiguous delivery.

### Job kinds

| `kind`                | Human text                           | Connector effect                                                                                        | Must not                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `continuation_prompt` | Copiar continuación body (or edited) | Start a host turn with that exact text so the agent can read the run and continue                       | Invent answers; mark steps complete                |
| `linked_cycle_prompt` | New-beginning draft from canvas      | Start a host turn with that exact text; agent may `create_run` with real `plan.request` + `parentRunId` | Auto-create the child run; invent the next request |

Each job carries at least: `id`, `kind`, `runId`, optional `parentRunId`, immutable `text`, `commandId` (idempotency), `connectorId` / harness, timestamps, and settlement fields aligned with ADR 0022 leases.

### Enqueue

- Only the human/coordinator path enqueues after an explicit **Enviar** (or equivalent authenticated command).
- Persist enqueue + receipt in one transaction. A transport retry must not duplicate work (`commandId`).
- UI may show Enviar only when `outboundSendConfigured` is true: a host-configured connector matching the run harness that parses as `connectorSchema` (Phase 0 gate in `src/client/next-cycle-send.ts`). Never invent `connectorId` or `sessionId` in the client or in a model plan.

### Claim and settle

- An installed send/resume connector claims pending outbound jobs for its `connectorId`, starts the host turn with the stored text, and settles `accepted` | `failed`.
- **Delivery ack ≠ task execution.** For `linked_cycle_prompt`, delivery ack ≠ child run created.
- Lease expiry → `uncertain`; connector must reconcile with the provider before another attempt. Never blindly resend.

### Separation from ADR 0022

|                      | ADR 0022 continuation                            | ADR 0036 outbound prompt                                            |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| Trigger              | Human submits/approves at a suspended checkpoint | Human chooses Enviar on authored prompt text                        |
| Payload              | Decision already in the run snapshot             | Prompt text for the **host chat/CLI turn**                          |
| Goal                 | Wake connector to continue the **same** run      | Deliver text so the agent can continue or plan a **new** linked run |
| UI without connector | Cooperative wait / Copiar continuación           | Copiar only (Phase 0)                                               |

Do not overload `Store.continuations` human-answer rows with linked-cycle create semantics. Prefer a dedicated outbound store (or a clearly typed job discriminant) so projections and leases stay honest.

### Non-claims (normative)

- MCP tools / skill load / Connections “Configurada” do **not** imply outbound send.
- Claude Desktop has no certified public wake API in this product; do not claim chat-pane injection.
- ChatGPT still needs a separately deployed remote path; local stdio is not reachable from its cloud.
- Provider identity support ≠ shipped native send connector.
- Animated edges, live SSE, or a successful enqueue do not prove the agent executed work.

## Consequences

- Phase 0 CTAs remain valid until a certified connector flips `outboundSendConfigured`.
- **PR1 landed:** domain schema, `OutboundPromptQueue`, HTTP enqueue/claim/settle, synthetic tests, protocol + send-column honesty.
- **PR2:** continuation **Enviar** wires to enqueue when the host supplies a real ResumeConnector; without it Enviar stays hidden and Copiar remains primary. Linked-cycle Enviar and native connectors remain later.
- Host spikes (Claude Code session, Cursor CLI, Codex App Server, Desktop helper) stay Phase 2; each must prove idempotent delivery before product claims.
- Docs and capability matrices gain an explicit **send** column distinct from MCP and from human-answer resume.
- Risk: conflating “Enviar succeeded” with “child run exists” or “step completed” — UI and receipts must separate delivery from execution.

## Validation (when implementing)

1. Unit/store: enqueue idempotent by `commandId`; claim/settle; uncertain + reconcile before resend.
2. HTTP roles: only coordinator; no session secrets in SSE projections.
3. UI: Enviar hidden without `connectorSchema`-valid host connector; Copiar unchanged; copy notice never says the chat was notified.
4. Synthetic connector only until a real provider connector is certified.
5. Linked-cycle: after accepted delivery, child run appears only if the agent calls `create_run` with a real request + `parentRunId` (ADR 0033).

## Out of scope for this ADR text

- Shipping a native provider send connector.
- Changing Phase 0 Copiar-primary honesty.
- HTML artifact preview, Preview channel release, or live-run mutation for this draft.
