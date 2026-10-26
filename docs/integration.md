# Agent integration

La pausa persistente y el alcance por herramienta se explican en [Reanudación agnóstica](continuacion-agnostica.md). La conexión MCP local y la reanudación de un chat cerrado son capacidades distintas.

Hyperion runs separately from the agent and owns workflow state. The agent proposes a plan, claims ready work, performs it with its own tools, and reports evidence. The human participates through the web interface.

For setup in Codex, Claude Code, Claude Desktop, Cursor, Google Antigravity and other local clients, follow the [connection guide](conexion.md). **Claude Code** is the documented happy path when agent work needs local files or a project shell: Desktop Conexiones installs the skill, register MCP, verify with `/mcp`, share the canvas URL (no native Hyperion pane), and keep human Q&A on the canvas. Claude Desktop remains valid for chat-side MCP but does not open a native Hyperion pane and is not the preferred path for folder/shell work. The user starts with a natural-language request; the host agent generates the plan and includes its original text in `plan.request`. Do not ask the user to author JSON.

### Host comparison (local)

| Host           | Strength for Hyperion work                         | Hyperion UI                                 | Human decisions   | After a handoff                                                     |
| -------------- | -------------------------------------------------- | ------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| Claude Code    | Local files and shell in the project               | Canvas URL in browser or Desktop only       | Canvas forms only | `hyperion_wait` / durable suspend, or paste **Copiar continuación** |
| Claude Desktop | Chat MCP + skill; OS permissions may block folders | Browse/URL only—**no** native Hyperion pane | Canvas forms only | Same; ending the turn without wait leaves ready work idle           |
| Codex / Cursor | MCP or portable skill with local shell             | Canvas URL only                             | Canvas forms only | Active wait or continuation paste                                   |

Never claim the host embedded Hyperion automatically. Listing tools or `/mcp` connected does not prove a prior chat already loaded them—use a new session and a read-only `hyperion_list_runs` when unsure.

## Minimal user request

“Use Hyperion to prepare a welcome guide for my project” is sufficient. The user specifies the outcome; the integration owns planning, task contracts, progress logs and handoffs. Read available conversation/project context before creating the plan. **Hard rule (MCP Hyperion):** once any `hyperion_*` tool is used—or those tools are loaded and the user invokes Hyperion—do **not** collect activity scope, paths, choices, approvals or clarifying Q&A in the chat. Encode every missing material fact as a manual/approval step with typed outputs (`form.options` for known choices) in `create_run` / `revise_plan`, share the canvas URL, then `hyperion_wait` (or a verified durable suspend). Read answers only from the run after wait/revision.

Allowed in chat: the canvas URL / how to open it; short progress; public summaries of evidence already logged; which existing run to resume when ambiguous; the objective only when Hyperion was invoked with zero activity (then create immediately with discovery as human steps if still vague). Forbidden in chat: “Which folders?”, path/root choices, yes/no that belong on forms, typing an option that should be `form.options`, collecting answers to paste into submit/complete, or parallel clarifying threads while the canvas waits.

Do not require users to prescribe steps, repeat I/O/logging instructions, or include an artificial wait in their prompt. Generating a draft does not imply publishing or sending it. The cooperative host-resume limitation must be explained when a handoff occurs, not encoded as part of the user's goal.

## No prior context

Acceptance criteria: a host can start from an activity with no conversation history, repository or general context; missing facts become relevant manual inputs; explicit run identity recovers persisted state; unrelated runs never become implicit context.

Business input is the user's activity plus optional supporting context. Treat absent context as unknown, not as permission to infer the project from Hyperion's own repository or another run. Generate a small discovery phase of canvas human steps only when material facts are missing; wire its typed outputs into downstream tasks—never a chat questionnaire that replaces Hyperion. Do not ask the user to specify protocol mechanics. If there is no objective, ask once for it before constructing task-specific work, then create the run with remaining discovery on the canvas.

A fresh chat resumes by run ID/link and reads the stored state. Distinguish this from a new activity; ask when the target run is ambiguous. A local integration can discover its runtime/service without depending on the calling workspace.

