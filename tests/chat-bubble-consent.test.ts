import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BUBBLE_ALLOWED_AGENT_ACTIONS,
  BUBBLE_FORBIDDEN_COMMANDS,
  assertBubblePayloadAllowed,
  isBubbleAgentAction,
  isBubbleForbiddenCommand,
} from '../src/client/chat-bubble-consent.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('consent wall rejects every human command the bubble must never issue', () => {
  for (const type of BUBBLE_FORBIDDEN_COMMANDS) {
    assert.equal(isBubbleForbiddenCommand(type), true);
    assert.throws(
      () => assertBubblePayloadAllowed({ type }),
      /human command|irreversible/i,
    );
    assert.throws(
      () => assertBubblePayloadAllowed({ action: type }),
      /human command|irreversible/i,
    );
  }
  assert.throws(
    () => assertBubblePayloadAllowed({ acknowledgeIrreversible: true }),
    /irreversible/i,
  );
});

test('consent wall allows declared agent-side bubble actions', () => {
  for (const action of BUBBLE_ALLOWED_AGENT_ACTIONS) {
    assert.equal(isBubbleAgentAction(action), true);
    assert.doesNotThrow(() => assertBubblePayloadAllowed({ action }));
    assert.doesNotThrow(() => assertBubblePayloadAllowed({ type: action }));
  }
  assert.equal(isBubbleForbiddenCommand('start'), false);
  assert.equal(isBubbleAgentAction('submit'), false);
});

test('forbidden list covers domain human actions plus irreversible ack', () => {
  const workflow = readFileSync(join(root, 'src/domain/workflow.ts'), 'utf8');
  const match = workflow.match(/const humanActions = \[([\s\S]*?)\];/);
  assert.ok(match, 'expected humanActions in workflow.ts');
  const domainHuman = [...match[1]!.matchAll(/'([a-zA-Z]+)'/g)].map(
    (m) => m[1]!,
  );
  for (const action of domainHuman) {
    assert.ok(
      (BUBBLE_FORBIDDEN_COMMANDS as readonly string[]).includes(action),
      `missing domain human action in bubble wall: ${action}`,
    );
  }
  assert.ok(
    (BUBBLE_FORBIDDEN_COMMANDS as readonly string[]).includes(
      'acknowledgeIrreversible',
    ),
  );
});

test('live chat page has no human command or API commit path', () => {
  const source = readFileSync(
    join(root, 'src/client/LiveChatPage.tsx'),
    'utf8',
  );
  for (const forbidden of BUBBLE_FORBIDDEN_COMMANDS) {
    assert.equal(
      source.includes(`'${forbidden}'`) || source.includes(`"${forbidden}"`),
      false,
      `live chat must not mention forbidden command ${forbidden}`,
    );
  }
  assert.equal(source.includes('/commands'), false);
  assert.equal(source.includes('acknowledgeIrreversible'), false);
  assert.equal(source.includes('fetch('), false);
  assert.match(source, /hyperionDesktop\?\.liveChat/);
  assert.match(source, /liveChat\.connect/);
  assert.match(source, /liveChat\.stop/);
  assert.match(source, /hyperionDesktop\?\.liveChat/);
  assert.match(source, /liveChat\.connect/);
  assert.match(source, /liveChat\.stop/);
  assert.match(source, /live-chat-thread/);
  assert.match(source, /live-chat-composer/);
  assert.match(source, /canvas conserva formularios/);
});

test('Desktop mounts the dedicated chat page only in its navbar view', () => {
  const app = readFileSync(join(root, 'src/client/App.tsx'), 'utf8');
  assert.match(app, /isElectron && desktopView === 'chat'/);
  assert.match(app, /<LiveChatPage/);
  assert.doesNotMatch(app, /<ChatBubble/);
  assert.doesNotMatch(
    app.slice(app.indexOf('<LiveChatPage'), app.indexOf('/>') + 2),
    /type:\s*'(submit|approve|reject|amend)'/,
  );
});
