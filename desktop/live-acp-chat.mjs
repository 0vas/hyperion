import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as acp from '@agentclientprotocol/sdk';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mcpLauncher = resolve(appRoot, 'dist/adapters/chat-mcp-launcher.js');

const ADAPTERS = {
  codex: {
    package: 'codex-acp',
    label: 'Codex',
  },
  claude: {
    package: 'claude-agent-acp',
    label: 'Claude Code',
  },
  cursor: { label: 'Cursor Agent', native: true },
  antigravity: { label: 'Antigravity', native: true },
};

/** Native ACP CLIs run directly; packaged adapters only wrap Claude and Codex. */
export function acpLaunchSpec(harness, executable, inherited = process.env) {
  const adapter = ADAPTERS[harness];
  if (!adapter) throw new Error('Unsupported ACP harness.');
  const env = { ...inherited };
  // Desktop launched from Finder may not inherit the user's CLI runtime paths.
  env.PATH = [
    ...new Set([
      dirname(executable),
      ...String(env.PATH || '')
        .split(delimiter)
        .filter(Boolean),
      ...(process.platform === 'win32'
        ? []
        : [
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            '/bin',
            resolve(homedir(), '.local/bin'),
            resolve(homedir(), '.gemini/bin'),
          ]),
    ]),
  ].join(delimiter);
  if (adapter.native) {
    delete env.ELECTRON_RUN_AS_NODE;
    return { command: executable, args: ['acp'], env };
  }
  env.ELECTRON_RUN_AS_NODE = '1';
  if (harness === 'codex') {
    env.CODEX_PATH = executable;
    env.INITIAL_AGENT_MODE = 'read-only';
  } else env.CLAUDE_CODE_EXECUTABLE = executable;
  return { command: process.execPath, args: [acpAdapterPath(harness)], env };
}

