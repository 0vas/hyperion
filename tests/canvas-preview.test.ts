import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREVIEW_TILE_BREAKPOINT,
  placePreviewTiles,
  previewBubbleLayout,
  previewBubblePositions,
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

test('compact bubble footprint stays accessible and includes its own clearance', () => {
  assert.equal(previewBubbleLayout.width, previewBubbleLayout.height);
  assert.ok(previewBubbleLayout.width >= 44);
  assert.equal(previewBubbleLayout.gap, 16);
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

test('consecutive horizontal producers keep their automatic HTML previews clear', () => {
  const placements = placePreviewTiles([
    {
      id: 'node:write',
      position: { x: 0, y: 0 },
      width: 220,
      height: 140,
      fixed: true,
    },
    {
      id: 'node:review',
      position: { x: 300, y: 0 },
      width: 220,
      height: 140,
      fixed: true,
    },
    {
      id: 'preview:write',
      position: { x: 248, y: 0 },
      width: previewTileLayout.width,
      height: previewTileLayout.height,
    },
    {
      id: 'preview:review',
      position: { x: 548, y: 0 },
      width: previewTileLayout.width,
      height: previewTileLayout.height,
    },
  ]);
  assert.deepEqual(placements['node:review'], { x: 300, y: 0 });
  assert.ok(
    placements['preview:write']!.y >= 140 + previewTileLayout.gap,
    'the first preview moves below the next producer instead of covering it',
  );
  assert.ok(
    placements['preview:review']!.y >=
      placements['preview:write']!.y +
        previewTileLayout.height +
        previewTileLayout.gap,
    'the second preview remains clear of the first preview tethered to its producer',
  );
});

test('compact bubbles use upper-right producer chrome for nearby horizontal producers', () => {
  const write = { x: 0, y: 0 };
  const review = { x: 300, y: 0 };
  const producerSize = { width: 220, height: 140 };
  const writeSlots = previewBubblePositions(write, producerSize);
  const reviewSlots = previewBubblePositions(review, producerSize);
  const placements = placePreviewTiles([
    {
      id: 'node:write',
      position: write,
      ...producerSize,
      fixed: true,
    },
    {
      id: 'node:review',
      position: review,
      ...producerSize,
      fixed: true,
    },
    {
      id: 'preview:write',
      position: writeSlots[0]!,
      localPositions: writeSlots.slice(1),
      clearance: previewBubbleLayout.gap,
      ...previewBubbleLayout,
    },
    {
      id: 'preview:review',
      position: reviewSlots[0]!,
      localPositions: reviewSlots.slice(1),
      clearance: previewBubbleLayout.gap,
      ...previewBubbleLayout,
    },
  ]);
  assert.deepEqual(
    placements['preview:write'],
    writeSlots[0],
    'the first placement uses its producer upper-right chrome',
  );
  assert.deepEqual(
    placements['preview:review'],
    reviewSlots[0],
    'the next producer also keeps the upper-right placement',
  );
  for (const previewId of ['preview:write', 'preview:review']) {
    const preview = placements[previewId]!;
    const producer = previewId.endsWith('write') ? write : review;
    assert.ok(
      Math.hypot(preview.x - producer.x, preview.y - producer.y) < 280,
      'each compact bubble remains local to its producer',
    );
  }
});

test('a blocked upper-right bubble falls back locally without covering another node', () => {
  const producer = { x: 0, y: 0 };
  const producerSize = { width: 220, height: 140 };
  const slots = previewBubblePositions(producer, producerSize);
  const placements = placePreviewTiles([
    {
      id: 'node:producer',
      position: producer,
      ...producerSize,
      fixed: true,
    },
    {
      id: 'node:neighbor',
      position: { x: 180, y: -90 },
      width: 220,
      height: 140,
      fixed: true,
    },
    {
      id: 'preview:producer',
      position: slots[0]!,
      localPositions: slots.slice(1),
      clearance: previewBubbleLayout.gap,
      ...previewBubbleLayout,
    },
  ]);
  assert.deepEqual(
    placements['preview:producer'],
    slots[2],
    'the blocked corner and side slots fall to the lower local slot',
  );
});

test('compact fallback remains clear and never rewrites a manual obstacle', () => {
  const producer = { x: 0, y: 0 };
  const producerSize = { width: 220, height: 140 };
  const slots = previewBubblePositions(producer, producerSize);
  const placements = placePreviewTiles([
    {
      id: 'node:producer',
      position: producer,
      ...producerSize,
      fixed: true,
    },
    ...slots.map((position, index) => ({
      id: `manual:${index}`,
      position,
      ...previewBubbleLayout,
      clearance: previewBubbleLayout.gap,
      fixed: true,
    })),
    {
      id: 'preview:auto',
      position: slots[0]!,
      localPositions: slots.slice(1),
      clearance: previewBubbleLayout.gap,
      ...previewBubbleLayout,
    },
  ]);
  assert.deepEqual(placements['manual:0'], slots[0]);
  assert.notDeepEqual(
    placements['preview:auto'],
    slots[0],
    'when the local ring is occupied, the normal safe fallback applies',
  );
  for (const index of slots.keys())
    assert.notDeepEqual(placements['preview:auto'], slots[index]);
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
