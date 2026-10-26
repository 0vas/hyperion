# Hyperion protocol v0.4.2

La pausa persistente y el alcance por herramienta se explican en [Reanudación agnóstica](https://github.com/0vas/hyperion/blob/main/docs/continuacion-agnostica.md). La conexión MCP local y la reanudación de un chat cerrado son capacidades distintas.

All requests use the loopback HTTP origin. JSON is validated strictly; unknown fields are rejected. Limits: 100 steps per plan, 128 KiB per request, 8,000 characters per result/log message. Plans are acyclic and contain unique step IDs. Executed/presented steps are immutable; future work can be revised through the guarded command below. Task ports use bounded lists of up to 30 fields.

Version 0.2 preserves legacy DAG plans and adds the optional `bpmn-lite` profile. See the [process contract](process-contract.md) for structured gateways, typed data and public traces.

Version 0.4 adds optional `jobs`/`step.jobId` and human `interaction` (question, context, next). Jobs summarize executable steps; they accept no commands. A typed human submission does not require duplicate free text. See the process contract for validation and compatibility.

## Authentication

CLI/MCP send `Authorization: Bearer <agentToken>`. Each registered integration has its own token; the authenticated identity owns runs it creates. All registered integrations can read local runs, while only the owning coordinator can mutate agent steps. The local browser obtains an HttpOnly, SameSite=Strict session cookie from the same-origin UI. Human and agent operations are distinct. This is a single trusted OS-user deployment; see [the security boundary](../SECURITY.md).

Never commit or include `.hyperion/credentials.json` in a report. The agent integration reads only the agent credential. The data directory is created with owner-only permissions on POSIX systems.

## Routes

| Method | Route                    | Result                                                      |
| ------ | ------------------------ | ----------------------------------------------------------- |
| GET    | `/api/health`            | Health and version, no credentials required                 |
| GET    | `/api/session`           | Bootstrap a local human browser session                     |
| GET    | `/api/connections`       | Human-only configuration inventory and owned-file preflight |
| POST   | `/api/connections/setup` | Human-only explicit setup; returns updated inventory        |
| GET    | `/api/runs`              | Up to 100 most recent snapshots, newest first               |
| POST   | `/api/runs`              | Agent creates `{commandId, plan}`; returns 201              |
| GET    | `/api/runs/:id`          | A complete run snapshot                                     |
| POST   | `/api/runs/:id/commands` | Apply one command atomically                                |

The session bootstrap is protected by exact Host/Origin and Fetch Metadata checks. It assumes trusted local programs and does not establish user identity over the Internet.

## Connection inventory (development source)

`GET /api/connections` requires the human session or human bearer credential: anonymous requests return 401; agent credentials return 403 before inspection. Responses retain `Cache-Control: no-store` and the same Host/Origin checks. Inspection does not register credentials, create connection exports or change client files. Explicit `POST /api/connections/setup` accepts `{client, replace?}` and retains its existing registration, backup and conflict-confirmation behavior; its `inventory` uses the same schema as GET.

Inventory retains `version`, `channel`, `serviceUrl`, `integrations` and `summary`. A row's `configured` status and `summary.configured` mean that the saved entry matches the expected configuration, not that tools are loaded. The additive `runtimePreflight` describes only this installation's generated executable and auto-start launcher:

```json
{
  "scope": "expected_mcp_files",
  "checkedAt": "2026-10-19T04:00:00.000Z",
  "executable": { "code": "readable_file" },
  "launcher": { "code": "missing" },
  "mcpInitialization": "not_checked",
  "toolCall": "not_checked",
  "chatTools": "unknown"
}
```

`checkedAt` is the actual UTC completion time of the filesystem observation; the timestamp above is illustrative. Each file code is one of:

| Code               | Observation under Hyperion's OS identity                                                   |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `readable_file`    | A regular file was opened read-only and its descriptor closed; contents were not read.     |
| `missing`          | The filesystem returned ENOENT or ENOTDIR.                                                 |
| `not_regular_file` | The path or opened descriptor was not a regular file.                                      |
| `read_denied`      | Metadata lookup or read-only open/inspection returned EACCES or EPERM.                     |
| `check_failed`     | Another I/O error, including failure to close the descriptor, prevented a reliable result. |

File failures remain HTTP 200 diagnostics. They neither change configuration status nor authorize replacement. An absent preflight field from an older server means not checked. No raw paths, errors, logs or secrets are added by the preflight. It accepts no client-selected paths or commands, starts no process and makes no network request. Saved conflicting entries and Claude Code's skill are not validated by these shared MCP-file observations.

Readability is a snapshot, not proof of executability, Windows policy/ACL access in Claude, MCP initialization, authentication, a successful tool call or tools enabled in a chat. Those latter fields remain explicitly unverified. The preflight does not repair files or establish why tools were absent on a particular computer. This addition is not yet included in a published installer.

## Plan

```json
{
  "title": "Review a change",
  "description": "Optional context",
  "request": "Use Hyperion to review this change and ask for my approval.",
  "steps": [
    {
      "id": "inspect",
      "title": "Inspect",
      "kind": "agent",
      "dependencies": []
    },
    {
      "id": "choose",
      "title": "Your decision",
      "kind": "approval",
      "dependencies": ["inspect"]
    }
  ]
}
```

`request` is optional for backward compatibility, with a maximum of 8,000 characters. Request-driven clients should always supply the original user request; it remains immutable across plan revisions and is displayed in the UI.

Legacy step kinds: `agent`, `manual`, `approval`. The process profile adds `start`, `end`, `gateway`. Optional step `description` provides instructions. IDs contain letters, numbers, `_` or `-`, max 64 characters. The authenticated agent becomes the coordinator.

## Commands

```json
{
  "commandId": "unique-operation-id",
  "type": "complete",
  "stepId": "inspect",
  "message": "Inspected README and ran npm test: 13 passing tests.",
  "expectedRevision": 2
}
```

`expectedRevision` is mandatory for every human command and optional for agent commands. An outdated revision returns 409. Agent operations still enforce the current step status, dependencies and coordinator identity.

| Command                 | Actor                | Required state/result                                       |
| ----------------------- | -------------------- | ----------------------------------------------------------- |
| start                   | Agent                | Agent step ready, run active                                |
| log                     | Agent                | Agent step running, nonempty message                        |
| complete / fail         | Agent                | Agent step running, nonempty evidence/error                 |
| submit                  | Human                | Manual step waiting, nonempty response                      |
| approve / reject        | Human                | Approval step waiting; rejection needs explanation          |
| retry                   | Human or coordinator | Failed, ready or running agent step; prior history retained |
| pause / resume / cancel | Human                | Run-level command, no step ID                               |

A step waits until **all** dependencies complete. Agent steps then become `ready`; human steps become `waiting`. After all steps complete, the run is `completed`. Rejection and cancellation close the run. They do not undo external effects.

Pausing prevents new starts and human step decisions. In-flight work may still log, fail or complete. A crash can leave a step running; the coordinator must reconcile actual external effects before reporting failure/completion. Never blindly retry a potentially completed external action.

## Idempotency and persistence

The server stores a receipt and updated snapshot in one SQLite transaction. Repeating the same command ID with identical parsed content and actor returns its original response. Reusing an ID for different content/actor returns 409. A failed command does not consume its key. A replayed response may be older than the latest state; use GET to refresh.

The command ID provides request deduplication, not exactly-once external execution. Steps include attempt counts; events retain prior results. Run `revision` increases for each accepted command. Event `sequence` increases per recorded event: a process command may also produce automatic routing events.

## Errors

Errors have `{error, message}`. Common statuses: 400 invalid input, 401 missing credentials, 403 role/host/origin denied, 404 missing run/step, 409 invalid state or revision/idempotency conflict, 413 oversized body, 415 wrong content type. Internal stack traces are not returned to clients.

## Current limits

Snapshots include the full event history and are retained locally without automated expiration. The UI receives committed changes through SSE and polls once per second as a fallback; this implementation targets small local workflows. Large-scale event storage, pagination, remote identity management, cancellation signalling to executors and distributed orchestration need later protocol versions and tests.

## Live receipts

`GET /api/events` is an authenticated, same-origin SSE channel. Use the normal local session cookie or bearer credential; never put credentials in its URL. It sends `snapshot` (recent runs) on connect and `run` (one committed run) after commands, with heartbeat comments. Reconnect recovers the current snapshot, not a replay cursor. Merge by ID and increasing revision; never apply an older idempotent receipt over newer state. The canvas keeps periodic reads as a fallback. Slow clients are disconnected when their queued output exceeds 4 MiB and reconnect to state.

Each run includes read-only `steps[].availableContext`, derived from its request, shared context and completed ancestors. Inputs can explicitly use `contextKey`; see the process contract.

Emit `log` before a material action and after its real observation, including failures, then complete with evidence and typed outputs. While host / computer-use / shell work is expected to run longer than about 30 seconds without a natural checkpoint, emit at least one public heartbeat `log` every about 60 seconds of wall time; chat-only narration is not mirrored progress. On host/OS permission deny, missing entitlement or host/tool timeout, `fail` with a public message—do not leave the step `running` after the turn ends unless an active wait or verified durable suspend is held. The UI streams only submitted events: it cannot intercept arbitrary harness tools, Computer Use panes or private model reasoning. Brief receipt signals mean newly arrived records/data, never an independent agent heartbeat invented by the canvas. Human approval enables a task but does not wake an idle host conversation.

### Orphan running lease (safety net)

When an agent step stays `running`, no coordinator wait is active, no durable continuation owns the turn, and there has been no progress (`start` / `log` / `complete` / `fail` / `artifact`) for that attempt for **180 seconds**, authenticated GET/SSE projections reconcile the attempt to `failed` with a distinct public `abandon` event (`Attempt abandoned: no progress while no agent wait was active.`). Heartbeats within the lease, `agentWaiting`, and in-flight continuation survive. This does not cancel external tools or replace harness `fail`; see [ADR 0035](decisions/0035-orphan-running-lease.md).

## Exceptional plan revision

The coordinator sends `{type: "revise", plan: FULL_REVISED_PLAN, message: REASON, expectedRevision: CURRENT_REVISION, commandId: UNIQUE_ID}` to the existing commands endpoint or CLI `command`. MCP exposes `hyperion_revise_plan` with `reason` instead of `message`. Read the run first; copy only plan/step definition fields, never runtime state, into the plan.

No step may be running. Completed, skipped, previously started (including failed/retried) steps and waiting human decisions must remain unchanged, along with their job definitions. Original `request`, general `context` and `profile` are preserved; supply changed requirements through future task descriptions or literal inputs. The whole plan is validated for contracts, dependency cycles and structured gateways. Resolved gateway definitions cannot be rewritten. At least one future step must remain. Terminal runs cannot be revised.

`planChanges` archives previous/next definitions, revision, actor, reason, and added/removed/changed step IDs. Existing decisions, results and events survive. The resulting run is paused: the human reviews the changes and uses Resume in the canvas; the agent cannot resume or approve for them. There is no silent replacement, rollback of external effects, or automatic replay of completed work. Command IDs retain the usual transactional idempotency semantics, including across restart.

## Event-driven continuation and recovery (0.4.1)

`GET /api/runs/:id/wait?afterRevision=N&timeoutSeconds=30` is an authenticated, coordinator-only long poll, bounded to 55 seconds. Confirmation, retry, pause and other accepted changes return the authoritative snapshot immediately; timeout returns unchanged state and never authorizes work. CLI/MCP `wait` uses this endpoint without snapshot polling. Disconnected requests and timed-out waits release their listeners. Each run allows up to eight concurrent waits.

Read responses include ephemeral `agentWaiting` and `agentPresenceAt` fields for canvas feedback. These represent an active wait, not an installed connector, a model's availability, or a background execution service. They do not increment the workflow revision or persist in SQLite. While `agentWaiting` is true, a human submit/approve notifies wait listeners so the coordinator resumes without a chat nudge; that coordinator must then execute every ready agent step in the same turn. An idle host (wait ended / disconnected) still needs a new turn via **Copiar continuación** or a real `ResumeConnector` send path—MCP alone does not wake a closed chat.

`retry` can re-notify a ready task or recover a running/failed agent task. It keeps completed human decisions and prior logs and enables the task again. It does not stop external tools, reverse effects or bypass dependencies. The canvas asks for confirmation before invalidating a running attempt; the coordinator must reconcile external effects before repeating work.

Each `start` returns the task's `attempt`. Send this number with `complete`, `fail` and `log`. After the first attempt it is required; missing or older attempts return `STALE_ATTEMPT`, so interrupted work cannot overwrite a recovery. CLI shorthand accepts `--attempt NUMBER`; JSON commands and MCP expose `attempt`. Do not replace an old attempt number with a current one to resubmit stale work.

Runtime 0.4.1 requires its matching local service. Restart an older instance before reconnecting; retain its data directory. Previously released 0.4.0 installers do not include this endpoint.

## Attached guided execution (0.4.2)

The portable skill runs `guide PLAN KEY` (legacy skill `create` invocations map to it). It streams a JSON line containing `event: waiting`, the canvas URL and `agentNext`, only when the revision changes, then keeps the shell tool attached across 30-second event waits, up to ten minutes per invocation. The host should use a short initial shell yield, share the URL in a progress message, and poll the running tool. The final JSON line contains the current run, saved input and `agentNext`. The guide re-reads state at its deadline to catch a concurrent answer. If input is still pending, its final `agentNext.action` is `disconnected`; the invocation is over and does not own a wait. The host executes eligible tasks; the adapter never performs or fabricates that work.

Use `follow RUN_ID` when a later human decision becomes available when explicitly reconnecting a disconnected chat. Do not renew unchanged expired sessions indefinitely. Pause, cancellation, completion, running work or ready agent tasks return control to the host immediately. Timeouts never authorize work. Killing the portable wrapper forwards the signal to its child so it cannot leave a false connected wait. This is an attached host tool, not a background executor or a mechanism for waking closed chats.

Direct CLI `create` remains nonblocking for programmatic clients. CLI and MCP run responses include `agentNext` with the next action and, for human waits, the exact wait arguments. MCP hosts show the URL and call `hyperion_wait`, renewing short timeouts within a bounded waiting period (at most ten minutes), without repeated unchanged reminders. This guidance is not a guarantee that an arbitrary host will follow it.

New plan creation and revised forms reject `CHOICES_REQUIRE_OPTIONS` when a human string field lists options using an imperative comma-separated Spanish/English sentence (for example “Escribe A, B o C”) without `form.options`. Write/enter instructions additionally require a selection title. This is a bounded authoring guard, not general language understanding or a product catalog. It does not infer option values from prose, mutate existing plans or rewrite previous responses. Use structured options; “Otro” / “Necesito ayuda” may lead to an optional text field or a subsequent question.

## Step artifacts

`POST /api/runs/:id/artifacts` registers one real result, using the coordinator's agent credential:

```json
{
  "commandId": "attach-report-1",
  "stepId": "inspect",
  "attempt": 1,
  "name": "report.md",
  "mediaType": "text/markdown",
  "contentBase64": "IyBSZXBvcnQK"
}
```

Supply exactly one `contentBase64` or `url` (HTTP/HTTPS without credentials). `expectedRevision` is optional; `attempt` is required and must match the attempt that produced the file. The agent step must be running or completed and the run active, paused or completed. Registering late evidence on a completed run appends metadata and an event; it does not reopen execution or change its result. Cancelled/rejected runs reject additions. Each step supports 100 artifacts, each uploaded file up to 10 MiB. Only this endpoint accepts a request body up to 14 MiB to accommodate base64; normal endpoints retain 128 KiB.

The response is the updated run. `steps[].artifacts[]` contains immutable `id`, `name`, `mediaType`, `createdAt`, `attempt`, and either `url` or `size`/`sha256`. Bytes are stored separately in SQLite; snapshots, receipts and SSE contain metadata only. Replaying an identical command returns its original receipt; changing the content with the same ID fails. Retry retains prior artifacts and rejects late uploads from a stale attempt.

`GET /api/runs/:id/artifacts/:artifactId` requires the existing human session or agent credential. It returns that run's stored file with its download filename. The endpoint accepts no filesystem path. Raster images support `?preview=1`; HTML, SVG and other active formats are served as attachments with sandbox CSP (never as same-origin documents). The canvas shows small plain text as escaped text, raster images inline, and `text/html` / `image/svg+xml` in a sandboxed `iframe` (`srcDoc`, empty `sandbox`) with a Preview/Source toggle and an inert-preview caption under Preview—uploaded scripts stay inert and the layout may differ from a full browser. Remote links open separately and are not fetched by the server. An artifact is evidence, not a substitute for a required typed output.

## A completed run can precede a new cycle

An agent creates a linked run with `POST /api/runs` using `{commandId, plan, parentRunId}`. The parent must be completed and `plan.request` must contain the user's new request. Supply a new plan and only the relevant context after reading the parent; context is not silently copied. This operation never resumes or revises the completed run, never infers a new request from a timeout, and does not wake an external chat by itself.

The child records immutable `origin: {runId, revision, title}`. The parent's snapshot, revision and events remain unchanged. SQLite records the relationship atomically with the child and receipt. Each parent supports up to 32 direct continuations. Read responses project `links.previous` and `links.next[]`, each with `id`, `title`, `status` and `request`. SSE refreshes these links without inventing a parent revision. These navigation links sit outside the executable DAG: the canvas connects the prior end to the new start, and both runs retain independent states and coordinators.

Included in Desktop **2026.10.26.1533 UTC · Preview**. Older installers require an update to provide these endpoints. Phase 0 UI keeps **Copiar petición para el chat** and hides **Enviar** until a host-configured send/`ResumeConnector` path exists — MCP alone does not wake a closed chat. Linked-cycle canvas drafts are not auto-pushed.

## Outbound host prompts (ADR 0036 PR1)

A dedicated outbox delivers human-authored **continuation** text to a trusted local send/resume connector. It is separate from ADR 0022 human-answer continuations: enqueue persists prompt text for a host turn; it does not invent answers or complete steps. Delivery acknowledgement is not task execution.

PR1 ships `kind: continuation_prompt` only (`linked_cycle_prompt` is later). Human or run coordinator enqueues; only the coordinator agent claims and settles. Public projections (`outboundPrompt` on GET/SSE) omit `sessionId`.

| Method | Route                              | Result                                                                                                        |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/runs/:id/outbound-prompts`   | Enqueue `{expectedRevision, commandId, text, connector, kind?}`; returns the run with public `outboundPrompt` |
| POST   | `/api/outbound-prompts/pending`    | `{connectorId}` → uncertain deliveries for reconciliation                                                     |
| POST   | `/api/outbound-prompts/claim`      | `{connectorId}` → one leased delivery (includes session for trusted connector code) or `null`                 |
| POST   | `/api/outbound-prompts/:id/settle` | `{leaseToken, outcome, reconciled?, message?}` → public outbox state                                          |

Idempotent `commandId` replays the same receipt; a different payload with the same id fails. Lease expiry becomes `uncertain` and requires `reconciled: true` before settle. Outstanding queued/leased/uncertain jobs block another enqueue. Canvas **Enviar** (continuation wake) calls this enqueue only when the host supplies a `connectorSchema`-valid ResumeConnector matching the run harness (`window.hyperionDesktop.resumeConnector`); otherwise Copiar stays primary and Enviar stays hidden. Delivery acknowledgement is not task execution. Linked-cycle **Enviar** and native provider connectors remain later. See [ADR 0036](decisions/0036-outbound-host-prompts.md).
