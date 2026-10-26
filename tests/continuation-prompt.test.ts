import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  continuationClipboardBody,
  formatReadyAgentStepLabel,
  readyAgentStepIds,
  readyAgentSteps,
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

test('ready agent labels use title (id)', () => {
  assert.equal(
    formatReadyAgentStepLabel({
      id: 'docs',
      title: 'Revisar documentación',
      kind: 'agent',
      status: 'ready',
    }),
    'Revisar documentación (docs)',
  );
  assert.equal(
    formatReadyAgentStepLabel({
      id: 'code',
      kind: 'agent',
      status: 'ready',
    }),
    'code (code)',
  );
});

test('continuation clipboard lists each ready agent as title (id)', () => {
  const body = continuationClipboardBody(identity, {
    id: 'run-1',
    steps: [
      {
        id: 'docs',
        title: 'Revisar documentación',
        kind: 'agent',
        status: 'ready',
      },
      { id: 'code', title: 'Revisar código', kind: 'agent', status: 'ready' },
      { id: 'skip', title: 'Omitido', kind: 'agent', status: 'pending' },
      { id: 'gate', title: 'Aprobar', kind: 'approval', status: 'ready' },
    ],
  });
  assert.match(body, /run-1/);
  assert.match(body, /Revisar documentación \(docs\), Revisar código \(code\)/);
  assert.doesNotMatch(body, /Aprobar \(gate\)/);
  assert.doesNotMatch(body, /listos: docs, code/);
  assert.match(body, /listo/i);
  assert.doesNotMatch(body, /MCP/);
  assert.equal(
    readyAgentSteps({
      steps: [{ id: 'g', kind: 'approval', status: 'ready' }],
    }).length,
    0,
  );
});

test('continuation clipboard without ready agent steps stays generic', () => {
  const body = continuationClipboardBody(identity, {
    id: 'run-2',
    steps: [
      { id: 'h', kind: 'manual', status: 'waiting' },
      { id: 'g', title: 'Gate', kind: 'approval', status: 'ready' },
    ],
  });
  assert.match(body, /run-2/);
  assert.match(body, /pasos habilitados/);
  assert.doesNotMatch(body, /Ejecuta YA/);
  assert.doesNotMatch(body, /Gate \(g\)/);
});

test('App wake CTA counts ready agent steps only', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(
    source,
    /steps\.filter\(\(s\) => s\.kind === 'agent' && s\.status === 'ready'\)/,
  );
  assert.match(source, /readyAgentCount: ready/);
  assert.match(source, /agentWaiting: !!run\.agentWaiting/);
});
