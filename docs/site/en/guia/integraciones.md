# Connect your AI

Hyperion keeps the same workflow regardless of the tool doing the work. The local connection supplies tools or instructions for creating and updating runs.

## Recommended setup

### Desktop side chat

The Desktop-only chat bubble sits beside the canvas. Work on the selected workflow or start a new one from Home, without inventing or opening a workflow first. Opening the bubble or connecting a provider does not send messages or create work automatically. Every actual Desktop Chat request without a selected workflow first creates one through Hyperion, retaining the original text in `plan.request`, before it receives a substantive response. With a selected workflow, the harness first reads its state and then continues eligible work or proposes an explicit revision; it does not answer a general query outside that workflow.

Codex, Claude Code, Cursor Agent and Antigravity receive the same Hyperion entry instructions: collaborate clearly, be concise and proactive, reply in your language, and turn your intent into a visible workflow with real evidence. Only missing information is requested; scope questions, forms and approvals stay on the canvas. A provider's one-time tool permission does not approve a workflow.

The private MCP offers every existing agent operation: create, read, open, execute eligible steps, record logs and artifacts, recover tasks and revise future work. Only the coordinator may mutate its workflow; changing harness does not transfer that permission. A revision pauses the workflow for the person to review and resume on the canvas. Recovery does not cancel tools or undo external effects: check them before repeating work. Waiting for decisions does not wake a closed chat; suspension needs a genuine installed resume connector. Forms, approvals, human corrections, pause, resume, cancellation and configuration remain human actions, never a credential shared with the harness.

Each message identifies the current selection and requests fresh state through MCP. Changing workflows starts another provider session when no turn is active; previous workflow context is not copied. A request continuing a completed workflow can create a linked one without changing its parent. Menu and chat are mutually exclusive: opening either hides the other. Opening Connections, Settings, or another global dialog also closes chat so that one layer owns the interaction; reopening chat preserves its draft. These instructions are not extra permission, a sandbox, or a guarantee of model compliance. The bubble, shared entry instructions, and compact picker ship in published Beta `2026.11.26.0203`. Protocol tests do not certify an authenticated Claude session or a real conversation for every provider on Windows.

While Menu, Connections, Settings, Help, or a confirmation is open, Desktop hides chat so those controls never compete. Opening chat closes Menu first. Closing Menu or a dialog restores chat only when it was already open, with its draft and local session intact.

#### Choosing local AI

Beta **2026.11.26.1345** adds global persistent **Ask / Auto** beside the provider in the composer toolbar, available before connecting. Auto allows verified delegable Codex/Claude requests once, including files, shell and MCP; exposed provider restrictions and human canvas decisions still apply. Cursor/Antigravity retain manual responses when their permission shapes cannot be verified. [Usage, persistence and limits](./usar-el-flujo.md). Every prompt reinforces working through Hyperion, but there is no guarantee of compliance or a response gate waiting for a workflow receipt.

The composer preserves room to write: a compact dropdown shows the selected provider's locally bundled SVG mark, name, and availability indicator. Opening it keeps the menu within the panel and shows every harness with readable status. The marks are bundled locally, never fetched at runtime, and do not certify or imply provider endorsement.

| Visible status            | Exact meaning                                                   | It does not mean                                                                                                        |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Available locally**     | Desktop resolved a usable absolute executable for that harness. | A signed-in session, loaded MCP tools, or a certified conversation.                                                     |
| **Not installed**         | It did not find a compatible executable in allowed locations.   | That Desktop will install a CLI, search through a shell, or that the provider is unavailable through every other route. |
| **Needs setup**           | The previously selected path is no longer valid.                | Credentials or workflows were lost.                                                                                     |
| **Checking availability** | The main-process safe result has not arrived yet.               | The harness is available or connected.                                                                                  |

Choose another harness from the menu only between turns: a connection, active turn, or pending permission preserves the selection so work cannot be retargeted. Switching closes the previous idle ACP session and keeps the draft. **Available locally** is never rendered as “authenticated”. When a harness needs setup, location, or sign-in, chat leads to **Connections**; that setup does not expand inside the composer.

Install Desktop and open **Hyperion → Conectar con mi IA**. The assistant configures:

