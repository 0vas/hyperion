import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/client/chat-bubble.css'), 'utf8');

test('chat bubble fields use theme surface tokens for light and dark contrast', () => {
  assert.doesNotMatch(
    css,
    /background:\s*#fffefa/,
    'hardcoded cream field background breaks dark theme ink',
  );
  assert.match(
    css,
    /\.chat-bubble-composer select,\s*\.chat-bubble-composer textarea\s*\{[^}]*background:\s*var\(--stone\)/,
  );
  assert.match(
    css,
    /\.chat-bubble-composer select,\s*\.chat-bubble-composer textarea\s*\{[^}]*color:\s*var\(--ink\)/,
  );
  assert.match(
    css,
    /\.chat-bubble-composer textarea::placeholder\s*\{[^}]*color:\s*var\(--muted\)/,
  );
  assert.match(css, /\.chat-bubble-honesty[\s\S]*?color:\s*var\(--muted\)/);
  assert.match(
    css,
    /\.chat-bubble-composer \.field-hint\s*\{[^}]*color:\s*var\(--muted\)/,
  );
});
