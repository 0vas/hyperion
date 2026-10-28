import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clearPreviewTileUiForRun,
  collapsePreviewTile,
  expandPreviewTile,
  parsePreviewTileGlobalState,
  parsePreviewTileSize,
  parsePreviewTileUiState,
  previewTileCompactLayout,
  previewTileContainScale,
  previewTileContentViewport,
  previewTileDefaultFrame,
  previewTileGlobalDefaults,
  previewTileGlobalStorageKey,
  previewTileMediumLayout,
  previewTileMiniContainScale,
  previewTileMobileFrame,
  previewTileMountsIframe,
  previewTileStageLayout,
  previewTileStoredPosition,
  previewTileUiDefaults,
  previewTileUiStorageKey,
  readPreviewTileGlobalState,
  readPreviewTileUiState,
  resizePreviewTileFrame,
  resolvePreviewTileFrame,
  resolvePreviewTilePosition,
  writePreviewTileGlobalState,
  writePreviewTileUiState,
} from '../src/client/preview-tile-ui.js';
import {
  officeKindForArtifact,
  parseDelimitedPreview,
  previewAestheticKind,
} from '../src/client/preview-type-aesthetics.js';
import {
  injectOpenBrowserCsp,
  PREVIEW_OPEN_BROWSER_CSP,
} from '../src/client/preview-open-browser.js';

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

test('preview tile UI defaults are mobile and not collapsed', () => {
  assert.deepEqual(previewTileUiDefaults, {
    size: 'mobile',
    collapsed: false,
  });
  assert.equal(previewTileMountsIframe(previewTileUiDefaults), true);
  assert.equal(
    previewTileMountsIframe(collapsePreviewTile(previewTileUiDefaults)),
    false,
  );
});

test('v3 migrates mini/medium/stage and legacy compact/expanded', () => {
  assert.equal(parsePreviewTileSize('compact'), 'mobile');
  assert.equal(parsePreviewTileSize('mini'), 'mobile');
  assert.equal(parsePreviewTileSize('expanded'), 'tablet');
  assert.equal(parsePreviewTileSize('medium'), 'tablet');
  assert.equal(parsePreviewTileSize('stage'), 'desktop');
  assert.equal(parsePreviewTileSize('nope'), 'mobile');
  const storage = memoryStorage({
    'hyperion.previewTile.v1:run-a:write': JSON.stringify({
      size: 'expanded',
      collapsed: false,
      x: 10,
      y: 20,
    }),
  });
  assert.deepEqual(readPreviewTileUiState('run-a', 'write', storage), {
    size: 'tablet',
    collapsed: false,
    x: 10,
    y: 20,
  });
  assert.equal(
    storage.getItem('hyperion.previewTile.v3:run-a:write') !== null,
    true,
  );
  assert.equal(storage.getItem('hyperion.previewTile.v1:run-a:write'), null);
  assert.deepEqual(
    readPreviewTileUiState('run-b', 'write', memoryStorage()),
    previewTileUiDefaults,
  );
});

test('v2 storage migrates to v3 device presets', () => {
  const storage = memoryStorage({
    'hyperion.previewTile.v2:run-a:write': JSON.stringify({
      size: 'mini',
      collapsed: false,
      x: 5,
      y: 6,
    }),
  });
  assert.deepEqual(readPreviewTileUiState('run-a', 'write', storage), {
    size: 'mobile',
    collapsed: false,
    x: 5,
    y: 6,
  });
  assert.equal(storage.getItem('hyperion.previewTile.v2:run-a:write'), null);
});

test('device content viewports and default frames are independent', () => {
  assert.equal(previewTileContentViewport('mobile').width, 390);
  assert.equal(previewTileContentViewport('tablet').width, 768);
  assert.equal(previewTileContentViewport('desktop').width, 1280);
  assert.equal(
    previewTileDefaultFrame('mobile').width,
    previewTileMobileFrame.width,
  );
  assert.equal(previewTileCompactLayout.width, 280);
  assert.equal(previewTileMediumLayout.width, 480);
  const scale = previewTileContainScale(
    previewTileDefaultFrame('mobile'),
    previewTileContentViewport('mobile'),
  );
  assert.ok(scale < 1);
  assert.equal(scale, Math.min(280 / 390, 180 / 844));
});

