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
  assert.match(source, /heartbeat log/);
  assert.match(source, /~60s/);
  assert.match(source, /host\/tool timeout/);
  assert.match(source, /chat-only/);
});

test('portable skill requires mirrored host progress and fail on timeout', () => {
  const skill = readFileSync(resolve('skills/hyperion/SKILL.md'), 'utf8');
  assert.match(skill, /Hard rule: mirror host progress into Hyperion logs/);
  assert.match(skill, /Before.*\*\* the first material host action/s);
  assert.match(skill, /After.*\*\* each material observation/s);
  assert.match(skill, /~60s/);
  assert.match(skill, /~30s/);
  assert.match(skill, /host\/tool timeout/);
  assert.match(skill, /attempt.*returned by `start`/i);
});