| Tool           | Connection                                          |
| -------------- | --------------------------------------------------- |
| Codex          | Local MCP server                                    |
| Cursor         | Local MCP server                                    |
| Claude Desktop | Local MCP server                                    |
| Claude Code    | Managed skill (+ separate MCP; verify with `/mcp`)  |
| Antigravity    | Local MCP server · Desktop 0.5.1-preview.1 or later |

Restart the tool and open a new chat. The assistant reports conflicts and backs up the configuration files it changes. Installing a connection does not guarantee that an existing chat has loaded it. Naming Hyperion in an unconnected application is not enough.

## Claude Code (happy path for local files)

When the activity reads or writes disk or uses the project terminal, use **Claude Code** with Hyperion:

1. In Desktop: **Hyperion → Conectar con mi IA → Claude Code** (installs the skill under `~/.claude/skills/hyperion`).
2. Register Hyperion’s MCP server in Code (`setup claude` from source, or `claude mcp add` with paths from **Connections → Diagnostics → Adapter files**). Desktop does not auto-register MCP for Code.
3. New chat in the project → run **`/mcp`** and confirm `hyperion`.
4. Ask “Use Hyperion to…”. Open the canvas URL in a **browser** or Desktop—Code has **no** native Hyperion pane.
5. Decisions and forms only on the canvas. If the chat ended without a wait, **Copiar continuación** (Copy continuation).

| Versus…        | Honest difference                                                        |
| -------------- | ------------------------------------------------------------------------ |
| Claude Desktop | Better for chat MCP; weaker path for folders/shell; also no native pane. |
| Codex / Cursor | Also local via MCP or skill; Code shines in project/terminal context.    |

