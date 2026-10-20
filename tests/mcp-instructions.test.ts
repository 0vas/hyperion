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
});
