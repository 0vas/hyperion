import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HyperionClient } from '../dist/adapters/client.js';
import {
  parseDesktopOutboundConfig,
  publicResumeConnector,
  createDesktopClipboardSendConnector,
} from '../dist/adapters/desktop-outbound-send.js';
import { runContinuationWorker } from '../dist/adapters/continuation-worker.js';

/**
 * Desktop W1: optional outbound send (ADR 0036 continuation_prompt).
 * Config: userData/outbound-send.json (connectorSchema + transport clipboard-open).
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
  const sendConnector = createDesktopClipboardSendConnector(config, {
    writeText: (text) => clipboard.writeText(text),
    openExternal: config.openUrl
      ? (href) => shell.openExternal(href)
      : undefined,
    rememberDelivery: (deliveryId) => {
      receipts.delivered[deliveryId] = new Date().toISOString();
      saveReceipts(userData, receipts);
    },
    wasDelivered: (deliveryId) => Boolean(receipts.delivered[deliveryId]),
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
