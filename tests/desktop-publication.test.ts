import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

// Exercise the publication guard that CI actually executes, with synthetic
// release metadata and installer bytes. No shell, credentials or network.
const workflow = readFileSync(
  new URL('../.github/workflows/publish-desktop.yml', import.meta.url),
  'utf8',
);
const verification = workflow.split(
  '      - name: Verify remote digests before publishing',
)[1];
assert.ok(verification);
const embedded = verification.match(
  /node --input-type=module <<'JS'\n([\s\S]+?)\n          JS/,
)?.[1];
assert.ok(embedded);
const guard = embedded
  .replace(/^          /gm, '')
  .replace(/^import .*;\n/gm, '');
const files = new Map([
  ['Hyperion-2026.10.19.0000-mac-arm64.dmg', Buffer.from('synthetic arm')],
  ['Hyperion-2026.10.19.0000-win-x64.exe', Buffer.from('synthetic windows')],
  ['SHA256SUMS.txt', Buffer.from('synthetic manifest')],
]);
const release = () => ({
  draft: true,
  assets: [...files].map(([name, bytes]) => ({
    name,
    state: 'uploaded',
    size: bytes.length,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  })),
});
function verify(value: ReturnType<typeof release>) {
  runInNewContext(guard, {
    JSON,
    assert,
    createHash,
    process: {
      env: { GITHUB_REPOSITORY: 'synthetic/hyperion', RELEASE_ID: '42' },
    },
    execFileSync: (command: string, args: string[]) => {
      assert.equal(command, 'gh');
      assert.deepEqual(Array.from(args), [
        'api',
        'repos/synthetic/hyperion/releases/42',
      ]);
      return JSON.stringify(value);
    },
    readdirSync: () => [...files.keys()],
    readFileSync: (path: string) => {
      const bytes = files.get(path.replace(/^publish\//, ''));
      assert.ok(bytes);
      return bytes;
    },
  });
}

test('publication accepts the exact tested installers and checksum manifest', () => {
  assert.doesNotThrow(() => verify(release()));
});
test('publication rejects extra Intel assets without changing the draft', () => {
  const value = release();
  value.assets.push({ ...value.assets[0]!, name: 'unsupported-mac-x64.dmg' });
  const before = JSON.stringify(value);
  assert.throws(() => verify(value), /Draft assets must match/);
  assert.equal(JSON.stringify(value), before);
});
test('publication rejects a missing required installer', () => {
  const value = release();
  value.assets.shift();
  assert.throws(() => verify(value), /Draft assets must match/);
});
test('publication still rejects a remote digest mismatch', () => {
  const value = release();
  value.assets[0]!.digest = 'sha256:incorrect';
  assert.throws(() => verify(value));
});
test('publication still rejects an already published release', () => {
  const value = release();
  value.draft = false;
  assert.throws(() => verify(value));
});
