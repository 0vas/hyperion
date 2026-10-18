import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setupDesktopClient } from '../src/adapters/desktop-setup.js';
import {
  inspectDesktopClient,
  inspectDesktopConnections,
} from '../src/adapters/connection-status.js';
import {
  isSameInstallHyperionConflict,
  refreshSameInstallConflicts,
} from '../src/adapters/post-update-connections.js';
import {
  consumePostUpdateRefresh,
  markPostUpdateRefresh,
  postUpdateFlagPath,
} from '../src/adapters/post-update-flag.js';

test('same-install heuristic accepts Hyperion mcp-launcher under this data dir', () => {
  const data = '/Users/me/.hyperion';
  assert.equal(
    isSameInstallHyperionConflict(
      {
        command: '/Applications/Hyperion.app/Contents/MacOS/Hyperion',
        args: [
          '/Applications/Hyperion.app/Contents/Resources/app/dist/adapters/mcp-launcher.js',
        ],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          HYPERION_AGENT_ID: 'cursor',
          HYPERION_DATA_DIR: data,
          HYPERION_URL: 'http://127.0.0.1:4317',
        },
      },
      { dataDirectory: data },
    ),
    true,
  );
});

test('same-install heuristic rejects foreign command, other data dir, or non-stdio', () => {
  const data = '/Users/me/.hyperion';
  assert.equal(
    isSameInstallHyperionConflict(
      { command: 'different', args: ['mcp-launcher.js'] },
      { dataDirectory: data },
    ),
    false,
  );
  assert.equal(
    isSameInstallHyperionConflict(
      {
        command: '/Applications/Hyperion.app/Contents/MacOS/Hyperion',
        args: [
          '/Applications/Hyperion.app/Contents/Resources/app/dist/adapters/mcp-launcher.js',
        ],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          HYPERION_AGENT_ID: 'cursor',
          HYPERION_DATA_DIR: '/other/.hyperion',
        },
      },
      { dataDirectory: data },
    ),
    false,
  );
  assert.equal(
    isSameInstallHyperionConflict(
      {
        type: 'http',
        url: 'https://example.com',
        command: '/Applications/Hyperion.app/Contents/MacOS/Hyperion',
        args: ['mcp-launcher.js'],
        env: {
          HYPERION_AGENT_ID: 'cursor',
          HYPERION_DATA_DIR: data,
        },
      },
      { dataDirectory: data },
    ),
    false,
  );
});

test('post-update flag is one-shot: mark then consume once', () => {
  const root = mkdtempSync(join(tmpdir(), 'hyperion-post-update-flag-'));
  try {
    assert.equal(consumePostUpdateRefresh(root), false);
    markPostUpdateRefresh(root);
    assert.ok(existsSync(postUpdateFlagPath(root)));
    assert.equal(consumePostUpdateRefresh(root), true);
    assert.equal(existsSync(postUpdateFlagPath(root)), false);
    assert.equal(consumePostUpdateRefresh(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refresh replaces same-install conflict with backup and leaves foreign/missing alone', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-post-update-refresh-'));
  const directory = join(home, 'data');
  try {
    const options = {
      home,
      directory,
      platform: 'darwin' as const,
      url: 'http://127.0.0.1:4355',
    };
    await setupDesktopClient('cursor', options);
    const cursorFile = join(home, '.cursor/mcp.json');
    const installed = JSON.parse(readFileSync(cursorFile, 'utf8'));
    // Simulate a prior Desktop install whose launcher path drifted after update.
    installed.mcpServers.hyperion.command =
      '/Applications/Hyperion.app/Contents/MacOS/Hyperion';
    installed.mcpServers.hyperion.args = [
      '/Applications/Hyperion.app/Contents/Resources/app.asar.unpacked/dist/adapters/mcp-launcher.js',
    ];
    installed.mcpServers.hyperion.env.ELECTRON_RUN_AS_NODE = '1';
    installed.mcpServers.hyperion.env.HYPERION_DATA_DIR = directory;
    writeFileSync(cursorFile, JSON.stringify(installed, null, 2) + '\n');
    assert.equal(inspectDesktopClient('cursor', options).status, 'conflict');
    assert.ok(
      isSameInstallHyperionConflict(installed.mcpServers.hyperion, {
        dataDirectory: directory,
      }),
    );

    const foreign = join(home, '.codex/config.toml');
    mkdirSync(dirname(foreign), { recursive: true });
    writeFileSync(
      foreign,
      '[mcp_servers.hyperion]\ncommand = "npx"\nargs = ["some-other-mcp"]\n',
    );
    assert.equal(inspectDesktopClient('codex', options).status, 'conflict');

    const result = await refreshSameInstallConflicts(options);
    assert.deepEqual(result.replaced, ['cursor']);
    assert.ok(result.skipped.includes('codex'));
    assert.ok(result.backups.length >= 1);
    assert.equal(inspectDesktopClient('cursor', options).status, 'configured');
    assert.equal(inspectDesktopClient('codex', options).status, 'conflict');
    assert.equal(
      inspectDesktopClient('antigravity', options).status,
      'missing',
    );
    assert.match(readFileSync(cursorFile, 'utf8'), /mcp-launcher\.js/);
    assert.match(readFileSync(foreign, 'utf8'), /npx/);

    const inventory = inspectDesktopConnections(options);
    assert.equal(inventory.summary.configured, 1);
    assert.equal(inventory.summary.conflicts, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('ordinary inventory without post-update refresh does not rewrite conflicts', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-no-auto-replace-'));
  const directory = join(home, 'data');
  try {
    const options = {
      home,
      directory,
      platform: 'darwin' as const,
      url: 'http://127.0.0.1:4356',
    };
    await setupDesktopClient('cursor', options);
    const cursorFile = join(home, '.cursor/mcp.json');
    const installed = JSON.parse(readFileSync(cursorFile, 'utf8'));
    installed.mcpServers.hyperion.args = [
      '/old/Hyperion.app/Contents/Resources/app/dist/adapters/mcp-launcher.js',
    ];
    installed.mcpServers.hyperion.command =
      '/old/Hyperion.app/Contents/MacOS/Hyperion';
    installed.mcpServers.hyperion.env.ELECTRON_RUN_AS_NODE = '1';
    installed.mcpServers.hyperion.env.HYPERION_DATA_DIR = directory;
    const before = JSON.stringify(installed, null, 2) + '\n';
    writeFileSync(cursorFile, before);
    assert.equal(inspectDesktopClient('cursor', options).status, 'conflict');
    // Cold start path: consume returns false → refresh must not run.
    assert.equal(consumePostUpdateRefresh(home), false);
    assert.equal(readFileSync(cursorFile, 'utf8'), before);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
