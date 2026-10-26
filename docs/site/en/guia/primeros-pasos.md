# Your first workflow

You need a compatible AI tool connected to Hyperion. Set up the connection once; write subsequent requests in your chat.

<Quickstart />

## Try it before installing

<WorkflowDemo />

## 1. Open Hyperion

<Downloads />

Choose the installer for your computer. On Apple Silicon Macs, open the DMG and move Hyperion to **Applications** before connecting your AI. On Windows, open the EXE. The Apple Silicon installer is signed with **Developer ID** and **notarized by Apple**. Windows has no publisher signature.

### macOS blocks the app

With the current notarized distribution, Gatekeeper should accept Hyperion. If “Apple could not verify Hyperion.app is free of malware” still appears, that alone does not establish download corruption; confirm you downloaded the official release and try again.

If macOS still blocks an official copy:

1. Move **Hyperion.app** to **Applications** and attempt to open it once.
2. Choose **Done** in the alert.
3. Open **System Settings → Privacy & Security**. Find Hyperion under Security and choose **Open Anyway**.
4. Confirm opening and authenticate if macOS requests it.

This exception applies to Hyperion. Do not disable Gatekeeper system-wide. If the button is absent, the Mac is managed, or the alert says the app is damaged or contains malware, do not force it open: consult [Apple’s official guide](https://support.apple.com/en-us/102445) and report the exact message.

## 2. Connect your AI

Choose **Codex**, **Cursor**, **Claude Desktop**, **Claude Code** or **Antigravity** in the first-launch assistant. You can reopen it from **Hyperion → Conectar con mi IA** (Connect my AI).

Restart your AI tool and open a new chat to load the integration. The basic Desktop path needs no Node.js or manual config edits. When the work uses **project files or a terminal**, the documented path is **Claude Code** (skill + MCP + `/mcp`); the canvas still opens in a browser or Desktop—Code does not embed a Hyperion pane. [Details](./integraciones.md#claude-code-happy-path-for-local-files).

## 3. Ask for what you need

> Use Hyperion to prepare a welcome guide for my project.

::: tip Just describe your goal
You do not need to design the workflow or explain how to use Hyperion. The agent organizes the steps and asks for missing information **on the canvas**, not as a chat questionnaire.
:::

The agent shares a link to your workflow. A new chat can start with this request once the connection is installed.

You can ask for a desktop window or a canvas beside your chat. Split view availability depends on your AI tool; the browser link opens the same run.

## 4. Take part in the canvas

Open the task marked **Tu turno** (Your turn), answer and save. Known choices appear as dropdowns when the plan declares their options; open questions accept text. The application currently uses Spanish labels; this documentation supports both languages.

If the agent is still waiting through the integration, it can continue in the same turn. If the chat has ended, use **Copiar continuación** (Copy continuation) and send the message in the connected chat. Your answer is already saved. See [pause and resume](./reanudacion.md) for connector capabilities.

## Check your first run

- The workflow reflects your request and identifies each task's owner.
- Your responses appear in I/O and reach subsequent tasks.
- The draft and real progress are recorded in the workflow.
- You can review the result and request changes in the chat.

Preparing a guide does not authorize publishing it. The integration must respect the scope of your request.

[Use the canvas](./usar-el-flujo.md) · [Connection troubleshooting](./integraciones.md)

## Requests ready to try

<UseCases />

Choose a case, copy the request and paste it into your connected AI tool. The agent adapts the plan to your context. These examples describe expected workflows, not guaranteed executions.

::: details Try it from source
For developers who prefer a local checkout instead of Desktop. Requires Node.js 22.13 or newer.

```sh
git clone https://github.com/0vas/hyperion.git
cd hyperion
npm ci
npm run build
npm start
```

In a second terminal, connect your tool once:

```sh
npm run hyperion -- setup cursor
# Alternatives: setup codex / setup claude
```

Restart that AI tool, open a new chat and paste a request from above. Visit `http://127.0.0.1:4317` to view the canvas. This runs the code in `main`, not the older preview installer.
:::

## Language, version and connections

Hyperion includes **Spanish and English** in the canvas and Desktop menus and dialogs. Open **Settings → Language** and choose **Automatic (system)**, **Español** or **English**. Desktop also provides **Hyperion → Language**.

Automatic mode follows the system or browser language and falls back to English when unsupported. A manual selection persists when reopening the app. Desktop menus and the canvas share one preference; the browser stores its own choice separately.

CalVer appears in the **Connections** view and in **About** (macOS). The header shows the **local service** and a quiet entry to **Connections** (Codex, Cursor, Claude Desktop, Claude Code, Antigravity). “Connected” does not mean your AI app has already loaded tools; after setup, restart the client and open a new chat. Hyperion does not overwrite a different entry.

::: tip Your content keeps its language
Switching the interface does not translate task names, agent questions, answers, results or logs. It does not restart the workflow or discard an unsubmitted form. Original tool and service diagnostics retain their text for troubleshooting.
:::

Included in the **2026.10.12.1722 UTC · Preview** installer, together with step artifacts and linked runs.

## Update Desktop

From CalVer **2026.10.12.0638 UTC**, open **Hyperion → Check for updates…**. The app checks GitHub and offers an installer for your computer. **Update and restart** downloads the official installer, checks size and SHA-256, then applies it and relaunches Hyperion (on macOS it replaces this app after `codesign`; on Windows it runs the verified NSIS installer). **Download installer…** saves the file for a manual install. Cancel with **Hyperion → Cancel download**. Workflows remain in local storage.

**The first migration from 0.4 or 0.5.1 to CalVer is manual from this page**: the old updater does not recognize the new tags. Public versions use **YYYY.MM.DD.HHmm UTC**, including hours and minutes; Preview is a separate channel. Subsequent updates are compared chronologically.

Version 0.4.0 requires a manual upgrade. Its macOS bundle has an incomplete signature; downloading the same installer again does not fix it. The current Apple Silicon installer is Developer ID signed and notarized by Apple. If macOS blocks installation, consult [Apple’s guide](https://support.apple.com/102445); do not disable system-wide protection.

Starting with **2026.10.12.2101**, opening the updated app automatically backs up and restarts the older service from the same installation. Workflows, files, answers and history remain intact; tasks are not executed again. You do not need to restart your computer. The backup remains in `backups` inside the local data directory.

If the default port (`127.0.0.1:4317`) is held by another Hyperion — for example from another account on this Mac or another installation — Desktop does not stop it: it starts this install on another free loopback port, remembers that URL in `~/.hyperion/workspace.json`, and reopens there while that service stays alive and authenticated (so two servers never share the same data directory). If the remembered alternate no longer answers with your credentials, the next launch prefers `4317` again. The default remains `4317` when no URL is remembered or when that port is free. Packaged Desktop stores data in `~/.hyperion`. If the conflict cannot be recovered (another program on the port, backup impossible, or a newer service), Hyperion leaves the foreign process running and shows an actionable message. Retry, View diagnostics and Check for updates remain available.
