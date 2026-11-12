import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Step inspect docks in Resultado (aside), not a modal dialog. */
const resultado = (page: Page) => page.getByTestId('resultado-stage');

const credentials = () =>
  JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')) as {
    agentToken: string;
    humanToken: string;
  };

const agentHeaders = () => ({
  authorization: `Bearer ${credentials().agentToken}`,
});
const humanHeaders = () => ({
  authorization: `Bearer ${credentials().humanToken}`,
});

async function createSubmittedRun(
  request: {
    post: (
      url: string,
      options: { headers: Record<string, string>; data: unknown },
    ) => Promise<{ status: () => number; json: () => Promise<any> }>;
  },
  options?: { completeAgent?: boolean },
) {
  const plan = {
    title: 'Corregir respuesta tipada',
    steps: [
      {
        id: 'answer',
        title: 'Elegir opción',
        kind: 'manual',
        outputs: [
          {
            name: 'choice',
            type: 'string',
            required: true,
            description: 'Opción elegida',
            form: {
              options: [
                { value: 'first', label: 'Primera' },
                { value: 'second', label: 'Segunda' },
              ],
            },
          },
        ],
      },
      {
        id: 'work',
        title: 'Trabajo del agente',
        kind: 'agent',
        dependencies: ['answer'],
        inputs: [
          {
            name: 'choice',
            type: 'string',
            required: true,
            source: { stepId: 'answer', output: 'choice' },
          },
        ],
      },
      {
        id: 'review',
        title: 'Revisar resultado',
        kind: 'approval',
        dependencies: ['work'],
      },
    ],
  };
  const created = await request.post('/api/runs', {
    headers: agentHeaders(),
    data: { plan, commandId: crypto.randomUUID() },
  });
  expect(created.status()).toBe(201);
  let run = await created.json();
  run = await (
    await request.post(`/api/runs/${run.id}/commands`, {
      headers: humanHeaders(),
      data: {
        type: 'submit',
        stepId: 'answer',
        outputs: { choice: 'first' },
        expectedRevision: run.revision,
        commandId: crypto.randomUUID(),
      },
    })
  ).json();
  if (options?.completeAgent) {
    run = await (
      await request.post(`/api/runs/${run.id}/commands`, {
        headers: agentHeaders(),
        data: {
          type: 'start',
          stepId: 'work',
          commandId: crypto.randomUUID(),
        },
      })
    ).json();
    run = await (
      await request.post(`/api/runs/${run.id}/commands`, {
        headers: agentHeaders(),
        data: {
          type: 'complete',
          stepId: 'work',
          message: 'Efecto externo registrado',
          attempt: 1,
          commandId: crypto.randomUUID(),
        },
      })
    ).json();
  }
  return run;
}

test('happy amend updates typed outputs without irreversible dialog', async ({
  page,
  request,
}) => {
  const run = await createSubmittedRun(request);
  await page.goto(`/?run=${run.id}`);
  await page
    .getByRole('button', { name: 'Ver paso: Elegir opción', exact: true })
    .click();
  const panel = resultado(page);
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Corregir respuesta' }).click();
  await expect(
    panel.getByRole('heading', { name: 'Corregir la respuesta guardada' }),
  ).toBeVisible();
  await panel
    .getByRole('combobox', { name: 'Opción elegida', exact: true })
    .selectOption('second');
  await panel.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Confirmar efectos irreversibles' }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Corrección guardada/, { exact: false }),
  ).toBeVisible();
  const refreshed = await (
    await request.get(`/api/runs/${run.id}`, { headers: humanHeaders() })
  ).json();
  expect(refreshed.steps[0].outputValues).toEqual({ choice: 'second' });
});

test('policy C shows irreversible list and requires confirm before amend', async ({
  page,
  request,
}) => {
  const run = await createSubmittedRun(request, { completeAgent: true });
  await page.goto(`/?run=${run.id}`);
  await page
    .getByRole('button', { name: 'Ver paso: Elegir opción', exact: true })
    .click();
  const panel = resultado(page);
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Corregir respuesta' }).click();
  await panel
    .getByRole('combobox', { name: 'Opción elegida', exact: true })
    .selectOption('second');
  await panel.getByRole('button', { name: 'Guardar corrección' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Confirmar efectos irreversibles',
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.locator('.amend-irreversible-list strong', {
      hasText: 'Trabajo del agente',
    }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar y corregir' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(/Corrección guardada/, { exact: false }),
  ).toBeVisible();
  const refreshed = await (
    await request.get(`/api/runs/${run.id}`, { headers: humanHeaders() })
  ).json();
  expect(refreshed.steps[0].outputValues).toEqual({ choice: 'second' });
  expect(refreshed.steps[1].status).toBe('ready');
});

test('amend surfaces revision conflict when the run changed', async ({
  page,
  request,
}) => {
  // Keep the canvas on the revision it loaded; block live SSE updates.
  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        connection: 'keep-alive',
      },
      body: ': e2e-block-live-updates\n\n',
    });
  });
  const run = await createSubmittedRun(request);
  await page.goto(`/?run=${run.id}`);
  await page
    .getByRole('button', { name: 'Ver paso: Elegir opción', exact: true })
    .click();
  const panel = resultado(page);
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Corregir respuesta' }).click();
  await panel
    .getByRole('combobox', { name: 'Opción elegida', exact: true })
    .selectOption('second');
  const bumped = await request.post(`/api/runs/${run.id}/commands`, {
    headers: humanHeaders(),
    data: {
      type: 'amend',
      stepId: 'answer',
      outputs: { choice: 'first' },
      message: 'Competing correction',
      expectedRevision: run.revision,
      commandId: crypto.randomUUID(),
    },
  });
  expect(bumped.status()).toBe(200);
  await panel.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText:
        'El flujo cambió mientras decidías. Revisa el estado actualizado y vuelve a intentarlo.',
    }),
  ).toBeVisible();
});
