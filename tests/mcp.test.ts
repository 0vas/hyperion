import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';
import { loadCredentials } from '../src/server/config.js';

for (const harness of ['codex', 'claude', 'cursor', 'antigravity']) {
  test(`Desktop MCP pins ${harness} to the active service and registers its identity`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'hyperion-chat-mcp-'));
    const credentials = loadCredentials(directory);
    const store = new Store(':memory:');
    const app = createApp({
      store,
      ...credentials,
      getAgentTokens: () => loadCredentials(directory).agents,
    });
    const url = await app.listen(0);
    const client = new Client({ name: 'chat-pin-test', version: '1' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', resolve('src/adapters/chat-mcp-launcher.ts')],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        HYPERION_AGENT_ID: harness,
        HYPERION_URL: url,
        HYPERION_DATA_DIR: directory,
        HYPERION_TOKEN: 'foreign-inherited-token-must-not-be-used',
      },
      stderr: 'pipe',
    });
    try {
      await client.connect(transport);
      assert.ok(loadCredentials(directory).agents[harness]);
      const result = await client.callTool({
        name: 'hyperion_list_runs',
        arguments: {},
      });
      assert.notEqual(result.isError, true);
      assert.equal((await client.listTools()).tools.length, 9);
      // This is the actual chat MCP launcher and HTTP service, with no selected
      // run or fabricated UI ID. It proves transport/policy, not LLM behavior.
      const request = `Create a synthetic welcome workflow with ${harness}`;
      const args = {
        commandId: 'desktop-new-activity',
        plan: {
          title: 'New activity from the bubble',
          request,
          steps: [{ id: 'work', title: 'Write welcome', kind: 'agent' }],
        },
      };
      const created = await client.callTool({
        name: 'hyperion_create_run',
        arguments: args,
      });
      assert.notEqual(created.isError, true);
      const run = JSON.parse((created.content as { text: string }[])[0]!.text);
      assert.equal(run.coordinator, harness);
      assert.equal(run.request, request);
      assert.match(run.id, /^[0-9a-f-]{36}$/i);
      const replay = await client.callTool({
        name: 'hyperion_create_run',
        arguments: args,
      });
      assert.equal(
        JSON.parse((replay.content as { text: string }[])[0]!.text).id,
        run.id,
      );
      const current = await client.callTool({
        name: 'hyperion_get_run',
        arguments: { runId: run.id },
      });
      assert.equal(
        JSON.parse((current.content as { text: string }[])[0]!.text).id,
        run.id,
      );
    } finally {
      await client.close();
      await transport.close();
      await app.close();
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const coordinator of [
  'codex',
  'chatgpt',
  'claude',
  'claude-code',
  'cursor',
  'hermes',
  'antigravity',
])
  test(`MCP stdio respects human gates with ${coordinator} identity`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hyperion-mcp-'));
    const store = new Store(':memory:');
    const app = createApp({
      store,
      agentToken: 'mcp-test-token',
      humanToken: 'human-test-token',
      agentId: 'codex',
      getAgentTokens: () => ({ [coordinator]: 'mcp-test-token' }),
    });
    const url = await app.listen(0);
    writeFileSync(
      join(dir, 'credentials.json'),
      JSON.stringify({ agentToken: 'mcp-test-token', agentId: coordinator }),
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', resolve('src/adapters/mcp.ts')],
      env: {
        ...env,
        HYPERION_TOKEN: '',
        HYPERION_AGENT_ID: coordinator,
        HYPERION_URL: url,
        HYPERION_DATA_DIR: dir,
      },
      stderr: 'pipe',
    });
    const client = new Client({
      name: 'hyperion-contract-test',
      version: '1.0.0',
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 9);
      assert.ok(tools.tools.some((t) => t.name === 'hyperion_add_artifact'));
      assert.ok(tools.tools.some((t) => t.name === 'hyperion_suspend'));
      assert.ok(!tools.tools.some((t) => /approve|submit/.test(t.name)));
      const created = await client.callTool({
        name: 'hyperion_create_run',
        arguments: {
          commandId: 'mcp-create',
          plan: {
            title: 'MCP contract',
            steps: [
              { id: 'approval', title: 'Human decision', kind: 'approval' },
              {
                id: 'work',
                title: 'Agent work',
                kind: 'agent',
                dependencies: ['approval'],
                outputs: [{ name: 'report', type: 'string', required: true }],
              },
            ],
          },
        },
      });
      const run = JSON.parse((created.content as { text: string }[])[0]!.text);
      assert.match(run.url, /\?run=/);
      assert.equal(run.coordinator, coordinator);
      assert.equal(run.agentNext.action, 'wait');
      assert.equal(run.agentNext.tool, 'hyperion_wait');
      assert.equal(run.agentNext.arguments.runId, run.id);
      const presented = await client.callTool({
        name: 'hyperion_open',
        arguments: { runId: run.id, presentation: 'split' },
      });
      assert.equal(presented.isError, undefined);
      const view = JSON.parse(
        (presented.content as { text: string }[])[0]!.text,
      );
      assert.equal(view.runId, run.id);
      assert.equal(view.url, run.url);
      assert.equal(view.presentation, 'split');

      const blocked = await client.callTool({
        name: 'hyperion_step',
        arguments: {
          runId: run.id,
          stepId: 'work',
          action: 'start',
          commandId: 'early',
        },
      });
      assert.equal(blocked.isError, true);
      const waiting = client.callTool({
        name: 'hyperion_wait',
        arguments: { runId: run.id, afterRevision: 1, timeoutSeconds: 5 },
      });
      for (let i = 0; i < 100; i++) {
        const response = await fetch(url + `/api/runs/${run.id}`, {
          headers: { authorization: 'Bearer mcp-test-token' },
        });
        if ((await response.json()).agentWaiting) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const approved = await fetch(url + `/api/runs/${run.id}/commands`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer human-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'approve',
          stepId: 'approval',
          expectedRevision: 1,
          commandId: 'human-choice',
        }),
      });
      assert.equal(approved.status, 200);
      const changed = await waiting;
      assert.equal(
        JSON.parse((changed.content as { text: string }[])[0]!.text).agentNext
          .action,
        'execute',
      );
      assert.equal(
        JSON.parse((changed.content as { text: string }[])[0]!.text).revision,
        2,
      );
      const revision = await client.callTool({
        name: 'hyperion_revise_plan',
        arguments: {
          runId: run.id,
          commandId: 'revise',
          expectedRevision: 2,
          reason: 'User requested a concise report',
          plan: {
            title: 'MCP contract',
            steps: [
              { id: 'approval', title: 'Human decision', kind: 'approval' },
              {
                id: 'work',
                title: 'Concise agent report',
                kind: 'agent',
                dependencies: ['approval'],
                outputs: [{ name: 'report', type: 'string', required: true }],
              },
            ],
          },
        },
      });
      assert.ok(!revision.isError);
      const revised = JSON.parse(
        (revision.content as { text: string }[])[0]!.text,
      );
      assert.equal(revised.status, 'paused');
      assert.equal(revised.planChanges.length, 1);
      const resumed = await fetch(url + `/api/runs/${run.id}/commands`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer human-test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'resume',
          commandId: 'resume-revision',
          expectedRevision: revised.revision,
        }),
      });
      assert.equal(resumed.status, 200);
      const start = await client.callTool({
        name: 'hyperion_step',
        arguments: {
          runId: run.id,
          stepId: 'work',
          action: 'start',
          commandId: 'start',
        },
      });
      assert.ok(!start.isError);
      const trace = await client.callTool({
        name: 'hyperion_step',
        arguments: {
          runId: run.id,
          stepId: 'work',
          action: 'log',
          commandId: 'trace',
          message: 'Read the relevant files',
          trace: { kind: 'action', tool: 'read_file' },
        },
      });
      assert.equal(
        JSON.parse((trace.content as { text: string }[])[0]!.text).events.at(-1)
          .trace.tool,
        'read_file',
      );
      const done = await client.callTool({
        name: 'hyperion_step',
        arguments: {
          runId: run.id,
          stepId: 'work',
          action: 'complete',
          message: 'Contract test executed successfully',
          outputs: { report: 'Verified MCP output contract' },
          commandId: 'done',
        },
      });
      assert.equal(
        JSON.parse((done.content as { text: string }[])[0]!.text).steps.find(
          (s: { id: string }) => s.id === 'work',
        ).outputValues.report,
        'Verified MCP output contract',
      );
      assert.equal(
        JSON.parse((done.content as { text: string }[])[0]!.text).status,
        'completed',
      );
      const attached = await client.callTool({
        name: 'hyperion_add_artifact',
        arguments: {
          runId: run.id,
          stepId: 'work',
          attempt: 1,
          commandId: 'report-file',
          name: 'report.md',
          text: '# Verified report',
        },
      });
      assert.ok(!attached.isError);
      const withArtifact = JSON.parse(
        (attached.content as { text: string }[])[0]!.text,
      );
      assert.equal(
        withArtifact.steps.find((s: { id: string }) => s.id === 'work')
          .artifacts[0].name,
        'report.md',
      );
      const child = await client.callTool({
        name: 'hyperion_create_run',
        arguments: {
          commandId: 'new-request',
          parentRunId: run.id,
          plan: {
            title: 'Translate report',
            request: 'Now translate the report',
            steps: [{ id: 'translate', title: 'Translate', kind: 'agent' }],
          },
        },
      });
      assert.ok(!child.isError);
      assert.equal(
        JSON.parse((child.content as { text: string }[])[0]!.text).origin.runId,
        run.id,
      );
    } finally {
      await client.close();
      await app.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