Current responsibility boundary: a connected host agent produces the full plan for `create_run`; the HTTP/MCP server validates and stores it. It is not a natural-language planning endpoint. An external application without an agent needs a planning/execution adapter. Lack of prior business context is supported; automatic installation, remote access and universal recognition of the word “Hyperion” are not implied.

Validation uses the installed portable runner from an empty temporary workspace, an arbitrary integration identity and no general context, alongside an unrelated stored run. A subsequent CLI process recovers the correct result by run ID. This validates transport/state isolation, not autonomous LLM interpretation of an unseen prompt.

## Portable invocation

Prefer `hyperion install` for local agents supporting Agent Skills and shell access. The installed skill recognizes requests to use Hyperion and launches the same compiled CLI independently of vendor MCP settings. Its script pins the runtime/data paths; `--agent ID` registers a caller without a vendor allowlist. The CLI starts or reuses the authenticated local server automatically. A standalone npm archive includes production assets; no source checkout is needed at runtime. See [the connection guide](conexion.md) for the one-time installation and host-discovery limits.

## This Codex conversation

Use the repository CLI. New MCP configuration does not automatically inject tools into an already running conversation.

1. Read `npm run hyperion -- --help`.
2. Generate a JSON plan from the user’s request using the [protocol](protocol.md) and create it with `npm run hyperion -- create PLAN.json UNIQUE_REQUEST_ID`.
3. Show the returned URL to the user.
4. Read `get RUN_ID`. Start only agent steps whose status is `ready` while the run is `active`.
5. Execute real work. Report progress with `log`; report an actual result with `complete`, or a failure with `fail`.
6. For `manual` and `approval` steps, wait for the user's action in the browser. Never submit or approve on the user's behalf.
7. Show the URL in a progress message and use `wait RUN_ID REVISION 30` (or MCP `hyperion_wait`) before ending the turn. On a revision change, read the human decision and continue ready work in this same turn. Ending the turn without an active wait leaves ready agent tasks idle in the canvas (Claude Desktop and similar hosts do not resume by themselves). A timeout is not approval. If ending the turn, explain that the idle chat needs the canvas continuation message; do not promise automatic wakeups.
8. If the run is cancelled or rejected, stop scheduling. Respect pauses. A pause permits reporting the result of work already started.

Independent ready steps may be active together. Only do this when the underlying actions are genuinely independent. A running indicator means a start was recorded; it does not prove the external agent is still alive.

## MCP stdio

Recommended: `npm run hyperion -- setup codex` (or `claude` / `cursor`) configures the adapter and local startup on demand. Reload tools or open a new client session. For structured gateways, typed outputs and public traces, follow the [process contract](process-contract.md).

Manual alternative: build and start the HTTP server first. Run `npm run hyperion -- connect CLIENT_ID` to register an identity and generate an absolute-path MCP configuration without credentials. Register the adapter in a compatible MCP client:

```json
{
  "mcpServers": {
    "hyperion": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/hyperion/dist/adapters/mcp.js"],
      "env": {
        "HYPERION_AGENT_ID": "codex",
        "HYPERION_DATA_DIR": "/absolute/path/to/hyperion/.hyperion",
        "HYPERION_URL": "http://127.0.0.1:4317"
      }
    }
  }
}
```

Clients have different configuration locations. The example defines the portable command and environment, not a universal configuration file path.

For Codex, the CLI supports registering stdio servers:

```sh
codex mcp add hyperion \
  --env HYPERION_AGENT_ID=codex \
  --env HYPERION_DATA_DIR=/absolute/path/to/hyperion/.hyperion \
  --env HYPERION_URL=http://127.0.0.1:4317 \
  -- node /absolute/path/to/hyperion/dist/adapters/mcp.js
```

