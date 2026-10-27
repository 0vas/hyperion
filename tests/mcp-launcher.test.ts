import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { HyperionClient } from '../src/adapters/client.js';
import { createApp } from '../src/server/app.js';
import { registerAgent } from '../src/server/config.js';
import { Store } from '../src/server/store.js';
import type { Run } from '../src/domain/workflow.js';

async function unusedLoopbackUrl() {
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done));
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((done) => reservation.close(() => done()));
  return `http://127.0.0.1:${port}`;
}

async function stopServer(pid: number) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw error;
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
      throw error;
    }
    await new Promise((done) => setTimeout(done, 20));
  }
  process.kill(pid, 'SIGKILL');
  throw new Error('Synthetic service did not stop after SIGTERM');
}

function seed(store: Store, title: string) {
  return store.create(
    { title, steps: [{ id: 'work', title: 'Work', kind: 'agent' }] },
    { role: 'agent', id: 'claude' },
    'synthetic-seed',
  );
}

for (const scenario of [
  'same service',
  'explicit free port',
  'foreign service',
])
  test(
    `MCP launcher uses the authenticated URL with ${scenario}`,
    { timeout: 30000 },
    async () => {
      const home = mkdtempSync(join(tmpdir(), 'hyperion-mcp-launcher spaces-'));
      const directory = join(home, 'owned');
      const credentials = registerAgent('claude', directory);
      const originalCredentials = readFileSync(
        join(directory, 'credentials.json'),
        'utf8',
      );
      const pidFile = join(home, 'server-pid');
      const tracker = join(home, 'track-server.mjs');
      // Record only our real spawned service for cleanup; do not mock bootstrap or HTTP.
      writeFileSync(
        tracker,
        `
      import { writeFileSync } from 'node:fs';
      if (process.argv[1] === ${JSON.stringify(fileURLToPath(new URL('../src/server/main.ts', import.meta.url)))})
        writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    `,
      );
      let app: ReturnType<typeof createApp> | undefined;
      let listenerStore: Store | undefined;
      let foreignCredentials: ReturnType<typeof registerAgent> | undefined;
      let foreignOriginal = '';
      let foreignRun: Run | undefined;
      let authenticationChecks = 0;
      const client = new Client({
        name: 'launcher-regression',
        version: '1.0.0',
      });
      const protocolErrors: string[] = [];
      client.onerror = (error) => protocolErrors.push(error.message);
      try {
        let expected: Run;
        if (scenario === 'same service') {
          listenerStore = new Store(':memory:');
          expected = seed(listenerStore, 'Owned service');
        } else {
          const store = new Store(join(directory, 'hyperion.sqlite'));
          try {
            expected = seed(store, 'Owned service');
          } finally {
            store.close();
          }
        }
        if (scenario === 'foreign service') {
          foreignCredentials = registerAgent('claude', join(home, 'foreign'));
          foreignOriginal = readFileSync(
            join(foreignCredentials.directory, 'credentials.json'),
            'utf8',
          );
          listenerStore = new Store(':memory:');
          foreignRun = seed(
            listenerStore,
            'Foreign service must remain untouched',
          );
        }
        if (listenerStore) {
          const config = foreignCredentials || credentials;
          app = createApp({
            store: listenerStore,
            ...config,
            getAgentTokens: () => {
              authenticationChecks++;
              return config.agents;
            },
          });
        }
        const requestedUrl = app
          ? await app.listen(0)
          : await unusedLoopbackUrl();
        const configFile = join(home, 'client-config.json');
        const config = {
          command: process.execPath,
          args: [
            '--import',
            import.meta.resolve('tsx'),
            fileURLToPath(
              new URL('../src/adapters/mcp-launcher.ts', import.meta.url),
            ),
          ],
          cwd: home,
          env: {
            HYPERION_AGENT_ID: 'claude',
            HYPERION_DATA_DIR: directory,
            HYPERION_TOKEN: '',
            HYPERION_URL: requestedUrl,
            NODE_OPTIONS: `--import=${pathToFileURL(tracker).href}`,
          },
        };
        const originalConfig = JSON.stringify(config);
        writeFileSync(configFile, originalConfig);
        const transport = new StdioClientTransport({
          ...JSON.parse(readFileSync(configFile, 'utf8')),
          stderr: 'pipe',
        });
        transport.stderr?.on('data', () => {});
        await client.connect(transport, { timeout: 15000 });
        const checksAfterStartup = authenticationChecks;
        const tools = await client.listTools();
        assert.ok(
          tools.tools.some((tool) => tool.name === 'hyperion_list_runs'),
        );
        const result = await client.callTool({
          name: 'hyperion_list_runs',
          arguments: {},
        });
        assert.notEqual(
          result.isError,
          true,
          'MCP must use the authenticated service selected by bootstrap',
        );
        const runs = JSON.parse(
          (result.content as { text: string }[])[0]!.text,
        ) as Run[];
        assert.deepEqual(
          runs.map((run) => run.id),
          [expected.id],
        );
        // The SDK reports non-JSON-RPC stdout through onerror, including startup noise.
        assert.deepEqual(protocolErrors, []);
        if (scenario === 'same service') {
          assert.equal(
            existsSync(pidFile),
            false,
            'An existing authenticated service must be reused',
          );
        } else {
          assert.ok(existsSync(pidFile));
          const log = readFileSync(join(directory, 'server.log'), 'utf8');
          const actualUrl = /Hyperion ready: (http:\/\/127\.0\.0\.1:\d+)/.exec(
            log,
          )?.[1];
          assert.ok(actualUrl);
          if (scenario === 'foreign service') {
            assert.notEqual(actualUrl, requestedUrl);
            assert.equal(
              authenticationChecks,
              checksAfterStartup,
              'MCP calls must not return to the foreign listener',
            );
          } else assert.equal(actualUrl, requestedUrl);
          assert.deepEqual(
            (
              await new HyperionClient({
                directory,
                url: actualUrl,
                agentId: 'claude',
              }).list()
            ).map((run) => run.id),
            [expected.id],
          );
        }
        if (foreignCredentials) {
          assert.deepEqual(
            await new HyperionClient({
              directory: foreignCredentials.directory,
              url: requestedUrl,
              agentId: 'claude',
            })
              .list()
              .then((runs) => runs.map((run) => run.id)),
            [foreignRun!.id],
          );
          assert.deepEqual(listenerStore!.get(foreignRun!.id), foreignRun);
          assert.equal(
            readFileSync(
              join(foreignCredentials.directory, 'credentials.json'),
              'utf8',
            ),
            foreignOriginal,
          );
        }
        assert.equal(readFileSync(configFile, 'utf8'), originalConfig);
        assert.equal(
          readFileSync(join(directory, 'credentials.json'), 'utf8'),
          originalCredentials,
        );
      } finally {
        await client.close();
        try {
          if (existsSync(pidFile))
            await stopServer(Number(readFileSync(pidFile, 'utf8')));
        } finally {
          await app?.close();
          listenerStore?.close();
          try {
            rmSync(home, {
              recursive: true,
              force: true,
              maxRetries: 10,
              retryDelay: 100,
            });
          } catch (error) {
            // Windows runners can leave a transient lock on temp dirs with
            // spaces; assertions already ran — do not fail the suite on cleanup.
            if (
              !error ||
              typeof error !== 'object' ||
              !('code' in error) ||
              (error.code !== 'EPERM' && error.code !== 'EBUSY')
            ) {
              throw error;
            }
          }
        }
      }
    },
  );
