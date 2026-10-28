# Scope and limits

## Available

Vertical and horizontal canvas layouts, jobs and steps, human decisions, typed inputs and outputs, agent-reported logs, retry and future-plan revisions. Local integrations use MCP or a skill; Desktop includes its runtime.

Core 0.5 provides durable suspension and a harness-independent worker. Native session-resumption connectors still need implementation and verification. See [pause and resume](../guia/reanudacion.md).

The `bpmn-lite` profile supports start/end nodes and structured exclusive, inclusive and parallel split/join gateways.

## Not available yet

- Universal wakeup of a chat that has ended its turn.
- Built-in execution of tools or interception of all agent calls.
- BPMN XML import/export or full BPMN: no loops, timers, compensation or messages between pools.
- Hosted multi-user operation, universal installation from a phrase or cross-device connections.
- Publishing changes or completing human decisions without appropriate authorization.

## Distribution

The published `2026.10.28.2302` preview provides Apple Silicon Macs (arm64), signed with Developer ID and notarized by Apple, and Windows x64, without a publisher signature. [Download links](../guia/primeros-pasos.md) point to that published release, not a pending build.

New builds and publications include only macOS arm64 and Windows x64. Both must pass native and packaged-installer tests; new Intel Mac packages are no longer produced. The historical `v0.4.0-preview.1` release included Apple Silicon, Intel and Windows; its files remain available. Native tests do not certify a real conversation in every AI client.

This documentation follows `main`, which may contain changes still absent from published installers. A build or CI artifact is not a new release available to update the application.

## Privacy

Workflow state and events live on the computer running Hyperion. Your AI provider's terms still apply to content it receives. Logs may contain work information; share only what is needed and never credentials.

GitHub Pages serves this static documentation. It does not receive or execute workflows, host SQLite or replace the local application.
