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
    /\.chat-bubble-field[\s\S]*?background:\s*#fffefa/,
    'hardcoded cream field background breaks dark theme ink',
  );
  assert.match(
    css,
    /\.chat-bubble-field select,\s*\.chat-bubble-field textarea\s*\{[^}]*background:\s*var\(--stone\)/,
  );
  assert.match(
    css,
    /\.chat-bubble-field select,\s*\.chat-bubble-field textarea\s*\{[^}]*color:\s*var\(--ink\)/,
  );
  assert.match(
    css,
    /\.chat-bubble-field textarea::placeholder\s*\{[^}]*color:\s*var\(--muted\)/,
  );
  assert.match(css, /\.chat-bubble-honesty[\s\S]*?color:\s*var\(--muted\)/);
  assert.match(
    css,
    /\.chat-bubble-field \.field-hint\s*\{[^}]*color:\s*var\(--muted\)/,
  );
});
