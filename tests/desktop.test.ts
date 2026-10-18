import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  desktopTarget,
  desktopWindowUrl,
  rememberDesktop,
  desktopLaunch,
  rememberWorkspace,
  rememberedWorkspaceDirectory,
  resolveWorkspaceService,
} from '../src/adapters/desktop.js';
import { DEFAULT_SERVICE } from '../src/adapters/bootstrap.js';
import { defaultDirectory } from '../src/adapters/install.js';

test('desktop targets reuse one local run, reject remote navigation and launch without shell interpolation', () => {
  const directory = join(tmpdir(), 'local data');
  const target = desktopTarget([
    '--hyperion-run=abc-123',
    '--hyperion-url=http://127.0.0.1:4317',
    `--hyperion-directory=${directory}`,
  ]);
  assert.equal(target.url, 'http://127.0.0.1:4317/?run=abc-123');
  assert.throws(
    () => desktopTarget(['--hyperion-url=https://example.com']),
    /local/i,
  );
  assert.throws(() => desktopTarget(['--hyperion-run=../../bad']), /run/i);
  const home = mkdtempSync(join(tmpdir(), 'hyperion-desktop-'));
  try {
    assert.throws(() => desktopLaunch(target, home), /abre Hyperion/i);
    rememberWorkspace(target, home);
    const recovered = desktopTarget([], home);
    assert.equal(recovered.directory, target.directory);
    assert.equal(recovered.service, target.service);
    const alternate = {
      ...target,
      service: 'http://127.0.0.1:54321',
      url: 'http://127.0.0.1:54321/?run=abc-123',
    };
    rememberWorkspace(alternate, home);
    const sticky = desktopTarget([], home);
    assert.equal(sticky.service, alternate.service);
    assert.equal(sticky.directory, target.directory);
    rememberDesktop({ executable: process.execPath, args: [] }, home);
    const launch = desktopLaunch(target, home);
    assert.equal(launch.executable, process.execPath);
    assert.deepEqual(launch.args, [
      '--hyperion-run=abc-123',
      '--hyperion-url=http://127.0.0.1:4317',
      `--hyperion-directory=${directory}`,
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Electron ignores a remembered portable data directory from workspace.json', () => {
  const previous = process.versions.electron;
  const home = mkdtempSync(join(tmpdir(), 'hyperion-sticky-workspace-'));
  const portable = mkdtempSync(join(tmpdir(), 'hyperion-portable-ws-'));
  try {
    Object.defineProperty(process.versions, 'electron', {
      value: '38.0.0',
      configurable: true,
    });
    rememberWorkspace(
      {
        service: 'http://127.0.0.1:54321',
        directory: join(portable, '.hyperion'),
      },
      home,
    );
    assert.equal(
      rememberedWorkspaceDirectory(
        { directory: join(portable, '.hyperion') },
        home,
      ),
      undefined,
    );
    const target = desktopTarget([], home);
    assert.equal(target.directory, defaultDirectory(home));
    assert.equal(target.service, 'http://127.0.0.1:54321');
    assert.equal(target.serviceSource, 'workspace');
  } finally {
    Object.defineProperty(process.versions, 'electron', {
      value: previous,
      configurable: true,
    });
    rmSync(home, { recursive: true, force: true });
    rmSync(portable, { recursive: true, force: true });
  }
});

test('workspace reopen prefers :4317 when a remembered alternate is no longer ours', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-prefer-4317-'));
  const directory = join(home, 'data');
  try {
    rememberWorkspace({ service: 'http://127.0.0.1:54321', directory }, home);
    const remembered = desktopTarget([], home);
    assert.equal(remembered.service, 'http://127.0.0.1:54321');
    assert.equal(remembered.serviceSource, 'workspace');
    assert.equal(
      await resolveWorkspaceService(remembered, async () => 'dead'),
      DEFAULT_SERVICE,
    );
    assert.equal(
      await resolveWorkspaceService(remembered, async () => 'ours'),
      'http://127.0.0.1:54321',
    );
    const explicit = desktopTarget(
      [
        '--hyperion-url=http://127.0.0.1:55555',
        `--hyperion-directory=${directory}`,
      ],
      home,
    );
    assert.equal(explicit.serviceSource, 'arg');
    assert.equal(
      await resolveWorkspaceService(explicit, async () => 'dead'),
      'http://127.0.0.1:55555',
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Desktop load URL uses the resolved service, not a dead remembered alternate', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-load-resolved-'));
  const directory = join(home, 'data');
  try {
    rememberWorkspace({ service: 'http://127.0.0.1:59799', directory }, home);
    const remembered = desktopTarget(['--hyperion-run=abc-123'], home);
    assert.equal(remembered.service, 'http://127.0.0.1:59799');
    assert.match(remembered.url, /59799/);
    const resolved = await resolveWorkspaceService(
      remembered,
      async () => 'dead',
    );
    assert.equal(resolved, DEFAULT_SERVICE);
    const loadUrl = desktopWindowUrl(remembered, resolved);
    assert.equal(loadUrl, `${DEFAULT_SERVICE}/?run=abc-123`);
    assert.notEqual(loadUrl, remembered.url);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
