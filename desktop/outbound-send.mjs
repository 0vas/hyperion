import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { HyperionClient } from '../dist/adapters/client.js';
import {
  parseDesktopOutboundConfig,
  publicResumeConnector,
  createDesktopOutboundSendConnector,
} from '../dist/adapters/desktop-outbound-send.js';
import { runContinuationWorker } from '../dist/adapters/continuation-worker.js';

/**
 * Desktop outbound send (ADR 0036 continuation_prompt).
 * Config: userData/outbound-send.json
 * - W1 transport clipboard-open
 * - W2 transport harness-cli (spawn installed CLI; Cursor agent --print proven in CI)
 * Without a valid file, resumeConnector stays undefined and Enviar stays hidden.
 */

let active = {
  connector: null,
  stop: null,
};

export function configPath(userData) {
  return resolve(userData, 'outbound-send.json');
}

export function receiptPath(userData) {
  return resolve(userData, 'outbound-send-receipts.json');
}

function loadReceipts(userData) {
  const file = receiptPath(userData);
  if (!existsSync(file)) return { delivered: {} };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return {
      delivered:
        raw && typeof raw.delivered === 'object' && raw.delivered
          ? raw.delivered
          : {},
    };
  } catch {
    return { delivered: {} };
  }
}

function saveReceipts(userData, receipts) {
  writeFileSync(receiptPath(userData), JSON.stringify(receipts), {
    mode: 0o600,
  });
}

export function loadDesktopOutboundConfig(userData) {
  const file = configPath(userData);
  if (!existsSync(file)) return null;
  try {
    return parseDesktopOutboundConfig(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

export function readResumeConnectorForPreload(userData) {
  const config = loadDesktopOutboundConfig(userData);
  return config ? publicResumeConnector(config) : undefined;
}

/**
 * Spawn without a shell. Inherit Desktop env only — no config-driven env
 * escalation. Delivery process exit codes are interpreted by the connector.
 */
export function spawnHarnessCli({
  command,
  args,
  cwd,
  stdinText,
  timeoutMs,
  spawnImpl = spawn,
}) {
  return new Promise((resolveResult) => {
    let child;
    try {
      child = spawnImpl(command, args, {
        cwd,
        env: process.env,
        stdio: stdinText != null ? ['pipe', 'ignore', 'ignore'] : 'ignore',
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      resolveResult({
        started: false,
        exitCode: null,
        signal: null,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return;
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      finish({
        started: true,
        exitCode: null,
        signal: 'SIGTERM',
        error: new Error(
          `Desktop harness-cli timed out after ${timeoutMs}ms; reconcile before retry`,
        ),
      });
    }, timeoutMs);

    child.on('error', (error) => {
      finish({
        started: false,
        exitCode: null,
        signal: null,
        error,
      });
    });

    if (stdinText != null && child.stdin) {
      child.stdin.on('error', () => {
        /* ignore broken pipe after early exit */
      });
      child.stdin.end(stdinText);
    }

    child.on('close', (exitCode, signal) => {
      finish({
        started: true,
        exitCode,
        signal,
      });
    });
  });
}

/**
 * Start (or restart) the bridge worker when a valid Desktop send config exists.
 * Stops cleanly when config is absent.
 */
export function syncDesktopOutboundWorker({
  userData,
  directory,
  url,
  clipboard,
  shell,
  onError = () => {},
}) {
  if (active.stop) {
    active.stop();
    active = { connector: null, stop: null };
  }
  const config = loadDesktopOutboundConfig(userData);
  if (!config) return { started: false, connector: null };

  mkdirSync(userData, { recursive: true });
  const receipts = loadReceipts(userData);
  const baseIo = {
    writeText: (text) => clipboard.writeText(text),
    openExternal:
      config.transport === 'clipboard-open' && config.openUrl
        ? (href) => shell.openExternal(href)
        : undefined,
    rememberDelivery: (deliveryId) => {
      receipts.delivered[deliveryId] = new Date().toISOString();
      saveReceipts(userData, receipts);
    },
    wasDelivered: (deliveryId) => Boolean(receipts.delivered[deliveryId]),
  };
  const sendConnector = createDesktopOutboundSendConnector(config, {
    ...baseIo,
    spawn: (request) => spawnHarnessCli(request),
  });

  const client = new HyperionClient({ url, directory });
  const controller = new AbortController();
  void runContinuationWorker(client, sendConnector, {
    signal: controller.signal,
    onError,
    intervalMs: 1000,
  });
  active = {
    connector: publicResumeConnector(config),
    stop: () => controller.abort(),
  };
  return { started: true, connector: active.connector };
}

export function stopDesktopOutboundWorker() {
  if (active.stop) active.stop();
  active = { connector: null, stop: null };
}
