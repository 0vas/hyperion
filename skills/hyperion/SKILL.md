---
name: hyperion
description: Use Hyperion when the user says “usa Hyperion”, “quiero usar Hyperion”, or asks to guide an activity through its visual workflow. Start or resume the local canvas, generate the process from the request, and report real progress with human decisions in the canvas.
license: MIT
---

# Hyperion

Requires local shell access with Node.js 22.13+ or the bundled Desktop runtime, or an already connected Hyperion MCP server.

The user describes the activity in their chat. You construct and advance its visual workflow. Preserve their scope and original request. Hyperion is independent of the model or agent vendor.

## Start from a request

Use loaded `hyperion_*` MCP tools when available. Otherwise run the script next to this skill:

```sh
node /absolute/path/to/this/skill/scripts/hyperion.mjs --agent YOUR_AGENT_ID up
```

Use a stable lowercase identity for your tool (for example `codex`, `chatgpt`, `claude`, `claude-code`, `cursor`, `hermes`, `antigravity`, or another ID). The script starts/reuses the local service, registers that identity and returns the canvas URL. No API key, manual server startup or MCP configuration is needed. The launcher automatically backs up and replaces an older authenticated service from this same installation. An unrelated process, different installation, credential mismatch or newer server is left untouched; resolve that conflict without deleting workflow data.

For MCP, use the URL returned by the tools rather than assuming port 4317. The development-source MCP launcher follows startup's authenticated alternate loopback URL when another Hyperion instance occupies the requested address, preserving the saved client configuration and foreign service. This correction is not yet in a published installer. A saved configuration or successful tool listing alone does not prove tool calls work in the current chat; verify a read-only call such as `hyperion_list_runs` before claiming the connection works.

Read [the protocol](references/protocol.md) for commands and [the process contract](references/process-contract.md) for gates, typed I/O and public traces. Generate a plan specific to the request, write it to a temporary JSON file, then run:

```sh
node /absolute/path/to/this/skill/scripts/hyperion.mjs --agent YOUR_AGENT_ID guide /absolute/path/plan.json UNIQUE_REQUEST_ID
```

Always preserve the original text in `plan.request`. Prefer `bpmn-lite` for process flows: start/end, structured split/join blocks only when meaningful, typed task ports and short clear phase names. Do not substitute a canned example for the requested activity. The guide streams a `waiting` event with the URL once per changed revision and keeps the tool invocation alive for a bounded wait of up to ten minutes. A waiting tool is not delayed creation: the flow already exists as soon as its URL is returned. Use a short shell yield (about 1 second), share that URL in commentary, and poll the running tool until it returns. The final result includes `agentNext`: execute ready work immediately. If it says `disconnected`, the bounded wait ended and there is no automatic wakeup; report that once and end the turn. Do not repeatedly invoke `follow` on the same unchanged question. Read the latest run before reporting whether an answer is still pending. The portable script also maps legacy `create` calls to this guided mode. The agent writes JSON; the user does not. Do not give installation commands as the daily usage path when this skill is already available. Connect the service yourself, create the flow, and return its link.

Group a multi-stage activity with `jobs: [{id, title, description?}]` and assign steps using `jobId`. Each step is independently executable with its own evidence and I/O; a job only summarizes them. Keep each job contiguous in the dependency graph (no reentry after leaving it). Group internal gateways with their job when needed. The canvas can show jobs or their steps.

For human steps, declare `interaction: {question, context, next}`: the exact decision, why it matters, and what follows. Use clear output descriptions as field labels. New plans are rejected when a field lists choices as an imperative comma-separated sentence but omits options. Fix the plan yourself; do not ask the user to repair it. For known choices, declare a string output with `form.options: [{value, label}]` so the canvas renders a dropdown without a preselected answer. If “Otro” or “No sé” is meaningful, include it as an option and collect any needed detail in an optional field or a subsequent step; never replace the whole selection with a textarea. Use booleans for yes/no and free text only for open answers. Prefer simple fields for nontechnical users; do not make them author JSON. Typed fields are the response: do not ask for the same information again in free text. Do not add artificial approvals or choices unrelated to the request. Generate the guided questions from the prompt and known context; never ask the person to fill generic technical fields such as `detail` or `preview`. Drafts and previews are agent-produced results to review, not required user inputs.

## Start without prior context

A new chat, empty workspace or external connected application may supply only an activity. Prior conversation, repository files and `plan.context` are optional. Use the request itself as the starting point; never assume “my project” means Hyperion, Olimpo, the current directory or a project from another stored run.

When a material fact is missing, generate the relevant manual discovery step in the canvas and connect its typed answers to the dependent work. Ask only what is needed next; do not require a technical brief, prescribed workflow, logging instructions or an artificial pause in the user's prompt. If the request already provides enough information, proceed without a discovery form. If no activity was provided at all, ask for the objective before inventing task-specific work.

For a continuation in a fresh chat, recover state from the provided run ID/link. If the intended run is ambiguous, ask which one to resume. Do not import another run's context as a default. Runtime/service access comes from the integration, independently of business context; a missing connection is not a request for project information.

## Execute and resume