async function withDeadline(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('ACP connection timed out.')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function acpAdapterPath(harness) {
  const adapter = ADAPTERS[harness];
  if (!adapter?.package)
    throw new Error('This harness uses its native ACP executable.');
  return resolve(
    appRoot,
    'node_modules',
    '@agentclientprotocol',
    adapter.package,
    'dist',
    'index.js',
  );
}

function privateWorkspace(userData, harness) {
  const workspace = resolve(userData, `live-${harness}-workspace`);
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  return workspace;
}

function privateMcpServer({ directory, url, harness }) {
  return {
    type: 'stdio',
    name: 'hyperion_active',
    command: process.execPath,
    args: [mcpLauncher],
    env: [
      { name: 'ELECTRON_RUN_AS_NODE', value: '1' },
      { name: 'HYPERION_INTERACTIVE_CHAT', value: '1' },
      { name: 'HYPERION_AGENT_ID', value: harness },
      { name: 'HYPERION_DATA_DIR', value: directory },
      { name: 'HYPERION_URL', value: url },
    ],
  };
}

export function safeFailure(harness, error, stderr = '') {
  const detail = `${error?.message || ''}\n${stderr}`.toLowerCase();
  const label = ADAPTERS[harness]?.label || 'The local harness';
  if (/(oauth|authenticat|login|sign.?in|api.?key)/.test(detail))
    return `${label} needs a valid local sign-in before Hyperion can start a session.`;
  if (/(enoent|not found|cannot find)/.test(detail))
    return `${label} could not be found. Choose its executable and retry.`;
  return `${label} could not start a local ACP session. Review its local setup and retry.`;
}

/**
 * One persistent Agent Client Protocol connection. ACP is deliberately the
 * boundary between the Desktop UI and each installed local harness: Hyperion
 * owns the transcript and consent UI while the provider owns its session.
 */
export class LiveAcpChat {
  constructor({
    harness,
    userData,
    directory,
    url,
    onEvent,
    onError,
    spawnImpl = spawn,
    resolveExecutable,
    connectionTimeoutMs = 30000,
  }) {
    if (!ADAPTERS[harness]) throw new Error('Unsupported ACP harness.');
    this.harness = harness;
    this.userData = userData;
    this.directory = directory;
    this.url = url;
    this.onEvent = onEvent;
    this.onError = onError;
    this.spawnImpl = spawnImpl;
    this.resolveExecutable = resolveExecutable;
    this.connectionTimeoutMs = connectionTimeoutMs;
    this.child = null;
    this.connection = null;
    this.agent = null;
    this.runId = null;
    this.threadId = null;
    this.turnId = null;
    this.stoppingTurnId = null;
    this.stderr = '';
    this.pendingApprovals = new Map();
    this.connecting = false;
  }

  emit(event) {
    this.onEvent(event);
  }

  async connect(runId) {
    if (this.connecting)
      throw new Error('A local connection is already starting.');
    if (this.connection) {
      if (this.runId !== runId)
        throw new Error('Close the current local harness session first.');
      this.emit({ type: 'connection', status: 'connected' });
      this.emit({ type: 'thread', runId, threadId: this.threadId });
      return { connected: true };
    }
    this.emit({ type: 'connection', status: 'connecting' });
    const launcher = this.resolveExecutable();
    if (!launcher?.executable) {
      const message = `${ADAPTERS[this.harness].label} is not available locally. Choose its executable and retry.`;
      this.emit({ type: 'connection', status: 'disconnected', message });
      return { connected: false, setup: launcher?.status || 'missing' };
    }
    const workspace = privateWorkspace(this.userData, this.harness);
    this.connecting = true;
    this.stderr = '';
    const spec = acpLaunchSpec(this.harness, launcher.executable);
    let child;
    try {
      child = this.spawnImpl(spec.command, spec.args, {
        cwd: workspace,
        env: spec.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      this.disconnect(error);
      return { connected: false, setup: 'failed' };
    }
    this.child = child;
    child.stderr.setEncoding?.('utf8');
    child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-4_000);
    });
    child.once('error', (error) => {
      if (this.child === child) this.disconnect(error);
    });
    child.once('exit', (code) => {
      if (this.child === child)
        this.disconnect(new Error(`ACP adapter exited (${code}).`));
    });

    const client = acp
      .client({ name: 'hyperion-desktop' })
      .onRequest(acp.methods.client.session.requestPermission, (context) =>
        this.child === child
          ? this.requestPermission(context.params, context.signal)
          : { outcome: { outcome: 'cancelled' } },
      )
      .onNotification(acp.methods.client.session.update, (context) =>
        this.onSessionUpdate(context.params),
      );
    // Cursor-specific blocking requests must never hang or implicitly approve.
    // Workflow forms and plan review belong to the Hyperion canvas.
    for (const method of ['cursor/ask_question', 'cursor/create_plan']) {
      client.onRequest(
        method,
        (params) => params,
        () => {
          this.emit({
            type: 'action',
            threadId: this.threadId,
            label: 'Use the Hyperion canvas for questions and plan approval.',
            status: 'cancelled',
          });
          return { outcome: { outcome: 'cancelled' } };
        },
      );
    }
    try {
      const stream = acp.ndJsonStream(
        Writable.toWeb(child.stdin),
        Readable.toWeb(child.stdout),
      );
      const connection = client.connect(stream);
      this.connection = connection;
      this.agent = connection.agent;
      connection.closed.then(() => {
        if (this.connection === connection) this.disconnect();
      });
      const init = await withDeadline(
        this.agent.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientInfo: { name: 'Hyperion Desktop', version: '1' },
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
        }),
        this.connectionTimeoutMs,
      );
      if (
        this.harness === 'cursor' &&
        init.authMethods?.some((method) => method.id === 'cursor_login')
      ) {
        await withDeadline(
          this.agent.request(acp.methods.agent.authenticate, {
            methodId: 'cursor_login',
          }),
          this.connectionTimeoutMs,
        );
      }
      const session = await withDeadline(
        this.agent
          .buildSession({
            cwd: workspace,
            mcpServers: [
              privateMcpServer({
                directory: this.directory,
                url: this.url,
                harness: this.harness,
              }),
            ],
          })
          .start(),
        this.connectionTimeoutMs,
      );
      if (this.child !== child)
        throw new Error('ACP session was closed during connection.');
      this.runId = runId;
      this.threadId = session.sessionId;
      this.connecting = false;
      this.emit({ type: 'connection', status: 'connected' });
      this.emit({ type: 'thread', runId, threadId: this.threadId });
      return { connected: true };
    } catch (error) {
      this.disconnect(error);
      return { connected: false, setup: 'failed' };
    }
  }

  async send(runId, text) {
    if (!this.agent || !this.threadId || this.runId !== runId)
      throw new Error('Connect the active run to a local harness first.');
    if (this.turnId)
      throw new Error('Wait for the current local turn to finish.');
    const prompt = String(text || '').trim();
    if (!prompt) throw new Error('Write a message for the local harness.');
    const turnId = randomUUID();
    this.turnId = turnId;
    this.emit({ type: 'user-message', threadId: this.threadId, text: prompt });
    this.emit({
      type: 'turn',
      threadId: this.threadId,
      turnId,
      status: 'running',
    });
    void this.agent
      .request(acp.methods.agent.session.prompt, {
        sessionId: this.threadId,
        prompt: [
          {
            type: 'text',
            text: `Hyperion context: the active workflow ID is ${runId}. Use the hyperion_active MCP server to inspect its current state before workflow actions. Other configured Hyperion servers belong to different contexts: do not use them for this workflow. Human forms, approvals and irreversible confirmations remain in the canvas. Do not claim work was performed without evidence. The user's message follows.`,
          },
          { type: 'text', text: prompt },
        ],
      })
      .then((result) => {
        if (this.turnId !== turnId) return;
        this.finish(
          result?.stopReason === 'end_turn'
            ? 'completed'
            : result?.stopReason === 'cancelled'
              ? 'interrupted'
              : 'failed',
        );
      })
      .catch((error) => {
        if (this.turnId === turnId) this.finish('failed', error);
      });
  }

  async stop(runId) {
    if (!this.agent || !this.threadId || !this.turnId || this.runId !== runId)
      throw new Error('There is no active local harness turn to stop.');
    const turnId = this.turnId;
    this.stoppingTurnId = turnId;
    try {
      // Send cancel first, then release permission requests immediately. Some
      // providers cannot finish cancellation while their permission is pending.
      const cancellation = this.agent.notify(acp.methods.agent.session.cancel, {
        sessionId: this.threadId,
      });
      this.cancelPendingApprovals();
      await cancellation;
    } catch (error) {
      this.cancelPendingApprovals();
      if (this.turnId === turnId) this.finish('failed', error);
      throw error;
    }
  }

  requestPermission(params, signal) {
    if (
      !this.runId ||
      !this.threadId ||
      !this.turnId ||
      this.stoppingTurnId ||
      params.sessionId !== this.threadId ||
      signal?.aborted
    )
      return Promise.resolve({ outcome: { outcome: 'cancelled' } });
    const token = randomUUID();
    const options = Array.isArray(params.options) ? params.options : [];
    return new Promise((resolveResult) => {
      const onAbort = () => this.resolvePermission(token, 'cancelled');
      this.pendingApprovals.set(token, {
        resolveResult,
        options,
        runId: this.runId,
        threadId: this.threadId,
        turnId: this.turnId,
        removeAbortListener: () =>
          signal?.removeEventListener('abort', onAbort),
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.emit({
        type: 'approval',
        threadId: this.threadId,
        token,
        label:
          params.toolCall?.title || 'The local harness requests permission.',
      });
    });
  }

  approve(runId, token, decision) {
    const pending = this.pendingApprovals.get(token);
    if (!pending || this.runId !== runId || pending.runId !== runId)
      throw new Error('That harness approval is no longer pending.');
    if (
      !this.turnId ||
      this.stoppingTurnId ||
      pending.threadId !== this.threadId ||
      pending.turnId !== this.turnId
    ) {
      this.resolvePermission(token, 'cancelled');
      throw new Error('That harness approval is no longer pending.');
    }
    const option =
      decision === 'allow'
        ? pending.options.find(
            (item) => item?.kind === 'allow_once' && item.optionId,
          )
        : null;
    this.resolvePermission(
      token,
      option ? 'allowed' : decision === 'allow' ? 'cancelled' : 'denied',
      option?.optionId,
    );
  }

  resolvePermission(token, decision, optionId) {
    const pending = this.pendingApprovals.get(token);
    if (!pending) return;
    this.pendingApprovals.delete(token);
    pending.removeAbortListener();
    pending.resolveResult({
      outcome:
        decision === 'allowed'
          ? { outcome: 'selected', optionId }
          : { outcome: 'cancelled' },
    });
    this.emit({
      type: 'approval-resolved',
      threadId: pending.threadId,
      token,
      decision,
    });
  }

  cancelPendingApprovals() {
    for (const token of this.pendingApprovals.keys())
      this.resolvePermission(token, 'cancelled');
  }

  onSessionUpdate({ sessionId, update }) {
    if (sessionId !== this.threadId || !update) return;
    if (
      update.sessionUpdate === 'agent_message_chunk' &&
      update.content?.type === 'text'
    ) {
      if (
        /^\s*(Failed to authenticate:|OAuth session expired|Invalid API key|Please run \/login)/i.test(
          update.content.text,
        )
      ) {
        this.disconnect(new Error('Authentication required'));
        return;
      }
      this.emit({
        type: 'assistant-delta',
        threadId: sessionId,
        itemId: update.messageId || this.turnId || 'assistant',
        text: update.content.text,
      });
      return;
    }
    if (update.sessionUpdate === 'tool_call') {
      this.emit({
        type: 'action',
        threadId: sessionId,
        label: update.title || 'Harness action',
        status: update.status || 'running',
      });
      return;
    }
    if (update.sessionUpdate === 'tool_call_update')
      this.emit({
        type: 'action',
        threadId: sessionId,
        label: 'Harness action updated',
        status: update.status || 'running',
      });
  }

  finish(status, error) {
    if (!this.turnId || !this.threadId) return;
    const turnId = this.turnId;
    this.turnId = null;
    this.stoppingTurnId = null;
    this.cancelPendingApprovals();
    this.emit({ type: 'turn', threadId: this.threadId, turnId, status });
    if (status === 'failed')
      this.disconnect(error || new Error('The local turn failed.'));
  }

  resolveUncertain() {
    this.emit({ type: 'connection', status: 'disconnected' });
  }

  disconnect(error) {
    const active = this.child;
    const connection = this.connection;
    this.child = null;
    this.connection = null;
    this.agent = null;
    this.connecting = false;
    this.stoppingTurnId = null;
    this.cancelPendingApprovals();
    connection?.close?.();
    if (active) active.kill?.('SIGTERM');
    if (this.turnId) {
      this.emit({
        type: 'turn',
        threadId: this.threadId,
        turnId: this.turnId,
        status: 'failed',
      });
      this.turnId = null;
    }
    if (error) {
      const message = safeFailure(this.harness, error, this.stderr);
      const code = /sign-in/.test(message) ? 'auth-required' : 'session-failed';
      this.onError?.(new Error(message));
      this.emit({ type: 'connection', status: 'disconnected', message, code });
    } else this.emit({ type: 'connection', status: 'disconnected' });
  }

  dispose() {
    this.disconnect();
  }
}
