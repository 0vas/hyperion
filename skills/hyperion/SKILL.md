---
name: hyperion
description: Use Hyperion when the user says “usa Hyperion”, “quiero usar Hyperion”, or asks to guide an activity through its visual workflow. Start or resume the local canvas, generate the process from the request, and report real progress with human decisions in the canvas.
license: MIT
---

# Hyperion

Requires local shell access with Node.js 22.13+ or the bundled Desktop runtime, or an already connected Hyperion MCP server.

The user describes the activity in their chat. You construct and advance its visual workflow. Preserve their scope and original request. Hyperion is independent of the model or agent vendor.

## Claude Code setup (happy path for local files/shell)

When the user works in **Claude Code** (especially with local folders, scripts or shell):

1. Prefer Hyperion Desktop → **Conectar con mi IA → Claude Code** so the skill lands in `~/.claude/skills/hyperion` on the Desktop runtime. Desktop Conexiones for Code installs the **skill only**—MCP `hyperion_*` tools still need a separate `claude mcp add` / `setup claude` using this installation’s absolute MCP launcher paths.
2. In a **new** Claude Code session for the work project, run **`/mcp`** and confirm `hyperion` is connected (or invoke this skill). Verify with a read-only `hyperion_list_runs` before claiming tools work in this chat.
3. On “Usa Hyperion” / “Use Hyperion”, call `hyperion_create_run` (or resume) first. Share the **canvas URL**; open it in a browser or Hyperion Desktop. **Do not** claim Claude Code opened a native Hyperion pane.
4. Keep all human Q&A on the canvas. After handoff, hold `hyperion_wait` (or verified durable suspend) in the same turn; if the turn already ended, tell the user to paste **Copiar continuación**.

Claude Desktop is a different host: MCP+skill there still has no native Hyperion pane, and it is not the preferred path for project file/shell work. Canvas owns decisions on every host.

## Start from a request

When the user says **Usa Hyperion**, **Use Hyperion**, **quiero usar Hyperion**, or asks to guide an activity through Hyperion, **call Hyperion first**. With MCP: invoke `hyperion_create_run` (or `hyperion_list_runs` / `hyperion_get_run` to resume) before answering in free text. **Never** claim a missing filesystem, Cowork, Browser or other connector instead of Hyperion when `hyperion_*` tools are loaded in this chat. Do not regenerate an old non-Hyperion thread as a substitute for creating or continuing a run.

### Hard rule: canvas owns all questions (MCP Hyperion)

Once any `hyperion_*` tool is used in this chat, or the user says Use Hyperion / Usa Hyperion / quiero usar Hyperion while `hyperion_*` tools are loaded:

- Do **NOT** collect activity scope, paths, choices, approvals, or clarifying Q&A in the chat.
- Encode every missing material fact as a `kind: manual` (or approval) step with typed outputs (`form.options` for known choices) in `hyperion_create_run` or `hyperion_revise_plan`.
- Share the canvas URL, open presentation if requested, then `hyperion_wait` (or verified durable suspend). Read answers only from the run after wait/revision.
- Never treat a chat reply as a substitute for a canvas form, and never ask the same question in chat after a human step is waiting.

**Allowed in chat:** canvas URL / how to open it; short progress (“waiting in Hyperion”, “scanning…”); public summaries of evidence already logged; which existing run to resume when ambiguous; the objective only when the user invoked Hyperion with zero activity (then `create_run` immediately with discovery as human steps if still vague).

**Forbidden in chat:** “Which folders?”, path/root choices, yes/no that belong on forms, typing an option that should be `form.options`, collecting answers to paste into submit/complete, parallel clarifying threads while the canvas waits.

Use loaded `hyperion_*` MCP tools when available. Otherwise run the script next to this skill:

```sh
node /absolute/path/to/this/skill/scripts/hyperion.mjs --agent YOUR_AGENT_ID up
```

Use a stable lowercase identity for your tool (for example `codex`, `chatgpt`, `claude`, `claude-code`, `cursor`, `hermes`, `antigravity`, or another ID). The script starts/reuses the local service, registers that identity and returns the canvas URL. No API key, manual server startup or MCP configuration is needed. The launcher automatically backs up and replaces an older authenticated service from this same installation. An unrelated process, different installation, credential mismatch or newer server is left untouched; resolve that conflict without deleting workflow data.

For MCP, use the URL returned by the tools rather than assuming port 4317. The development-source MCP launcher follows startup's authenticated alternate loopback URL when another Hyperion instance occupies the requested address, preserving the saved client configuration and foreign service. This correction is not yet in a published installer. A saved configuration or successful tool listing alone does not prove tool calls work in the current chat; verify a read-only call such as `hyperion_list_runs` before claiming the connection works.

