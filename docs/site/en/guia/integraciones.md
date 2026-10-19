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

## Review a conflict

In the development source, **Menu → Connections → Resolve conflict…** compares a limited preview. URLs show only scheme, host and port; credentials, paths, queries and fragments are removed. Private environment values are omitted. Arguments are shown only while they follow supported formats; from the first unsupported or ambiguous item, the remaining tail becomes `••••`. The amber cue compares visible values, including permitted environment values.

This preview is not a universal secret detector: executable names, local paths, hosts and client IDs are treated as public metadata. Do not put credentials in them or share configuration files without reviewing them. **Replace connection** still requires confirmation, creates a backup and preserves other MCP servers. This fix is not yet part of a published installer. [Exact policy and limits](https://github.com/0vas/hyperion/blob/main/SECURITY.md#connection-conflict-previews).

## If Hyperion is not recognized

1. Check that you selected the right tool in the assistant.
2. Restart it and open a new chat.
3. Ask “Use Hyperion to…” with a concrete goal.
4. Check the assistant or MCP server error if it still fails.

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
