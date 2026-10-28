import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clearPreviewTileUiForRun,
  collapsePreviewTile,
  expandPreviewTile,
  parsePreviewTileGlobalState,
  parsePreviewTileUiState,
  previewTileCompactLayout,
  previewTileGlobalDefaults,
  previewTileGlobalStorageKey,
  previewTileMountsIframe,
  previewTileStoredPosition,
  previewTileUiDefaults,
  previewTileUiStorageKey,
  readPreviewTileGlobalState,
  readPreviewTileUiState,
  resolvePreviewTilePosition,
  togglePreviewTileSize,
  writePreviewTileGlobalState,
  writePreviewTileUiState,
} from '../src/client/preview-tile-ui.js';

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

test('preview tile UI defaults are mini/compact and not collapsed', () => {
  assert.deepEqual(previewTileUiDefaults, {
    size: 'compact',
    collapsed: false,
  });
  assert.equal(previewTileMountsIframe(previewTileUiDefaults), true);
  assert.equal(
    previewTileMountsIframe(collapsePreviewTile(previewTileUiDefaults)),
    false,
  );
});

test('absent storage migrates to compact mini; stored expanded is preserved', () => {
  const storage = memoryStorage();
  assert.deepEqual(
    readPreviewTileUiState('run-a', 'write', storage),
    previewTileUiDefaults,
  );
  writePreviewTileUiState(
    'run-a',
    'write',
    { size: 'expanded', collapsed: false },
    storage,
  );
  assert.deepEqual(readPreviewTileUiState('run-a', 'write', storage), {
    size: 'expanded',
    collapsed: false,
  });
});

test('compact layout sits in Architect stamp band with scale A', () => {
  assert.equal(previewTileCompactLayout.width, 280);
  assert.equal(previewTileCompactLayout.bodyHeight, 180);
  assert.ok(previewTileCompactLayout.scale >= 0.75);
  assert.ok(previewTileCompactLayout.scale <= 0.85);
});

test('storage key is UI-only and scoped by run + producer', () => {
  assert.equal(
    previewTileUiStorageKey('run-a', 'write'),
    'hyperion.previewTile.v1:run-a:write',
  );
  assert.equal(
    previewTileGlobalStorageKey('run-a'),
    'hyperion.previewTileGlobal.v1:run-a',
  );
  assert.doesNotMatch(
    previewTileUiStorageKey('run-a', 'write'),
    /snapshot|workflow|sqlite/i,
  );
});

test('global hide-all round-trip and clears with layout reset', () => {
  const storage = memoryStorage();
  assert.deepEqual(
    readPreviewTileGlobalState('run-a', storage),
    previewTileGlobalDefaults,
  );
  writePreviewTileGlobalState('run-a', { hideAll: true }, storage);
  assert.deepEqual(readPreviewTileGlobalState('run-a', storage), {
    hideAll: true,
  });
  writePreviewTileUiState(
    'run-a',
    'write',
    { size: 'expanded', collapsed: false },
    storage,
  );
  clearPreviewTileUiForRun('run-a', storage);
  assert.deepEqual(
    readPreviewTileGlobalState('run-a', storage),
    previewTileGlobalDefaults,
  );
  assert.deepEqual(
    readPreviewTileUiState('run-a', 'write', storage),
    previewTileUiDefaults,
  );
  assert.deepEqual(parsePreviewTileGlobalState({ hideAll: 'yes' }), {
    hideAll: false,
  });
});

test('read/write round-trip and clear by run', () => {
  const storage = memoryStorage();
  writePreviewTileUiState(
    'run-a',
    'write',
    { size: 'expanded', collapsed: true, x: 40, y: 80 },
    storage,
  );
  assert.deepEqual(readPreviewTileUiState('run-a', 'write', storage), {
    size: 'expanded',
    collapsed: true,
    x: 40,
    y: 80,
  });
  writePreviewTileUiState(
    'run-a',
    'other',
    { size: 'expanded', collapsed: false },
    storage,
  );
  writePreviewTileUiState(
    'run-b',
    'write',
    { size: 'expanded', collapsed: false },
    storage,
  );
  clearPreviewTileUiForRun('run-a', storage);
  assert.deepEqual(
    readPreviewTileUiState('run-a', 'write', storage),
    previewTileUiDefaults,
  );
  assert.deepEqual(readPreviewTileUiState('run-b', 'write', storage), {
    size: 'expanded',
    collapsed: false,
  });
});

