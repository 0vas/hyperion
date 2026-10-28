import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyWindowOpenUrl } from '../desktop/window-open-policy.mjs';

const service = 'http://127.0.0.1:4317';

test('Track I denies blob/data and artifact preview on primary window', () => {
  assert.deepEqual(
    classifyWindowOpenUrl('blob:http://127.0.0.1:4317/x', service),
    {
      action: 'deny',
      reason: 'blob',
    },
  );
  assert.deepEqual(classifyWindowOpenUrl('data:text/html,hi', service), {
    action: 'deny',
    reason: 'blob',
  });
  assert.deepEqual(
    classifyWindowOpenUrl(
      `${service}/api/runs/r1/artifacts/a1?preview=1`,
      service,
    ),
    { action: 'deny', reason: 'artifact' },
  );
});

test('Track I allows SPA load and remote openExternal', () => {
  assert.deepEqual(classifyWindowOpenUrl(`${service}/?run=abc`, service), {
    action: 'load-primary',
    reason: 'spa',
  });
  assert.deepEqual(classifyWindowOpenUrl('https://example.com/doc', service), {
    action: 'open-external',
    reason: 'remote',
  });
});
