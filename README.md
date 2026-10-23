# Hyperion

<p align="center"><img src="docs/site/public/brand/hyperion-titan.png" alt="Hyperion — solar titan icon" width="104" height="104" /></p>

[![License: MIT](https://img.shields.io/badge/License-MIT-755922?labelColor=273139)](LICENSE)
[![Documentation build](https://img.shields.io/github/actions/workflow/status/0vas/hyperion/pages.yml?branch=main&label=Docs&labelColor=273139)](https://github.com/0vas/hyperion/actions/workflows/pages.yml)
[![GitHub repository](https://img.shields.io/badge/GitHub-0vas%2Fhyperion-755922?logo=github&logoColor=white&labelColor=273139)](https://github.com/0vas/hyperion)

[Reanudación agnóstica: contrato y alcance por herramienta](docs/continuacion-agnostica.md). El núcleo 0.5 guarda pausas y solicitudes de continuación; los conectores nativos para reactivar chats todavía deben integrarse.

**Human-guided workflows for any AI tool.** Turn a conversation into a visible plan: see what your agent is doing, supply information, review evidence, and decide when it can continue.

Hyperion is an independent, MIT-licensed module. It can accompany Codex or another compatible agent through HTTP, a CLI, or MCP. It has no dependency on Olimpo and does not require an AI API key.

> **v0.4 — local cooperative preview.** One trusted user and one external coordinator per execution. Hyperion manages workflow state; your agent performs the actual work. Multi-agent dispatch, hosted multi-user operation, and automatic conversation wakeups are future work.

![Hyperion landscape canvas with interactive workflow nodes](docs/images/workflow.png)

**[Español](https://0vas.github.io/hyperion/) · [English](https://0vas.github.io/hyperion/en/)** — setup, daily use, integrations and architecture.

**[Interactive architecture · Archify](https://0vas.github.io/hyperion/en/referencia/arquitectura.html)** · [Formal ArchiMate models](docs/architecture/README.md).

## Start in your conversation

Say **“Usa Hyperion para [tu actividad]”** to a connected agent. It starts Hyperion, creates jobs and executable steps from the request, and shares the canvas. Choose between the job overview and detailed steps; focus or follow the active task. Human decisions show a concrete question, context and next action. Appearance and navigation preferences live in **Ajustes**. Switch vertical/horizontal from the direction button. SVG BPMN gateways, animated execution, waiting pulses, decision checklists and visible retries make the process readable.

For daily use, follow the [Spanish user manual](docs/manual-uso.md). The installation instructions below are for setting up a new environment; the user does not run them for each activity.

## Connect once, then just ask

The simplest path is **Hyperion Desktop**; it includes its runtime:

1. Install the macOS `.dmg` or Windows `.exe` and open Hyperion. On macOS, move it to Applications before connecting.
2. In the first-launch assistant, choose **Codex**, **Cursor**, **Claude Desktop**, **Claude Code**, or **Antigravity** (0.5.1-preview.1+). You can connect another application later from **Hyperion → Conectar con mi IA**.
3. Restart your AI application, open a new chat, and say **“Usa Hyperion para preparar una guía breve de bienvenida a mi proyecto.”**

No terminal, Node installation, API key or hand-written configuration is needed for this Desktop path. Codex, Cursor, Claude Desktop and Antigravity receive a local MCP connection; Claude Desktop and Claude Code also receive the portable skill under `~/.claude/skills/hyperion`. Hyperion preserves other connections and backs up existing configuration before changing it. A conflicting Hyperion entry is reported without overwriting it.

Google Antigravity is supported by the Desktop connection assistant and `setup antigravity` in `main`. [Setup and version availability](docs/conexion.md#antigravity): 0.5.1-preview.1 installers include this option; users of 0.4.0 need a manual upgrade. Configuration and MCP contract tests pass; a real Antigravity conversation and native resume connector remain unverified.

The request is enough: the agent asks for missing context, constructs the workflow and shares its canvas. You can request **split** or **desktop** in the chat; both show the same run. After a human handoff, ask the chat to continue. Hyperion does not wake an idle conversation automatically.

**Direct downloads:** [macOS · Apple Silicon](https://github.com/0vas/hyperion/releases/download/v2026.10.23.0823/Hyperion-2026.10.23.0823-mac-arm64.dmg) · [Windows · x64](https://github.com/0vas/hyperion/releases/download/v2026.10.23.0823/Hyperion-2026.10.23.0823-win-x64.exe).

These are **2026.10.23.0823 UTC · Preview** installers (CalVer: year, month, day, hour and minute) with Update and Restart, foreign-port alternate recovery when another Hyperion owns `:4317`, a readable canvas, Spanish/English interfaces, step artifacts, linked conversation cycles and in-app update downloads. The Apple Silicon macOS installer is Developer ID signed and Apple-notarized; Windows installers have no publisher signature. Intel macOS is not published in this release. The first migration from 0.4/0.5.1 to CalVer is manual; the old updater cannot read CalVer tags.

**[Download Hyperion Desktop — preview](https://github.com/0vas/hyperion/releases/tag/v2026.10.23.0823)** · macOS Apple Silicon · Windows x64.

A stable channel release remains pending. New Desktop builds target **macOS Apple Silicon (arm64)** and **Windows x64** only. Both native jobs in the [Desktop installers workflow](https://github.com/0vas/hyperion/actions/workflows/desktop.yml) must pass before their tested installers can be published. Intel Mac builds are no longer produced; historical release assets remain available. Source versions may be newer than the published installers linked above. Protocol tests do not replace native conversation testing in every AI client.

[Setup and troubleshooting](docs/conexion.md) · [User manual](docs/manual-uso.md) · [Desktop build details](desktop/README.md)

### Alternative for an agent with local shell access

From a prepared checkout, `npm run hyperion -- install` installs the portable skill. Reload skills or open a new agent session. A compiled archive can also be installed with `npm install --global ./hyperion-workflows-2026.10.12-build.398.tgz`, followed by `hyperion install`; this alternative needs Node.js 22.13+. The archive is built with `npm pack` and is not published to npm.

## Run from source

Requirements: Node.js **22.13+** (Node 24 LTS recommended) and npm. `node:sqlite` may emit an experimental warning on older supported Node versions.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. State and locally generated credentials live in `.hyperion/`, excluded from Git. The CLI and portable skill can also start the server on demand.

In another terminal, create a real workflow:

```sh
npm run hyperion -- create examples/codex-trial.json
```

Open the returned URL, submit your objective, and ask your agent to read the run and continue. The sample does not fabricate agent activity or run commands automatically.

## What works

- Directed acyclic plans with agent, manual, and approval steps.
- An executable BPMN-based profile: start/end and structured parallel, exclusive and inclusive gateways.
- Typed task inputs/outputs and public decision/action/observation traces, each available from node icons.
- Dependency gates, independent parallel steps, and explicit coordinator ownership.
- An edge-to-edge canvas with floating controls, task selection, focus and optional activity following. Manual navigation releases following; details, I/O and logs remain available in popups.
- Node popups for human input, approvals, step details and evidence; buttons for the original request and activity.
- Human input, approval/rejection, pause/resume, cancel, and retry after failure.
- Transactional SQLite persistence and command idempotency.
- Version checks that reject stale human decisions.
- A JSON HTTP API, CLI, and tested MCP stdio adapter.

The interface receives committed updates through SSE, with periodic reads as a fallback. An agent must cooperate with the protocol; Hyperion cannot stop arbitrary work performed outside it. Future work can be exceptionally revised with a reason and expected revision. Executed/presented work is preserved; revisions pause for human review. Terminal runs require a new run.

## Connect an agent

MCP is an optional alternative to the portable skill. After `npm ci`, configure your client with one command:

```sh
npm run hyperion -- setup codex  # or claude / cursor
```

The adapter starts Hyperion locally on demand. Reload MCP tools or start a new client session. No hand-written connection JSON is required. [Setup and manual alternatives](docs/conexion.md).

The CLI works immediately from an existing Codex conversation with local shell access:

```sh
npm run hyperion -- list
npm run hyperion -- get RUN_ID
npm run hyperion -- start RUN_ID STEP_ID
# Perform the actual authorized work using your own tools.
npm run hyperion -- complete RUN_ID STEP_ID 'What was done and how it was verified'
```

Start with a natural-language request: “Use Hyperion to guide me through…”. The connected agent generates the plan and records the request; users do not need to write JSON.

Run `npm run hyperion -- connect codex` (or `claude`, `cursor`, or your client ID) to generate its MCP connection configuration. Follow the [manual in Spanish](docs/manual-uso.md) for each application, a complete request-driven test case, and troubleshooting. See the [agent integration contract](docs/integration.md) for exact tools and the human handoff protocol.

## Develop and verify

```sh
npm run dev       # API, watch mode
npm run dev:ui    # Vite UI, separate terminal
npm run check     # Types, unit/integration/MCP tests, build, formatting
npx playwright install chromium
npm run test:e2e  # Real browser interaction and accessibility checks
```

Tests use isolated storage. The browser suite runs a separate server on port 4318 and resets only `.hyperion-e2e/`.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). CI runs on Node 22 and 24.

## Architecture

```text
src/domain/       Pure workflow model, validation, state transitions
src/server/       HTTP boundary, local sessions, transactional SQLite store
src/adapters/     HTTP client, CLI, MCP stdio server
src/client/       React UI and graph
```

[Architecture context and ArchiMate view](docs/architecture/README.md) · [First increment decision](docs/decisions/0001-functional-increment.md) · [Request-driven integrations](docs/decisions/0002-request-driven-integrations.md) · [Protocol](docs/protocol.md) · [Process and data contract](docs/process-contract.md) · [Functional test with Codex](docs/functional-test.md)

## Configuration

| Variable            | Default                           | Purpose                                                   |
| ------------------- | --------------------------------- | --------------------------------------------------------- |
| `HYPERION_PORT`     | `4317`                            | Local server port                                         |
| `HYPERION_DATA_DIR` | `.hyperion`                       | SQLite and credentials directory                          |
| `HYPERION_AGENT_ID` | `codex`                           | Registered CLI/MCP identity; also initial server identity |
| `HYPERION_URL`      | `http://127.0.0.1:4317`           | CLI/MCP target                                            |
| `HYPERION_TOKEN`    | Agent token from credentials file | Optional CLI/MCP credential override                      |

Use `127.0.0.1` in browser URLs, not `localhost`; Host and Origin are checked against the bound address. The local edition deliberately binds only to loopback. Do not expose it through a public tunnel or reverse proxy without adding a suitable authentication and authorization design.

## License

[MIT](LICENSE) — Copyright © 2026 Oscar Lobaton Salas.

## Interface languages

The canvas and Desktop support Spanish and English, automatically selected from the system/browser language. Change it in **Settings → Language** (or **Ajustes → Idioma**); Desktop also exposes **Hyperion → Language**. The preference persists, and switching preserves current workflow data and unsubmitted answers. User/agent content and original diagnostics are not translated. See the [language guide](https://0vas.github.io/hyperion/en/guia/primeros-pasos.html#app-language).

Included in the **2026.10.23.0823 UTC · Preview** installers.

### Deliverables and continued conversations

Each agent step can expose generated files and links in **Artifacts**, with safe previews and downloads. A new user request after completion can start a linked workflow: the graph shows the previous end and the new beginning while retaining both histories. Included in **2026.10.23.0823 UTC · Preview**. See [the usage guide](docs/manual-uso.md) and [integration examples](docs/integration.md).