test('E1: dragged position survives compact/collapse and is not wiped as default', () => {
  const storage = memoryStorage();
  writePreviewTileUiState(
    'run-a',
    'write',
    { size: 'expanded', collapsed: false, x: 120, y: 240 },
    storage,
  );
  const dragged = readPreviewTileUiState('run-a', 'write', storage);
  assert.deepEqual(previewTileStoredPosition(dragged), { x: 120, y: 240 });
  writePreviewTileUiState(
    'run-a',
    'write',
    { ...dragged, size: 'compact' },
    storage,
  );
  writePreviewTileUiState(
    'run-a',
    'write',
    {
      ...readPreviewTileUiState('run-a', 'write', storage),
      collapsed: true,
    },
    storage,
  );
  const after = readPreviewTileUiState('run-a', 'write', storage);
  assert.equal(after.size, 'compact');
  assert.equal(after.collapsed, true);
  assert.deepEqual(previewTileStoredPosition(after), { x: 120, y: 240 });
  assert.deepEqual(
    resolvePreviewTilePosition(after, undefined, { x: 999, y: 999 }),
    { x: 120, y: 240 },
  );
  assert.deepEqual(
    resolvePreviewTilePosition(after, { x: 1, y: 2 }, { x: 999, y: 999 }),
    { x: 1, y: 2 },
  );
});

test('size toggle and collapse/expand helpers', () => {
  assert.deepEqual(togglePreviewTileSize(previewTileUiDefaults), {
    size: 'expanded',
    collapsed: false,
  });
  assert.deepEqual(
    togglePreviewTileSize({ size: 'expanded', collapsed: false }),
    previewTileUiDefaults,
  );
  assert.deepEqual(
    expandPreviewTile(collapsePreviewTile(previewTileUiDefaults)),
    previewTileUiDefaults,
  );
  assert.deepEqual(parsePreviewTileUiState({ size: 'nope', collapsed: 1 }), {
    size: 'compact',
    collapsed: false,
  });
  assert.deepEqual(parsePreviewTileUiState({ size: 'expanded' }), {
    size: 'expanded',
    collapsed: false,
  });
});

test('PreviewNode exposes icon-only chrome and never bare role claims', () => {
  const source = readFileSync(resolve('src/client/PreviewNode.tsx'), 'utf8');
  assert.match(source, /preview-tile-drag/);
  assert.match(source, /Arrastrar vista previa/);
  assert.match(source, /Minimize2|Maximize2/);
  assert.match(source, /EyeOff|Eye/);
  assert.match(source, /ExternalLink/);
  assert.match(source, /icon-button/);
  assert.match(source, /Ampliar vista|Vista mini|Abrir en web/);
  assert.match(source, /previewTileMountsIframe|collapsed/);
  assert.doesNotMatch(source, />\{t\(['"]Compactar['"]\)\}/);
  assert.doesNotMatch(source, />\{t\(['"]Ampliar['"]\)\}/);
  assert.doesNotMatch(source, />\{hideLabel\}|>\{sizeLabel\}/);
  assert.doesNotMatch(source, />\{t\(['"]Abrir enlace['"]\)\}/);
  assert.doesNotMatch(source, /Office|pen\.dev complete|W2|free-resize/);
});

test('App enables preview dragHandle, global hide-all, and persists outside domain', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /type:\s*'preview'/);
  assert.match(source, /dragHandle:\s*['"]\.preview-tile-drag['"]/);
  assert.match(source, /draggable:\s*true/);
  assert.match(source, /resolvePreviewTilePosition/);
  assert.match(source, /onNodeDragStop/);
  assert.match(source, /clearPreviewTileUiForRun/);
  assert.match(
    source,
    /readPreviewTileGlobalState|writePreviewTileGlobalState/,
  );
  assert.match(
    source,
    /Ocultar todas las vistas previas|Mostrar vistas previas/,
  );
  assert.match(source, /canvas-tools/);
  assert.match(source, /node\.type === 'preview'/);
  assert.doesNotMatch(source, /previewTile.*snapshot|artifacts\.push.*x:/);
});
