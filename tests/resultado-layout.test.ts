import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  canvasInsetsWithResultado,
  resultadoDock,
  resultadoDockWidth,
} from '../src/client/viewport.js';

test('Resultado dock uses finalized 960 breakpoint and width clamp', () => {
  assert.equal(resultadoDock.breakpoint, 960);
  assert.equal(resultadoDockWidth(1280), 480);
  assert.equal(resultadoDockWidth(900), 342);
  assert.equal(resultadoDockWidth(700), 320);
  const css = readFileSync(resolve('src/client/resultado.css'), 'utf8');
  assert.match(css, /max-width:\s*959px/);
  assert.match(css, /clamp\(320px,\s*38%,\s*480px\)/);
  assert.match(css, /Volver al canvas|resultado-back-canvas/);
});

test('narrow Resultado raises bottom canvas inset for the sheet', () => {
  const closed = canvasInsetsWithResultado({ open: false, narrow: true });
  assert.equal(closed.bottom, 64);
  const open = canvasInsetsWithResultado({ open: true, narrow: true });
  assert.ok(open.bottom > 64);
  const wide = canvasInsetsWithResultado({ open: true, narrow: false });
  assert.equal(wide.bottom, 64);
});

test('App wires job priority selection and Esc focus restore', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /status === 'waiting'/);
  assert.match(source, /selectJobRollup/);
  assert.match(source, /\.focus\(\)/);
  assert.match(source, /Volver al canvas|onClose=\{clearResultado\}/);
  assert.match(source, /eventLabels=\{eventLabels\}/);
});
