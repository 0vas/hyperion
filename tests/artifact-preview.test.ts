import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isSandboxedMarkup } from '../src/client/artifact-preview.js';

test('sandboxed markup covers HTML and SVG only', () => {
  assert.equal(isSandboxedMarkup('text/html'), true);
  assert.equal(isSandboxedMarkup('image/svg+xml'), true);
  assert.equal(isSandboxedMarkup('text/plain'), false);
  assert.equal(isSandboxedMarkup('image/png'), false);
  assert.equal(isSandboxedMarkup('application/json'), false);
});

test('shared ArtifactSandboxPreview keeps empty sandbox, Preview/Source, and inert disclaimer', () => {
  const source = readFileSync(
    resolve('src/client/ArtifactSandboxPreview.tsx'),
    'utf8',
  );
  assert.match(source, /srcDoc=\{srcDoc\}/);
  assert.match(source, /sandbox=""/);
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.match(source, /Vista previa/);
  assert.match(source, /Código fuente/);
  assert.match(source, /Modo de visualización/);
  assert.match(
    source,
    /Vista previa inerte: sin JavaScript ni red\. El aspecto puede diferir del navegador completo\./,
  );
  assert.match(source, /composeInertHtmlSrcDoc/);
  assert.match(source, /selectCssSiblingArtifacts/);
  assert.match(source, /Estilos incluidos \(inerte\)/);
  assert.match(source, /Estilos parciales · faltan archivos/);
  assert.match(source, /mode === 'preview' &&/);
  assert.match(source, /isSandboxedMarkup/);
  assert.match(source, /artifact-preview-stage/);
  assert.doesNotMatch(source, /allow-scripts/);
  assert.doesNotMatch(source, /allow-same-origin/);
});

test('preview stage CSS keeps light page inside a dark matte well and P1 stage band', () => {
  const css = readFileSync(resolve('src/client/workspace.css'), 'utf8');
  assert.match(css, /\.artifact-preview-stage/);
  assert.match(css, /color-scheme:\s*light/);
  assert.match(css, /\[data-theme='dark'\] \.artifact-preview-stage/);
  assert.match(css, /\[data-theme='dark'\] \.artifact-preview-disclaimer/);
  assert.match(css, /\.preview-tile\s*\{[^}]*width:\s*280px/s);
  assert.match(css, /\.preview-tile-body\s*\{[^}]*min-height:\s*180px/s);
  assert.match(css, /\.artifact-html-frame\s*\{[^}]*min-height:\s*280px/s);
  assert.match(css, /\.preview-tile-resize/);
});

test('trace scope select forces readable ink on dark theme', () => {
  const css = readFileSync(resolve('src/client/process.css'), 'utf8');
  assert.match(css, /\.trace-scope select option/);
  assert.match(css, /\[data-theme='dark'\] \.trace-scope select/);
});

test('Artifacts reuses the shared sandbox preview helper', () => {
  const source = readFileSync(resolve('src/client/Artifacts.tsx'), 'utf8');
  assert.match(source, /ArtifactSandboxPreview/);
  assert.doesNotMatch(source, /sandbox=""/);
});

test('canvas PreviewNode uses shared sandbox preview and selects producer', () => {
  const source = readFileSync(resolve('src/client/PreviewNode.tsx'), 'utf8');
  assert.match(source, /ArtifactSandboxPreview/);
  assert.match(source, /onSelectProducer/);
  assert.match(source, /preview-tile/);
});
