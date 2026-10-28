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
  previewTileGlobalDefaults,
  previewTileGlobalStorageKey,
  previewTileMediumLayout,
  previewTileMiniContainScale,
  previewTileMountsIframe,
  previewTileStageLayout,
  previewTileStoredPosition,
  previewTileUiDefaults,
  previewTileUiStorageKey,
  readPreviewTileGlobalState,
  readPreviewTileUiState,
  resolvePreviewTilePosition,
  writePreviewTileGlobalState,
  writePreviewTileUiState,
} from '../src/client/preview-tile-ui.js';
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

test('preview tile UI defaults are mini and not collapsed', () => {
  assert.deepEqual(previewTileUiDefaults, {
    size: 'mini',
    collapsed: false,
  });
  assert.equal(previewTileMountsIframe(previewTileUiDefaults), true);
  assert.equal(
    previewTileMountsIframe(collapsePreviewTile(previewTileUiDefaults)),
    false,
  );
});

test('v2 migrates compact→mini and expanded→medium; absent→mini', () => {
  assert.equal(parsePreviewTileSize('compact'), 'mini');
  assert.equal(parsePreviewTileSize('expanded'), 'medium');
  assert.equal(parsePreviewTileSize('stage'), 'stage');
  assert.equal(parsePreviewTileSize('nope'), 'mini');
  const storage = memoryStorage({
    'hyperion.previewTile.v1:run-a:write': JSON.stringify({
      size: 'expanded',
      collapsed: false,
      x: 10,
      y: 20,
    }),
  });
  assert.deepEqual(readPreviewTileUiState('run-a', 'write', storage), {
    size: 'medium',
    collapsed: false,
    x: 10,
    y: 20,
  });
  assert.equal(
    storage.getItem('hyperion.previewTile.v2:run-a:write') !== null,
    true,
  );
  assert.equal(storage.getItem('hyperion.previewTile.v1:run-a:write'), null);
  assert.deepEqual(
    readPreviewTileUiState('run-b', 'write', memoryStorage()),
    previewTileUiDefaults,
  );
});

test('mini and medium layout bands match Architect stamps', () => {
  assert.equal(previewTileCompactLayout.width, 280);
  assert.equal(previewTileCompactLayout.bodyHeight, 180);
  assert.equal(previewTileMediumLayout.width, 480);
  assert.equal(previewTileMediumLayout.bodyHeight, 320);
});

test('mini contain uses uniform letterbox scale, not fixed 0.8 crop', () => {
  const scale = previewTileMiniContainScale();
  assert.equal(scale, Math.min(280 / 480, 180 / 320));
  assert.ok(scale < 0.8);
  assert.doesNotMatch(
    readFileSync(resolve('src/client/PreviewNode.tsx'), 'utf8'),
    /scale\(0\.8\)|transformOrigin:\s*['"]top left['"]/,
  );
  assert.match(
    readFileSync(resolve('src/client/PreviewNode.tsx'), 'utf8'),
    /previewTileMiniContainScale|is-mini-contain/,
  );
});

test('stage layout is near-full pane without free-resize', () => {
  const pane = { width: 1000, height: 800 };
  const stage = previewTileStageLayout(pane);
  assert.ok(stage.width / pane.width >= 0.85 - 1e-9);
  assert.ok(stage.bodyHeight / pane.height >= 0.75 - 1e-9);
  assert.ok(stage.width <= Math.min(1200, pane.width - 48));
  assert.ok(stage.bodyHeight <= Math.min(900, pane.height - 72));
});

test('storage key is UI-only v2 and scoped by run + producer', () => {
  assert.equal(
    previewTileUiStorageKey('run-a', 'write'),
    'hyperion.previewTile.v2:run-a:write',
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
    { size: 'stage', collapsed: false },
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
    { size: 'medium', collapsed: false, x: 120, y: 240 },
    storage,
  );
  const dragged = readPreviewTileUiState('run-a', 'write', storage);
  assert.deepEqual(previewTileStoredPosition(dragged), { x: 120, y: 240 });
  writePreviewTileUiState(
    'run-a',
    'write',
    { ...dragged, size: 'mini' },
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
  assert.equal(after.size, 'mini');
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
    size: 'stage',
    collapsed: false,
  });
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

test('PreviewNode tile hide is icon-only; Abrir uses in-app shell hook', () => {
  const source = readFileSync(resolve('src/client/PreviewNode.tsx'), 'utf8');
  assert.match(source, /preview-tile-drag/);
  assert.match(source, /Resolución/);
  assert.match(source, /PREVIEW_TILE_SIZE_OPTIONS|Mini|Media|Escenario/);
  assert.match(source, /select/);
  assert.match(source, /Abrir en navegador/);
  assert.match(source, /openPreviewInBrowser/);
  assert.match(source, /onOpenInAppShell|in-app-shell/);
  assert.match(source, /Ocultar artefacto|Mostrar artefacto/);
  assert.match(source, /icon-button preview-tile-action/);
  assert.doesNotMatch(source, /\{t\(['"]Artefactos['"]\)\}/);
  assert.doesNotMatch(source, /Maximize2|Minimize2/);
  assert.doesNotMatch(source, /Office|pen\.dev complete|W2|free-resize/);
});

test('App hosts PreviewOpenShell chrome; Jobs demoted; Artefactos on toolbar', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /Ocultar artefactos|Mostrar artefactos/);
  assert.match(source, /PreviewOpenShell/);
  assert.match(source, /onOpenInAppShell/);
  assert.match(source, /previewOpenShell/);
  assert.match(source, /PaneSizeReporter|flowPaneSize|paneSize/);
  assert.match(source, /dragHandle:\s*['"]\.preview-tile-drag['"]/);
  assert.doesNotMatch(source, /Ver trabajos/);
  assert.doesNotMatch(source, /Layers3/);
  const shell = readFileSync(
    resolve('src/client/PreviewOpenShell.tsx'),
    'utf8',
  );
  assert.match(shell, /Volver al canvas/);
  assert.match(shell, /Vista en Hyperion/);
  assert.match(shell, /Cerrar vista/);
  assert.match(shell, /ArtifactSandboxPreview/);
});
