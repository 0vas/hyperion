import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREVIEW_TILE_BREAKPOINT,
  previewNodeId,
  previewTileLayout,
  previewTilePosition,
  selectCanvasPreviewCandidates,
} from '../src/client/canvas-preview.js';
import { previewTileBreakpoint } from '../src/client/viewport.js';
import type { Artifact } from '../src/domain/artifacts.js';
import type { Step } from '../src/domain/workflow.js';

const artifact = (
  partial: Partial<Artifact> & Pick<Artifact, 'id' | 'name' | 'mediaType'>,
): Artifact => ({
  attempt: 1,
  size: 120,
  createdAt: '2026-10-26T12:00:00.000Z',
  ...partial,
});

const step = (
  partial: Partial<Step> & Pick<Step, 'id' | 'title' | 'kind' | 'status'>,
): Step =>
  ({
    dependencies: [],
    attempt: 1,
    artifacts: [],
    ...partial,
  }) as Step;

test('tile breakpoint stays aligned with viewport export at 900', () => {
  assert.equal(PREVIEW_TILE_BREAKPOINT, 900);
  assert.equal(previewTileBreakpoint, 900);
});

test('P1 tile layout sits in the sealed stage band, still a satellite', () => {
  assert.equal(previewTileLayout.width, 480);
  assert.equal(previewTileLayout.bodyHeight, 320);
  assert.ok(previewTileLayout.width >= 420 && previewTileLayout.width <= 520);
  assert.ok(
    previewTileLayout.bodyHeight >= 280 && previewTileLayout.bodyHeight <= 360,
  );
});

test('preview node ids are client-only satellites of the producer', () => {
  assert.equal(previewNodeId('write'), 'preview:write');
});

test('satellite position sits to the right of the producer box', () => {
  assert.deepEqual(
    previewTilePosition({ x: 100, y: 40 }, { width: 280, height: 160 }, false),
    { x: 100 + 280 + previewTileLayout.gap, y: 40 },
  );
});

test('selectCanvasPreviewCandidates prefers leaf producers with previewable artifacts', () => {
  const html = artifact({
    id: 'a1',
    name: 'guia.html',
    mediaType: 'text/html',
    createdAt: '2026-10-26T12:01:00.000Z',
  });
  const remote = artifact({
    id: 'a2',
    name: 'doc',
    mediaType: 'text/html',
    url: 'https://example.com/doc',
    createdAt: '2026-10-26T12:02:00.000Z',
  });
  const steps = [
    step({
      id: 'begin',
      title: 'Inicio',
      kind: 'start',
      status: 'completed',
    }),
    step({
      id: 'write',
      title: 'Preparar guía',
      kind: 'agent',
      status: 'completed',
      artifacts: [html],
    }),
    step({
      id: 'link',
      title: 'Compartir',
      kind: 'agent',
      status: 'ready',
      artifacts: [remote],
    }),
    step({
      id: 'pack',
      title: 'Paquete',
      kind: 'agent',
      status: 'waiting',
      artifacts: [
        artifact({
          id: 'a3',
          name: 'bin.bin',
          mediaType: 'application/octet-stream',
          size: 40,
        }),
      ],
    }),
  ];
  const selected = selectCanvasPreviewCandidates(steps, {
    selectedStepId: 'write',
    maxVisible: 5,
  });
  assert.equal(selected.length, 2);
  assert.equal(selected[0]!.producerStepId, 'write');
  assert.equal(selected[0]!.artifact.id, 'a1');
  assert.equal(selected[0]!.remoteOnly, false);
  assert.equal(selected[1]!.producerStepId, 'link');
  assert.equal(selected[1]!.remoteOnly, true);
});

test('soft cap prefers selected then attention over older completed', () => {
  const steps = [
    step({
      id: 'old',
      title: 'Viejo',
      kind: 'agent',
      status: 'completed',
      artifacts: [
        artifact({
          id: 'o',
          name: 'old.html',
          mediaType: 'text/html',
          createdAt: '2026-10-26T10:00:00.000Z',
        }),
      ],
    }),
    step({
      id: 'wait',
      title: 'Espera',
      kind: 'manual',
      status: 'waiting',
      artifacts: [
        artifact({
          id: 'w',
          name: 'note.txt',
          mediaType: 'text/plain',
          createdAt: '2026-10-26T11:00:00.000Z',
        }),
      ],
    }),
    step({
      id: 'pick',
      title: 'Elegido',
      kind: 'agent',
      status: 'completed',
      artifacts: [
        artifact({
          id: 'p',
          name: 'pick.html',
          mediaType: 'text/html',
          createdAt: '2026-10-26T09:00:00.000Z',
        }),
      ],
    }),
  ];
  const capped = selectCanvasPreviewCandidates(steps, {
    selectedStepId: 'pick',
    maxVisible: 2,
  });
  assert.deepEqual(
    capped.map((c) => c.producerStepId),
    ['pick', 'wait'],
  );
});
