import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';

test('Desktop MCP exposes agent operations while engine roles, revisions and receipts still apply', async () => {
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
      HYPERION_TOKEN: '',
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
      'hyperion_revise_plan',
      'hyperion_step',
      'hyperion_suspend',
      'hyperion_wait',
    ]);
    const call = async (
      name: string,
      args: Record<string, unknown>,
      error?: RegExp,
    ) => {
      const result = await client.callTool({ name, arguments: args });
      const parsed = JSON.parse(
        (result.content as { text: string }[])[0]!.text,
      );
      if (error) {
        assert.equal(result.isError, true);
        assert.match(parsed.error, error);
      } else assert.notEqual(result.isError, true, JSON.stringify(parsed));
      return parsed;
    };
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
    const step = (action: string, commandId: string, extra = {}) =>
      call('hyperion_step', {
        runId: body.id,
        stepId: 'work',
        action,
        commandId,
        ...extra,
      });
    const started = await step('start', 'start');
    const attempt = started.steps[0].attempt;
    await step('fail', 'fail', { attempt, message: 'Synthetic tool failure' });
    const retried = await step('retry', 'retry');
    assert.equal(retried.steps[0].status, 'ready');
    assert.equal((await step('retry', 'retry')).revision, retried.revision);
    await call(
      'hyperion_step',
      {
        runId: body.id,
        stepId: 'work',
        action: 'retry',
        commandId: 'retry',
        message: 'Different content',
      },
      /IDEMPOTENCY|CONFLICT/,
    );
    const restarted = await step('start', 'restart');
    assert.equal(restarted.steps[0].attempt, attempt + 1);
    await call(
      'hyperion_step',
      {
        runId: body.id,
        stepId: 'work',
        action: 'complete',
        commandId: 'stale-result',
        attempt,
        message: 'Stale result',
      },
      /STALE_ATTEMPT/,
    );
    // Recovery of running work invalidates the old attempt, not external effects.
    const recovered = await step('retry', 'recover', {
      message: 'External effects reconciled in fixture',
    });
    assert.equal(recovered.steps[0].status, 'ready');
    const plan = {
      title: 'Policy',
      steps: [
        { id: 'work', title: 'Work', kind: 'agent' },
        {
          id: 'future',
          title: 'New future work',
          kind: 'agent',
          dependencies: ['work'],
        },
      ],
    };
    const revisionArgs = {
      runId: body.id,
      plan,
      reason: 'New user scope',
      expectedRevision: recovered.revision,
      commandId: 'revision',
    };
    await call(
      'hyperion_revise_plan',
      {
        ...revisionArgs,
        expectedRevision: recovered.revision - 1,
        commandId: 'stale-revision',
      },
      /REVISION_CONFLICT/,
    );
    const revised = await call('hyperion_revise_plan', revisionArgs);
    assert.equal(revised.status, 'paused');
    assert.equal(
      (await call('hyperion_revise_plan', revisionArgs)).revision,
      revised.revision,
    );
    await call(
      'hyperion_step',
      {
        runId: body.id,
        stepId: 'work',
        action: 'start',
        commandId: 'paused-start',
      },
      /PAUSED/,
    );
    // Synthetic direct HTTP requests prove server authorization, not just absence
    // of human actions in the tool schema. Never hand this fixture token to MCP.
    for (const type of [
      'approve',
      'reject',
      'submit',
      'pause',
      'resume',
      'cancel',
      'amend',
    ]) {
      const response = await fetch(`${url}/api/runs/${body.id}/commands`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer agent-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type, commandId: `denied-${type}` }),
      });
      assert.equal(response.status, 403, type);
    }
    const foreign = store.create(
      {
        title: 'Foreign coordinator',
        steps: [{ id: 'work', title: 'Work', kind: 'agent' }],
      },
      { role: 'agent', id: 'cursor' },
      'foreign',
    );
    await call(
      'hyperion_step',
      {
        runId: foreign.id,
        stepId: 'work',
        action: 'retry',
        commandId: 'foreign-retry',
      },
      /FORBIDDEN/,
    );
    await call(
      'hyperion_revise_plan',
      {
        ...revisionArgs,
        runId: foreign.id,
        expectedRevision: foreign.revision,
        commandId: 'foreign-revise',
      },
      /FORBIDDEN/,
    );
    const connector = {
      id: 'synthetic-connector',
      harness: 'codex',
      sessionId: 'synthetic-session',
      scope: 'native-chat',
      capabilities: { resume: true, idempotentDelivery: true },
    };
    await call(
      'hyperion_suspend',
      { runId: foreign.id, expectedRevision: foreign.revision, connector },
      /FORBIDDEN/,
    );
    const waiting = await call('hyperion_create_run', {
      commandId: 'waiting',
      plan: {
        title: 'Human wait',
        steps: [{ id: 'approval', title: 'Human decision', kind: 'approval' }],
      },
    });
    // Contract validation cannot certify that a connector is installed. It
    // must still reject missing connector/session details before any checkpoint.
    for (const incomplete of [undefined, { ...connector, sessionId: '' }]) {
      const invalid = await client.callTool({
        name: 'hyperion_suspend',
        arguments: {
          runId: waiting.id,
          expectedRevision: waiting.revision,
          ...(incomplete ? { connector: incomplete } : {}),
        },
      });
      assert.equal(invalid.isError, true);
      assert.match(JSON.stringify(invalid.content), /connector|sessionId/);
      assert.equal(store.get(waiting.id).revision, waiting.revision);
      assert.equal(store.continuations.state(waiting.id), undefined);
    }
    await call(
      'hyperion_suspend',
      { runId: waiting.id, expectedRevision: waiting.revision + 1, connector },
      /Current revision required/,
    );
    const suspended = await call('hyperion_suspend', {
      runId: waiting.id,
      expectedRevision: waiting.revision,
      connector,
    });
    assert.equal(suspended.continuation.status, 'waiting');
    assert.equal(suspended.steps[0].status, 'waiting');
  } finally {
    await client.close();
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
