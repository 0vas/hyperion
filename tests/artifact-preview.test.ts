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

test('Artifacts preview uses an empty sandbox iframe and Preview/Source labels', () => {
  const source = readFileSync(resolve('src/client/Artifacts.tsx'), 'utf8');
  assert.match(source, /srcDoc=\{text\}/);
  assert.match(source, /sandbox=""/);
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.match(source, /Vista previa/);
  assert.match(source, /Código fuente/);
  assert.match(source, /isSandboxedMarkup/);
});