The development-source human Connections inventory can check whether Hyperion can read its own generated executable and launcher files. Configured means the saved entry matches; readable files do not prove MCP startup, tool calls or tools loaded in this chat. Missing files and permission failures are specific observations; other I/O failures remain unknown. Inspection does not execute saved commands, read logs, register credentials or repair files. These diagnostics are not yet in a published installer. Claude Desktop's bundled-runtime connection does not require Claude Code or a separate Node installation. If tools are absent after a restart, use Claude's actual server status and Edit Config location to diagnose; do not invent an account-plan restriction, repeat blind restarts or expose the local service. Request only sanitized evidence, never credentials or full logs.

Read [the protocol](references/protocol.md) for commands and [the process contract](references/process-contract.md) for gates, typed I/O and public traces. Generate a plan specific to the request, write it to a temporary JSON file, then run:

```sh
node /absolute/path/to/this/skill/scripts/hyperion.mjs --agent YOUR_AGENT_ID guide /absolute/path/plan.json UNIQUE_REQUEST_ID
```

Always preserve the original text in `plan.request`. Prefer `bpmn-lite` for process flows: start/end, structured split/join blocks only when meaningful, typed task ports and short clear phase names. Do not substitute a canned example for the requested activity. The guide streams a `waiting` event with the URL once per changed revision and keeps the tool invocation alive for a bounded wait of up to ten minutes. A waiting tool is not delayed creation: the flow already exists as soon as its URL is returned. Use a short shell yield (about 1 second), share that URL in commentary, and poll the running tool until it returns. The final result includes `agentNext`: execute ready work immediately. If it says `disconnected`, the bounded wait ended and there is no automatic wakeup; report that once and end the turn. Do not repeatedly invoke `follow` on the same unchanged question. Read the latest run before reporting whether an answer is still pending. The portable script also maps legacy `create` calls to this guided mode. The agent writes JSON; the user does not. Do not give installation commands as the daily usage path when this skill is already available. Connect the service yourself, create the flow, and return its link.

Group a multi-stage activity with `jobs: [{id, title, description?}]` and assign steps using `jobId`. Each step is independently executable with its own evidence and I/O; a job only summarizes them. Keep each job contiguous in the dependency graph (no reentry after leaving it). Group internal gateways with their job when needed. The canvas can show jobs or their steps.

For human steps, declare `interaction: {question, context, next}`: the exact decision, why it matters, and what follows. Use clear output descriptions as field labels. New plans are rejected when a field lists choices as an imperative comma-separated sentence but omits options. Fix the plan yourself; do not ask the user to repair it. For known choices, declare a string output with `form.options: [{value, label}]` so the canvas renders a dropdown without a preselected answer. If “Otro” or “No sé” is meaningful, include it as an option and collect any needed detail in an optional field or a subsequent step; never replace the whole selection with a textarea. Use booleans for yes/no and free text only for open answers. Prefer simple fields for nontechnical users; do not make them author JSON. Typed fields are the response: do not ask for the same information again in free text. When a required input binds `source: {stepId, output}`, mark that producer output `required: true` as well (create promotes it if you omit the flag). Do not add artificial approvals or choices unrelated to the request. Generate the guided questions from the prompt and known context; never ask the person to fill generic technical fields such as `detail` or `preview`. Drafts and previews are agent-produced results to review, not required user inputs.

## Start without prior context

A new chat, empty workspace or external connected application may supply only an activity. Prior conversation, repository files and `plan.context` are optional. Use the request itself as the starting point; never assume “my project” means Hyperion, Olimpo, the current directory or a project from another stored run.

When a material fact is missing, generate the relevant manual discovery step in the canvas and connect its typed answers to the dependent work—**never** a chat clarifying sequence that replaces the canvas (see hard rule above). Do not require a technical brief, prescribed workflow, logging instructions or an artificial pause in the user's prompt. If the request already provides enough information, proceed without a discovery form. If no activity was provided at all, ask once for the objective in chat only when Hyperion was invoked with zero activity, then create the run immediately with any remaining discovery as human steps.

For a continuation in a fresh chat, recover state from the provided run ID/link. If the intended run is ambiguous, ask which one to resume. Do not import another run's context as a default. Runtime/service access comes from the integration, independently of business context; a missing connection is not a request for project information.

## Execute and resume

