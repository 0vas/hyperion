import { test, expect } from '@playwright/test';
import { chooseFromAppMenu } from './app-menu';
import { readFileSync } from 'node:fs';
const headers = () => ({
  authorization: `Bearer ${JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')).agentToken}`,
});

test('checklist numbers and completion icons stay centered beside the first label line', async ({
  page,
  request,
}) => {
  const labels = [
    'Nombre del proyecto y qué hace',
    'A quién va dirigida la guía',
    'Información del proyecto: carpeta, enlaces o resumen',
  ] as const;
  const response = await request.post('/api/runs', {
    headers: headers(),
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Numeración del formulario',
        steps: [
          {
            id: 'details',
            title: 'Conocer el proyecto',
            kind: 'manual',
            outputs: labels.map((description, index) => ({
              name: `detail${index}`,
              type: 'string',
              required: true,
              description,
            })),
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/?run=${run.id}`);
    await page
      .getByRole('button', {
        name: 'Ver paso: Conocer el proyecto',
        exact: true,
      })
      .click();
    for (const width of [700, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByLabel(labels[0], { exact: true }).fill('');
      const badges = page.locator('.decision-check');
      await expect(badges).toHaveText(['1', '2', '3']);
      const geometry = () =>
        badges.evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(element);
            const content =
              element.querySelector('svg')?.getBoundingClientRect() ??
              range.getBoundingClientRect();
            const label = element.parentElement!.querySelector('label')!;
            return {
              x: content.x + content.width / 2 - (box.x + box.width / 2),
              y: content.y + content.height / 2 - (box.y + box.height / 2),
              labelOffset:
                box.y +
                box.height / 2 -
                (label.getBoundingClientRect().y +
                  parseFloat(getComputedStyle(label).lineHeight) / 2),
              width: box.width,
            };
          }),
        );
      for (const badge of await geometry()) {
        expect(Math.abs(badge.x)).toBeLessThan(1);
        expect(Math.abs(badge.y)).toBeLessThan(2);
        expect(Math.abs(badge.labelOffset)).toBeLessThan(1);
        expect(badge.width).toBe(22);
      }
      const before = await badges.first().boundingBox();
      await page
        .getByLabel(labels[0], { exact: true })
        .fill('Proyecto de ejemplo');
      await expect(badges.first().locator('svg')).toBeVisible();
      const completed = (await geometry())[0]!;
      expect(Math.abs(completed.x)).toBeLessThan(1);
      expect(Math.abs(completed.y)).toBeLessThan(1);
      // Resultado may scroll the focused field into view; keep horizontal lock and size.
      const after = await badges.first().boundingBox();
      expect(after?.width).toBe(before?.width);
      expect(Math.abs((after?.x || 0) - (before?.x || 0))).toBeLessThan(1);
      expect(Math.abs((after?.y || 0) - (before?.y || 0))).toBeLessThan(16);
      await page.screenshot({
        path: `test-results/checklist-${theme}-${width}.png`,
      });
    }
  }
});

test('a compact decision reveals help and optional detail without losing a negative answer', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/runs', {
    headers: headers(),
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Formulario claro',
        steps: [
          {
            id: 'review',
            title: 'Revisar el recorrido',
            kind: 'manual',
            interaction: {
              question: '¿Entiendes el siguiente paso?',
              context:
                'Abre un trabajo para revisar sus pasos. Comprueba quién realiza cada acción y revisa las opciones de Ajustes. Después vuelve a esta pregunta y elige la respuesta que mejor describe tu experiencia.',
              next: 'El agente revisará tu decisión y adaptará la explicación si hace falta.',
            },
            outputs: [
              {
                name: 'clear',
                type: 'boolean',
                required: true,
                description: 'Claridad del recorrido',
                form: { hint: 'Elige la opción que describe tu experiencia.' },
              },
              {
                name: 'notes',
                type: 'string',
                description: 'Qué cambiarías',
                form: {
                  placeholder:
                    'Por ejemplo: explicar mejor quién realiza la tarea',
                },
              },
            ],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.setViewportSize({ width: 540, height: 860 });
  await page.goto(`/?run=${run.id}`);
  const open = () =>
    page
      .getByRole('button', {
        name: 'Ver paso: Revisar el recorrido',
        exact: true,
      })
      .click();
  await open();
  await expect(
    page.getByRole('heading', { name: '¿Entiendes el siguiente paso?' }),
  ).toHaveCount(1);
  await expect(page.locator('.checklist-progress')).toHaveCount(0);
  await expect(page.locator('.step-meta')).not.toBeVisible();
  await expect(
    page.getByPlaceholder('Por ejemplo: explicar mejor quién realiza la tarea'),
  ).not.toBeVisible();
  const save = page.getByRole('button', {
    name: 'Guardar elección',
    exact: true,
  });
  await expect(save).toBeDisabled();
  await page.getByText('Ver instrucciones', { exact: true }).click();
  await expect(
    page.getByText('Abre un trabajo', { exact: false }),
  ).toBeVisible();
  await page.getByText('Ver instrucciones', { exact: true }).click();
  await page.getByRole('radio', { name: 'No', exact: true }).check();
  await expect(save).toBeEnabled();
  const optional = page.locator('.optional-fields summary');
  await optional.focus();
  await page.keyboard.press('Enter');
  const notes = page.getByPlaceholder(
    'Por ejemplo: explicar mejor quién realiza la tarea',
  );
  await notes.fill('Necesito saber quién realiza cada tarea.');
  await optional.click();
  await optional.click();
  await expect(notes).toHaveValue('Necesito saber quién realiza cada tarea.');
  await optional.click();
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const theme of ['light', 'dark'] as const) {
    await page.keyboard.press('Escape');
    await chooseFromAppMenu(page, 'Ajustes');
    await page.getByLabel('Tema', { exact: true }).selectOption(theme);
    await page.keyboard.press('Escape');
    await open();
    await page.setViewportSize({
      width: theme === 'light' ? 540 : 390,
      height: 860,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    const box = await save.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(860);
    await page.screenshot({ path: `test-results/form-${theme}.png` });
  }
  await save.click();
  const updated = await (
    await request.get(`/api/runs/${run.id}`, { headers: headers() })
  ).json();
  expect(updated.steps[0].outputValues).toEqual({
    clear: false,
    notes: 'Necesito saber quién realiza cada tarea.',
  });
});

test('field hints and inline validation explain what to enter before submitting typed data', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/runs', {
    headers: headers(),
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Datos claros',
        steps: [
          {
            id: 'data',
            title: 'Preparar datos',
            kind: 'manual',
            outputs: [
              {
                name: 'count',
                type: 'number',
                required: true,
                description: 'Cantidad de ejemplos',
                form: {
                  hint: 'Usa 0 si no necesitas ejemplos.',
                  placeholder: 'Ej. 3',
                },
              },
              {
                name: 'config',
                type: 'object',
                required: true,
                description: 'Configuración',
                form: { hint: 'Datos proporcionados por tu herramienta.' },
              },
            ],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  await page
    .getByRole('button', { name: 'Ver paso: Preparar datos', exact: true })
    .click();
  const count = page.getByLabel('Cantidad de ejemplos', { exact: true });
  await expect(count).toHaveAttribute('aria-describedby', /hint/);
  await count.fill('0');
  const config = page.getByLabel('Configuración', { exact: true });
  await config.fill('[]');
  await config.press('Tab');
  await expect(config).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveText(
    'Usa un objeto válido entre llaves { }.',
  );
  await expect(
    page.getByRole('button', { name: 'Guardar elección' }),
  ).toBeDisabled();
  await config.fill('{"tema":"claro"}');
  await config.press('Tab');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar elección' }).click();
  const updated = await (
    await request.get(`/api/runs/${run.id}`, { headers: headers() })
  ).json();
  expect(updated.steps[0].outputValues).toEqual({
    count: 0,
    config: { tema: 'claro' },
  });
});

test('known choices use a dropdown and the saved decision has a readable handoff', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/runs', {
    headers: headers(),
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Product choice',
        steps: [
          {
            id: 'choose',
            title: 'Elegir producto',
            kind: 'manual',
            outputs: [
              {
                name: 'product',
                type: 'string',
                required: true,
                description: 'Producto',
                form: {
                  options: [
                    { value: 'idea', label: 'IntelliJ IDEA' },
                    { value: 'pycharm', label: 'PyCharm' },
                  ],
                },
              },
            ],
          },
          {
            id: 'prepare',
            title: 'Preparar guía',
            kind: 'agent',
            dependencies: ['choose'],
            inputs: [
              {
                name: 'product',
                type: 'string',
                required: true,
                source: { stepId: 'choose', output: 'product' },
              },
            ],
          },
        ],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const run = await response.json();
  await page.setViewportSize({ width: 540, height: 900 });
  await page.goto(`/?run=${run.id}`);
  await page
    .getByRole('button', { name: 'Ver paso: Elegir producto', exact: true })
    .click();
  const select = page.getByRole('combobox', { name: 'Producto', exact: true });
  await expect(select).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Guardar elección', exact: true }),
  ).toBeDisabled();
  await select.selectOption('idea');
  await page
    .getByRole('button', { name: 'Guardar elección', exact: true })
    .click();
  const updated = await (
    await request.get(`/api/runs/${run.id}`, { headers: headers() })
  ).json();
  expect(updated.steps[0].outputValues).toEqual({ product: 'idea' });
  expect(updated.steps[1].status).toBe('ready');
  await page
    .getByRole('button', { name: 'Ver paso: Preparar guía', exact: true })
    .click();
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(
      page
        .locator('.step-hint')
        .getByRole('button', { name: 'Copiar continuación', exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include('.step-hint')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `test-results/handoff-${theme}.png` });
  }
});
