import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/domain/workflow.js';
import {
  draftFromOutputValues,
  fieldError,
  parseField,
} from '../src/client/decision-form.js';

test('draftFromOutputValues prefills typed ports for amend', () => {
  const run = createRun(
    {
      title: 'Amend draft',
      steps: [
        {
          id: 'answer',
          title: 'Decide',
          kind: 'manual',
          outputs: [
            { name: 'choice', type: 'string', required: true },
            { name: 'ok', type: 'boolean', required: true },
            { name: 'count', type: 'number', required: true },
          ],
        },
      ],
    },
    'codex',
  );
  const step = {
    ...run.steps[0]!,
    status: 'completed' as const,
    outputValues: { choice: 'first', ok: true, count: 3 },
  };
  assert.deepEqual(draftFromOutputValues(step), {
    choice: 'first',
    ok: 'true',
    count: '3',
  });
});

test('field guidance is optional and never changes output types or selects an answer', () => {
  const run = createRun(
    {
      title: 'Review',
      steps: [
        {
          id: 'review',
          title: 'Choose',
          kind: 'manual',
          outputs: [
            {
              name: 'include',
              type: 'boolean',
              required: true,
              description: 'Include examples',
              form: {
                label: '¿Añadimos ejemplos?',
                hint: 'Se incluirán en la guía.',
                trueLabel: 'Incluir',
                falseLabel: 'Omitir',
              },
            },
          ],
        },
      ],
    },
    'codex',
  );
  const port = run.steps[0]!.outputs![0]!;
  assert.equal(port.form?.label, '¿Añadimos ejemplos?');
  assert.equal(run.steps[0]!.outputValues, undefined);
  assert.equal(fieldError(port, ''), 'Elige una opción.');
  assert.equal(fieldError(port, 'false'), undefined);
  assert.equal(parseField(port, 'false'), false);
});
test('form validation preserves zero and flags malformed typed data before submission', () => {
  const number = {
    name: 'count',
    type: 'number' as const,
    required: true,
    description: '',
  };
  assert.equal(fieldError(number, '0'), undefined);
  assert.equal(parseField(number, '01'), 1);
  assert.equal(fieldError(number, 'no'), 'Escribe un número válido.');
  const object = { ...number, type: 'object' as const };
  assert.ok(fieldError(object, '[]'));
  assert.ok(fieldError(object, '{'));
  assert.equal(fieldError(object, '{"ok":true}'), undefined);
  assert.equal(fieldError({ ...object, required: false }, ''), undefined);
});

test('known choices require an explicit allowed value in both the form and domain', async () => {
  const { validateOutputs } = await import('../src/domain/process.js');
  const run = createRun(
    {
      title: 'Choose a product',
      steps: [
        {
          id: 'choose',
          title: 'Product',
          kind: 'manual',
          outputs: [
            {
              name: 'product',
              type: 'string',
              required: true,
              form: {
                options: [
                  { value: 'idea', label: 'IntelliJ IDEA' },
                  { value: 'pycharm', label: 'PyCharm' },
                ],
              },
            },
          ],
        },
      ],
    },
    'codex',
  );
  const step = run.steps[0]!;
  const port = step.outputs![0]!;
  assert.equal(step.outputValues, undefined);
  assert.equal(fieldError(port, ''), 'Elige una opción.');
  assert.equal(fieldError(port, 'idea'), undefined);
  assert.equal(
    fieldError(port, 'unknown'),
    'Elige una de las opciones disponibles.',
  );
  assert.throws(() => validateOutputs(step, { product: 'unknown' }));
  assert.deepEqual(validateOutputs(step, { product: 'idea' }), {
    product: 'idea',
  });
  for (const options of [
    [],
    [
      { value: 'a', label: 'A' },
      { value: 'a', label: 'Again' },
    ],
  ]) {
    assert.throws(() =>
      createRun(
        {
          title: 'Bad options',
          steps: [
            {
              id: 'choose',
              title: 'Choose',
              kind: 'manual',
              outputs: [{ name: 'product', type: 'string', form: { options } }],
            },
          ],
        },
        'codex',
      ),
    );
  }
  assert.throws(() =>
    createRun(
      {
        title: 'Bad type',
        steps: [
          {
            id: 'choose',
            title: 'Choose',
            kind: 'manual',
            outputs: [{ ...port, type: 'number' }],
          },
        ],
      },
      'codex',
    ),
  );
});
