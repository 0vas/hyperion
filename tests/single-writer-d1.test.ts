import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import {
  DATA_DIR_BUSY_MESSAGE,
  ensureServer,
} from '../src/adapters/bootstrap.js';
import { HyperionClient } from '../src/adapters/client.js';
import { Store } from '../src/server/store.js';
import { createApp } from '../src/server/app.js';
import { dataDirHolders } from '../src/adapters/runtime-upgrade.js';

const token = () => randomBytes(24).toString('hex');

async function stopPid(pid?: number) {
  if (!pid) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

test('DATA_DIR_BUSY copy is actionable and never bare INTERNAL', () => {
  assert.match(
    DATA_DIR_BUSY_MESSAGE,
    /carpeta de datos|flujos no se han borrado/i,
  );
  assert.doesNotMatch(DATA_DIR_BUSY_MESSAGE, /INTERNAL|UNAUTHORIZED/);
});

test('SQLite busy maps to DATA_IN_USE instead of INTERNAL', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'test-agent-token-32chars-minimum!!',
    humanToken: 'test-human-token-32chars-minimum!!',
    agentId: 'cursor',
  });
  const url = await app.listen(0);
  // Force the catch-all by posting invalid that isn't WorkflowError — instead
  // invoke the busy mapper through a synthetic throw by monkeypatching list.
  const original = store.list.bind(store);
  store.list = () => {
    throw new Error('SQLITE_BUSY: database is locked');
  };
  try {
    const response = await fetch(url + '/api/runs', {
      headers: {
        authorization: 'Bearer test-agent-token-32chars-minimum!!',
      },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'DATA_IN_USE',
      message:
        'Another Hyperion process is using this data folder. Close other Hyperion windows from this account and retry.',
    });
  } finally {
    store.list = original;
    await app.close();
    store.close();
  }
});

test('ensureServer reaps an owned same-directory peer on another port before spawn', async (t) => {
  if (process.platform === 'win32') {
    t.skip(
      'lsof-backed holder checks are Unix-first; Windows uses credential peers',
    );
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'hyperion-d1-zombie-'));
  const agentToken = token();
  const humanToken = token();
  writeFileSync(
    join(dir, 'credentials.json'),
    JSON.stringify({ agentToken, humanToken, agentId: 'cursor' }),
    { mode: 0o600 },
  );
  const store = new Store(join(dir, 'hyperion.sqlite'));
  store.create(
    { title: 'Keep', steps: [{ id: 'a', title: 'A', kind: 'agent' }] },
    { role: 'agent', id: 'cursor' },
    randomUUID(),
  );
  store.close();

  const zombiePort = await freePort();
  const zombieUrl = `http://127.0.0.1:${zombiePort}`;
  const zombie = await ensureServer({ directory: dir, url: zombieUrl });
  assert.equal(zombie.started, true);
  assert.ok(zombie.pid);

  const primaryPort = await freePort();
  const primaryUrl = `http://127.0.0.1:${primaryPort}`;
  let primary: Awaited<ReturnType<typeof ensureServer>> | undefined;
  try {
    primary = await ensureServer({ directory: dir, url: primaryUrl });
    assert.equal(primary.started, true);
    assert.ok(primary.pid);
    assert.notEqual(primary.pid, zombie.pid);

    // Zombie must be gone; at most one holder of the sqlite.
    for (let i = 0; i < 50; i++) {
      try {
        process.kill(zombie.pid!, 0);
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await assert.rejects(async () => {
      process.kill(zombie.pid!, 0);
    }, /ESRCH|kill/);

    const holders = await dataDirHolders(dir);
    assert.ok(
      holders.every((h) => h.pid === primary!.pid),
      `expected single writer, got ${holders.map((h) => h.pid).join(',')}`,
    );

    const client = new HyperionClient({ directory: dir, url: primary.url });
    const listed = await client.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.title, 'Keep');
  } finally {
    await stopPid(primary?.pid);
    await stopPid(zombie.pid);
    rmSync(dir, { recursive: true, force: true });
  }
});