If a trusted installed connector supplies a real session reference and declares durable resume and idempotent delivery, use `hyperion_suspend` (or `suspend RUN_ID suspension.json`) at a human checkpoint with the current revision. Then share the canvas URL and end the turn: the connector owns resumption. Never invent a connector, session ID or capability. `agentNext.action=suspended` means no long poll is needed. Re-arm at each subsequent human checkpoint. A queued request is not delivery; delivery is not execution. This release supplies the common queue/worker contract, not native wakeup connectors for every brand. ChatGPT requires a separately deployed authenticated remote integration; local stdio is not accessible from its cloud. Without a real connector use the cooperative path below.

Use `get RUN_ID` to read current state and decisions. For an existing run use its coordinator identity; do not create a replacement run on every continuation. Start only ready agent tasks, execute their actual work with your own tools, and send evidence. Use `command RUN_ID /absolute/path/command.json` for typed outputs and structured logs. Reuse an action's commandId only on transport retries with identical content. Keep the `attempt` returned by `start` and include it in every `complete`, `fail` and `log` command (CLI shorthand: `--attempt NUMBER`). It is required after a retry. Never look up a newer attempt to attach old work to it; a stale-attempt error means stop reporting that execution.

Logs may contain public summaries, actions and observations. Do not expose or request private chain-of-thought. Hyperion only displays the events you submit; it does not intercept your tools. Parallel gates make work eligible together; report simultaneous execution only when it actually happened.

Manual responses and approvals happen in the canvas. Never submit or approve for the person. Provide the URL and waiting step in a progress message, then use `hyperion_wait` (MCP) or `wait RUN_ID REVISION 30` (CLI) while the person answers. This subscribes to server events; confirmations and retry requests deliver the updated state immediately. The canvas shows whether this wait is active. When the revision changes, read the decision and continue ready work in this same turn; do not demand an extra chat message if you already received the answer. Waits are bounded: a timeout is neither approval nor a failure. After completing agent work that enables another human step, use `follow RUN_ID` (CLI) or repeat `hyperion_wait` (MCP). Renew short MCP waits only within a single bounded waiting period of at most ten minutes. A guide timeout or host interruption ends that period; do not start another unchanged waiting period automatically. Report actual changes rather than repeated reminders that the same choice is pending. Before a final handoff read the latest run; if an answer arrived, execute ready work instead of claiming the choice is still missing. Explain once when the chat is disconnected. End waiting when the process is paused, cancelled, completed or the user asks to stop. Without a real resumable connector, never promise background wakeups; an idle host requires a new message. Respect pause, cancellation, rejection and the user's explicit instructions.

If only “quiero usar Hyperion” is given without an activity, start the canvas and ask what activity they want to guide. Do not invent a task.

## Presentation chosen in the chat

Keep the same run when the user switches presentation. If they request split/web, return the run URL (`open RUN_ID split` also returns it). With MCP, use `hyperion_open({runId, presentation: "split" | "desktop"})`. Otherwise, if they request desktop, run `open RUN_ID desktop`; the adapter launches the locally registered Hyperion Desktop with the same authenticated service and run. Only report the launch after the command succeeds. If Desktop is not installed/registered, explain that its installer must be opened once and keep the web link available. Do not silently install or choose desktop when the user requested split.

The canvas supports vertical/horizontal orientation and SVG parallel, exclusive and inclusive gateways. Include only gateways justified by the activity. Human decisions appear as a list with progress; use short field descriptions and explicit booleans. Pending and failed agent tasks expose Reintentar; running tasks expose Recuperar tarea. These requests notify a waiting coordinator and preserve human answers. Before repeating interrupted work, inspect external effects: recovery does not cancel external tools or authorize duplicate side effects. Read state before resuming; do not start a retry automatically because a timeout elapsed.

Desktop also offers **Conectar con mi IA** in its native menu to install the managed skill. If the harness has no `node` executable, read the installed `runtime.json`: invoke its `node` executable with its `cli` path and the desired arguments, applying `nodeEnv`, `HYPERION_DATA_DIR=directory` and `HYPERION_URL=url`. This uses Desktop's bundled runtime; do not ask the user to install Node or type shell commands.

## Deliverables and a new beginning

When a step generates a deliverable, register it with `hyperion_add_artifact` (MCP) or `artifact RUN_ID STEP_ID /absolute/path/file --attempt ATTEMPT COMMAND_ID` (CLI). Use the producing attempt, not a newer one after recovery. MCP accepts exactly one `filePath`, `text` or HTTP(S) `url`; text/link require a name. Uploads are limited to 10 MiB. Register actual results relevant to the task; a log containing a path does not make the file accessible. Keep typed outputs and evidence logs as well. The canvas exposes registered artifacts inside the step and preserves them across retries.

When the user makes a new request after a run completed, read that run and create a new plan with its relevant context, the new `plan.request`, and `parentRunId` in `hyperion_create_run`. CLI/portable guide: `guide /absolute/path/next-plan.json UNIQUE_REQUEST_ID --from COMPLETED_RUN_ID`. This draws the prior end → new beginning relationship without reopening the old process. Do not create another cycle merely because the prior run completed or a wait expired. In-progress changes still use the guarded revision mechanism. The same rules apply to every harness.
