import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  inspectDesktopConnections,
  inspectDesktopClient,
} from '../src/adapters/connection-status.js';
import { setupDesktopClient } from '../src/adapters/desktop-setup.js';

function snapshot(directory: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      entries[entry.name + '/'] = 'directory';
      for (const [child, digest] of Object.entries(snapshot(path)))
        entries[entry.name + '/' + child] = digest;
    } else {
      entries[entry.name] = createHash('sha256')
        .update(readFileSync(path))
        .digest('hex');
    }
  }
  return entries;
}

for (const credentialsExist of [true, false]) {
  test(`repeated inventory preserves the entire tree with ${credentialsExist ? 'other-identity credentials' : 'a missing data directory'}`, () => {
    const home = mkdtempSync(join(tmpdir(), 'hyperion-inventory-pure-'));
    const directory = join(home, 'data');
    try {
      const file = join(home, '.cursor/mcp.json');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        JSON.stringify({
          mcpServers: { hyperion: { command: 'untrusted-command-never-run' } },
        }),
      );
      if (credentialsExist) {
        mkdirSync(directory);
        writeFileSync(
          join(directory, 'credentials.json'),
          JSON.stringify({
            agentId: 'codex',
            agentToken: 'a'.repeat(64),
            humanToken: 'h'.repeat(64),
          }),
        );
      }
      const before = snapshot(home);
      for (let repeat = 0; repeat < 2; repeat++) {
        const options = { home, directory, platform: 'win32' as const };
        assert.equal(
          inspectDesktopClient('cursor', options).status,
          'conflict',
        );
        assert.equal(inspectDesktopConnections(options).summary.conflicts, 1);
        assert.deepEqual(
          snapshot(home),
          before,
          'inventory must not register credentials or export connections',
        );
      }
      assert.equal(existsSync(directory), credentialsExist);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
}

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
