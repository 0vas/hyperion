import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function validatePermissionMode(mode) {
  if (mode !== 'ask' && mode !== 'auto')
    throw new TypeError('Choose Ask or Auto.');
  return mode;
}

/** Desktop-wide human preference only. No sessions, tokens or provider input. */
export class LiveChatPermissionStore {
  constructor(userData) {
    this.path = resolve(userData, 'live-chat-permission.json');
    this.mode = 'ask';
    try {
      this.mode = validatePermissionMode(
        JSON.parse(readFileSync(this.path, 'utf8')).mode,
      );
    } catch {
      /* Missing, corrupt and old session-mode values fail closed. */
    }
  }

  snapshot() {
    return { mode: this.mode };
  }

  set(mode) {
    validatePermissionMode(mode);
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path + '.tmp', JSON.stringify({ mode }) + '\n', {
      mode: 0o600,
    });
    renameSync(this.path + '.tmp', this.path);
    // Apply only after durable replacement succeeds; a failed save cannot
    // silently enable Auto in memory or report success to the renderer.
    this.mode = mode;
    return this.snapshot();
  }
}
