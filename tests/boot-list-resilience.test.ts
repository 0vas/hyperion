import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/server/store.js';
import { createApp } from '../src/server/app.js';
import { HyperionClient } from '../src/adapters/client.js';
import { ensureServer } from '../src/adapters/bootstrap.js';
import { createServer } from 'node:net';

const token = () => randomBytes(24).toString('hex');

test('auth/check authenticates without projecting runs', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'test-agent-token-32chars-minimum!!',
    humanToken: 'test-human-token-32chars-minimum!!',
    agentId: 'cursor',
  });
  const url = await app.listen(0);
  const client = new HyperionClient({
    url,
    token: 'test-agent-token-32chars-minimum!!',
  });
  try {
    const check = await client.authCheck();
    assert.deepEqual(check, { ok: true, role: 'agent', id: 'cursor' });
    assert.equal(
      (
        await fetch(url + '/api/auth/check', {
          headers: { authorization: 'Bearer wrong' },
        })
      ).status,
      401,
    );
  } finally {
    await app.close();
    store.close();
  }
});

test('GET /api/runs skips corrupt snapshots instead of INTERNAL 500', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hyperion-corrupt-list-'));
  const agentToken = token();
  const humanToken = token();
  writeFileSync(
    join(dir, 'credentials.json'),
    JSON.stringify({ agentToken, humanToken, agentId: 'cursor' }),
    { mode: 0o600 },
  );
  const store = new Store(join(dir, 'hyperion.sqlite'));
  const good = store.create(
    {
      title: 'Good',
      steps: [{ id: 'a', title: 'A', kind: 'agent' }],
    },
    { role: 'agent', id: 'cursor' },
    randomUUID(),
  );
  store.close();

  const db = new DatabaseSync(join(dir, 'hyperion.sqlite'));
  db.prepare('INSERT INTO runs(id, snapshot, created_at) VALUES(?,?,?)').run(
    randomUUID(),
    '{not-json',
    new Date().toISOString(),
  );
  db.close();

  const store2 = new Store(join(dir, 'hyperion.sqlite'));
  const app = createApp({
    store: store2,
    agentToken,
    humanToken,
    agentId: 'cursor',
  });
  const url = await app.listen(0);
  const client = new HyperionClient({ url, token: agentToken });
  try {
    const listed = await client.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.id, good.id);
  } finally {
    await app.close();
    store2.close();
  }
});

test('links omit missing related runs instead of failing the projection', () => {
  const store = new Store(':memory:');
  try {
    const child = store.create(
      {
        title: 'Child',
        request: 'next',
        steps: [{ id: 'a', title: 'A', kind: 'agent' }],
      },
      { role: 'agent', id: 'cursor' },
      randomUUID(),
    );
    // Force a dangling origin without a parent row.
    const db = (store as unknown as { db: DatabaseSync }).db;
    const row = db
      .prepare('SELECT snapshot FROM runs WHERE id=?')
      .get(child.id);
    const snap = JSON.parse(row!.snapshot as string);
    snap.origin = {
      runId: randomUUID(),
      revision: 1,
      title: 'Missing parent',
    };
    db.prepare('UPDATE runs SET snapshot=? WHERE id=?').run(
      JSON.stringify(snap),
      child.id,
    );
    const links = store.links(child.id);
    assert.equal(links.previous, undefined);
    assert.deepEqual(links.next, []);
  } finally {
    store.close();
  }
});

test('ensureServer authenticates via auth/check even when list would skip corrupt rows', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hyperion-boot-auth-'));
  const agentToken = token();
  const humanToken = token();
  writeFileSync(
    join(dir, 'credentials.json'),
    JSON.stringify({ agentToken, humanToken, agentId: 'cursor' }),
    { mode: 0o600 },
  );
  const store = new Store(join(dir, 'hyperion.sqlite'));
  store.create(
    { title: 'Seed', steps: [{ id: 'a', title: 'A', kind: 'agent' }] },
    { role: 'agent', id: 'cursor' },
    randomUUID(),
  );
  store.close();
  const db = new DatabaseSync(join(dir, 'hyperion.sqlite'));
  db.prepare('INSERT INTO runs(id, snapshot, created_at) VALUES(?,?,?)').run(
    randomUUID(),
    '<<<corrupt>>>',
    new Date().toISOString(),
  );
  db.close();

  const reservation = createServer();
  await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r));
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((r) => reservation.close(() => r()));
  const url = `http://127.0.0.1:${port}`;
  let pid: number | undefined;
  try {
    const started = await ensureServer({ directory: dir, url });
    pid = started.pid;
    assert.equal(started.started, true);
    const client = new HyperionClient({ directory: dir, url });
    assert.deepEqual(await client.authCheck(), {
      ok: true,
      role: 'agent',
      id: 'cursor',
    });
    const listed = await client.list();
    assert.equal(listed.length, 1);
  } finally {
    if (pid)
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* gone */
      }
  }
});