test('mini contain helper remains for legacy callers', () => {
  const scale = previewTileMiniContainScale();
  assert.equal(scale, Math.min(280 / 480, 180 / 320));
  assert.ok(scale < 0.8);
});

test('stage soft-cap layout still near-full pane', () => {
  const pane = { width: 1000, height: 800 };
  const stage = previewTileStageLayout(pane);
  assert.ok(stage.width / pane.width >= 0.85 - 1e-9);
  assert.ok(stage.bodyHeight / pane.height >= 0.75 - 1e-9);
  assert.ok(stage.width <= Math.min(1200, pane.width - 48));
  assert.ok(stage.bodyHeight <= Math.min(900, pane.height - 72));
});

test('J5 frame resize never mutates resolution size', () => {
  const base = {
    size: 'tablet' as const,
    collapsed: false,
    x: 12,
    y: 34,
  };
  const resized = resizePreviewTileFrame(base, { width: 500, bodyHeight: 400 });
  assert.equal(resized.size, 'tablet');
  assert.equal(resized.frameW, 500);
  assert.equal(resized.frameH, 400);
  assert.deepEqual(previewTileStoredPosition(resized), { x: 12, y: 34 });
  const frame = resolvePreviewTileFrame(resized);
  assert.equal(frame.width, 500);
  assert.equal(frame.bodyHeight, 400);
  assert.equal(previewTileContentViewport(resized.size).width, 768);
});

