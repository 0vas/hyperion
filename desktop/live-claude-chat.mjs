import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  harnessGuidance,
  resolveHarness,
  saveHarnessExecutable,
} from './harness-launcher.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mcpLauncher = resolve(appRoot, 'dist/adapters/mcp-launcher.js');

const CLAUDE_SYSTEM_PROMPT = [
  'You are the Hyperion Desktop agent.',
  'Use only the configured Hyperion MCP tools.',
  'Never use shell, browser, files, plugins, or another MCP server.',
  'Human forms, submit, approve, amend, retry and irreversible acknowledgements belong exclusively to the canvas.',
].join(' ');

const DISALLOWED_TOOLS = [
  'Bash',
  'PowerShell',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
].join(',');

/** A generated, private MCP config; no user Claude settings are loaded. */
export function prepareLiveClaudeConfig({ userData, directory, url }) {
  const home = resolve(userData, 'live-claude');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const configPath = resolve(home, 'mcp.json');
  const config = {
    mcpServers: {
      hyperion: {
        type: 'stdio',
        command: process.execPath,
        args: [mcpLauncher],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          HYPERION_INTERACTIVE_CHAT: '1',
          HYPERION_AGENT_ID: 'claude',
          HYPERION_DATA_DIR: directory,
          HYPERION_URL: url,
        },
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  const workspace = resolve(home, 'workspace');
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  return { configPath, workspace };
}

function extractText(message) {
  if (!message || typeof message !== 'object') return null;
  const event = message.event;
  if (
    event?.type === 'content_block_delta' &&
    event.delta?.type === 'text_delta' &&
    typeof event.delta.text === 'string'
  )
    return { text: event.delta.text, partial: true };
  if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
    const text = message.message.content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('');
    return text ? { text, partial: false } : null;
  }
  return null;
}

/**
 * Claude Code is run one bounded streamed turn at a time. Its native session
 * persistence is intentionally not reused: Hyperion owns the workflow state
 * and a restart never replays an ambiguous request.
 */
export class LiveClaudeChat {
  constructor({
    userData,
    directory,
    url,
    onEvent,
    onError,
    spawnImpl = spawn,
    resolveExecutable = () => resolveHarness('claude', { userData }),
    saveExecutable = (executable) =>
      saveHarnessExecutable({ userData, id: 'claude', executable }),
  }) {
    this.userData = userData;
    this.directory = directory;
    this.url = url;
    this.onEvent = onEvent;
    this.onError = onError;
    this.spawnImpl = spawnImpl;
    this.resolveExecutable = resolveExecutable;
    this.saveExecutable = saveExecutable;
    this.runId = null;
    this.threadId = null;
    this.executable = null;
    this.profile = null;
    this.child = null;
    this.buffer = '';
    this.turnId = null;
    this.sawPartial = false;
  }

  emit(event) {
    this.onEvent(event);
  }

  async connect(runId) {
    if (this.runId && this.runId !== runId)
      throw new Error('Close the current live chat before changing runs.');
    this.emit({ type: 'connection', status: 'connecting' });
    const launcher = this.resolveExecutable();
    if (!launcher?.executable) {
      this.emit({
        type: 'connection',
        status: 'disconnected',
        setup: launcher?.status || 'missing',
        message: harnessGuidance('claude', launcher?.status),
      });
      return { connected: false, setup: launcher?.status || 'missing' };
    }
    this.executable = launcher.executable;
    this.profile = prepareLiveClaudeConfig({
      userData: this.userData,
      directory: this.directory,
      url: this.url,
    });
    this.runId = runId;
    this.threadId = `claude-${randomUUID()}`;
    this.emit({ type: 'connection', status: 'connected' });
    this.emit({ type: 'thread', runId, threadId: this.threadId });
    return { connected: true };
  }

  chooseExecutable(executable) {
    if (this.child)
      throw new Error(
        'Wait for the current Claude Code turn before changing it.',
      );
    return this.saveExecutable(executable);
  }

  async send(runId, text) {
    if (
      !this.executable ||
      !this.profile ||
      this.runId !== runId ||
      !this.threadId
    )
      throw new Error(
        'Connect this active run to Claude Code before sending a message.',
      );
    if (this.child)
      throw new Error('Wait for the current Claude Code turn to finish.');
    const prompt = String(text || '').trim();
    if (!prompt) throw new Error('Write a message for Claude Code.');
    this.turnId = randomUUID();
    this.sawPartial = false;
    this.emit({ type: 'user-message', threadId: this.threadId, text: prompt });
    this.emit({
      type: 'turn',
      threadId: this.threadId,
      turnId: this.turnId,
      status: 'running',
    });
    const child = this.spawnImpl(
      this.executable,
      [
        '--print',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--no-session-persistence',
        '--restricted',
        '--strict-mcp-config',
        '--mcp-config',
        this.profile.configPath,
        '--permission-mode',
        'plan',
        '--permission-prompts',
        'none',
        '--disallowedTools',
        DISALLOWED_TOOLS,
        '--system-prompt',
        CLAUDE_SYSTEM_PROMPT,
        prompt,
      ],
      {
        cwd: this.profile.workspace,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      },
    );
    this.child = child;
    child.stdout.setEncoding?.('utf8');
    child.stdout.on('data', (chunk) => this.onStdout(chunk));
    child.stderr.setEncoding?.('utf8');
    child.stderr.on('data', () => undefined);
    child.once('error', () => this.finish('failed'));
    child.once('exit', () => {
      if (this.child === child) this.finish('failed');
    });
  }

  async stop(runId) {
    if (!this.child || this.runId !== runId)
      throw new Error('There is no live Claude Code turn to stop.');
    this.child.kill('SIGINT');
  }

  approve() {
    throw new Error(
      'Claude Code cannot request Desktop approvals in restricted mode.',
    );
  }

  resolveUncertain() {
    this.emit({ type: 'connection', status: 'disconnected' });
  }

  onStdout(chunk) {
    this.buffer += String(chunk);
    for (;;) {
      const end = this.buffer.indexOf('\n');
      if (end < 0) return;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch {
        this.finish('failed');
      }
    }
  }

  onMessage(message) {
    const text = extractText(message);
    if (text && this.threadId) {
      if (text.partial) this.sawPartial = true;
      if (text.partial || !this.sawPartial)
        this.emit({
          type: 'assistant-delta',
          threadId: this.threadId,
          itemId: this.turnId || 'claude',
          text: text.text,
        });
    }
    if (message?.type === 'result')
      this.finish(message.subtype === 'success' ? 'completed' : 'failed');
  }

  finish(status) {
    if (!this.turnId || !this.threadId) return;
    const turnId = this.turnId;
    this.turnId = null;
    this.child = null;
    this.emit({ type: 'turn', threadId: this.threadId, turnId, status });
    if (status === 'failed')
      this.onError(new Error('Claude Code live turn failed.'));
  }
}
