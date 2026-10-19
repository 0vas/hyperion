import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCredentials, registerAgent } from '../src/server/config.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';
import { HyperionClient } from '../src/adapters/client.js';

test('legacy credentials survive adding independent, idempotent client identities', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hyperion-credentials-'));
  try {
    const legacy = {
      agentId: 'codex',
      agentToken: 'c'.repeat(64),
      humanToken: 'h'.repeat(64),
    };
    writeFileSync(join(dir, 'credentials.json'), JSON.stringify(legacy));
    const first = registerAgent('claude', dir);
    const again = registerAgent('claude', dir);
    assert.equal(first.agents.claude, again.agents.claude);
    assert.notEqual(first.agents.claude, legacy.agentToken);
    const cursor = registerAgent('cursor', dir);
    assert.equal(cursor.agents.codex, legacy.agentToken);
    assert.equal(cursor.humanToken, legacy.humanToken);
    assert.equal(cursor.agents.claude, first.agents.claude);
    assert.throws(() => registerAgent('../invalid', dir));
    assert.equal(
      JSON.parse(readFileSync(join(dir, 'credentials.json'), 'utf8'))
        .agentToken,
      legacy.agentToken,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('multiple tools share the platform but cannot take over another coordinator or approve', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hyperion-clients-'));
  const config = loadCredentials(dir);
  const store = new Store(':memory:');
  const app = createApp({
    store,
    ...config,
    getAgentTokens: () => loadCredentials(dir).agents,
  });
  const url = await app.listen(0);
  try {
    // Registration happens while the server is already running.
    registerAgent('claude', dir);
    for (const id of ['codex', 'claude', 'cursor', 'another-tool']) {
      registerAgent(id, dir);
      const client = new HyperionClient({ url, directory: dir, agentId: id });
      const request = `Use Hyperion to prepare a review with ${id}.`;
      const run = await client.create({
        title: `From ${id}`,
        request,
        steps: [{ id: 'inspect', title: 'Inspect', kind: 'agent' }],
      });
      assert.equal(run.coordinator, id);
      assert.equal(run.request, request);
      const other = new HyperionClient({
        url,
        directory: dir,
        agentId: id === 'codex' ? 'claude' : 'codex',
      });
      await assert.rejects(
        other.command(run.id, { type: 'start', stepId: 'inspect' }),
        /coordinator/i,
      );
      await client.command(run.id, { type: 'start', stepId: 'inspect' });
      const done = await client.command(run.id, {
        type: 'complete',
        stepId: 'inspect',
        message: 'Real contract test completed',
      });
      assert.equal(done.status, 'completed');
      const gate = await client.create({
        title: 'Human approval',
        steps: [{ id: 'gate', title: 'Approve', kind: 'approval' }],
      });
      await assert.rejects(
        client.command(gate.id, { type: 'approve', stepId: 'gate' }),
        /human/i,
      );
    }
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('connection generator emits usable absolute MCP configuration without credentials', async () => {
  const { generateConnection } = await import('../src/adapters/connections.js');
  const dir = mkdtempSync(join(tmpdir(), 'hyperion-config-'));
  try {
    const result = generateConnection('cursor', dir);
    const encoded = readFileSync(result.configFile, 'utf8');
    const credentials = loadCredentials(dir);
    assert.equal(
      result.config.mcpServers.hyperion.env.HYPERION_AGENT_ID,
      'cursor',
    );
    assert.equal(result.config.mcpServers.hyperion.env.HYPERION_DATA_DIR, dir);
    assert.ok(
      result.config.mcpServers.hyperion.args[0]!.endsWith(
        join('dist', 'adapters', 'mcp.js'),
      ),
    );
    for (const secret of Object.values(credentials.agents))
      assert.ok(!encoded.includes(secret));
    assert.ok(!encoded.includes(credentials.humanToken));
    for (const autoStart of [false, true]) {
      const output = generateConnection(
        'cursor',
        dir,
        autoStart,
        'http://127.0.0.1:4347',
      );
      const expected = {
        type: 'stdio',
        command: process.execPath,
        args: [
          fileURLToPath(
            new URL(
              `../dist/adapters/${autoStart ? 'mcp-launcher' : 'mcp'}.js`,
              import.meta.url,
            ),
          ),
        ],
        env: {
          ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
          HYPERION_AGENT_ID: 'cursor',
          HYPERION_DATA_DIR: dir,
          HYPERION_URL: 'http://127.0.0.1:4347',
        },
      };
      assert.deepEqual(output.config, { mcpServers: { hyperion: expected } });
      assert.equal(output.configFile, join(dir, 'connections/cursor.mcp.json'));
      assert.equal(
        readFileSync(output.configFile, 'utf8'),
        JSON.stringify(output.config, null, 2) + '\n',
      );
      assert.deepEqual(
        loadCredentials(dir),
        credentials,
        'repeated explicit exports preserve registered credentials',
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
