import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveAppBundle,
  applyMacDmg,
  applyWindowsInstaller,
} from '../desktop/apply-update.mjs';

test('resolveAppBundle accepts only Hyperion.app Contents/MacOS layout', () => {
  assert.equal(
    resolveAppBundle('/Applications/Hyperion.app/Contents/MacOS/Hyperion'),
    '/Applications/Hyperion.app',
  );
  assert.throws(
    () => resolveAppBundle('/Applications/Other.app/Contents/MacOS/Hyperion'),
    /Hyperion\.app/,
  );
  assert.throws(() => resolveAppBundle('/tmp/Hyperion'), /Hyperion\.app/);
});

test('applyMacDmg mounts read-only, verifies signature, replaces bundle and restores on failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hyperion-apply-mac-'));
  const mount = join(root, 'mount');
  const current = join(root, 'Hyperion.app');
  const incoming = join(mount, 'Hyperion.app');
  const dmg = join(root, 'Hyperion.dmg');
  mkdirSync(join(current, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(join(current, 'Contents', 'MacOS', 'Hyperion'), 'old');
  mkdirSync(join(incoming, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(join(incoming, 'Contents', 'MacOS', 'Hyperion'), 'new');
  writeFileSync(dmg, 'dmg');
  const calls = [];
  try {
    await applyMacDmg(dmg, {
      executablePath: join(current, 'Contents', 'MacOS', 'Hyperion'),
      mountPoint: mount,
      execFile: async (command, args) => {
        calls.push([command, ...args]);
        if (command === 'hdiutil' && args[0] === 'attach')
          return { stdout: '' };
        if (command === 'codesign') return { stdout: '' };
        if (command === 'hdiutil' && args[0] === 'detach')
          return { stdout: '' };
        throw new Error(`unexpected ${command}`);
      },
    });
    assert.equal(
      readFileSync(join(current, 'Contents', 'MacOS', 'Hyperion'), 'utf8'),
      'new',
    );
    assert.ok(calls.some((c) => c[0] === 'hdiutil' && c[1] === 'attach'));
    assert.ok(calls.some((c) => c.includes('-readonly')));
    assert.ok(calls.some((c) => c[0] === 'codesign'));
    assert.ok(
      !calls.some((c) => c[0] === 'open'),
      'applyMacDmg must not open -n while the old instance still holds the lock',
    );
    assert.ok(!existsSync(join(root, 'Hyperion.app.updating-backup')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('applyMacDmg refuses unwritable destination and never leaves a half-replaced app', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hyperion-apply-refuse-'));
  const mount = join(root, 'mount');
  const current = join(root, 'Hyperion.app');
  const incoming = join(mount, 'Hyperion.app');
  const dmg = join(root, 'Hyperion.dmg');
  mkdirSync(join(current, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(join(current, 'Contents', 'MacOS', 'Hyperion'), 'old');
  mkdirSync(join(incoming, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(join(incoming, 'Contents', 'MacOS', 'Hyperion'), 'new');
  writeFileSync(dmg, 'dmg');
  let spawned = false;
  try {
    await assert.rejects(
      applyMacDmg(dmg, {
        executablePath: join(current, 'Contents', 'MacOS', 'Hyperion'),
        mountPoint: mount,
        ensureWritable: async () => {
          throw new Error('EACCES');
        },
        execFile: async () => {
          spawned = true;
          throw new Error('hdiutil must not run when unwritable');
        },
      }),
      /escribible|writable|permiso|permission/i,
    );
    assert.equal(spawned, false);
    assert.equal(
      readFileSync(join(current, 'Contents', 'MacOS', 'Hyperion'), 'utf8'),
      'old',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('applyWindowsInstaller spawns only the verified path with silent update flags', async () => {
  const spawned = [];
  const installer =
    'C:\\Users\\me\\updates\\Hyperion-2026.10.15.1916-win-x64.exe';
  await applyWindowsInstaller(installer, {
    spawn: (command, args, options) => {
      spawned.push({ command, args, options });
      return { unref() {} };
    },
  });
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].command, installer);
  assert.deepEqual(spawned[0].args, ['/S', '--updated']);
  assert.equal(spawned[0].options.detached, true);
  assert.equal(spawned[0].options.shell, false);
  await assert.rejects(
    applyWindowsInstaller('C:\\Temp\\evil.exe', {
      spawn: () => {
        throw new Error('should not spawn');
      },
    }),
    /instalador|installer|Hyperion/i,
  );
});
