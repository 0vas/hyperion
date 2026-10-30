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
  previewTileGlobalDefaults,
  previewTileGlobalStorageKey,
  previewTileMountsIframe,
  previewTileStandardFrame,
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
  officeKindForArtifact,
  parseDelimitedPreview,
  previewAestheticKind,
  previewBubbleIconKind,
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

test('new preview tiles start as compact bubbles', () => {
  assert.deepEqual(previewTileUiDefaults, { collapsed: true });
  assert.deepEqual(previewTileStandardFrame, { width: 480, bodyHeight: 300 });
  assert.equal(previewTileMountsIframe(previewTileUiDefaults), false);
  assert.equal(
    previewTileMountsIframe(expandPreviewTile(previewTileUiDefaults)),
    true,
  );
});

test('v5 migration keeps an explicit expanded or moved legacy tile', () => {
  const storage = memoryStorage({
    'hyperion.previewTile.v4:run-a:write': JSON.stringify({
      size: 'desktop',
      frameW: 1100,
      frameH: 800,
      collapsed: false,
      x: 10,
      y: 20,
    }),
  });
  assert.deepEqual(readPreviewTileUiState('run-a', 'write', storage), {
    collapsed: false,
    x: 10,
    y: 20,
  });
  assert.equal(
    storage.getItem('hyperion.previewTile.v5:run-a:write') !== null,
    true,
  );
  assert.equal(storage.getItem('hyperion.previewTile.v4:run-a:write'), null);
  assert.deepEqual(parsePreviewTileUiState({ size: 'mobile' }), {
    collapsed: true,
  });
});

test('storage key is UI-only v5 and scoped by run + producer', () => {
  assert.equal(
    previewTileUiStorageKey('run-a', 'write'),
    'hyperion.previewTile.v5:run-a:write',
  );
  assert.equal(
    previewTileGlobalStorageKey('run-a'),
    'hyperion.previewTileGlobal.v1:run-a',
  );
});

test('global hide-all and placement round-trip', () => {
  const storage = memoryStorage();
  writePreviewTileUiState(
    'run-a',
    'write',
    { collapsed: false, x: 120, y: 240 },
    storage,
  );
  const state = readPreviewTileUiState('run-a', 'write', storage);
  assert.deepEqual(previewTileStoredPosition(state), { x: 120, y: 240 });
  assert.deepEqual(
    resolvePreviewTilePosition(state, undefined, { x: 999, y: 999 }),
    { x: 120, y: 240 },
  );
  assert.deepEqual(
    expandPreviewTile(collapsePreviewTile(previewTileUiDefaults)),
    { collapsed: false },
  );
  writePreviewTileGlobalState('run-a', { hideAll: true }, storage);
  assert.deepEqual(readPreviewTileGlobalState('run-a', storage), {
    hideAll: true,
  });
  clearPreviewTileUiForRun('run-a', storage);
  assert.deepEqual(readPreviewTileGlobalState('run-a', storage), {
    hideAll: false,
  });
  assert.deepEqual(parsePreviewTileGlobalState({ hideAll: 'yes' }), {
    hideAll: false,
  });
  assert.deepEqual(previewTileGlobalDefaults, { hideAll: false });
});

test('type aesthetics keep Office as an icon/download, never a rendered document', () => {
  assert.equal(
    previewBubbleIconKind({
      id: '1',
      name: 'page.html',
      mediaType: 'text/html',
      createdAt: '',
      attempt: 1,
    }),
    'markup',
  );
  assert.equal(
    previewBubbleIconKind({
      id: '1',
      name: 'note.md',
      mediaType: 'text/markdown',
      createdAt: '',
      attempt: 1,
    }),
    'note',
  );
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
    previewBubbleIconKind({
      id: '1',
      name: 'a.csv',
      mediaType: 'text/csv',
      createdAt: '',
      attempt: 1,
    }),
    'csv',
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
  assert.deepEqual(parseDelimitedPreview('a,b\n1,2').rows, [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('open-browser CSP remains inert for composed documents', () => {
  const withHead = injectOpenBrowserCsp(
    '<html><head></head><body>x</body></html>',
  );
  assert.match(withHead, /Content-Security-Policy/);
  assert.equal(PREVIEW_OPEN_BROWSER_CSP.includes("default-src 'none'"), true);
});

test('PreviewNode has one frame, full-screen expansion, and connected movable bubbles', () => {
  const source = readFileSync(resolve('src/client/PreviewNode.tsx'), 'utf8');
  assert.match(source, /Ampliar vista/);
  assert.match(source, /Maximize2/);
  assert.match(source, /artifact-download-bubble/);
  assert.match(source, /artifact-preview-bubble/);
  assert.match(source, /artifact-bubble-drag/);
  assert.match(source, /PreviewArtifactIcon/);
  assert.match(source, /previewBubbleIconKind/);
  assert.match(source, /Mostrar artefacto/);
  assert.match(source, /Mostrar artefacto: \{0\}/);
  assert.match(source, /title=\{t\('Descargar \{0\}'/);
  assert.match(source, /artifactFileUrl/);
  assert.doesNotMatch(source, /PREVIEW_TILE_SIZE_OPTIONS/);
  assert.doesNotMatch(source, /preview-tile-resolution/);
  assert.doesNotMatch(source, /preview-tile-resize/);
  assert.doesNotMatch(source, /frameW|frameH|previewTileContainScale/);
});

test('App opens an immersive full-screen shell and keeps the Jobs switch', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /data-testid="canvas-jobs-toggle"/);
  assert.match(source, /downloadOnly/);
  assert.match(source, /PreviewOpenShell/);
  assert.match(source, /node-status-footer/);
  assert.doesNotMatch(source, /size === ['"]desktop['"]/);
  const shell = readFileSync(
    resolve('src/client/PreviewOpenShell.tsx'),
    'utf8',
  );
  assert.match(shell, /Volver/);
  assert.match(shell, /immersive/);
  assert.doesNotMatch(shell, /preview-open-shell-chrome/);
  const css = readFileSync(resolve('src/client/workspace.css'), 'utf8');
  assert.match(css, /\.preview-open-shell\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.preview-open-shell-back\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.artifact-markup-expanded\.is-immersive/);
  assert.match(css, /\.artifact-download-bubble/);
  assert.match(css, /\.artifact-preview-bubble/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.artifact-html-frame-expanded/);
});
