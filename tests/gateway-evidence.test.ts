import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gatewayEvidenceForStep } from '../src/client/gateway-evidence.js';
import type { Step } from '../src/domain/workflow.js';
import { translate } from '../src/i18n/core.js';

const step = (partial: Partial<Step> & Pick<Step, 'id' | 'title'>): Step =>
  ({
    kind: 'agent',
    status: 'completed',
    dependencies: [],
    attempt: 1,
    ...partial,
  }) as Step;

test('gateway evidence maps an executed split to human route titles and observed input', () => {
  const scope = step({
    id: 'scope',
    title: 'Definir el alcance',
    outputValues: { docs: true },
  });
  const gate = step({
    id: 'choice',
    title: 'Elegir ruta',
    kind: 'gateway',
    selectedBranches: ['docs'],
    gateway: {
      type: 'exclusive',
      direction: 'split',
      defaultTarget: 'skipDocs',
      routes: [
        {
          target: 'docs',
          when: { stepId: 'scope', output: 'docs', equals: true },
        },
        { target: 'skipDocs' },
      ],
    },
  });
  const docs = step({ id: 'docs', title: 'Revisar documentación' });
  const skipped = step({
    id: 'skipDocs',
    title: 'Omitir documentación',
    status: 'skipped',
  });

  const evidence = gatewayEvidenceForStep(gate, [scope, gate, docs, skipped]);

  assert.ok(evidence);
  assert.equal(evidence.direction, 'split');
  assert.equal(evidence.decisionKnown, true);
  assert.deepEqual(
    evidence.activeRoutes.map((route) => route.title),
    ['Revisar documentación'],
  );
  assert.deepEqual(
    evidence.inactiveRoutes.map((route) => route.title),
    ['Omitir documentación'],
  );
  assert.deepEqual(evidence.observedValues, [
    {
      stepTitle: 'Definir el alcance',
      output: 'docs',
      value: true,
    },
  ]);
});

test('gateway evidence keeps a join honest about completed and skipped incoming routes', () => {
  const left = step({ id: 'left', title: 'Generar web' });
  const right = step({
    id: 'right',
    title: 'Generar notas',
    status: 'skipped',
  });
  const join = step({
    id: 'join',
    title: 'Unir resultados',
    kind: 'gateway',
    dependencies: ['left', 'right'],
    gateway: { type: 'inclusive', direction: 'join', splitId: 'split' },
  });

  const evidence = gatewayEvidenceForStep(join, [left, right, join]);

  assert.ok(evidence);
  assert.equal(evidence.direction, 'join');
  assert.deepEqual(
    evidence.activeRoutes.map((route) => route.title),
    ['Generar web'],
  );
  assert.deepEqual(
    evidence.inactiveRoutes.map((route) => route.title),
    ['Generar notas'],
  );
  assert.deepEqual(evidence.observedValues, []);
});

test('gateway labels retain their Spanish source and English translation', () => {
  assert.equal(translate('es', 'Rutas activadas'), 'Rutas activadas');
  assert.equal(translate('en', 'Rutas activadas'), 'Activated routes');
  assert.equal(translate('en', 'Rutas no tomadas'), 'Routes not taken');
  assert.equal(translate('en', 'Decisión registrada'), 'Decision recorded');
});
