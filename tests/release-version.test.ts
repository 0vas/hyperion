import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { VERSION } from '../src/version.js';
const require = createRequire(import.meta.url);
const {
  releaseVersions,
  parseCalVer,
} = require('../desktop/release-version.cjs');
const release = require('../src/release.json');
const pkg = require('../package.json');

test('public CalVer, runtime, native build and package metadata stay consistent', () => {
  assert.equal(VERSION, release.version);
  const versions = releaseVersions(release);
  assert.equal(pkg.version, versions.packageVersion);
  assert.equal(
    JSON.parse(
      readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
    ).version,
    versions.packageVersion,
  );
  const config = require('../desktop/builder.config.cjs');
  assert.equal(
    config.artifactName,
    `Hyperion-${VERSION}-\${os}-\${arch}.\${ext}`,
  );
  assert.equal(config.buildVersion, versions.buildVersion);
  for (const n of versions.buildVersion.split('.'))
    assert.ok(Number(n) <= 65535);
  assert.ok(Number(versions.buildVersion.split('.')[0]) <= 9999);
  const first = releaseVersions({
    version: '2026.12.31.2359',
    timezone: 'UTC',
    channel: 'preview',
  });
  const next = releaseVersions({
    version: '2027.01.01.0000',
    timezone: 'UTC',
    channel: 'preview',
  });
  assert.ok(
    Number(next.buildVersion.split('.')[0]) >
      Number(first.buildVersion.split('.')[0]),
  );
  assert.ok(parseCalVer('2028.02.29.1200'));
  assert.equal(parseCalVer('2027.02.29.1200'), null);
  assert.doesNotThrow(() =>
    releaseVersions({
      version: '2026.12.31.2358',
      timezone: 'UTC',
      channel: 'beta',
    }),
  );
});

test('public macOS packaging fails before building when notarization credentials are absent', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', "require('./desktop/builder.config.cjs')"],
    {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        HYPERION_REQUIRE_NOTARIZATION: '1',
        HYPERION_SIGN_IDENTITY: '',
        CSC_LINK: '',
        APPLE_ID: '',
        APPLE_APP_SPECIFIC_PASSWORD: '',
        APPLE_TEAM_ID: '',
      },
      encoding: 'utf8',
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires Developer ID/);
});
