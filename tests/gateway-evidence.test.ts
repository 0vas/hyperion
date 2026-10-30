import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  gatewayEvidenceForStep,
  gatewayRouteDisplayTitle,
} from '../src/client/gateway-evidence.js';
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
      value: true,
    },
  ]);
});

test('gateway evidence never promotes an output key or unsafe value into its summary', () => {
  const source = step({
    id: 'source',
    title: 'Formulario humano',
    outputValues: { internal_machine_key: { token: 'not-for-summary' } },
  });
  const gate = step({
    id: 'choice',
    title: 'Elegir ruta',
    kind: 'gateway',
    selectedBranches: ['next'],
    gateway: {
      type: 'exclusive',
      direction: 'split',
      defaultTarget: 'next',
      routes: [
        {
          target: 'next',
          when: {
            stepId: 'source',
            output: 'internal_machine_key',
            equals: true,
          },
        },
      ],
    },
  });
  const next = step({ id: 'next', title: 'Continuar' });

  const evidence = gatewayEvidenceForStep(gate, [source, gate, next]);

  assert.ok(evidence);
  assert.deepEqual(evidence.observedValues, [
    { stepTitle: 'Formulario humano' },
  ]);
  assert.doesNotMatch(JSON.stringify(evidence), /internal_machine_key|token/);
});

test('gateway evidence leaves a missing route destination unnamed for localized UI fallback', () => {
  const gate = step({
    id: 'choice',
    title: 'Elegir ruta',
    kind: 'gateway',
    selectedBranches: ['missing-target'],
    gateway: {
      type: 'exclusive',
      direction: 'split',
      defaultTarget: 'missing-target',
      routes: [{ target: 'missing-target' }],
    },
  });

  const evidence = gatewayEvidenceForStep(gate, [gate]);

  assert.ok(evidence);
  assert.deepEqual(evidence.activeRoutes, [
    { id: 'missing-target', title: undefined },
  ]);
  assert.equal(
    gatewayRouteDisplayTitle(
      evidence.activeRoutes[0]!,
      translate('en', 'Destino no disponible'),
    ),
    'Destination unavailable',
  );
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

test('an empty join does not claim a recorded route decision', () => {
  const join = step({
    id: 'join',
    title: 'Unir resultados',
    kind: 'gateway',
    gateway: { type: 'inclusive', direction: 'join', splitId: 'split' },
  });

  const evidence = gatewayEvidenceForStep(join, [join]);

  assert.ok(evidence);
  assert.equal(evidence.decisionKnown, false);
  assert.deepEqual(evidence.activeRoutes, []);
  assert.deepEqual(evidence.inactiveRoutes, []);
});

test('gateway labels retain their Spanish source and English translation', () => {
  assert.equal(translate('es', 'Rutas activadas'), 'Rutas activadas');
  assert.equal(translate('en', 'Rutas activadas'), 'Activated routes');
  assert.equal(translate('en', 'Rutas no tomadas'), 'Routes not taken');
  assert.equal(translate('en', 'Decisión registrada'), 'Decision recorded');
  assert.equal(
    translate('en', 'Destino no disponible'),
    'Destination unavailable',
  );
  assert.equal(
    translate('en', 'Sin decisión de ruta registrada'),
    'No route decision has been recorded',
  );
});
