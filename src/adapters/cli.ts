#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  runContinuationWorker,
  type BridgeConnector,
} from './continuation-worker.js';
import { suspendSchema } from '../domain/continuation.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { openPresentation, rememberWorkspace } from './desktop.js';
import { ensureServer } from './bootstrap.js';
import { registerAgent } from '../server/config.js';
import { installSkill, defaultDirectory } from './install.js';
import { setupClient } from './setup.js';
import { HyperionClient } from './client.js';
import { followHumanInput, withHandoff, withGuideResult } from './handoff.js';
import { appendHarnessLog } from './harness-log.js';
import type { Run } from '../domain/workflow.js';
import { commandSchema } from '../domain/workflow.js';
import { generateConnection } from './connections.js';
const args = process.argv.slice(2);
if (args[0] === '--agent') {
  if (!args[1]) throw new Error('--agent requires an identity');
  process.env.HYPERION_AGENT_ID = args[1];
  args.splice(0, 2);
}
process.env.HYPERION_DATA_DIR ||= defaultDirectory();
const attemptIndex = args.indexOf('--attempt');
const attempt = attemptIndex >= 0 ? Number(args[attemptIndex + 1]) : undefined;
if (attemptIndex >= 0) args.splice(attemptIndex, 2);
const parentIndex = args.indexOf('--from');
const parentRunId = parentIndex >= 0 ? args[parentIndex + 1] : undefined;
if (parentIndex >= 0) args.splice(parentIndex, 2);
const [operation, first, second, ...rest] = args;
const help = `Hyperion — cooperative workflow adapter
  install [skills-directory]  # portable skill, no vendor CLI or MCP required
  open <run-id> <split|desktop> # user chooses presentation in chat
  up                         # start/reuse local Hyperion, return URL
  setup <codex|claude|cursor|antigravity>  # configure the client; local server starts on demand
  connect <client-id>  # codex, claude, cursor, or your own ID
  guide <plan.json> [idempotency-key] # stream URL and keep waiting for canvas input
  suspend <run-id> <connector.json> # persist checkpoint for a real resumable connector
  bridge <trusted-connector.mjs> # run an installed connector; no LLM during human input
  follow <run-id>             # keep the host tool open until work is ready
  create <plan.json> [idempotency-key] # nonblocking API-style result
  artifact <run-id> <step-id> <absolute-file> --attempt NUMBER [idempotency-key]
  create|guide <plan.json> [idempotency-key] --from <completed-run-id> # linked new cycle
  command <run-id> <command.json>  # typed outputs or structured traces
  list
  get <run-id>
  start|complete|fail|log|retry <run-id> <step-id> [message]
  complete|fail|log <run-id> <step-id> --attempt NUMBER [message]
  wait <run-id> [after-revision] [timeout-seconds, max 55]

Human approvals and manual input belong in the web interface.
Set HYPERION_URL and HYPERION_DATA_DIR to target another local instance.`;
try {
  if (
    attemptIndex >= 0 &&
    (!Number.isInteger(attempt) ||
      attempt! < 1 ||
      !['complete', 'fail', 'log', 'artifact'].includes(operation || ''))
  )
    throw new Error(
      '--attempt requires a positive execution attempt for complete/fail/log/artifact',
    );
  if (
    parentIndex >= 0 &&
    (!parentRunId || !['create', 'guide'].includes(operation || ''))
  )
    throw new Error('--from requires a parent run for create/guide');
  if (!operation || operation === '--help') console.log(help);
  else if (operation === 'install' || (operation === 'setup' && first)) {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    if (!existsSync(resolve(root, 'dist/adapters/mcp-launcher.js'))) {
      const build = spawnSync('npm', ['run', 'build'], {
        cwd: root,
        stdio: 'inherit',
        shell: false,
      });
      if (build.status !== 0)
        throw new Error('Build failed. Run npm ci and npm run build first.');
    }
    console.log(
      JSON.stringify(
        operation === 'install'
          ? installSkill({ destination: first })
          : await setupClient(first!),
        null,
        2,
      ),
    );
  } else if (operation === 'connect' && first)
    console.log(JSON.stringify(generateConnection(first), null, 2));
  else {
    if (
      ![
        'artifact',
        'suspend',
        'bridge',
        'up',
        'open',
        'list',
        'create',
        'guide',
        'follow',
        'command',
        'get',
        'wait',
        'start',
        'complete',
        'fail',
        'log',
        'retry',
      ].includes(operation)
    )
      throw new Error(help);
    if (process.env.HYPERION_AGENT_ID)
      registerAgent(
        process.env.HYPERION_AGENT_ID,
        process.env.HYPERION_DATA_DIR,
      );
    const startup = await ensureServer();
    const service =
      startup.url || process.env.HYPERION_URL || 'http://127.0.0.1:4317';
    const client = new HyperionClient({
      url: service,
      directory: process.env.HYPERION_DATA_DIR,
    });
    rememberWorkspace({
      service,
      directory: process.env.HYPERION_DATA_DIR!,
    });
    let result: unknown;
    if (operation === 'bridge' && first) {
      const connector = (await import(pathToFileURL(resolve(first)).href))
        .default as BridgeConnector;
      if (
        !connector ||
        typeof connector.id !== 'string' ||
        (typeof connector.resume !== 'function' &&
          typeof connector.send !== 'function')
      )
        throw new Error(
          'Connector must export default {id, resume and/or send, reconcile?}',
        );
      const abort = new AbortController();
      const stop = () => abort.abort();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      try {
        await runContinuationWorker(client, connector, {
          signal: abort.signal,
          onError: () =>
            console.error(
              'Continuation delivery unresolved; inspect the connector receipt before retrying.',
            ),
        });
      } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
      result = { stopped: true };
    } else if (operation === 'suspend' && first && second)
      result = await client.suspend(
        first,
        suspendSchema.parse(JSON.parse(readFileSync(second, 'utf8'))),
      );
    else if (operation === 'up') result = { ...startup, url: client.url };
    else if (
      operation === 'open' &&
      first &&
      ['split', 'desktop'].includes(second || '')
    ) {
      result = await openPresentation(
        client,
        first,
        second as 'split' | 'desktop',
      );
    } else if (operation === 'list') result = await client.list();
    else if (['create', 'guide'].includes(operation) && first) {
      let run: Run;
      try {
        run = await client.create(
          JSON.parse(readFileSync(first, 'utf8')),
          second,
          parentRunId,
        );
      } catch (error) {
        appendHarnessLog('create_rejected', {
          reason: error instanceof Error ? error.message : 'Unknown error',
          commandId: second,
        });
        throw error;
      }
      const current =
        operation === 'guide'
          ? await followHumanInput(client, run, (event) => {
              console.log(JSON.stringify(event));
            })
          : run;
      result = { ...withHandoff(current), url: client.link(current) };
    } else if (
      operation === 'artifact' &&
      first &&
      second &&
      rest[0] &&
      attempt
    )
      result = await client.attachFile(first, resolve(rest[0]), {
        stepId: second,
        attempt,
        commandId: rest[1] || crypto.randomUUID(),
      });
    else if (operation === 'command' && first && second)
      result = await client.command(
        first,
        commandSchema.parse(JSON.parse(readFileSync(second, 'utf8'))),
      );
    else if (operation === 'follow' && first)
      result = await followHumanInput(
        client,
        await client.get(first),
        (event) => {
          console.log(JSON.stringify(event));
        },
      );
    else if (operation === 'get' && first) result = await client.get(first);
    else if (operation === 'wait' && first) {
      const afterRevision = Number(second || 0);
      const timeoutSeconds = Number(rest[0] || 30);
      appendHarnessLog('wait_armed', {
        runId: first,
        afterRevision,
        timeoutSeconds,
      });
      const waited = await client.wait(first, afterRevision, timeoutSeconds);
      if (
        waited.revision <= afterRevision &&
        waited.status === 'active' &&
        waited.continuation?.status !== 'waiting'
      )
        appendHarnessLog('wait_expired', {
          runId: first,
          afterRevision,
          revision: waited.revision,
        });
      result = waited;
    } else if (
      ['start', 'complete', 'fail', 'log', 'retry'].includes(operation) &&
      first &&
      second
    )
      result = await client.command(
        first,
        commandSchema.parse({
          type: operation,
          ...(attempt !== undefined ? { attempt } : {}),
          stepId: second,
          message: rest.join(' ') || undefined,
        }),
      );
    else throw new Error(help);
    if (
      result &&
      typeof result === 'object' &&
      'steps' in result &&
      'revision' in result
    )
      result = ['guide', 'follow'].includes(operation)
        ? withGuideResult(result as Run)
        : withHandoff(result as Run);
    console.log(
      JSON.stringify(
        result,
        null,
        ['guide', 'follow'].includes(operation) ? undefined : 2,
      ),
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
