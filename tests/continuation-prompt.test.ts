import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  continuationClipboardBody,
  readyAgentStepIds,
} from '../src/client/continuation-prompt.js';

const identity = (
  message: string,
  values?: Record<string, string | number>,
) => {
  let out = message;
  for (const [key, value] of Object.entries(values || {}))
    out = out.replaceAll(`{${key}}`, String(value));
  return out;
};

test('readyAgentStepIds lists only ready agent steps', () => {
  assert.deepEqual(
    readyAgentStepIds({
      steps: [
        { id: 'h', kind: 'manual', status: 'completed' },
        { id: 'a', kind: 'agent', status: 'ready' },
        { id: 'b', kind: 'agent', status: 'running' },
        { id: 'c', kind: 'agent', status: 'ready' },
        { id: 'g', kind: 'approval', status: 'ready' },
      ],
    }),
    ['a', 'c'],
  );
});

test('continuation clipboard names every ready stepId in one prompt', () => {
  const body = continuationClipboardBody(identity, {
    id: 'run-1',
    steps: [
      { id: 'docs', kind: 'agent', status: 'ready' },
      { id: 'code', kind: 'agent', status: 'ready' },
      { id: 'skip', kind: 'agent', status: 'pending' },
    ],
  });
  assert.match(body, /run-1/);
  assert.match(body, /docs, code/);
  assert.match(body, /listo/i);
  assert.doesNotMatch(body, /MCP/);
});

test('continuation clipboard without ready steps stays generic', () => {
  const body = continuationClipboardBody(identity, {
    id: 'run-2',
    steps: [{ id: 'h', kind: 'manual', status: 'waiting' }],
  });
  assert.match(body, /run-2/);
  assert.match(body, /pasos habilitados/);
  assert.doesNotMatch(body, /Ejecuta YA/);
});
