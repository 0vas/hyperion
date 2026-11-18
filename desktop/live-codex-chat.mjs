import { spawn } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectAppServerEvent } from '../dist/adapters/live-codex-chat.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mcpLauncher = resolve(appRoot, 'dist/adapters/mcp-launcher.js');

function tomlString(value) {
  return JSON.stringify(value);
}

/**
 * This is an application-owned tool boundary, not an instruction to the model.
 * The only intentionally enabled external capability is the private Hyperion
 * MCP server below. Keep this list explicit: a later Codex default must not
 * silently widen the Desktop agent's surface.
 */
export const LIVE_CODEX_DISABLED_FEATURES = [
  'apps',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'image_generation',
  'multi_agent',
  'plugins',
  'shell_tool',
  'skill_search',
  'unified_exec',
  'view_image',
];

/** A private profile leaves every other Codex MCP server out of this chat. */
export function prepareLiveCodexHome({ userData, directory, url }) {
  const sourceHome = process.env.CODEX_HOME || resolve(homedir(), '.codex');
  const sourceAuth = resolve(sourceHome, 'auth.json');
  if (!existsSync(sourceAuth))
    throw new Error(
      'Codex must be authenticated locally before starting live chat.',
    );
  const home = resolve(userData, 'live-codex');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const auth = resolve(home, 'auth.json');
  copyFileSync(sourceAuth, auth, 0);
  chmodSync(auth, 0o600);
  const config = [
    '# Hyperion live chat: generated locally by Desktop. Do not add other MCP servers.',
    '# Generic local tools are disabled by this profile; only the MCP server below is exposed.',
    'web_search = "disabled"',
    '[features]',
    ...LIVE_CODEX_DISABLED_FEATURES.map((feature) => `${feature} = false`),
    '[mcp_servers.hyperion]',
    `command = ${tomlString(process.execPath)}`,
    `args = [${tomlString(mcpLauncher)}]`,
    '[mcp_servers.hyperion.env]',
    'ELECTRON_RUN_AS_NODE = "1"',
    'HYPERION_INTERACTIVE_CHAT = "1"',
    'HYPERION_AGENT_ID = "codex"',
    `HYPERION_DATA_DIR = ${tomlString(directory)}`,
    `HYPERION_URL = ${tomlString(url)}`,
    '',
  ].join('\n');
  writeFileSync(resolve(home, 'config.toml'), config, { mode: 0o600 });
  const workspace = resolve(userData, 'live-codex-workspace');
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  return { home, workspace };
}

function protocolError(id, message) {
  return { jsonrpc: '2.0', id, error: { code: -32601, message } };
}

/**
 * A crash can happen after turn/start is written but before Codex acknowledges
 * it. Keep only opaque IDs locally, so a later Desktop cannot resend blindly.
 */
export class LiveTurnStore {
  constructor(userData) {
    this.path = resolve(userData, 'live-codex-turns.json');
    this.corrupt = false;
    this.records = this.read();
  }

  read() {
    if (!existsSync(this.path)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      // A corrupt local marker must fail closed, rather than enable a resend.
      this.corrupt = true;
      return {};
    }
  }

  save() {
    writeFileSync(this.path, JSON.stringify(this.records), { mode: 0o600 });
  }

  get(runId) {
    if (this.corrupt)
      return {
        status: 'uncertain',
        threadId: null,
        turnId: null,
        updatedAt: 0,
      };
    return this.records[runId] || null;
  }

  markUnsettled(runId, threadId, turnId = null) {
    this.records[runId] = {
      status: 'uncertain',
      threadId: typeof threadId === 'string' ? threadId : null,
      turnId: typeof turnId === 'string' ? turnId : null,
      updatedAt: Date.now(),
    };
    this.save();
  }

  settle(runId, turnId) {
    const current = this.get(runId);
    if (!current || (current.turnId && current.turnId !== turnId)) return;
    delete this.records[runId];
    this.save();
  }

  resolve(runId) {
    if (this.corrupt) {
      this.corrupt = false;
      this.records = {};
      this.save();
      return true;
    }
    if (!this.get(runId)) return false;
    delete this.records[runId];
    this.save();
    return true;
  }
}

/**
 * Main-process owner for a single foreground Codex App Server conversation.
 * No JSON-RPC handles, config paths, process output, or credentials cross IPC.
 */
export class LiveCodexChat {
  constructor({
    userData,
    directory,
    url,
    onEvent,
    onError,
    spawnImpl = spawn,
    turnStore = new LiveTurnStore(userData),
  }) {
    this.userData = userData;
    this.directory = directory;
    this.url = url;
    this.onEvent = onEvent;
    this.onError = onError;
    this.spawnImpl = spawnImpl;
    this.turnStore = turnStore;
    this.child = null;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
    this.mcpReady = null;
    this.runId = null;
    this.threadId = null;
    this.turnId = null;
    this.pendingApprovals = new Map();
  }