Verify with `codex mcp get hyperion` and use a session in which the tools are loaded. This command changes your local Codex MCP configuration; it is an optional setup step, not part of the server startup. Documentation: [official OpenAI MCP guidance](https://developers.openai.com/codex/mcp).

| Tool                   | Behavior                                                        |
| ---------------------- | --------------------------------------------------------------- |
| `hyperion_create_run`  | Validate and persist a plan; return a browser URL               |
| `hyperion_list_runs`   | Read recent executions                                          |
| `hyperion_get_run`     | Read state, decisions, results and history                      |
| `hyperion_step`        | `start`, `log`, `complete`, `fail`, or `retry` an agent step    |
| `hyperion_revise_plan` | Revise future work, preserve history and pause for human review |
| `hyperion_wait`        | Wait up to 55 seconds for a revision change                     |

Create/step tools require `commandId`. Reuse it when retrying a transport request with the same content. A different action or changed content requires a new ID. The MCP server intentionally exposes no human approval tool. It uses the same HTTP contract as the CLI, with no direct access to the database.

## What connection diagnostics establish

In development source, the human-only connection inventory separates saved configuration from an owned-file preflight. Configured means the entry matches the expected connection. The file check only indicates whether Hyperion can open this installation's executable and launcher as regular files for reading. Inspection does not register credentials or create exports; explicit setup still does. Missing files and permission failures have distinct results; an unknown result does not prove failure. These diagnostics are not yet included in a published installer.

The check does not execute saved commands, start MCP, read logs or confirm that Claude loaded tools. MCP initialization and a tool call remain not checked; tools in the current chat remain unknown. Claude Desktop's bundled-runtime connection does not require Claude Code or a separately installed Node. If tools remain absent after restarting, inspect the actual Hyperion server status in Claude and the configuration location opened by Claude's own Edit Config. Use only a short sanitized startup error when needed; do not share credentials or full logs. Do not infer account-plan restrictions from missing tools alone. Recheck after correcting a confirmed installation problem; reinstall/update is a separate human action.

## Other providers and environments

An agent with HTTP or shell access can use the same protocol. MCP support alone does not guarantee that an agent can remain alive waiting for a decision or wake a conversation. Document those capabilities per integration. A remote/cloud agent cannot reach `127.0.0.1` on your laptop; remote access is outside this release.

Set `HYPERION_AGENT_ID` to a registered identity when using CLI/MCP. Each identity has its own credential and can coexist in the same data directory; registration preserves existing credentials and is picked up by the running server. A run retains its original coordinator. Identities share read access within this trusted local deployment, but cannot mutate another coordinator’s agent steps. These are integration identities, not an isolation boundary against programs running as the same OS user.

## User-selected presentation

MCP offers `hyperion_open` with `runId` and `presentation: split|desktop`, including hosts without shell access. `hyperion open RUN_ID split` returns the existing browser URL only; Claude Desktop has no native Hyperion pane. After returning the URL, instruct opening it in the host Browse/split side panel (or an external browser if loopback Browse fails) so the pane is not left blank—never claim the chat UI opened Hyperion automatically. `hyperion open RUN_ID desktop` authenticates that run and launches the Desktop executable registered by its first launch, with explicit argument arrays (no shell). Presentation changes never create a run. The same loopback service and data directory back both views. Desktop intentionally refuses switching to a different service while a window is open.

While an agent step you started is `running` and you perform host / computer-use / shell work, emit public `hyperion_step` `log` events: before the first material action, after each material observation, and at least one heartbeat every ~60s during long work (>~30s). Chat-only narration is not mirrored progress; Hyperion does not scrape Computer Use UIs. Always send the `attempt` from `start` on every log/fail/complete. As a safety net, Hyperion may auto-fail an orphan `running` attempt after 180s without progress when no wait or durable continuation owns the turn (distinct `abandon` event); do not rely on that instead of logging or failing yourself.

If host/OS permission, a missing entitlement or a host/tool timeout blocks agent work, the harness must `hyperion_step` with `action: fail` and a public message naming the block before ending the turn. A log alone is not enough; do not leave a started step `running` without an active `hyperion_wait` or verified durable suspend. After fail, share the canvas URL and Copiar continuación; the human uses Reintentar once access is fixed or the tool can be retried, or Recuperar tarea if a step is still marked running.

The executable registration is local to the current user (`~/.hyperion/desktop.json`); it contains paths, not agent credentials. A development installation can override its home using `HYPERION_HOME`. Desktop includes Electron's Node runtime to start the service when absent. Closing the client preserves the service for chat/split continuation.

## When the conversation changes the remaining plan

Use revision only for an explicit change in the user's activity. Read current state, finish any in-flight task, preserve executed/presented definitions and send `hyperion_revise_plan` (MCP) or a `revise` command (CLI/HTTP). Include the complete plan, latest revision and reason. The run pauses for the person to review the diff and resume. Continue in that same run after their next message. Never replan to bypass a human decision, rewrite evidence or silently recover from an execution failure; use retry for failures. See [protocol](protocol.md#exceptional-plan-revision).

## Register the generated deliverables

When an agent step produces a file, register it so the person can access it from that step. Keep the attempt returned by `start`:

```sh
hyperion artifact RUN_ID inspect /absolute/path/report.md --attempt 1 attach-report-1
```

MCP clients use the same provider-independent contract:

```json
{
  "tool": "hyperion_add_artifact",
  "arguments": {
    "runId": "RUN_ID",
    "stepId": "inspect",
    "attempt": 1,
    "commandId": "attach-report-1",
    "filePath": "/absolute/path/report.md"
  }
}
```

Use exactly one `filePath`, `text` or `url`; inline text and remote links also require `name`. For example `text: "# Report\nVerified results", name: "report.md", mediaType: "text/markdown"`. File paths must be absolute and belong to files accessible to the connected local runtime. A cloud integration can send inline text or an HTTP(S) link to an existing artifact; do not invent a local file path or publicly expose the local server. The upload limit is 10 MiB. Publish typed outputs and real logs separately. Register only deliverables relevant to the request, never credentials or unrelated files.

## Continue after a completed process

When the user continues the conversation with a new objective, read the completed run, carry its relevant results into a new plan, and link it:

```sh
hyperion create /absolute/path/next-plan.json new-user-request-id --from COMPLETED_RUN_ID
```

The portable skill's `guide` command accepts the same `--from` flag. MCP uses `hyperion_create_run` with `parentRunId`, `commandId` and the new `plan`. See [the sample plan](../examples/continue-guide.json). The new request must be real, not inferred from completion or elapsed time. The previous run remains completed; each canvas links to the other. This is separate from retrying an attempt or reconnecting a suspended chat. No provider gets automatic wakeup merely by supporting MCP.

These artifact and cycle APIs ship in the **2026.10.12.1722 UTC · Preview** installers. Reconnect the harness after updating Desktop so it can load the new tools.

## Upgrading the local runtime

From 2026.10.12.2101, Desktop, CLI and MCP share a launcher that automatically replaces an older authenticated server from the same installation. It checks the listening PID, OS owner and exact server command, creates an integrity-checked SQLite backup, serializes concurrent launches, then reuses the original data directory and credentials. Other installations, unknown processes, failed authentication/backups and newer servers are never terminated. Existing clients reconnect; an interrupted request retries with its original command ID. This restarts the service, not workflow tasks or an idle conversation. No provider-specific wakeup capability is added.

In development source, the MCP launcher uses the authenticated service URL returned by startup. If another Hyperion instance rejects this installation's credentials at the requested loopback address, startup can select another local port; subsequent MCP calls use that address without changing the saved client configuration or stopping the foreign instance. An authenticated existing service and a free explicit port retain their requested URL. This correction is not yet included in a published installer. Successful MCP initialization and tool discovery must be followed by a successful tool call; neither confirms that a particular chat has loaded the tools.

After Desktop **Actualizar y reiniciar**, the next boot may refresh Hyperion MCP entries that belong to _this_ installation and only conflict because the update changed command/args/paths (with file backup). Foreign or unknown conflicts still require the Connections Resolver; ordinary cold starts do not auto-replace.
