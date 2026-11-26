import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as acp from '@agentclientprotocol/sdk';
import {
  hyperionPromptBlocks,
  validateChatRunId,
} from './hyperion-entry-prompt.mjs';

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

function privateMcpServer({ directory, url, harness, name }) {
  return {
    type: 'stdio',
    name,
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

const AUTO_TOOLS = new Set([
  'hyperion_list_runs',
  'hyperion_get_run',
  'hyperion_wait',
  'hyperion_create_run',
  'hyperion_revise_plan',
  'hyperion_step',
]);
const AUTO_ACTIONS = new Set(['start', 'log', 'complete', 'fail']);
const TERMINAL_ACTIONS = new Set(['completed', 'failed', 'cancelled']);
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const callId = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 200 &&
  !/[\x00-\x1f\x7f]/.test(value)
    ? value
    : undefined;
function inputSignature(value) {
  if (!record(value)) return undefined;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= 64_000 ? serialized : undefined;
  } catch {
    return undefined;
  }
}
function publicLabel(identity, kind) {
  // Providers can put complete commands or private prose in titles. Project
  // only fixed labels; attempting to redact arbitrary text is not sufficient.
  const operations = {
    hyperion_list_runs: 'List workflows',
    hyperion_get_run: 'Read workflow',
    hyperion_wait: 'Wait for workflow',
    hyperion_create_run: 'Create workflow',
    hyperion_revise_plan: 'Revise workflow plan',
    hyperion_step: 'Update workflow step',
  };
  const kinds = {
    read: 'Read content',
    edit: 'Edit content',
    delete: 'Delete content',
    move: 'Move content',
    search: 'Search content',
    execute: 'Run command',
    think: 'Process request',
    fetch: 'Fetch content',
    switch_mode: 'Change mode',
  };
  if (identity && Object.hasOwn(operations, identity.tool))
    return operations[identity.tool];
  return Object.hasOwn(kinds, kind) ? kinds[kind] : 'Harness action';
}
function actionStatus(value, prior = 'pending') {
  const statuses = {
    pending: 'pending',
    in_progress: 'running',
    running: 'running',
    completed: 'completed',
    succeeded: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
  };
  return Object.hasOwn(statuses, value) ? statuses[value] : prior;
}
/** Only schema-shaped facts from a verified Hyperion response leave main. */
function publicResult(update, identified) {
  if (!identified) return undefined;
  const opaque = update.rawOutput;
  const result = record(opaque?.result) ? opaque.result : opaque;
  if (opaque?.error || result?.isError === true)
    return 'Tool reported an error.';
  const blocks = Array.isArray(result?.content) ? result.content : [];
  for (const block of blocks.slice(0, 4)) {
    if (
      block?.type !== 'text' ||
      typeof block.text !== 'string' ||
      block.text.length > 256_000
    )
      continue;
    let value;
    try {
      value = JSON.parse(block.text);
    } catch {
      continue;
    }
    const run = record(value?.run) ? value.run : value;
    if (
      record(run) &&
      [
        'active',
        'paused',
        'completed',
        'failed',
        'cancelled',
        'rejected',
      ].includes(run.status) &&
      Array.isArray(run.steps)
    ) {
      return `Workflow ${run.status}; ${run.steps.length} steps recorded.`;
    }
    if (
      Array.isArray(value) &&
      value.length <= 1000 &&
      value.every(
        (item) =>
          record(item) &&
          typeof item.id === 'string' &&
          typeof item.status === 'string',
      )
    ) {
      return `${value.length} workflows returned.`;
    }
  }
  return undefined;
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
    this.entryPromptSent = false;
    this.permissionMode = 'manual';
    this.mcpServerName = `hyperion_active_${randomUUID().replaceAll('-', '')}`;
    this.toolCalls = new Map();
    this.seenToolCalls = new Map();
  }

  emit(event) {
    this.onEvent({ runId: this.runId, ...event });
  }

  async connect(runId) {
    validateChatRunId(runId);
    if (this.connecting)
      throw new Error('A local connection is already starting.');
    if (this.connection) {
      if (this.runId !== runId)
        throw new Error('Close the current local harness session first.');
      this.emit({ type: 'connection', status: 'connected' });
      this.emit({ type: 'thread', runId, threadId: this.threadId });
      this.emitPermissionMode();
      return { connected: true };
    }
    this.runId = runId;
    this.emit({ type: 'connection', status: 'connecting' });
    const launcher = this.resolveExecutable();
    if (!launcher?.executable) {
      const message = `${ADAPTERS[this.harness].label} is not available locally. Choose its executable and retry.`;
      this.emit({ type: 'connection', status: 'disconnected', message });
      return { connected: false, setup: launcher?.status || 'missing' };
    }
    const workspace = privateWorkspace(this.userData, this.harness);
    this.mcpServerName = `hyperion_active_${randomUUID().replaceAll('-', '')}`;
    this.seenToolCalls.clear();
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
        this.child === child ? this.onSessionUpdate(context.params) : undefined,
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
                name: this.mcpServerName,
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
      this.entryPromptSent = false;
      this.connecting = false;
      this.emit({ type: 'connection', status: 'connected' });
      this.emit({ type: 'thread', runId, threadId: this.threadId });
      this.emitPermissionMode();
      return { connected: true };
    } catch (error) {
      this.disconnect(error);
      return { connected: false, setup: 'failed' };
    }
  }

  async send(runId, text) {
    validateChatRunId(runId);
    if (!this.agent || !this.threadId || this.runId !== runId)
      throw new Error(
        'Connect this workflow selection to a local harness first.',
      );
    if (this.turnId)
      throw new Error('Wait for the current local turn to finish.');
    const prompt = String(text || '').trim();
    if (!prompt) throw new Error('Write a message for the local harness.');
    const blocks = hyperionPromptBlocks({
      runId,
      text: prompt,
      includeEntry: !this.entryPromptSent,
      serverName: this.mcpServerName,
    });
    this.entryPromptSent = true;
    const turnId = randomUUID();
    this.turnId = turnId;
    this.toolCalls.clear();
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
        prompt: blocks,
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
    this.resetPermissionMode();
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
    // null is a real no-workflow selection, not a missing session. Consent is
    // still bound to this live session/turn and its exact selection below.
    if (
      !this.threadId ||
      !this.turnId ||
      this.stoppingTurnId ||
      params.sessionId !== this.threadId ||
      signal?.aborted
    )
      return Promise.resolve({ outcome: { outcome: 'cancelled' } });
    const token = randomUUID();
    const options = Array.isArray(params.options)
      ? params.options.slice(0, 64)
      : [];
    const toolCallId = callId(params.toolCall?.toolCallId);
    const identified = this.permissionIdentity(params);
    const once = options.find(
      (item) => item?.kind === 'allow_once' && callId(item.optionId),
    );
    const autoEligible = !!identified && !!once;
    return new Promise((resolveResult) => {
      const onAbort = () => this.resolvePermission(token, 'cancelled');
      this.pendingApprovals.set(token, {
        resolveResult,
        options,
        runId: this.runId,
        threadId: this.threadId,
        turnId: this.turnId,
        toolCallId,
        autoEligible,
        identity: identified,
        removeAbortListener: () =>
          signal?.removeEventListener('abort', onAbort),
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        this.resolvePermission(token, 'cancelled');
        return;
      }
      if (this.permissionMode === 'auto-hyperion' && autoEligible) {
        this.resolvePermission(token, 'allowed', once.optionId);
        return;
      }
      this.emit({
        type: 'approval',
        threadId: this.threadId,
        turnId: this.turnId,
        token,
        ...(toolCallId ? { toolCallId } : {}),
        ...(identified ? { toolName: identified.tool } : {}),
        autoEligible,
        label: publicLabel(identified, params.toolCall?.kind),
      });
    });
  }

  emitPermissionMode() {
    if (this.threadId)
      this.emit({
        type: 'permission-mode',
        threadId: this.threadId,
        mode: this.permissionMode,
      });
    return { mode: this.permissionMode, threadId: this.threadId };
  }

  resetPermissionMode() {
    this.permissionMode = 'manual';
    this.cancelPendingApprovals();
    this.emitPermissionMode();
  }

  setPermissionMode(runId, threadId, mode) {
    if (
      !this.agent ||
      !this.threadId ||
      this.threadId !== threadId ||
      this.runId !== runId ||
      this.stoppingTurnId ||
      !['manual', 'auto-hyperion'].includes(mode)
    )
      throw new Error('That local chat session is no longer available.');
    this.permissionMode = mode;
    if (mode === 'manual') this.cancelPendingApprovals();
    else
      for (const [token, pending] of this.pendingApprovals) {
        if (
          pending.threadId !== this.threadId ||
          pending.turnId !== this.turnId ||
          pending.runId !== this.runId
        ) {
          this.resolvePermission(token, 'cancelled');
          continue;
        }
        const tracked = this.toolCalls.get(pending.toolCallId);
        if (
          pending.autoEligible &&
          tracked?.identity &&
          tracked.identity.tool === pending.identity?.tool &&
          tracked.identity.signature === pending.identity?.signature &&
          !TERMINAL_ACTIONS.has(tracked.status)
        ) {
          const once = pending.options.find(
            (item) => item?.kind === 'allow_once' && callId(item.optionId),
          );
          if (once) this.resolvePermission(token, 'allowed', once.optionId);
        }
      }
    return this.emitPermissionMode();
  }

  toolIdentity(toolCall, permission = false) {
    if (!toolCall || !inputSignature(toolCall.rawInput)) return undefined;
    let tool, args;
    if (this.harness === 'codex') {
      if (!permission && toolCall._meta?.is_mcp_tool_call !== true)
        return undefined;
      if (toolCall._meta?.is_mcp_tool_call === false) return undefined;
      if (toolCall.rawInput.server !== this.mcpServerName) return undefined;
      tool = toolCall.rawInput.tool;
      args = toolCall.rawInput.arguments;
    } else if (this.harness === 'claude') {
      const meta = toolCall._meta?.claudeCode;
      const prefix = `mcp__${this.mcpServerName}__`;
      if (
        typeof meta?.toolName !== 'string' ||
        !meta.toolName.startsWith(prefix)
      )
        return undefined;
      if (
        (permission || meta.mcpServer !== undefined) &&
        (meta.mcpServer?.name !== this.mcpServerName ||
          meta.mcpServer?.source !== 'dynamic')
      )
        return undefined;
      tool = meta.toolName.slice(prefix.length);
      args = toolCall.rawInput;
    } else return undefined;
    if (!AUTO_TOOLS.has(tool) || !record(args)) return undefined;
    if (tool === 'hyperion_step' && !AUTO_ACTIONS.has(args.action))
      return undefined;
    return { tool, signature: inputSignature(toolCall.rawInput) };
  }

  permissionIdentity(params) {
    const toolCall = params.toolCall;
    const prior = this.toolCalls.get(callId(toolCall?.toolCallId));
    const policy = params._meta?.permission;
    if (
      policy?.defaultToNo === true ||
      policy?.description ||
      !prior ||
      !prior.identity ||
      TERMINAL_ACTIONS.has(prior.status)
    )
      return undefined;
    // A provider that withholds persistence may be enforcing an explicit ask
    // rule or a safety check. Do not reinterpret those requests as delegable.
    // The persistent option is evidence only: we NEVER select it.
    const persistentIds =
      this.harness === 'codex'
        ? ['allow_session', 'allow_always']
        : this.harness === 'claude'
          ? ['allow-with-updates']
          : [];
    if (
      !Array.isArray(params.options) ||
      !params.options
        .slice(0, 64)
        .some(
          (option) =>
            option?.kind === 'allow_always' &&
            persistentIds.includes(option.optionId),
        )
    )
      return undefined;
    if (this.harness === 'codex' && params._meta?.is_mcp_tool_approval !== true)
      return undefined;
    // Codex ElicitationReporter deliberately omits rawInput on correlated MCP
    // approvals. Its request-level marker distinguishes tool approval from a
    // form/question; the original, private-server call supplies the identity.
    const sparseCodex =
      this.harness === 'codex' && toolCall.rawInput === undefined;
    if (
      sparseCodex &&
      (toolCall.kind !== 'execute' ||
        toolCall.status !== 'pending' ||
        toolCall._meta?.is_mcp_tool_call === false ||
        toolCall._meta?.claudeCode ||
        toolCall.input !== undefined ||
        toolCall.readableInput !== undefined)
    )
      return undefined;
    const identity = sparseCodex
      ? prior.identity
      : this.toolIdentity(toolCall, true);
    if (
      !identity ||
      !prior.identity ||
      identity.tool !== prior.identity.tool ||
      identity.signature !== prior.identity.signature
    ) {
      prior.identity = undefined;
      prior.rawInput = undefined;
      prior.summary = undefined;
      return undefined;
    }
    if (toolCall.kind && toolCall.kind !== prior.kind) {
      prior.identity = undefined;
      prior.rawInput = undefined;
      prior.summary = undefined;
      return undefined;
    }
    return identity;
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
            (item) => item?.kind === 'allow_once' && callId(item.optionId),
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
      runId: pending.runId,
      threadId: pending.threadId,
      turnId: pending.turnId,
      ...(pending.toolCallId ? { toolCallId: pending.toolCallId } : {}),
      token,
      decision,
    });
  }

  cancelPendingApprovals() {
    for (const token of this.pendingApprovals.keys())
      this.resolvePermission(token, 'cancelled');
  }

  onSessionUpdate({ sessionId, update }) {
    if (
      sessionId !== this.threadId ||
      !this.turnId ||
      this.stoppingTurnId ||
      !update
    )
      return;
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
    if (!['tool_call', 'tool_call_update'].includes(update.sessionUpdate))
      return;
    const id = callId(update.toolCallId);
    if (
      id &&
      this.seenToolCalls.has(id) &&
      this.seenToolCalls.get(id) !== this.turnId
    )
      return;
    const prior = id ? this.toolCalls.get(id) : undefined;
    if (prior && TERMINAL_ACTIONS.has(prior.status)) return;
    // Identity cannot be acquired or repaired by a partial/duplicate update.
    // A conflict permanently makes this call manual, including already-open
    // permission requests that the user might later enable Auto to resolve.
    let identity = prior
      ? prior.identity
      : update.sessionUpdate === 'tool_call'
        ? this.toolIdentity(update)
        : undefined;
    if (
      prior?.identity &&
      update.rawInput !== undefined &&
      inputSignature(update.rawInput) !== prior.identity.signature
    )
      identity = undefined;
    const metadataIdentity = update._meta
      ? this.toolIdentity({
          ...update,
          rawInput: update.rawInput ?? prior?.rawInput,
        })
      : undefined;
    if (
      prior &&
      ((update.kind && update.kind !== prior.kind) ||
        (update._meta &&
          (!metadataIdentity ||
            metadataIdentity.tool !== prior.identity?.tool)))
    )
      identity = undefined;
    const entry = {
      label: prior?.label || publicLabel(identity, update.kind),
      kind: update.kind || prior?.kind,
      status: actionStatus(update.status, prior?.status),
      identity,
      rawInput: identity ? (update.rawInput ?? prior?.rawInput) : undefined,
      summary: publicResult(update, identity) || prior?.summary,
    };
    if (id && (this.seenToolCalls.has(id) || this.seenToolCalls.size < 1024)) {
      this.seenToolCalls.set(id, this.turnId);
      this.toolCalls.set(id, entry);
    }
    this.emit({
      type: 'action',
      threadId: sessionId,
      turnId: this.turnId,
      ...(id ? { toolCallId: id, itemId: id } : {}),
      label: entry.label,
      status: entry.status,
      ...(identity ? { toolName: identity.tool } : {}),
      ...(entry.summary ? { summary: entry.summary } : {}),
    });
  }

  finish(status, error) {
    if (!this.turnId || !this.threadId) return;
    const turnId = this.turnId;
    this.turnId = null;
    this.stoppingTurnId = null;
    if (status === 'completed') this.cancelPendingApprovals();
    else this.resetPermissionMode();
    this.toolCalls.clear();
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
    this.entryPromptSent = false;
    this.stoppingTurnId = null;
    this.resetPermissionMode();
    this.toolCalls.clear();
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
