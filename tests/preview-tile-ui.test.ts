import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clearPreviewTileUiForRun,
  collapsePreviewTile,
  expandPreviewTile,
  parsePreviewTileUiState,
  previewTileCompactLayout,
  previewTileMountsIframe,
  previewTileUiDefaults,
  previewTileUiStorageKey,
  readPreviewTileUiState,
  togglePreviewTileSize,
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

test('preview tile UI defaults are expanded and not collapsed', () => {
  assert.deepEqual(previewTileUiDefaults, {
    size: 'expanded',
    collapsed: false,
  });
  assert.equal(previewTileMountsIframe(previewTileUiDefaults), true);
  assert.equal(
    previewTileMountsIframe(collapsePreviewTile(previewTileUiDefaults)),
    false,
  );
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
  assert.doesNotMatch(
    previewTileUiStorageKey('run-a', 'write'),
    /snapshot|workflow|sqlite/i,
  );
});

test('read/write round-trip and clear by run', () => {
  const storage = memoryStorage();
  writePreviewTileUiState(
    'run-a',
    'write',
    { size: 'compact', collapsed: true },
    storage,
  );
  assert.deepEqual(readPreviewTileUiState('run-a', 'write', storage), {
    size: 'compact',
    collapsed: true,
  });
  writePreviewTileUiState(
    'run-a',
    'other',
    { size: 'compact', collapsed: false },
    storage,
  );
  writePreviewTileUiState(
    'run-b',
    'write',
    { size: 'compact', collapsed: false },
    storage,
  );
  clearPreviewTileUiForRun('run-a', storage);
  assert.deepEqual(
    readPreviewTileUiState('run-a', 'write', storage),
    previewTileUiDefaults,
  );
  assert.deepEqual(readPreviewTileUiState('run-b', 'write', storage), {
    size: 'compact',
    collapsed: false,
  });
});

test('size toggle and collapse/expand helpers', () => {
  assert.deepEqual(togglePreviewTileSize(previewTileUiDefaults), {
    size: 'compact',
    collapsed: false,
  });
  assert.deepEqual(
    togglePreviewTileSize({ size: 'compact', collapsed: false }),
    previewTileUiDefaults,
  );
  assert.deepEqual(
    expandPreviewTile(collapsePreviewTile(previewTileUiDefaults)),
    previewTileUiDefaults,
  );
  assert.deepEqual(parsePreviewTileUiState({ size: 'nope', collapsed: 1 }), {
    size: 'expanded',
    collapsed: false,
  });
});

test('PreviewNode exposes chrome drag handle and never bare role claims', () => {
  const source = readFileSync(resolve('src/client/PreviewNode.tsx'), 'utf8');
  assert.match(source, /preview-tile-drag/);
  assert.match(source, /Arrastrar vista previa/);
  assert.match(source, /Compactar|Ampliar/);
  assert.match(source, /Ocultar vista|Mostrar vista/);
  assert.match(source, /previewTileMountsIframe|collapsed/);
  assert.doesNotMatch(source, /Office|pen\.dev complete|W2/);
});

test('App enables preview dragHandle without domain snapshot writes', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /type:\s*'preview'/);
  assert.match(source, /dragHandle:\s*['"]\.preview-tile-drag['"]/);
  assert.match(source, /draggable:\s*true/);
  assert.match(source, /clearPreviewTileUiForRun/);
  assert.doesNotMatch(source, /previewTile.*snapshot|artifacts\.push.*x:/);
});
