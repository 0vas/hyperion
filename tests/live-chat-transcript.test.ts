import assert from 'node:assert/strict';
import test from 'node:test';
import { translate } from '../src/i18n/core.js';
import {
  updateActivity,
  appendAssistant,
  groupTranscript,
  settleActivities,
  localizePublicActionLabel,
  type ThreadMessage,
} from '../src/client/live-chat-transcript';

test('only the fixed backend public vocabulary localizes in Spanish and English', () => {
  const labels = [
    ['List workflows', 'Listar flujos', 'List workflows'],
    ['Read workflow', 'Consultar el flujo', 'Read the workflow'],
    [
      'Wait for workflow',
      'Esperar un cambio del flujo',
      'Wait for a workflow change',
    ],
    ['Create workflow', 'Crear un flujo', 'Create a workflow'],
    [
      'Revise workflow plan',
      'Proponer una revisión del plan',
      'Propose a plan revision',
    ],
    [
      'Update workflow step',
      'Actualizar un paso del flujo',
      'Update a workflow step',
    ],
    ['Read content', 'Leer contenido', 'Read content'],
    ['Edit content', 'Editar contenido', 'Edit content'],
    ['Delete content', 'Eliminar contenido', 'Delete content'],
    ['Move content', 'Mover contenido', 'Move content'],
    ['Search content', 'Buscar contenido', 'Search content'],
    ['Run command', 'Ejecutar comando', 'Run command'],
    ['Process request', 'Procesar solicitud', 'Process request'],
    ['Fetch content', 'Obtener contenido', 'Fetch content'],
    ['Change mode', 'Cambiar modo', 'Change mode'],
    ['Harness action', 'Acción del proveedor', 'Provider action'],
  ] as const;
  for (const [input, es, en] of labels) {
    assert.equal(
      localizePublicActionLabel(input, (key) => translate('es', key)),
      es,
    );
    assert.equal(
      localizePublicActionLabel(input, (key) => translate('en', key)),
      en,
    );
  }
  for (const original of [
    'Read workflow report.txt',
    'read workflow',
    'Completado',
    'constructor',
    '__proto__',
    'Hyperion: hyperion_step',
  ]) {
    assert.equal(
      localizePublicActionLabel(original, () => {
        throw new Error('Arbitrary content must not be translated');
      }),
      original,
    );
  }
});

test('tool updates keep one stable item and its original label across assistant chunks', () => {
  let items: ThreadMessage[] = [];
  items = updateActivity(
    items,
    { toolCallId: 'tool-1', label: 'Read workflow', status: 'running' },
    'thread',
    'event-1',
  );
  items = appendAssistant(items, 'answer', 'Result: ', 'Codex');
  items = updateActivity(
    items,
    {
      toolCallId: 'tool-1',
      status: 'completed',
      label: 'Harness action updated',
    },
    'thread',
    'event-2',
  );
  items = appendAssistant(items, 'answer', 'ready.', 'Codex');
  assert.equal(items.length, 2);
  assert.equal(items[0]?.id, 'event-1');
  assert.equal(items[0]?.text, 'Read workflow');
  assert.equal(items[0]?.activity?.status, 'completed');
  assert.equal(items[1]?.text, 'Result: ready.');
});

test('distinct calls and calls from different sessions never collapse by label', () => {
  let items: ThreadMessage[] = [];
  for (const [thread, id, event] of [
    ['a', '1', 'first'],
    ['a', '2', 'second'],
    ['b', '1', 'third'],
    ['a', '', 'fourth'],
    ['a', '', 'fifth'],
  ])
    items = updateActivity(
      items,
      { toolCallId: id, label: 'Read workflow' },
      thread!,
      event!,
    );
  assert.equal(items.length, 5);
  assert.equal(groupTranscript(items).length, 1);
});

test('pending permissions and answers remain separate from activity groups', () => {
  const items = updateActivity(
    [],
    { toolCallId: '1', label: 'Read', status: 'failed', error: 'Unavailable' },
    'a',
    'first',
  );
  items.push({
    id: 'permission',
    role: 'system',
    text: 'Publish',
    approvalToken: 'p',
  });
  items.push({
    id: 'answer',
    role: 'assistant',
    text: 'I could not read the workflow.',
  });
  const groups = groupTranscript(items);
  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.kind, 'activity');
  assert.equal(items[0]?.activity?.error, 'Unavailable');
});

test('ending a turn does not fabricate successful tool execution', () => {
  const items = updateActivity(
    [],
    { toolCallId: '1', label: 'Read', status: 'running' },
    'a',
    'first',
  );
  assert.equal(
    settleActivities(items, 'completed')[0]?.activity?.status,
    'unconfirmed',
  );
  assert.equal(
    settleActivities(items, 'interrupted')[0]?.activity?.status,
    'interrupted',
  );
  assert.equal(
    settleActivities(items, 'failed')[0]?.activity?.status,
    'failed',
  );
});

test('reused tool IDs across turns retain separate evidence and safe summaries', () => {
  let items = updateActivity(
    [],
    {
      toolCallId: '1',
      turnId: 'first',
      label: 'Read',
      status: 'completed',
      summary: 'First result',
    },
    'thread',
    'a',
  );
  items = updateActivity(
    items,
    { toolCallId: '1', turnId: 'second', label: 'Read', status: 'running' },
    'thread',
    'b',
  );
  items = updateActivity(
    items,
    {
      toolCallId: '1',
      turnId: 'second',
      status: 'completed',
      summary: 'Second result',
    },
    'thread',
    'c',
  );
  assert.equal(items.length, 2);
  assert.equal(items[0]?.activity?.summary, 'First result');
  assert.equal(items[1]?.activity?.summary, 'Second result');
});

test('legacy item IDs correlate without assuming an unknown call identity', () => {
  let items = updateActivity(
    [],
    { itemId: 'legacy', label: 'Read workflow', status: 'running' },
    'thread',
    'first',
  );
  items = updateActivity(
    items,
    { itemId: 'legacy', status: 'succeeded' },
    'thread',
    'second',
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, 'first');
  assert.equal(items[0]?.text, 'Read workflow');
  assert.equal(items[0]?.activity?.status, 'succeeded');
});
