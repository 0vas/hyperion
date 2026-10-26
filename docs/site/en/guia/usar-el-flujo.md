# Use the canvas

The chat carries the goal, short progress and continuation when needed. Scope, paths and decisions live in canvas forms—not in a parallel chat questionnaire.

<GuideLens kind="canvas" />

## Find your next task

Select a task in the top navigation and use **Enfocar tarea** (Focus task). **Seguir actividad** (Follow activity) keeps active work in view. Settings offer vertical or horizontal layouts and light or dark themes. Expand jobs to see their steps.

| Signal         | Meaning                                         |
| -------------- | ----------------------------------------------- |
| Green start    | Process entry                                   |
| Yellow gateway | Splits or joins paths                           |
| Red end        | Process closure; not necessarily an error       |
| Green task     | Completed                                       |
| Blue task      | Ready for the agent or running; read its status |
| Amber task     | Needs your input                                |
| Red task       | Failure or rejection                            |
| Gray path      | Pending or skipped, depending on its stroke     |

Paths reflect recorded progress. Animation does not prove that an agent is connected. Motion respects your system's reduced-motion preference.

## Answer what is needed

Forms should ask a concrete question using dropdowns, Yes/No, numbers or text. No choice is approved by default. Expand help only when needed.

Selecting a step opens **Result** beside the canvas (≥960px: canvas ~60% / pane ~38%, 320–480px). Below 960px, a bottom sheet with **Back to canvas**. It prefers registered evidence: artifact, else typed outputs, else a public log summary; if nothing is registered yet, it says so without inventing progress. When the step is waiting for you, the form appears first. **Details**, **I/O**, **Logs** and step **Activity** stay secondary in the same pane (run-level Activity remains in the menu). Escape or an empty canvas closes Result and returns focus to the node. Connections and Settings remain modal dialogs.

**I/O** shows inputs and outputs. **Logs** contains public summaries, actions and observations sent by the agent—including heartbeats during long host work. A host timeout or permission denial should leave the step **Failed**, not endless **In progress**. Logs are not an automatic recording of every tool or private reasoning.

## Resume work

**Espera al agente** (Waiting for the agent) means that the task is ready but has not started. Saving an answer does not itself execute actions in another application.

During an active integration wait (`hyperion_wait` / “Agent connected”), confirming on the canvas resumes that wait in the same turn—the agent must execute **all** ready agent steps without asking you to type “ready” in chat. If the chat ended without waiting—common with Claude Desktop—use **Copiar continuación** (Copy continuation): one prompt with the run ID and every ready `stepId`, then paste it in the connected chat. **Send** stays hidden unless a real resume connector is configured; MCP alone does not wake the chat. Asking for “split” only returns the URL: open it in Browse / the side panel (or an external browser); Claude Desktop does not open a native Hyperion pane. Do not regenerate an old chat (for example yesterday’s Excel thread) to resume Hyperion: open a **new** chat, confirm `hyperion_*` tools are loaded, then paste the continuation or say “Use Hyperion to…”.

Check for a paused run, another unanswered question or a reported error before retrying. A step still **En curso** (running) with no active wait after a permission denial usually needs **Recuperar tarea** (Recover task) or Copiar continuación once access is granted. Do not approve the same decision again to bypass a block.

## Retry

Use **Reintentar** (Retry) on a ready or failed AI task—including after an automatic abandonment for no progress (~180s with no active wait). For a stuck running task, use **Recuperar tarea** (Recover task) and confirm. Responses and logs remain intact. An actively waiting agent receives the recovery event. External tools are not cancelled; the agent must check what happened before repeating an action. Results from an older attempt are rejected.

## Change the plan

Ask in the chat: “From this phase, add a review.” The agent can revise future work with a reason. Hyperion preserves completed work and pauses the revised plan for your review. History must not be rewritten.

## Gateways

- **Exclusive (×):** selects one path.
- **Inclusive (○):** enables one or more matching paths.
- **Parallel (+):** enables branches and waits for their join.

Multiple ready tasks do not guarantee concurrent execution; that depends on the agent.

## Runtime versions

The 0.4.1 runtime added active-agent presence and event delivery. The 0.4.2 skill added bounded guided waiting and validation of detected free-text choice lists. Core 0.5 adds durable continuation infrastructure; native resume connectors remain pending. These changes are not in the 0.4.0 preview installer. [Read about pause and resume](./reanudacion.md).

## Open step artifacts

**Artifacts** (inside **Result**) lists files and links registered by the agent. The node's package icon opens Result focused on that list. Preview small text files and supported images, download files, or open a document link. Results from earlier attempts remain labeled.

::: tip Deliverables within reach
For example, “Prepare guide” can contain `welcome.md`, an illustration and a shared document link. **I/O** retains its data, **Logs** explains the actions, and **Artifacts** provides access to the result.
:::

The agent must register the file; Hyperion does not scan your disk or publish documents automatically. HTML and SVG open in an `iframe` with empty `sandbox=""`: switch **Preview** and **Source**; under Preview you see the inert-preview caption (no JavaScript or network; layout may differ from a full browser). This is not a full browser and not malware protection. Uploaded files are limited to 10 MiB.

## Continue after the end

Say in the same chat: “Now translate this guide into English.” The agent creates another linked run, and the graph shows **Previous end → new beginning**. Select a run card to navigate between them. The completed run keeps its decisions, files and history.

**Continue from here**, at the end of the graph, helps you draft that request. **Copy request for chat** is the usual path (copy ≠ delivery). Paste into the connected chat; automatic send needs a send connector — MCP alone cannot wake the chat (**Send** hidden in this phase). The agent must create the linked run. Use plan revision for changes to unfinished work, or retry for a failed task.

::: info Availability
The **2026.10.26.2007 UTC · Preview** installers include artifacts (sandboxed HTML/SVG preview) and linked runs. [Download the new version](primeros-pasos.md) if you are using an older one.
:::

## Move and arrange nodes

The canvas opens at a readable scale. For a long workflow, use **Overview** to fit the entire graph or **Focus current step** to inspect a task. **Completed** means that step has finished; open its package icon to inspect artifacts.

Drag the dotted grip above a card or symbol. With a keyboard, focus the node, press Enter and use the arrow keys. **Arrange flow** restores the automatic layout for the current view.

::: tip Your arrangement, the same process
Positions are saved in this browser per workflow, orientation and steps/jobs view, including when agent activity arrives. They do not change dependencies or history, and do not sync across devices.
:::

Available in **2026.10.26.2007 UTC · Preview** installers. [Download](primeros-pasos.md).
