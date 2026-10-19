import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';

test('HTTP enforces auth, origin, human-only approvals, input validation and revisions', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'test-agent',
    humanToken: 'test-human',
    agentId: 'codex',
  });
  const url = await app.listen(0);
  const post = (
    path: string,
    data: unknown,
    token = 'test-agent',
    extra: Record<string, string> = {},
  ) =>
    fetch(url + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...extra,
      },
      body: JSON.stringify(data),
    });
  try {
    assert.equal((await fetch(url + '/api/runs')).status, 401);
    assert.equal(
      (
        await post('/api/runs', {}, 'test-agent', {
          origin: 'https://evil.example',
        })
      ).status,
      403,
    );
    assert.equal((await post('/api/runs', {})).status, 400);
    const response = await post('/api/runs', {
      commandId: 'create',
      plan: {
        title: 'HTTP test',
        steps: [{ id: 'gate', title: 'Approve', kind: 'approval' }],
      },
    });
    assert.equal(response.status, 201);
    const run = await response.json();
    const endpoint = `/api/runs/${run.id}/commands`;
    assert.equal(
      (
        await post(endpoint, {
          commandId: 'approve',
          type: 'approve',
          stepId: 'gate',
          expectedRevision: 1,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          endpoint,
          { commandId: 'approve-human', type: 'approve', stepId: 'gate' },
          'test-human',
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          endpoint,
          {
            commandId: 'approve-human',
            type: 'approve',
            stepId: 'gate',
            expectedRevision: 0,
          },
          'test-human',
        )
      ).status,
      409,
    );
    const approved = await post(
      endpoint,
      {
        commandId: 'approve-human',
        type: 'approve',
        stepId: 'gate',
        expectedRevision: 1,
      },
      'test-human',
    );
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).status, 'completed');
    const deniedHost = await new Promise<number | undefined>((done, reject) => {
      const req = httpRequest(
        url + '/api/runs',
        {
          headers: {
            host: 'attacker.example',
            authorization: 'Bearer test-agent',
          },
        },
        (res) => {
          res.resume();
          done(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(deniedHost, 403);
  } finally {
    await app.close();
    store.close();
  }
});

test('HTTP connection inventory is human-only and lists five clients without claiming live tools', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const home = mkdtempSync(join(tmpdir(), 'hyperion-http-conn-'));
  const saved = {
    HYPERION_HOME: process.env.HYPERION_HOME,
    CODEX_HOME: process.env.CODEX_HOME,
    APPDATA: process.env.APPDATA,
  };
  process.env.HYPERION_HOME = home;
  process.env.CODEX_HOME = join(home, '.codex');
  process.env.APPDATA = join(home, 'Roaming');
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'test-agent',
    humanToken: 'test-human',
    agentId: 'codex',
    directory: join(home, 'data'),
  });
  const url = await app.listen(0);
  try {
    assert.equal((await fetch(url + '/api/connections')).status, 401);
    assert.equal(
      (
        await fetch(url + '/api/connections', {
          headers: { authorization: 'Bearer test-agent' },
        })
      ).status,
      403,
    );
    const response = await fetch(url + '/api/connections', {
      headers: { authorization: 'Bearer test-human' },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.integrations.length, 5);
    assert.equal(body.summary.total, 5);
    assert.ok(body.version);
    assert.ok(
      body.integrations.every(
        (row: { status: string }) =>
          row.status === 'missing' ||
          row.status === 'configured' ||
          row.status === 'conflict' ||
          row.status === 'unknown',
      ),
    );
  } finally {
    await app.close();
    store.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
});

test('HTTP rejects oversized, malformed and cross-site input without exposing internal details', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'test-agent',
    humanToken: 'test-human',
    agentId: 'codex',
  });
  const url = await app.listen(0);
  const headers = {
    authorization: 'Bearer test-agent',
    'content-type': 'application/json',
  };
  try {
    const large = await fetch(url + '/api/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: 'x'.repeat(150000) }),
    });
    assert.equal(large.status, 413);
    const invalid = await fetch(url + '/api/runs', {
      method: 'POST',
      headers,
      body: '{',
    });
    assert.equal(invalid.status, 400);
    assert.equal(
      (await fetch(url + '/api/session', { headers: { origin: 'null' } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(url + '/api/session', {
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + '/api/runs', {
          headers: { authorization: 'Bearer éééééééééé' },
        })
      ).status,
      401,
    );
  } finally {
    await app.close();
    store.close();
  }
});

test('SSE authenticates, sends committed revisions immediately, and reconnects with a snapshot', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'codex',
  });
  const url = await app.listen(0);
  const headers = {
    authorization: 'Bearer agent',
    'content-type': 'application/json',
  };
  const abort = new AbortController();
  try {
    assert.equal((await fetch(url + '/api/events')).status, 401);
    assert.equal(
      (
        await fetch(url + '/api/events', {
          headers: { ...headers, origin: 'https://evil.test' },
        })
      ).status,
      403,
    );
    const response = await fetch(url + '/api/events', {
      headers,
      signal: abort.signal,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /text\/event-stream/);
    const reader = response.body!.getReader();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /event: snapshot/,
    );
    const created = await fetch(url + '/api/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        commandId: 'live',
        plan: {
          title: 'Live',
          steps: [{ id: 'a', title: 'A', kind: 'agent' }],
        },
      }),
    });
    const run = await created.json();
    const frame = new TextDecoder().decode((await reader.read()).value);
    assert.match(frame, /event: run/);
    assert.ok(frame.includes(run.id));
    await fetch(url + `/api/runs/${run.id}/commands`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'start', stepId: 'a', commandId: 'start' }),
    });
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /"revision":2/,
    );
    abort.abort();
    const reconnect = await fetch(url + '/api/events', { headers });
    const recovery = reconnect.body!.getReader();
    assert.match(
      new TextDecoder().decode((await recovery.read()).value),
      /"revision":2/,
    );
    await recovery.cancel();
  } finally {
    abort.abort();
    await app.close();
    store.close();
  }
});
