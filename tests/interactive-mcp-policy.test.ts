import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';

test('interactive Desktop MCP omits human-control tools and rejects retry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-live-mcp-'));
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent-token',
    humanToken: 'human-token',
    agentId: 'codex',
  });
  const url = await app.listen(0);
  writeFileSync(
    join(directory, 'credentials.json'),
    JSON.stringify({ agentToken: 'agent-token', agentId: 'codex' }),
  );
  const client = new Client({
    name: 'interactive-policy-test',
    version: '1.0.0',
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', resolve('src/adapters/mcp.ts')],
    env: {
      ...process.env,
      HYPERION_DATA_DIR: directory,
      HYPERION_URL: url,
      HYPERION_AGENT_ID: 'codex',
      HYPERION_INTERACTIVE_CHAT: '1',
    },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(names, [
      'hyperion_add_artifact',
      'hyperion_create_run',
      'hyperion_get_run',
      'hyperion_list_runs',
      'hyperion_open',
      'hyperion_step',
      'hyperion_wait',
    ]);
    const run = await client.callTool({
      name: 'hyperion_create_run',
      arguments: {
        commandId: 'create-live-policy',
        plan: {
          title: 'Policy',
          steps: [{ id: 'work', title: 'Work', kind: 'agent' }],
        },
      },
    });
    const body = JSON.parse((run.content as { text: string }[])[0]!.text);
    const denied = await client.callTool({
      name: 'hyperion_step',
      arguments: {
        runId: body.id,
        stepId: 'work',
        action: 'retry',
        commandId: 'retry-live-policy',
      },
    });
    assert.equal(denied.isError, true);
  } finally {
    await client.close();
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
