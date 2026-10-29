import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREVIEW_TILE_BREAKPOINT,
  placePreviewTiles,
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

test('default tile layout is a single standard frame; still a satellite', () => {
  assert.equal(previewTileLayout.width, 480);
  assert.equal(previewTileLayout.bodyHeight, 300);
  assert.equal(previewTileLayout.maxVisible, 5);
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

test('four automatic previews use deterministic non-overlapping lanes', () => {
  const placements = placePreviewTiles(
    ['html', 'note', 'csv', 'image'].map((id) => ({
      id,
      position: { x: 420, y: 80 },
      width: previewTileLayout.width,
      height: previewTileLayout.height,
    })),
  );
  const values = Object.values(placements);
  assert.equal(values.length, 4);
  assert.deepEqual(placements.csv, { x: 420, y: 80 });
  for (let index = 1; index < values.length; index++)
    assert.ok(
      values[index]!.y >=
        values[index - 1]!.y + previewTileLayout.height + previewTileLayout.gap,
    );
});

test('stored or live bubble positions are fixed obstacles, not rewritten', () => {
  const placements = placePreviewTiles([
    {
      id: 'manual',
      position: { x: 420, y: 80 },
      width: previewTileLayout.width,
      height: previewTileLayout.height,
      fixed: true,
    },
    {
      id: 'automatic',
      position: { x: 420, y: 80 },
      width: previewTileLayout.width,
      height: previewTileLayout.height,
    },
  ]);
  assert.deepEqual(placements.manual, { x: 420, y: 80 });
  assert.ok(
    placements.automatic!.y >=
      80 + previewTileLayout.height + previewTileLayout.gap,
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
  assert.equal(selected[0]!.downloadOnly, false);
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

test('Office artifacts are compact download bubbles, not preview panels', () => {
  const selected = selectCanvasPreviewCandidates(
    [
      step({
        id: 'files',
        title: 'Archivos',
        kind: 'agent',
        status: 'completed',
        artifacts: [
          artifact({
            id: 'page',
            name: 'page.html',
            mediaType: 'text/html',
          }),
          artifact({
            id: 'deck',
            name: 'deck.pptx',
            mediaType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          }),
        ],
      }),
    ],
    { maxVisible: 5 },
  );
  assert.equal(selected.length, 2);
  assert.deepEqual(
    selected.map((item) => [item.artifact.id, item.downloadOnly]),
    [
      ['page', false],
      ['deck', true],
    ],
  );
});