If a trusted installed connector supplies a real session reference and declares durable resume and idempotent delivery, use `hyperion_suspend` (or `suspend RUN_ID suspension.json`) at a human checkpoint with the current revision. Then share the canvas URL and end the turn: the connector owns resumption. Never invent a connector, session ID or capability. `agentNext.action=suspended` means no long poll is needed. Re-arm at each subsequent human checkpoint. A queued request is not delivery; delivery is not execution. This release supplies the common queue/worker contract, not native wakeup connectors for every brand. ChatGPT requires a separately deployed authenticated remote integration; local stdio is not accessible from its cloud, and ChatGPT Work mode is not a Hyperion requirement. Without a real connector use the cooperative path below.

Use `get RUN_ID` to read current state and decisions. For an existing run use its coordinator identity; do not create a replacement run on every continuation. When `agentNext.action` is `execute` (or the run shows ready agent steps), start and finish **all** ready agent `stepIds` in this same turn—do not pick one and ask the human to type “listo” / “continúa” for the rest. Execute their actual work with your own tools, and send evidence. Use `command RUN_ID /absolute/path/command.json` for typed outputs and structured logs. Reuse an action's commandId only on transport retries with identical content. Keep the `attempt` returned by `start` and include it in every `complete`, `fail` and `log` command (CLI shorthand: `--attempt NUMBER`). It is required after a retry. Never look up a newer attempt to attach old work to it; a stale-attempt error means stop reporting that execution.

### Hard rule: mirror host progress into Hyperion logs

While an agent step you `start`ed is `running` and you perform host / computer-use / shell work, emit public `hyperion_step` `log` events into Hyperion—do **not** keep progress only in chat. Chat narration without a submitted log does **not** count. Hyperion does not scrape Computer Use UIs or inject logs automatically.

Minimum cadence:

1. **Before** the first material host action (grant folder, run script, open path): one `log` (`trace.kind` `action` or `summary`) naming the intent.
2. **After** each material observation (access granted/denied, script started, batch progress, partial count): at least one `log` (`observation` or `action`).
3. For work expected to last **>~30s** without a natural checkpoint: a heartbeat `log` at least every **~60s** of wall time while still working (public one-liner, e.g. “still scanning… N folders”).

Always send the `attempt` returned by `start` on every `log`, `fail` and `complete`.

### Hard rule: permission blocks and host timeouts must fail the step

Before ending a turn that started an agent step:

- If work is blocked by host/OS permission, missing entitlement, **host/tool timeout**, or any condition you cannot clear without the human changing system settings: you **MUST** `hyperion_step` with `action: fail` (or `complete` only if declared outputs are fully satisfied—rare) with a public message naming the block (e.g. Documents access denied, host tool timed out). A **log alone is not enough**.
- Do **NOT** end the chat while any agent step you started remains `running` unless you still hold an active `hyperion_wait` / durable `suspend` for this run.
- After fail, share the canvas URL and **Copiar continuación** guidance; the human uses **Reintentar** after fixing permission or retrying, or **Recuperar tarea** if a step is somehow still running.
- Never invent a successful scan/`complete` when access was denied or the host timed out.

Safety net (do not rely on it): if a step you started stays `running` with no active wait/suspend and no progress for ~180s, Hyperion may auto-fail it with a public `abandon` event on GET/SSE. Keep heartbeats and fail yourself first.

Logs may contain public summaries, actions and observations. Do not expose or request private chain-of-thought. Hyperion only displays the events you submit; it does not intercept your tools. Parallel gates make work eligible together; report simultaneous execution only when it actually happened. Adapter diagnostics for create rejects, wait arm/expiry and missing resume connectors append JSONL to `.hyperion/harness.log` (gitignored; separate from `server.log`). Inspect that file locally when a harness stalls; never paste credentials or full plans from it into chat.