test('storage key is UI-only v3 and scoped by run + producer', () => {
  assert.equal(
    previewTileUiStorageKey('run-a', 'write'),
    'hyperion.previewTile.v3:run-a:write',
  );
  assert.equal(
    previewTileGlobalStorageKey('run-a'),
    'hyperion.previewTileGlobal.v1:run-a',
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
    { size: 'desktop', collapsed: false },
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

test('E1: dragged position survives size changes and collapse', () => {
  const storage = memoryStorage();
  writePreviewTileUiState(
    'run-a',
    'write',
    { size: 'tablet', collapsed: false, x: 120, y: 240 },
    storage,
  );
  const dragged = readPreviewTileUiState('run-a', 'write', storage);
  assert.deepEqual(previewTileStoredPosition(dragged), { x: 120, y: 240 });
  writePreviewTileUiState(
    'run-a',
    'write',
    { ...dragged, size: 'mobile' },
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
  assert.equal(after.size, 'mobile');
  assert.equal(after.collapsed, true);
  assert.deepEqual(previewTileStoredPosition(after), { x: 120, y: 240 });
  assert.deepEqual(
    resolvePreviewTilePosition(after, undefined, { x: 999, y: 999 }),
    { x: 120, y: 240 },
  );
  assert.deepEqual(
    expandPreviewTile(collapsePreviewTile(previewTileUiDefaults)),
    previewTileUiDefaults,
  );
  assert.deepEqual(parsePreviewTileUiState({ size: 'stage' }), {
    size: 'desktop',
    collapsed: false,
  });
});

test('J4 type aesthetics: csv / note / office icons', () => {
  assert.equal(
    previewAestheticKind({
      id: '1',
      name: 'a.csv',
      mediaType: 'text/csv',
      createdAt: '',
      attempt: 1,
    }),
    'csv',
  );
  assert.equal(
    previewAestheticKind({
      id: '1',
      name: 'note.md',
      mediaType: 'text/markdown',
      createdAt: '',
      attempt: 1,
    }),
    'note',
  );
  assert.equal(
    officeKindForArtifact({
      id: '1',
      name: 'deck.pptx',
      mediaType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      createdAt: '',
      attempt: 1,
    }),
    'pptx',
  );
  const parsed = parseDelimitedPreview('a,b\n1,2\n3,4');
  assert.deepEqual(parsed.rows, [
    ['a', 'b'],
    ['1', '2'],
    ['3', '4'],
  ]);
  assert.equal(parsed.truncated, false);
});

test('open-browser CSP meta is injected for composed documents', () => {
  const withHead = injectOpenBrowserCsp(
    '<html><head></head><body>x</body></html>',
  );
  assert.match(withHead, /Content-Security-Policy/);
  assert.match(withHead, /default-src 'none'/);
  assert.equal(PREVIEW_OPEN_BROWSER_CSP.includes("default-src 'none'"), true);
  const bare = injectOpenBrowserCsp('<p>hi</p>');
  assert.match(bare, /^<head><meta http-equiv="Content-Security-Policy"/);
});

test('Abrir prefers in-app shell for local markup (Track I)', async () => {
  const { openPreviewInBrowser, prefersInAppPreviewShell } =
    await import('../src/client/preview-open-browser.js');
  assert.equal(
    prefersInAppPreviewShell({
      id: 'a',
      name: 'x.html',
      mediaType: 'text/html',
      createdAt: '',
      attempt: 1,
    }),
    true,
  );
  const local = await openPreviewInBrowser('run', {
    id: 'a',
    name: 'x.html',
    mediaType: 'text/html',
    createdAt: '',
    attempt: 1,
  });
  assert.deepEqual(local, { ok: true, via: 'in-app-shell' });
  let opened = '';
  const remote = await openPreviewInBrowser(
    'run',
    {
      id: 'a',
      name: 'ext',
      mediaType: 'text/html',
      url: 'https://example.com/p',
      createdAt: '',
      attempt: 1,
    },
    [],
    (url) => {
      opened = url;
      return {} as Window;
    },
  );
  assert.deepEqual(remote, { ok: true, via: 'remote' });
  assert.equal(opened, 'https://example.com/p');
});

test('PreviewNode Track J: device presets, Abrir, frame resize handles', () => {
  const source = readFileSync(resolve('src/client/PreviewNode.tsx'), 'utf8');
  assert.match(source, /preview-tile-drag/);
  assert.match(source, /Resolución/);
  assert.match(source, /PREVIEW_TILE_SIZE_OPTIONS|Móvil|Tableta|Escritorio/);
  assert.match(source, /select/);
  assert.match(source, /Abrir/);
  assert.match(source, /openPreviewInBrowser/);
  assert.match(source, /onOpenInAppShell|in-app-shell/);
  assert.match(source, /Ocultar artefacto|Mostrar artefacto/);
  assert.match(source, /icon-button preview-tile-action/);
  assert.match(source, /resizePreviewTileFrame|preview-tile-resize/);
  assert.match(source, /previewTileContentViewport|previewTileContainScale/);
  assert.doesNotMatch(source, /\{t\(['"]Artefactos['"]\)\}/);
  assert.doesNotMatch(source, /Maximize2|Minimize2/);
  assert.doesNotMatch(source, /Office WYSIWYG|pen\.dev complete|W2/);
  assert.doesNotMatch(source, /size:\s*['"]mini['"]|size === ['"]mini['"]/);
});

test('App hosts thin PreviewOpenShell Volver; Artefactos on toolbar', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /Ocultar artefactos|Mostrar artefactos/);
  assert.match(source, /PreviewOpenShell/);
  assert.match(source, /onOpenInAppShell/);
  assert.match(source, /previewOpenShell/);
  assert.match(source, /PaneSizeReporter|flowPaneSize|paneSize/);
  assert.match(source, /dragHandle:\s*['"]\.preview-tile-drag['"]/);
  assert.match(source, /size === ['"]desktop['"]/);
  assert.doesNotMatch(source, /Layers3/);
  const shell = readFileSync(
    resolve('src/client/PreviewOpenShell.tsx'),
    'utf8',
  );
  assert.match(shell, /Volver/);
  assert.match(shell, /ArtifactSandboxPreview/);
  assert.doesNotMatch(shell, /Vista en Hyperion/);
  assert.doesNotMatch(shell, /Cerrar vista/);
});

test('canvas toolbar keeps the Jobs switch visible when the workflow has jobs', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /data-testid="canvas-jobs-toggle"/);
  assert.match(source, /\{t\('Trabajos'\)\}/);
  assert.match(source, /view:\s*p\.view === 'jobs' \? 'steps' : 'jobs'/);
});
