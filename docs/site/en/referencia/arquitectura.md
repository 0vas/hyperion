---
sidebar: false
aside: false
pageClass: architecture-page
---

# Architecture

**From a conversation to visible work.** The agent executes, you decide, and Hyperion retains state and evidence.

## From request to result

<ArchitectureAtlas />

## Inside Hyperion

Three views of the same system. Select one and open Archify to explore the components in full screen.

<Architecture />

## Deployment and trust boundaries

<ArchitectureAtlas kind="deployment" />

The shared launcher can replace an older authenticated service from the same installation after verifying its process identity and creating an integrity-checked SQLite backup. This preserves workflow state and external tasks; it adds no shutdown endpoint or chat wakeup. [Runtime upgrade lifecycle](https://github.com/0vas/hyperion/blob/main/docs/decisions/0034-runtime-replacement-on-upgrade.md).

Desktop also checks GitHub releases and downloads installers after confirmation, validating size and SHA-256. macOS ad-hoc integrity is not notarization. [Distribution and update decision](https://github.com/0vas/hyperion/blob/main/docs/decisions/0031-desktop-integrity-and-updates.md).

::: info What is available
Engine, canvas, persistence and continuation queue are implemented. Resuming a closed chat requires a real installed connector; native connectors remain pending.
:::

<details class="architecture-reference">
<summary>Go deeper: contracts, responsibilities, failures and ArchiMate models</summary>

## What Hyperion does

| Capability               | Implementation                                                 | What the person sees                              |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------- |
| Structure a request      | The agent records the request, plan, jobs and steps            | A shared goal and a navigable path                |
| Guide work and decisions | The engine validates dependencies, roles and responses         | What is ready, who acts and what is missing       |
| Coordinate branches      | BPMN-lite resolves parallel, exclusive and inclusive gateways  | Selected, skipped and pending paths               |
| Carry data forward       | Typed contracts connect context, inputs and outputs            | Where data comes from and what each task produces |
| Expose evidence          | Events, results and public traces accompany each step          | Activity, I/O, failures and attempts              |
| Adapt to a conversation  | Revisions propose future work changes while preserving history | Plan changes requiring review                     |
| Recover continuity       | Persisted responses, retry and a continuation queue            | The actual state of work and agent handoff        |

Autonomous multiagent orchestration remains an extension. Process parallelism already exists; it does not imply that Hyperion selects and starts multiple models itself.

## A concrete journey

> “Use Hyperion to prepare a welcome guide for my project.”

1. **Request → plan.** The harness generates a plan and asks only for missing information. CLI or MCP sends it to the local HTTP service.
2. **Plan → eligible work.** The engine validates structure and dependencies. The canvas displays the same run the agent reads.
3. **Person → output.** The person chooses the audience. The form comes from its contract; known choices are selectable rather than something to guess in free text.
4. **Output → input.** The draft references the selected audience. The agent reads updated data, starts the task and records a real result.
5. **Result → review.** The person reviews the draft. Approval does not publish or send anything unless that work is in scope.
6. **Completion → evidence.** The process retains responses, results, events and attempts to explain how it reached the outcome.

::: info Shared state
The conversation provides intent. The persisted run provides operational state. A “ready” label enables a task; it does not establish that the agent is already executing it.
:::

## Responsibilities and code

| Boundary         | Responsibility                                                           | Source                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External harness | Interpret the request, propose steps, use tools and report results       | [Integration contract](https://github.com/0vas/hyperion/blob/main/docs/integration.md)                                                                                 |
| Adapters         | CLI and MCP share an HTTP client; discovery and local bootstrap          | [src/adapters](https://github.com/0vas/hyperion/tree/main/src/adapters)                                                                                                |
| Local API        | Authenticate identities, distinguish roles and expose commands/reads/SSE | [app.ts](https://github.com/0vas/hyperion/blob/main/src/server/app.ts)                                                                                                 |
| Domain engine    | Transitions, dependencies, gateways, contracts and revisions             | [src/domain](https://github.com/0vas/hyperion/tree/main/src/domain)                                                                                                    |
| Store and queue  | SQLite snapshots, idempotent receipts and durable deliveries             | [store.ts](https://github.com/0vas/hyperion/blob/main/src/server/store.ts), [continuations.ts](https://github.com/0vas/hyperion/blob/main/src/server/continuations.ts) |
| Canvas           | Present state, collect decisions and display step activity               | [src/client](https://github.com/0vas/hyperion/tree/main/src/client)                                                                                                    |
| Desktop          | Host the canvas, start/reuse the service and assist connection setup     | [desktop](https://github.com/0vas/hyperion/tree/main/desktop)                                                                                                          |
| Optional worker  | Claim deliveries and delegate resumption to an installed connector       | [continuation-worker.ts](https://github.com/0vas/hyperion/blob/main/src/adapters/continuation-worker.ts)                                                               |

These are responsibility boundaries, not eight independently deployed microservices.

## Data, contracts and evidence

**Plan → run → steps → attempts and events.** The plan contains the request, context, jobs, dependencies and contracts. The run adds state, revision and results. Jobs group steps and derive progress; they do not duplicate the execution engine.

An input can use a literal, a context key or an earlier task output. The engine validates types and required values. Available context also exposes completed ancestors' results, but does not replace required inputs.

| Data                       | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `plan.request` and context | Retain intent and background                           |
| Typed inputs / outputs     | Define what each step needs and produces               |
| Run revision               | Reject responses based on stale state                  |
| Command ID and receipt     | Prevent duplicate transitions on transport retry       |
| Events and traces          | Record public summaries, actions and observations      |
| Delivery ID and lease      | Coordinate connector handoff and reconcile uncertainty |

SSE updates the canvas; fallback polling recovers changes when needed. Logs reflect what the agent reports. They do not expose private model reasoning or independently verify every external effect.

## Pauses, failures and plan changes

| Situation                                  | Architectural response                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Human input is missing                     | The successor stays blocked; the response and revision must be validated                  |
| The chat keeps a call open                 | Cooperative integration can read the change and continue                                  |
| Suspension and a connector are installed   | The response stores state, receipt and delivery atomically; the worker claims the request |
| The connector acknowledges delivery        | Dispatch is acknowledged; the agent still has to start and report work                    |
| Acknowledgement is lost or a lease expires | Reconcile before resending: a turn may already have started                               |
| A task fails or an attempt remains active  | Retry/recovery preserve evidence; verify external effects before repeating                |
| The goal changes during the conversation   | Future-work revisions retain history and pause for human review                           |

::: warning Current integration boundary
Core 0.5 includes suspension, a durable queue and a generic worker. Native resume connectors remain pending. MCP alone cannot wake a conversation after its turn has ended. See [Pause and resume](../guia/reanudacion.md) for available capabilities.
:::

## Deployment details

**Local machine:** harness → CLI/MCP → loopback HTTP → engine + SQLite. Browser or Electron displays that service's canvas. Presentation processes do not maintain independent workflow engines.

**GitHub Pages:** static documentation, diagrams and simulations. Pages does not run the workflow service or install an agent. The site and runtime have separate release cycles.

**Resume integration:** a trusted local module connects the worker to a real harness session. It is configured outside generated plans and preserves normal host permissions.

Human sessions and agent identities have different permissions. Tokens, session references and local data must not appear in published examples, diagrams or shared logs. The local edition does not include a remote multiuser service with authentication and isolation; connecting a cloud application requires that additional work.

## ArchiMate and decisions

Archify provides interactive exploration. ArchiMate retains formal component and relationship models. BPMN-lite represents executed processes; it neither replaces ArchiMate nor claims full BPMN 2.0 compliance.

<details>
<summary>View formal component and continuation models</summary>

![Implemented components: adapters, API, persistence, engine and canvas](../../../architecture/implemented.svg)

![ArchiMate: human decision, persistent queue, worker and external connector](../../../architecture/continuation.svg)

</details>

[XML models and SVG views](https://github.com/0vas/hyperion/tree/main/docs/architecture) · [Architecture decisions](https://github.com/0vas/hyperion/tree/main/docs/decisions). XML references can be checked; no unperformed XSD validation or formal import is claimed.

## Keeping the architecture verifiable

- **Engine and data:** domain, process, context and form tests verify contracts and paths.
- **Persistence and recovery:** store, HTTP and continuation tests cover restart, duplicates and ambiguous delivery.
- **Experience:** Playwright checks decisions, navigation and simulations. A test connector does not certify a real harness.
- **Documentation:** contract, integration or component changes must update ES/EN guides, diagrams and examples in the same change.

[AGENTS.md](https://github.com/0vas/hyperion/blob/main/AGENTS.md) records the repository map, invariants and documentation update matrix. The [process contract](https://github.com/0vas/hyperion/blob/main/docs/process-contract.md) details the executable format.

</details>

## From deliverable to the next run

In the Archify explorer, open **Data and decisions** to follow a step result into a new cycle.

Artifact registration, its event and receipt commit in one transaction. The coordinator registers the result; the canvas reads it with its session. Bytes remain separate from the snapshot. HTML/SVG preview uses an `iframe` with empty `sandbox=""` (Preview|Source, inert caption); that is not app hosting and not malware protection. The API and domain enforce limits and ownership.

The conversation relationship is stored in `run_links` and projected into both runs. The parent retains its snapshot; the child receives an origin reference and relevant context supplied explicitly by the agent. The visual connection sits outside the executable DAG and neither activates a connector nor reopens finished work. [ADR 0033](https://github.com/0vas/hyperion/blob/main/docs/decisions/0033-artifacts-and-linked-cycles.md). Automatic push of a canvas draft into the host chat remains proposed in [ADR 0036](https://github.com/0vas/hyperion/blob/main/docs/decisions/0036-outbound-host-prompts.md) and is not implemented.
