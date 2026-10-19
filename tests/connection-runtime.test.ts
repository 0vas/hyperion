import assert from 'node:assert/strict';
import test from 'node:test';
import {
  promises as fs,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectOwnedMcpRuntime,
  type RuntimeFileCode,
  type RuntimeFileSystem,
} from '../src/adapters/connection-runtime.js';
import { ownedMcpRuntimePaths } from '../src/adapters/connections.js';

const regular = { isFile: () => true };
const nonregular = { isFile: () => false };
const ioError = (code: string) =>
  Object.assign(new Error('SYNTHETIC_PRIVATE_ERROR /private/path'), { code });

test('readable owned fixture files with spaces do not claim startup or tool availability', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-owned files-'));
  const paths = ownedMcpRuntimePaths();
  const fixtures = new Map([
    [paths.executable, join(home, 'Hyperion Program.exe')],
    [paths.launcher, join(home, 'MCP launcher.js')],
  ]);
  const closes: string[] = [];
  const resolveFixture = (path: string) => {
    assert.ok(
      fixtures.has(path),
      'only this installation’s generated paths are eligible',
    );
    return fixtures.get(path)!;
  };
  for (const path of fixtures.values())
    writeFileSync(path, 'synthetic bytes, never executed');
  try {
    const io: RuntimeFileSystem = {
      stat: (path) => fs.stat(resolveFixture(path)),
      open: async (path, flags) => {
        assert.equal(flags, 'r');
        const file = await fs.open(resolveFixture(path), flags);
        return {
          stat: () => file.stat(),
          close: async () => {
            await file.close();
            closes.push(path);
          },
        };
      },
    };
    const result = await inspectOwnedMcpRuntime(io);
    const { checkedAt, ...facts } = result;
    assert.equal(new Date(checkedAt).toISOString(), checkedAt);
    assert.deepEqual(facts, {
      scope: 'expected_mcp_files',
      executable: { code: 'readable_file' },
      launcher: { code: 'readable_file' },
      mcpInitialization: 'not_checked',
      toolCall: 'not_checked',
      chatTools: 'unknown',
    });
    assert.deepEqual(closes.sort(), [paths.executable, paths.launcher].sort());
    for (const target of ['executable', 'launcher'] as const) {
      const fixture = fixtures.get(paths[target])!;
      rmSync(fixture);
      assert.equal((await inspectOwnedMcpRuntime(io))[target].code, 'missing');
      mkdirSync(fixture);
      assert.equal(
        (await inspectOwnedMcpRuntime(io))[target].code,
        'not_regular_file',
      );
      rmSync(fixture, { recursive: true });
      writeFileSync(fixture, 'restored synthetic bytes');
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

for (const stage of ['stat', 'open', 'fstat'] as const) {
  for (const [errorCode, expected] of [
    ['ENOENT', 'missing'],
    ['ENOTDIR', 'missing'],
    ['EACCES', 'read_denied'],
    ['EPERM', 'read_denied'],
    ['EIO', 'check_failed'],
    ['EBUSY', 'check_failed'],
    ['ELOOP', 'check_failed'],
  ] as const satisfies ReadonlyArray<readonly [string, RuntimeFileCode]>) {
    test(`${stage} ${errorCode} returns ${expected} without raw errors and closes opened handles`, async () => {
      let opens = 0;
      let closes = 0;
      const result = await inspectOwnedMcpRuntime({
        stat: async () => {
          if (stage === 'stat') throw ioError(errorCode);
          return regular;
        },
        open: async () => {
          if (stage === 'open') throw ioError(errorCode);
          opens++;
          return {
            stat: async () => {
              throw ioError(errorCode);
            },
            close: async () => {
              closes++;
            },
          };
        },
      });
      assert.equal(result.executable.code, expected);
      assert.equal(result.launcher.code, expected);
      assert.equal(opens, stage === 'fstat' ? 2 : 0);
      assert.equal(closes, opens);
      assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_ERROR'));
      assert.ok(!JSON.stringify(result).includes('/private/path'));
    });
  }
}

test('nonregular targets are never opened; descriptor changes and close failures remain explicit', async () => {
  let opens = 0;
  let closes = 0;
  let preOpen = nonregular;
  let postOpen = nonregular;
  let failClose = false;
  const io: RuntimeFileSystem = {
    stat: async () => preOpen,
    open: async () => {
      opens++;
      return {
        stat: async () => postOpen,
        close: async () => {
          closes++;
          if (failClose) throw ioError('EPERM');
        },
      };
    },
  };
  assert.equal(
    (await inspectOwnedMcpRuntime(io)).launcher.code,
    'not_regular_file',
  );
  assert.equal(opens, 0);
  preOpen = regular;
  assert.equal(
    (await inspectOwnedMcpRuntime(io)).launcher.code,
    'not_regular_file',
  );
  assert.equal(closes, 2);
  postOpen = regular;
  failClose = true;
  assert.equal(
    (await inspectOwnedMcpRuntime(io)).launcher.code,
    'check_failed',
  );
  assert.equal(closes, opens);
});

test('unexpected thrown values remain unknown instead of being called missing', async () => {
  for (const error of [
    undefined,
    null,
    'private error',
    new Error('private error'),
  ]) {
    const result = await inspectOwnedMcpRuntime({
      stat: async () => {
        throw error;
      },
      open: async () => {
        throw new Error('must not open');
      },
    });
    assert.equal(result.executable.code, 'check_failed');
    assert.equal(result.launcher.code, 'check_failed');
  }
});