Manual responses and approvals happen in the canvas. Never submit or approve for the person. Provide the URL and waiting step in a progress message, then use `hyperion_wait` (MCP) or `wait RUN_ID REVISION 30` (CLI) while the person answers. This subscribes to server events; confirmations and retry requests deliver the updated state immediately (`agentWaiting` true → canvas submit/approve resumes the wait without a chat nudge). The canvas shows whether this wait is active. **After every human handoff, keep an active wait in the same turn:** if you end the turn without `hyperion_wait`/`wait` (or a verified durable connector suspension), Claude Desktop and similar hosts will not resume when the person saves an answer—the canvas then shows ready agent work as “Waiting for the agent” with no automatic wakeup. When the revision changes, read the decision and execute **all** ready agent steps in this same turn; do not demand an extra chat message (“listo”, “continúa”, etc.) if you already received the answer via wait. Do not leave ready agent tasks idle because the chat already shared a URL. When disconnected, the human uses **Copiar continuación** (one prompt naming every ready `stepId`); **Enviar** stays off unless a real host `ResumeConnector` is configured—MCP alone does not wake a closed chat. Waits are bounded: a timeout is neither approval nor a failure. After completing agent work that enables another human step, use `follow RUN_ID` (CLI) or repeat `hyperion_wait` (MCP). Renew short MCP waits only within a single bounded waiting period of at most ten minutes. A guide timeout or host interruption ends that period; do not start another unchanged waiting period automatically. Report actual changes rather than repeated reminders that the same choice is pending. Before a final handoff read the latest run; if an answer arrived, execute ready work instead of claiming the choice is still missing. Explain once when the chat is disconnected. End waiting when the process is paused, cancelled, completed or the user asks to stop. Without a real resumable connector, never promise background wakeups; an idle host requires a new message. Respect pause, cancellation, rejection and the user's explicit instructions.

If only “quiero usar Hyperion” is given without an activity, start the canvas and ask what activity they want to guide. Do not invent a task.

## Presentation chosen in the chat

Keep the same run when the user switches presentation. With MCP, use `hyperion_open({runId, presentation: "split" | "desktop"})` (CLI: `open RUN_ID split|desktop`).

When the user asks for **split / side-by-side / Browse** with Hyperion:

1. Call `hyperion_open({ runId, presentation: "split" })` (or CLI `open` split).
2. The tool **ONLY** returns the canvas URL. Claude Desktop has **NO** native Hyperion pane.
3. Instruct the person (and, if the host supports it, use the host Browse/split tab) to open **that URL** in the side Browse panel so the right pane shows the canvas—**do not leave the pane blank** after returning the URL.
4. Never claim Hyperion opened automatically inside Claude, Cursor, or any chat UI.
5. If Browse cannot load loopback, say so and keep the URL for an external browser; offer `presentation: "desktop"` only if they ask.

Otherwise, if they request desktop, run `open RUN_ID desktop`; the adapter launches the locally registered Hyperion Desktop with the same authenticated service and run. Only report the launch after the command succeeds. If Desktop is not installed/registered, explain that its installer must be opened once and keep the web link available. Do not silently install or choose desktop when the user requested split.

The canvas supports vertical/horizontal orientation and SVG parallel, exclusive and inclusive gateways. Include only gateways justified by the activity. Human decisions appear as a list with progress; use short field descriptions and explicit booleans. Pending and failed agent tasks expose Reintentar; running tasks expose Recuperar tarea. These requests notify a waiting coordinator and preserve human answers. Before repeating interrupted work, inspect external effects: recovery does not cancel external tools or authorize duplicate side effects. Read state before resuming; do not start a retry automatically because a timeout elapsed.

Desktop also offers **Conectar con mi IA** in its native menu to install the managed skill. If the harness has no `node` executable, read the installed `runtime.json`: invoke its `node` executable with its `cli` path and the desired arguments, applying `nodeEnv`, `HYPERION_DATA_DIR=directory` and `HYPERION_URL=url`. This uses Desktop's bundled runtime; do not ask the user to install Node or type shell commands.

## Deliverables and a new beginning

When a step generates a deliverable, register it with `hyperion_add_artifact` (MCP) or `artifact RUN_ID STEP_ID /absolute/path/file --attempt ATTEMPT COMMAND_ID` (CLI). Use the producing attempt, not a newer one after recovery. MCP accepts exactly one `filePath`, `text` or HTTP(S) `url`; text/link require a name. Uploads are limited to 10 MiB. Register actual results relevant to the task; a log containing a path does not make the file accessible. Keep typed outputs and evidence logs as well. The canvas exposes registered artifacts inside the step and preserves them across retries.

When the user makes a new request after a run completed, read that run and create a new plan with its relevant context, the new `plan.request`, and `parentRunId` in `hyperion_create_run`. CLI/portable guide: `guide /absolute/path/next-plan.json UNIQUE_REQUEST_ID --from COMPLETED_RUN_ID`. This draws the prior end → new beginning relationship without reopening the old process. Do not create another cycle merely because the prior run completed or a wait expired. In-progress changes still use the guarded revision mechanism. The same rules apply to every harness.

If the human drafted a new beginning on the canvas, they use **Copiar petición para el chat** and paste into the connected chat. Copying is not delivery; MCP alone does not wake a closed chat. Continuation **Enviar** only appears when the host supplies a real ResumeConnector and enqueues `continuation_prompt` text—delivery ack is not execution. Linked-cycle Enviar and native send connectors are not certified.