[Technical detail](https://github.com/0vas/hyperion/blob/main/docs/conexion.md#claude-code-camino-feliz-archivos-y-shell-locales).

## Review local configuration

In Preview `2026.11.20.1708`, **Menu → Connections** shows a compact list of apps. The menu groups Connections and Settings, help options, and window (web) or update (Desktop) actions followed by About Hyperion. With an open workflow, **This workflow** includes Original request, Activity, and Pause or Resume when allowed. The full CalVer and channel appear in the menu footer and Connections header.

Rows show **Configured locally**, **Not configured**, **Conflict · unchanged**, or **Could not check**. **Configured locally** counts matching files in the catalog, not installed apps or tools loaded in a chat. Select an app name to expand its explanation, actions, and full path with **Copy path**. Only one app expands at a time; the selection survives rechecks and language changes. **Original diagnostic message** expands the text received, whether recognized or unknown, without translation or inferred causes. Copy success is announced only after the clipboard accepts it; a failed copy shows an error. Opening details changes neither files nor workflow answers. Loading or unavailable inventory is never presented as zero configured apps.

Known Hyperion explanations for conflicts and setup failures, and success notices, follow the selected language even after they appear. Only Hyperion connection message templates are recognized; paths and unrecognized diagnostics keep their original text. Changing language does not retry setup or alter workflow content.

Open **Diagnostics** below the list to see the service URL, suggestions for investigating failures, and **Adapter files**. This panel preserves the selected app. This checks only whether Hyperion can read this installation’s expected executable and MCP launcher. It does not check execution permission, dependencies, authentication or the client environment; it does not start MCP. **MCP startup and tool call: not checked** and **Tools in this chat: unknown** remain separate. Readable files do not validate a conflicting saved entry or Claude Code’s skill.

A shared notice distinguishes a missing file, a nonregular file, a file Hyperion could not read due to permissions, and an incomplete check. **Could not check** does not prove a file is missing. Older servers without this metadata show **Not checked**, with no invented timestamp. **View diagnostics** opens the existing diagnostic information; **Recheck** refreshes this read-only observation without changing files or registering credentials. There is no automatic repair or replacement. This redesign and these diagnostics ship in Preview `2026.11.20.1708`.

## Review a conflict

**Menu → Connections → app → Resolve conflict…** compares a limited preview. URLs show only scheme, host and port; credentials, paths, queries and fragments are removed. Private environment values are omitted. Arguments are shown only while they follow supported formats; from the first unsupported or ambiguous item, the remaining tail becomes `••••`. The amber cue compares visible values, including permitted environment values.

This preview is not a universal secret detector: executable names, local paths, hosts and client IDs are treated as public metadata. Do not put credentials in them or share configuration files without reviewing them. **Replace connection** still requires confirmation, creates a backup and preserves other MCP servers. This fix ships in Preview `2026.11.20.1708`. [Exact policy and limits](https://github.com/0vas/hyperion/blob/main/SECURITY.md#connection-conflict-previews).

**Cancel**, **Escape**, or clicking outside the confirmation returns to the resolver and focuses **Replace connection**, without writing changes. Closing the resolver returns focus to its originating app control; **Back to canvas** or Escape from Connections returns to its opener. Only the top dialog receives keyboard and pointer input. While saving, the confirmation cannot be dismissed or submitted again. On failure, you can read the error, retry, or cancel; on success, both dialogs close and the list updates. This navigation ships in Preview `2026.11.20.1708`.

## If Hyperion is not recognized

If another Hyperion instance rejects this installation’s credentials at the requested address, the MCP launcher uses the alternate local port selected during startup. It does not change the saved client configuration or stop the other instance. This correction ships in Preview `2026.11.20.1708`. Verify a read-only call such as `hyperion_list_runs`: an existing configuration or a visible tool list does not establish that calls work in that chat.

1. Check that you selected the right tool in the assistant.
2. If setup is new, restart it and open a **new** chat (do not regenerate an old non-Hyperion thread). If you already did that and tools are still absent, inspect the actual Hyperion server status and configuration in the client.
3. In Claude Desktop, expand Loaded tools and confirm `hyperion_*` entries (for example `hyperion_create_run`). In Claude Code, run `/mcp` and confirm `hyperion`.
4. Ask “Use Hyperion to…” with a concrete goal.
5. Check the assistant or MCP server error if it still fails.

Claude Desktop does not require Claude Code; the packaged Desktop connection also needs no separate system Node installation. Connecting Claude Desktop also refreshes the skill under `~/.claude/skills/hyperion`. After a canvas decision, the agent must keep `hyperion_wait` in the same turn; without that wait the chat does not resume by itself. `hyperion_open` in split mode only returns the browser URL—it does not open a Hyperion pane inside Claude. Readable adapter files do not identify the cause of missing tools on Windows. Actual client evidence is still needed.

Do not share credentials or tokens when reporting an issue.

## If saving an answer does not resume work

See [pause and resume](./reanudacion.md). Without an installed resume connector, your answer is saved locally. An agent can receive it during an active integration wait; a finished chat needs another message. Use **Copiar continuación** in the canvas and send it in the chat. After a completed run, **Copy request for chat** in “A new beginning” also does not notify the agent; automatic send needs a send connector (MCP alone cannot wake the chat).

## Antigravity

In Desktop 0.5.1-preview.1 or later, open **Hyperion → Conectar con mi IA → Antigravity**. The assistant adds `mcpServers.hyperion` to Antigravity’s documented global configuration, preserves other servers and backs up the original file. The bundled runtime starts Hyperion when the client loads MCP.

Restart Antigravity or reload its MCP servers. Check that Hyperion tools appear and ask: **“Use Hyperion to prepare a welcome guide for my project.”**

::: warning Required version
The button is included from **0.5.1-preview.1**. If you still have **0.4.0-preview.1**, install the new version; the [technical connection guide](https://github.com/0vas/hyperion/blob/main/docs/conexion.md#antigravity) also offers `setup antigravity` for source installations. The new assistant does not require editing JSON.
:::

::: info Verified scope
Tests cover configuration, backups, conflicts and the MCP protocol with an Antigravity identity. A conversation in Google’s application remains unverified. The connector that automatically wakes a finished chat is still pending.
:::

[Antigravity MCP documentation](https://antigravity.google/docs/mcp).

## Other applications

Compatible clients can use MCP, the CLI or the local API. They must supply an agent that plans and executes; Hyperion does not include an AI model. Hermes can use a manually configured MCP stdio connection.

**ChatGPT Desktop** cannot use the local stdio MCP on this computer. An authenticated remote integration remains pending and is not included. ChatGPT **Work mode** is not a Hyperion requirement: for local work use Cursor, Codex, Claude Desktop or Claude Code from **Menu → Connections**.

The current edition connects applications on the same computer. Do not expose the local service as a remote server.

Integrator references: [technical setup](https://github.com/0vas/hyperion/blob/main/docs/conexion.md), [protocol](https://github.com/0vas/hyperion/blob/main/docs/protocol.md), [process contract](https://github.com/0vas/hyperion/blob/main/docs/process-contract.md).
