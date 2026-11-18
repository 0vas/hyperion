import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isInteractiveToolCallAllowed,
  projectAppServerEvent,
  reduceLiveChat,
  type LiveChatState,
} from '../src/adapters/live-codex-chat.js';

test('live Codex chat only permits the bounded Hyperion tools', () => {
  assert.equal(isInteractiveToolCallAllowed('hyperion_get_run', {}), true);
  assert.equal(
    isInteractiveToolCallAllowed('hyperion_step', { action: 'log' }),
    true,
  );
  assert.equal(
    isInteractiveToolCallAllowed('hyperion_step', { action: 'retry' }),
    false,
  );
  assert.equal(isInteractiveToolCallAllowed('hyperion_submit', {}), false);
  assert.equal(isInteractiveToolCallAllowed('shell', {}), false);
});

test('projects only safe protocol events and redacts tool inputs', () => {
  assert.deepEqual(
    projectAppServerEvent({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        item: {
          type: 'userMessage',
          content: [{ type: 'text', text: 'Start the allowed work.' }],
        },
      },
    }),
    [{ type: 'user-message', text: 'Start the allowed work.' }],
  );
  assert.deepEqual(
    projectAppServerEvent({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', itemId: 'item-1', delta: 'Hello' },
    }),
    [
      {
        type: 'assistant-delta',
        threadId: 'thread-1',
        itemId: 'item-1',
        text: 'Hello',
      },
    ],
  );
  assert.deepEqual(
    projectAppServerEvent({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        item: {
          id: 'tool-1',
          type: 'mcpToolCall',
          server: 'hyperion',
          tool: 'hyperion_step',
          arguments: { token: 'secret', action: 'complete' },
        },
      },
    }),
    [
      {
        type: 'action',
        threadId: 'thread-1',
        itemId: 'tool-1',
        status: 'running',
        label: 'Hyperion: hyperion_step',
      },
    ],
  );
  assert.deepEqual(
    projectAppServerEvent({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'interrupted' },
      },
    }),
    [
      {
        type: 'turn',
        threadId: 'thread-1',
        turnId: 'turn-1',
        status: 'interrupted',
      },
    ],
  );
});

test('the reducer blocks a second prompt and only finalizes terminal turns', () => {
  let state: LiveChatState = {
    status: 'connected',
    activeTurnId: null,
    messages: [],
  };
  state = reduceLiveChat(state, {
    type: 'turn',
    threadId: 't',
    turnId: 'one',
    status: 'running',
  });
  assert.equal(state.canSend, false);
  state = reduceLiveChat(state, {
    type: 'assistant-delta',
    threadId: 't',
    itemId: 'm',
    text: 'Actual response',
  });
  assert.equal(state.messages[0]?.text, 'Actual response');
  state = reduceLiveChat(state, {
    type: 'turn',
    threadId: 't',
    turnId: 'one',
    status: 'completed',
  });
  assert.equal(state.canSend, true);
  assert.equal(state.messages[0]?.status, 'completed');
});
