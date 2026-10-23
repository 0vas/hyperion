import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultDirectory } from './install.js';

export type HarnessLogEvent =
  'create_rejected' | 'wait_armed' | 'wait_expired' | 'connector_absent';

const allowed = new Set([
  'reason',
  'commandId',
  'runId',
  'afterRevision',
  'timeoutSeconds',
  'revision',
  'context',
]);

function sanitize(
  details: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!allowed.has(key) || value === undefined) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 500);
    else out[key] = value;
  }
  return out;
}

/** Best-effort local JSONL diagnostics for adapters. Never logs secrets, plans or sessions. */
export function appendHarnessLog(
  event: HarnessLogEvent,
  details: Record<string, string | number | boolean | undefined> = {},
  directory = process.env.HYPERION_DATA_DIR || defaultDirectory(),
): void {
  try {
    mkdirSync(directory, { recursive: true });
    appendFileSync(
      resolve(directory, 'harness.log'),
      `${JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...sanitize(details),
      })}\n`,
      { mode: 0o600 },
    );
  } catch {
    /* best-effort */
  }
}
