import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const FLAG_NAME = 'post-update-connections.json';

export function postUpdateFlagPath(userDataPath: string): string {
  return join(userDataPath, FLAG_NAME);
}

/** Mark that the next Desktop boot should refresh same-install connections. */
export function markPostUpdateRefresh(userDataPath: string): string {
  mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
  const file = postUpdateFlagPath(userDataPath);
  const temporary = `${file}.${randomUUID()}.tmp`;
  const body =
    JSON.stringify({
      pending: true,
      markedAt: new Date().toISOString(),
    }) + '\n';
  try {
    writeFileSync(temporary, body, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  return file;
}

/**
 * Consume the one-shot flag. Returns true only when a pending mark existed;
 * clears the file either way so ordinary cold starts never re-trigger.
 */
export function consumePostUpdateRefresh(userDataPath: string): boolean {
  const file = postUpdateFlagPath(userDataPath);
  if (!existsSync(file)) return false;
  let pending = false;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { pending?: unknown };
    pending = raw?.pending === true;
  } catch {
    pending = false;
  }
  rmSync(file, { force: true });
  return pending;
}
