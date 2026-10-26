import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  pickPreferredArtifact,
  resolveStepEvidence,
} from '../src/client/resultado-evidence.js';
import type { Artifact } from '../src/domain/artifacts.js';
import type { RunEvent, Step } from '../src/domain/workflow.js';

const baseStep = (partial: Partial<Step> & Pick<Step, 'id' | 'title'>): Step =>
  ({
    kind: 'agent',
    status: 'completed',
    dependencies: [],
    attempt: 1,
    ...partial,
  }) as Step;

test('prefers sandboxed HTML on the current attempt over older images', () => {
  const artifacts: Artifact[] = [
    {
      id: 'img',
      name: 'shot.png',
      mediaType: 'image/png',
      createdAt: '2026-10-26T12:00:00.000Z',
      attempt: 1,
      size: 1200,
    },
    {
      id: 'html',
      name: 'guia.html',
      mediaType: 'text/html',
      createdAt: '2026-10-26T11:00:00.000Z',
      attempt: 1,
      size: 800,
    },
    {
      id: 'old',
      name: 'old.html',
      mediaType: 'text/html',
      createdAt: '2026-10-26T13:00:00.000Z',
      attempt: 0,
      size: 400,
    },
  ];
  assert.equal(pickPreferredArtifact(artifacts, 1)?.id, 'html');
});

test('evidence order is artifact → outputs → log → empty', () => {
  const html: Artifact = {
    id: 'a1',
    name: 'out.html',
    mediaType: 'text/html',
    createdAt: '2026-10-26T12:00:00.000Z',
    attempt: 1,
    size: 100,
  };
  const withArtifact = resolveStepEvidence(
    baseStep({
      id: 'write',
      title: 'Write',
      artifacts: [html],
      outputValues: { text: 'ignored when artifact exists' },
      result: 'ignored',
    }),
    [],
  );
  assert.equal(withArtifact.kind, 'artifact');
  assert.equal(withArtifact.artifact?.id, 'a1');
  assert.equal(withArtifact.extraArtifactCount, 0);

  const withOutputs = resolveStepEvidence(
    baseStep({
      id: 'write',
      title: 'Write',
      outputValues: { guide: 'hola' },
      result: 'ignored when outputs exist',
    }),
    [],
  );
  assert.equal(withOutputs.kind, 'outputs');
  assert.deepEqual(withOutputs.outputs, { guide: 'hola' });

  const events: RunEvent[] = [
    {
      sequence: 1,
      type: 'log',
      at: '2026-10-26T12:00:00.000Z',
      actor: 'agent',
      stepId: 'write',
      message: 'Borrador listo',
    },
  ];
  const withLog = resolveStepEvidence(
    baseStep({ id: 'write', title: 'Write', result: 'Resumen del paso' }),
    events,
  );
  assert.equal(withLog.kind, 'log');
  assert.equal(withLog.logSummary, 'Resumen del paso');

  const fromEvent = resolveStepEvidence(
    baseStep({ id: 'write', title: 'Write' }),
    events,
  );
  assert.equal(fromEvent.kind, 'log');
  assert.equal(fromEvent.logSummary, 'Borrador listo');

  const empty = resolveStepEvidence(
    baseStep({ id: 'write', title: 'Write' }),
    [],
  );
  assert.equal(empty.kind, 'empty');
});

test('Resultado stage is docked from step select, not a step modal', async () => {
  const source = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../src/client/App.tsx', import.meta.url), 'utf8'),
  );
  assert.match(source, /ResultadoStage/);
  assert.match(source, /setResultadoOpen\(true\)/);
  assert.match(source, /onPaneClick=\{\(\) => clearResultado\(\)\}/);
  assert.doesNotMatch(source, /setPopup\(view\)/);
});
