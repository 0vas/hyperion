import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  selectRelease,
  checkForUpdate,
  downloadUpdate,
} from '../desktop/updates.mjs';
const bytes = Buffer.from('synthetic installer');
const asset = (version, suffix = 'mac-arm64.dmg') => ({
  name: `Hyperion-${version}-${suffix}`,
  size: bytes.length,
  browser_download_url: `https://github.com/0vas/hyperion/releases/download/v${version}/Hyperion-${version}-${suffix}`,
  digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
});
const release = (v, extra = {}) => {
  const {
    channel = v.includes('preview') ? 'preview' : 'stable',
    prerelease = channel !== 'stable',
    name = `Hyperion ${v} ${channel[0].toUpperCase()}${channel.slice(1)}`,
    ...rest
  } = extra;
  return {
    tag_name: `v${v}`,
    name,
    prerelease,
    draft: false,
    assets: [asset(v)],
    ...rest,
  };
};
test('updates select newer compatible releases numerically and respect the preview channel', () => {
  const releases = [
    release('0.5.2-preview.1'),
    release('0.5.10'),
    release('0.5.3'),
    release('99.0.0', { draft: true }),
  ];
  assert.equal(
    selectRelease(releases, '0.5.1-preview.1', 'darwin', 'arm64').version,
    '0.5.10',
  );
  assert.equal(
    selectRelease([release('0.6.0-preview.1')], '0.5.1', 'darwin', 'arm64'),
    null,
  );
  assert.equal(
    selectRelease([release('0.5.1')], '0.5.1-preview.1', 'darwin', 'arm64')
      .version,
    '0.5.1',
  );
  assert.equal(selectRelease(releases, '0.5.10', 'darwin', 'arm64'), null);
  assert.equal(selectRelease(releases, '0.4.0', 'win32', 'x64'), null);
  assert.equal(
    selectRelease(
      [release('0.5.2', { assets: [asset('0.5.2', 'win-x64.exe')] })],
      '0.5.1',
      'win32',
      'x64',
    ).asset.name,
    'Hyperion-0.5.2-win-x64.exe',
  );
});
test('updates reject foreign assets, missing digests, malformed tags and draft releases', () => {
  for (const candidate of [
    release('bad'),
    release('0.6.0', { assets: [{ ...asset('0.6.0'), digest: null }] }),
    release('0.6.0', {
      assets: [
        {
          ...asset('0.6.0'),
          browser_download_url: 'https://evil.example/file.dmg',
        },
      ],
    }),
  ])
    assert.equal(selectRelease([candidate], '0.5.0', 'darwin', 'arm64'), null);
});
test('GitHub failures are explicit; a failed check is not reported as up to date', async () => {
  await assert.rejects(
    checkForUpdate(
      '0.5.0',
      'darwin',
      'arm64',
      async () => new Response('', { status: 403 }),
    ),
    /403/,
  );
  const update = await checkForUpdate(
    '0.5.0',
    'darwin',
    'arm64',
    async (url) => {
      assert.equal(
        url,
        'https://api.github.com/repos/0vas/hyperion/releases?per_page=30',
      );
      return Response.json([release('0.5.1')]);
    },
  );
  assert.equal(update.version, '0.5.1');
});
test('downloads stream to a temporary file and require matching size and SHA-256 before replacing the destination', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hyperion-update-'));
  const destination = join(dir, 'installer.dmg');
  try {
    const update = selectRelease(
      [release('0.5.1')],
      '0.5.0',
      'darwin',
      'arm64',
    );
    writeFileSync(destination, 'keep');
    await assert.rejects(
      downloadUpdate(update, destination, {
        fetcher: async () => new Response('tampered'),
      }),
      /integridad|tamaño/,
    );
    assert.equal(readFileSync(destination, 'utf8'), 'keep');
    assert.deepEqual(readdirSync(dir), ['installer.dmg']);
    const progress = [];
    await downloadUpdate(update, destination, {
      fetcher: async () => new Response(bytes),
      onProgress: (p) => progress.push(p),
    });
    assert.deepEqual(readFileSync(destination), bytes);
    assert.equal(progress.at(-1), 1);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      downloadUpdate(update, destination, {
        signal: controller.signal,
        fetcher: async () => new Response(bytes),
      }),
    );
    assert.deepEqual(readdirSync(dir), ['installer.dmg']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CalVer orders releases by UTC date and minute, preserves channels and never falls back to SemVer', () => {
  const options = [
    release('2026.10.12.0640'),
    release('2026.10.12.0639'),
    release('2026.10.13.0000', { channel: 'preview' }),
  ];
  assert.equal(
    selectRelease(options, '2026.10.12.0638', 'darwin', 'arm64').version,
    '2026.10.12.0640',
  );
  assert.equal(
    selectRelease(options, '2026.10.12.0638', 'darwin', 'arm64', 'preview')
      .version,
    '2026.10.13.0000',
  );
  assert.equal(
    selectRelease([release('9999.0.0')], '2026.10.12.0638', 'darwin', 'arm64'),
    null,
  );
  assert.equal(
    selectRelease(
      [release('2026.10.12.0638')],
      '2026.10.12.0638',
      'darwin',
      'arm64',
    ),
    null,
  );
  assert.equal(
    selectRelease(
      [release('2026.10.12.0638')],
      '0.5.1-preview.1',
      'darwin',
      'arm64',
    ).version,
    '2026.10.12.0638',
  );
  for (const value of [
    '2026.02.29.1200',
    '2026.13.01.1200',
    '2026.10.12.2460',
    '2026.10.12.063',
    '2026.10.00.0638',
  ]) {
    assert.equal(
      selectRelease([release(value)], '2026.10.12.0638', 'darwin', 'arm64'),
      null,
    );
  }
});