  emit(event) {
    this.onEvent(event);
  }

  write(message) {
    if (!this.child?.stdin?.writable)
      throw new Error('Codex App Server is disconnected.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params) {
    const id = this.nextId++;
    this.write({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolveResult, reject) => {
      this.pending.set(id, { resolve: resolveResult, reject });
    });
  }

  async connect(runId) {
    if (this.child) {
      if (this.runId !== runId)
        throw new Error('Close the current live chat before changing runs.');
      this.emit({ type: 'connection', status: 'connected' });
      this.emit({ type: 'thread', runId, threadId: this.threadId });
      return { connected: true };
    }
    if (this.turnStore.get(runId)) {
      this.emit({
        type: 'uncertain',
        runId,
        label:
          'A previous Codex turn is unresolved after restart. Resolve it before starting another turn.',
      });
      this.emit({ type: 'connection', status: 'disconnected' });
      return { connected: false, uncertain: true };
    }
    this.emit({ type: 'connection', status: 'connecting' });
    const { home: codexHome, workspace } = prepareLiveCodexHome({
      userData: this.userData,
      directory: this.directory,
      url: this.url,
    });
    const child = this.spawnImpl(
      'codex',
      ['app-server', '--strict-config', '--listen', 'stdio://'],
      {
        cwd: this.directory,
        env: { ...process.env, CODEX_HOME: codexHome },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      },
    );
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.onStdout(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', () => undefined); // Never forward process output to the renderer.
    child.once('error', (error) => this.disconnect(error));
    child.once('exit', () => this.disconnect());
    try {
      await this.request('initialize', {
        clientInfo: {
          name: 'hyperion-desktop',
          title: 'Hyperion Desktop',
          version: '1',
        },
      });
      this.write({ jsonrpc: '2.0', method: 'initialized', params: {} });
      const hyperionMcpReady = this.waitForHyperionMcp();
      const started = await this.request('thread/start', {
        // The agent has no shell-visible Hyperion data, credentials, or project files.
        // Its only supported path to workflow state is the narrowed MCP server.
        cwd: workspace,
        sandbox: 'read-only',
        approvalPolicy: 'untrusted',
        developerInstructions:
          'You are the Hyperion Desktop agent. Use only the configured Hyperion MCP tools. Never use shell, browser, files, plugins, or another MCP server. Human forms, submit, approve, amend, retry and irreversible acknowledgements belong exclusively to the canvas.',
      });
      const threadId = started?.thread?.id;
      if (typeof threadId !== 'string' || !threadId)
        throw new Error('Codex did not create a thread.');
      await hyperionMcpReady;
      this.runId = runId;
      this.threadId = threadId;
      this.emit({ type: 'connection', status: 'connected' });
      this.emit({ type: 'thread', runId, threadId });
      return { connected: true };
    } catch (error) {
      this.disconnect(error);
      throw error;
    }
  }

  waitForHyperionMcp() {
    if (this.mcpReady) return this.mcpReady;
    this.mcpReady = new Promise((resolveResult, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error('Hyperion MCP did not become ready for live Codex chat.'),
        );
      }, 15_000);
      this.mcpStatus = (params) => {
        if (params?.name !== 'hyperion') return;
        if (params.status === 'ready') {
          clearTimeout(timer);
          resolveResult();
        } else if (
          params.status === 'failed' ||
          params.status === 'cancelled'
        ) {
          clearTimeout(timer);
          reject(
            new Error('Hyperion MCP could not start for live Codex chat.'),
          );
        }
      };
    });
    return this.mcpReady;
  }

  async send(runId, text) {
    if (!this.child || !this.threadId || this.runId !== runId)
      throw new Error(
        'Connect this active run to Codex before sending a message.',
      );
    if (this.turnId)
      throw new Error('Wait for the current Codex turn to finish.');
    const prompt = String(text || '').trim();
    if (!prompt) throw new Error('Write a message for Codex.');
    // Persist before writing: losing the response to turn/start is ambiguous.
    this.turnStore.markUnsettled(runId, this.threadId);
    const result = await this.request('turn/start', {
      threadId: this.threadId,
      input: [{ type: 'text', text: prompt }],
      approvalPolicy: 'untrusted',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
    });
    const turnId = result?.turn?.id;
    // Keep the pre-write marker unchanged: a terminal notification can arrive
    // before the turn/start response, and must not be recreated afterwards.
    if (typeof turnId === 'string') this.turnId = turnId;
  }

  async stop(runId) {
    if (!this.threadId || !this.turnId || this.runId !== runId)
      throw new Error('There is no live Codex turn to stop.');
    await this.request('turn/interrupt', {
      threadId: this.threadId,
      turnId: this.turnId,
    });
  }

  approve(runId, token, decision) {
    const approval = this.pendingApprovals.get(token);
    if (
      !approval ||
      approval.runId !== runId ||
      this.runId !== runId ||
      !this.child
    )
      throw new Error('That Codex approval is no longer pending.');
    this.pendingApprovals.delete(token);
    this.write({
      jsonrpc: '2.0',
      id: approval.protocolId,
      result: { action: decision === 'allow' ? 'accept' : 'decline' },
    });
    this.emit({
      type: 'approval-resolved',
      threadId: approval.threadId,
      token,
      decision: decision === 'allow' ? 'allowed' : 'denied',
    });
  }

  resolveUncertain(runId) {
    if (!this.turnStore.resolve(runId))
      throw new Error('There is no unresolved Codex turn for this flow.');
    this.emit({ type: 'connection', status: 'disconnected' });
  }

  onStdout(chunk) {
    this.buffer += chunk;
    for (;;) {
      const end = this.buffer.indexOf('\n');
      if (end < 0) return;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch {
        this.disconnect(
          new Error('Codex App Server sent an invalid protocol message.'),
        );
      }
    }
  }

  onMessage(message) {
    if (
      message &&
      Object.prototype.hasOwnProperty.call(message, 'id') &&
      !message.method
    ) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error)
        pending.reject(new Error('Codex App Server rejected the request.'));
      else pending.resolve(message.result);
      return;
    }
    const isRequest =
      message && Object.prototype.hasOwnProperty.call(message, 'id');
    if (isRequest && message?.method === 'mcpServer/elicitation/request') {
      // Provider approvals are not Hyperion forms or approvals. The app server
      // receives the raw request, while the renderer gets only a redacted card.
      if (
        message.params?.serverName !== 'hyperion' ||
        message.params?.threadId !== this.threadId ||
        this.pendingApprovals.size > 0
      ) {
        this.write({
          jsonrpc: '2.0',
          id: message.id,
          result: { action: 'decline' },
        });
        return;
      }
      const token = randomUUID();
      this.pendingApprovals.set(token, {
        protocolId: message.id,
        runId: this.runId,
        threadId: this.threadId,
      });
      this.emit({
        type: 'approval',
        threadId: this.threadId,
        token,
        label: 'Codex requests permission to use the bounded Hyperion action.',
      });
      return;
    }
    if (isRequest && message?.method === 'item/permissions/requestApproval') {
      // No filesystem, network, or shell escalation can cross this boundary.
      this.write({
        jsonrpc: '2.0',
        id: message.id,
        result: { permissions: {} },
      });
      return;
    }
    if (
      isRequest &&
      (message?.method === 'item/commandExecution/requestApproval' ||
        message?.method === 'item/fileChange/requestApproval')
    ) {
      this.write({
        jsonrpc: '2.0',
        id: message.id,
        result: { decision: 'decline' },
      });
      return;
    }
    if (isRequest && message?.method === 'execCommandApproval') {
      this.write({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          decision: {
            denied: {
              rejection:
                'Hyperion Desktop live chat permits only its authenticated MCP surface.',
            },
          },
        },
      });
      return;
    }
    if (isRequest && message?.method === 'item/tool/call') {
      this.write(
        protocolError(
          message.id,
          'Hyperion Desktop exposes no renderer-owned dynamic tools.',
        ),
      );
      return;
    }
    if (isRequest) {
      // Future App Server request types remain denied until deliberately added.
      this.write(
        protocolError(
          message.id,
          'Hyperion Desktop live chat does not expose this host capability.',
        ),
      );
      return;
    }
    if (message?.method === 'mcpServer/startupStatus/updated') {
      this.mcpStatus?.(message.params);
      return;
    }
    for (const event of projectAppServerEvent(message)) {
      if (event.type === 'turn') {
        this.turnId = event.status === 'running' ? event.turnId : null;
        if (
          event.status !== 'running' &&
          this.runId &&
          event.threadId === this.threadId
        )
          this.turnStore.settle(this.runId, event.turnId);
      }
      this.emit(event);
    }
  }

  disconnect(error) {
    const child = this.child;
    if (!child && !this.threadId && !this.runId) return;
    this.child = null;
    this.threadId = null;
    this.turnId = null;
    this.runId = null;
    this.pendingApprovals.clear();
    for (const pending of this.pending.values())
      pending.reject(error || new Error('Codex App Server disconnected.'));
    this.pending.clear();
    if (child && !child.killed) {
      try {
        child.kill();
      } catch {}
    }
    this.emit({
      type: 'connection',
      status: 'disconnected',
      ...(error ? { message: 'Live Codex chat disconnected.' } : {}),
    });
    if (error) this.onError(error);
  }

  dispose() {
    this.disconnect();
  }
}
