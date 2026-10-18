import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  inspectDesktopConnections,
  inspectDesktopClient,
} from '../src/adapters/connection-status.js';
import { setupDesktopClient } from '../src/adapters/desktop-setup.js';

test('inventory lists five clients as missing when no configs exist', () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-inventory-empty-'));
  try {
    const inventory = inspectDesktopConnections({
      home,
      directory: join(home, 'data'),
      platform: 'darwin',
      url: 'http://127.0.0.1:4317',
      version: '2026.10.15.2036',
      channel: 'preview',
    });
    assert.equal(inventory.integrations.length, 5);
    assert.equal(inventory.summary.configured, 0);
    assert.equal(inventory.summary.conflicts, 0);
    assert.ok(inventory.integrations.every((row) => row.status === 'missing'));
    assert.equal(inventory.version, '2026.10.15.2036');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('inventory reports configured after desktop setup and conflict when entry differs', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-inventory-mixed-'));
  try {
    const options = {
      home,
      directory: join(home, 'data'),
      platform: 'darwin' as const,
      url: 'http://127.0.0.1:4342',
    };
    await setupDesktopClient('cursor', options);
    const configured = inspectDesktopClient('cursor', options);
    assert.equal(configured.status, 'configured');
    assert.match(configured.path || '', /[/\\]\.cursor[/\\]mcp\.json$/);

    const conflictFile = join(home, '.codex/config.toml');
    mkdirSync(dirname(conflictFile), { recursive: true });
    writeFileSync(
      conflictFile,
      '[mcp_servers.hyperion]\ncommand = "different"\n',
    );
    const conflict = inspectDesktopClient('codex', options);
    assert.equal(conflict.status, 'conflict');
    assert.match(conflict.detail || '', /No se sobrescribió/);
    assert.equal(conflict.existing?.command, 'different');
    assert.ok(conflict.expected?.command);
    assert.notEqual(conflict.existing?.command, conflict.expected?.command);

    const inventory = inspectDesktopConnections(options);
    assert.equal(inventory.summary.configured, 1);
    assert.equal(inventory.summary.conflicts, 1);
    assert.equal(
      readFileSync(conflictFile, 'utf8').includes('different'),
      true,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('unreadable JSON becomes unknown without changing the file', () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-inventory-unknown-'));
  try {
    const file = join(home, '.cursor/mcp.json');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '{not-json');
    const row = inspectDesktopClient('cursor', {
      home,
      directory: join(home, 'data'),
      platform: 'darwin',
    });
    assert.equal(row.status, 'unknown');
    assert.equal(readFileSync(file, 'utf8'), '{not-json');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