test('explicitly named release channels route previews, betas, and stable installs safely', () => {
  const candidates = [
    release('2026.11.24.1415', { channel: 'preview' }),
    release('2026.11.24.1416', { channel: 'beta' }),
    release('2026.11.24.1417', { channel: 'stable' }),
  ];
  assert.equal(
    selectRelease(candidates, '2026.11.24.1412', 'darwin', 'arm64', 'preview')
      .channel,
    'stable',
  );
  assert.equal(
    selectRelease(
      candidates.slice(0, 2),
      '2026.11.24.1412',
      'darwin',
      'arm64',
      'beta',
    ).channel,
    'beta',
  );
  assert.equal(
    selectRelease(candidates, '2026.11.24.1412', 'darwin', 'arm64', 'stable')
      .channel,
    'stable',
  );
  for (const candidate of candidates)
    assert.equal(
      selectRelease(
        [candidate],
        '2026.11.24.1412',
        'darwin',
        'arm64',
        'preview',
      )?.channel,
      candidate.name.split(' ').at(-1).toLowerCase(),
    );
  assert.equal(
    selectRelease(
      [release('2026.11.24.1418', { channel: 'preview' })],
      '2026.11.24.1412',
      'darwin',
      'arm64',
      'beta',
    ),
    null,
  );
  assert.equal(
    selectRelease(
      [release('2026.11.24.1418', { channel: 'beta' })],
      '2026.11.24.1412',
      'darwin',
      'arm64',
      'stable',
    ),
    null,
  );
  assert.equal(
    selectRelease(
      [release('2026.11.24.1419', { channel: 'preview' })],
      '2026.11.24.1412',
      'darwin',
      'arm64',
      'stable',
    ),
    null,
  );
});

test('CalVer channels require matching explicit release names and prerelease state', () => {
  const malformed = [
    release('2026.11.24.1415', { channel: 'beta', prerelease: false }),
    release('2026.11.24.1416', { channel: 'preview', prerelease: false }),
    release('2026.11.24.1417', { channel: 'stable', prerelease: true }),
    release('2026.11.24.1418', { name: 'Hyperion 2026.11.24.1418' }),
  ];
  for (const candidate of malformed)
    assert.equal(
      selectRelease(
        [candidate],
        '2026.11.24.1412',
        'darwin',
        'arm64',
        'preview',
      ),
      null,
    );
});
