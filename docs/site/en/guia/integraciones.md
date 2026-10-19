# Connect your AI

Hyperion keeps the same workflow regardless of the tool doing the work. The local connection supplies tools or instructions for creating and updating runs.

## Recommended setup

Install Desktop and open **Hyperion → Conectar con mi IA**. The assistant configures:

| Tool           | Connection                                          |
| -------------- | --------------------------------------------------- |
| Codex          | Local MCP server                                    |
| Cursor         | Local MCP server                                    |
| Claude Desktop | Local MCP server                                    |
| Claude Code    | Managed skill connected to the Desktop runtime      |
| Antigravity    | Local MCP server · Desktop 0.5.1-preview.1 or later |

Restart the tool and open a new chat. The assistant reports conflicts and backs up the configuration files it changes. Installing a connection does not guarantee that an existing chat has loaded it. Naming Hyperion in an unconnected application is not enough.

## Review local configuration

In development source, **Menu → Connections** shows a compact list of apps. The menu groups Connections and Settings, help options, and window (web) or update (Desktop) actions followed by About Hyperion. With an open workflow, **This workflow** includes Original request, Activity, and Pause or Resume when allowed. The full CalVer and channel appear in the menu footer and Connections header.

Rows show **Configured locally**, **Not configured**, **Conflict · unchanged**, or **Could not check**. **Configured locally** counts matching files in the catalog, not installed apps or tools loaded in a chat. Select an app name to expand its explanation, actions, and full path with **Copy path**. Only one app expands at a time; the selection survives rechecks and language changes. **Original diagnostic message** expands the text received, whether recognized or unknown, without translation or inferred causes. Copy success is announced only after the clipboard accepts it; a failed copy shows an error. Opening details changes neither files nor workflow answers. Loading or unavailable inventory is never presented as zero configured apps.

Known Hyperion explanations for conflicts and setup failures, and success notices, follow the selected language even after they appear. Only Hyperion connection message templates are recognized; paths and unrecognized diagnostics keep their original text. Changing language does not retry setup or alter workflow content.

Open **Diagnostics** below the list to see the service URL, suggestions for investigating failures, and **Adapter files**. This panel preserves the selected app. This checks only whether Hyperion can read this installation’s expected executable and MCP launcher. It does not check execution permission, dependencies, authentication or the client environment; it does not start MCP. **MCP startup and tool call: not checked** and **Tools in this chat: unknown** remain separate. Readable files do not validate a conflicting saved entry or Claude Code’s skill.

A shared notice distinguishes a missing file, a nonregular file, a file Hyperion could not read due to permissions, and an incomplete check. **Could not check** does not prove a file is missing. Older servers without this metadata show **Not checked**, with no invented timestamp. **View diagnostics** opens the existing diagnostic information; **Recheck** refreshes this read-only observation without changing files or registering credentials. There is no automatic repair or replacement. This redesign and these diagnostics are not yet in a published installer.

## Review a conflict

In the development source, **Menu → Connections → app → Resolve conflict…** compares a limited preview. URLs show only scheme, host and port; credentials, paths, queries and fragments are removed. Private environment values are omitted. Arguments are shown only while they follow supported formats; from the first unsupported or ambiguous item, the remaining tail becomes `••••`. The amber cue compares visible values, including permitted environment values.

This preview is not a universal secret detector: executable names, local paths, hosts and client IDs are treated as public metadata. Do not put credentials in them or share configuration files without reviewing them. **Replace connection** still requires confirmation, creates a backup and preserves other MCP servers. This fix is not yet part of a published installer. [Exact policy and limits](https://github.com/0vas/hyperion/blob/main/SECURITY.md#connection-conflict-previews).

In development source, **Cancel**, **Escape**, or clicking outside the confirmation returns to the resolver and focuses **Replace connection**, without writing changes. Closing the resolver returns focus to its originating app control; **Back to canvas** or Escape from Connections returns to its opener. Only the top dialog receives keyboard and pointer input. While saving, the confirmation cannot be dismissed or submitted again. On failure, you can read the error, retry, or cancel; on success, both dialogs close and the list updates. This navigation is not yet in a published installer.

## If Hyperion is not recognized

In development source, if another Hyperion instance rejects this installation’s credentials at the requested address, the MCP launcher uses the alternate local port selected during startup. It does not change the saved client configuration or stop the other instance. This correction is not yet included in a published installer. Verify a read-only call such as `hyperion_list_runs`: an existing configuration or a visible tool list does not establish that calls work in that chat.

1. Check that you selected the right tool in the assistant.
2. If setup is new, restart it and open a new chat. If you already did that and tools are still absent, inspect the actual Hyperion server status and configuration in the client.
3. Ask “Use Hyperion to…” with a concrete goal.
4. Check the assistant or MCP server error if it still fails.

Claude Desktop does not require Claude Code; the packaged Desktop connection also needs no separate system Node installation. Readable adapter files do not identify the cause of missing tools on Windows. Actual client evidence is still needed.

Do not share credentials or tokens when reporting an issue.

## If saving an answer does not resume work

See [pause and resume](./reanudacion.md). Without an installed resume connector, your answer is saved locally. An agent can receive it during an active integration wait; a finished chat needs another message. Use **Copiar continuación** in the canvas and send it in the chat.

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

Compatible clients can use MCP, the CLI or the local API. They must supply an agent that plans and executes; Hyperion does not include an AI model. Hermes can use a manually configured MCP stdio connection. ChatGPT requires a remote authenticated integration, which is not included.

The current edition connects applications on the same computer. Do not expose the local service as a remote server.

Integrator references: [technical setup](https://github.com/0vas/hyperion/blob/main/docs/conexion.md), [protocol](https://github.com/0vas/hyperion/blob/main/docs/protocol.md), [process contract](https://github.com/0vas/hyperion/blob/main/docs/process-contract.md).
