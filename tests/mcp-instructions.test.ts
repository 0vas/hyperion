import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('MCP server instructions require Hyperion-first use when tools are loaded', () => {
  const source = readFileSync(resolve('src/adapters/mcp.ts'), 'utf8');
  assert.match(source, /Usa Hyperion \/ Use Hyperion/);
  assert.match(source, /hyperion_create_run/);
  assert.match(source, /filesystem|Cowork/);
  assert.match(source, /hyperion_wait/);
  assert.match(source, /presentation split only returns a browser URL/);
  assert.match(source, /Hard rule/);
  assert.match(source, /do NOT collect scope/);
  assert.match(source, /Which folders\?/);
  assert.match(source, /never ask those clarifying questions in chat/);
  assert.match(source, /Browse\/split side panel/);
  assert.match(source, /do not leave the pane blank/);
  assert.match(source, /action=fail/);
  assert.match(source, /log alone is not enough/);
});
