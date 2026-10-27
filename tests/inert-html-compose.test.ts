import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Artifact } from '../src/domain/artifacts.js';
import {
  COMPOSED_SRCDOC_BYTES,
  CSS_SIBLING_BYTES,
  MAX_CSS_SIBLINGS,
  composeInertHtmlSrcDoc,
  selectCssSiblingArtifacts,
} from '../src/client/inert-html-compose.js';

const artifact = (
  partial: Partial<Artifact> & Pick<Artifact, 'id' | 'name' | 'mediaType'>,
): Artifact => ({
  attempt: 1,
  size: 80,
  createdAt: '2026-10-27T12:00:00.000Z',
  ...partial,
});

test('selectCssSiblingArtifacts picks same-attempt text/css siblings for HTML only', () => {
  const html = artifact({
    id: 'h1',
    name: 'index.html',
    mediaType: 'text/html',
    attempt: 2,
  });
  const css = artifact({
    id: 'c1',
    name: 'site.css',
    mediaType: 'text/css',
    attempt: 2,
  });
  const older = artifact({
    id: 'c0',
    name: 'old.css',
    mediaType: 'text/css',
    attempt: 1,
  });
  const js = artifact({
    id: 'j1',
    name: 'app.js',
    mediaType: 'text/javascript',
    attempt: 2,
  });
  assert.deepEqual(
    selectCssSiblingArtifacts(html, [html, css, older, js]).map((a) => a.id),
    ['c1'],
  );
  assert.deepEqual(
    selectCssSiblingArtifacts(
      artifact({ id: 's', name: 'icon.svg', mediaType: 'image/svg+xml' }),
      [css],
    ),
    [],
  );
});

test('selectCssSiblingArtifacts prefers relative link basenames from the HTML', () => {
  const html = artifact({
    id: 'h1',
    name: 'index.html',
    mediaType: 'text/html',
  });
  const theme = artifact({
    id: 'c1',
    name: 'theme.css',
    mediaType: 'text/css',
  });
  const extra = artifact({
    id: 'c2',
    name: 'extra.css',
    mediaType: 'text/css',
  });
  const selected = selectCssSiblingArtifacts(
    html,
    [html, extra, theme],
    '<html><head><link rel="stylesheet" href="theme.css"></head><body></body></html>',
  );
  assert.equal(selected[0]!.id, 'c1');
  assert.ok(selected.some((a) => a.id === 'c2'));
});

test('composeInertHtmlSrcDoc injects style blocks and strips inlined relative links', () => {
  const html =
    '<!doctype html><html><head><link rel="stylesheet" href="theme.css"><title>t</title></head><body><h1>Hi</h1></body></html>';
  const result = composeInertHtmlSrcDoc(html, [
    { name: 'theme.css', css: 'h1{color:tomato}' },
  ]);
  assert.equal(result.styleStatus, 'included');
  assert.match(
    result.srcDoc,
    /<style data-hyperion-inert-css="theme\.css">h1\{color:tomato\}<\/style>/,
  );
  assert.doesNotMatch(result.srcDoc, /<link[^>]+href=["']theme\.css["']/i);
  assert.match(result.srcDoc, /<h1>Hi<\/h1>/);
});

test('composeInertHtmlSrcDoc stops before composed budget and marks partial', () => {
  const html = '<html><body>x</body></html>';
  const big = 'x'.repeat(300 * 1024);
  const result = composeInertHtmlSrcDoc(html, [
    { name: 'a.css', css: big },
    { name: 'b.css', css: 'body{margin:0}' },
  ]);
  assert.equal(result.styleStatus, 'partial');
  assert.doesNotMatch(result.srcDoc, /data-hyperion-inert-css="a\.css"/);
  assert.match(result.srcDoc, /data-hyperion-inert-css="b\.css"/);
});

test('compose caps match Architect seal', () => {
  assert.equal(CSS_SIBLING_BYTES, 256 * 1024);
  assert.equal(COMPOSED_SRCDOC_BYTES, 512 * 1024);
  assert.equal(MAX_CSS_SIBLINGS, 12);
});
