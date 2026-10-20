# Pause and resume

Hyperion saves the process even when the chat ends its turn. Resuming after a canvas response requires a **resume connector** for the chosen tool.

Core 0.5 includes the protocol, durable queue and shared I/O worker. Native connectors for resuming provider sessions are not yet included. Preview 0.5.1 includes the protocol but no native resume connectors.

<GuideLens kind="resume" />

## Intended experience

1. Ask “Use Hyperion to prepare a welcome guide for my project.”
2. The agent generates the workflow and asks for missing information on the canvas.
3. With an installed connector, it saves the suspension and ends its turn.
4. Saving your response asks the connector to resume the work.
5. The agent reads your data and updates tasks, results and logs.

The canvas distinguishes pending resumption, connector dispatch and delivery to the agent. Delivery is not proof of completed work. Uncertain deliveries must be reconciled before being repeated.

## Requirements by tool

| Tool           | Current status                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex          | Local MCP/skill available. App Server resume connector pending.                                                                                   |
| ChatGPT        | Requires authenticated remote integration and events; pending. Cannot use your local stdio MCP directly. Work mode is not a Hyperion requirement. |
| Claude Desktop | Local MCP available. Same-chat wakeup unverified.                                                                                                 |
| Claude Code    | MCP/skill available. Agent SDK session connector pending.                                                                                         |
| Cursor         | MCP/skill available. CLI session connector pending.                                                                                               |
| Hermes Agent   | Configurable stdio MCP. Persisted-session connector pending.                                                                                      |
| Antigravity    | MCP and Desktop setup from 0.5.1-preview.1. Not validated in the real client; resume connector pending.                                           |

**Continuar desde el chat** (Continue from the chat) means your response is saved but no resume connector is assigned. Retry does not create an agent or open a chat.

Without a connector, cooperative execution can continue while the host keeps its tool call open. A guided call waits at most ten minutes, then reports disconnection once. Repeatedly renewing it does not create background execution. MCP support alone does not wake a closed chat.

Harness identity does not change workflow rules. Session references, permissions and duplicate-turn prevention belong to the connector.

[Explore the architecture](../referencia/arquitectura.md) · [Contract, official sources and protocol tests](https://github.com/0vas/hyperion/blob/main/docs/continuacion-agnostica.md)
