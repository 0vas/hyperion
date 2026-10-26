import { test, expect } from '@playwright/test';
import { chooseFromAppMenu } from './app-menu';
import { readFileSync } from 'node:fs';
test.use({ locale: 'en-US' });
test('system language, saved choice and live switching preserve workflow content and drafts', async ({
  page,
  request,
}) => {
  const headers = {
    authorization: `Bearer ${JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')).agentToken}`,
  };
  const response = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Mi flujo original',
        steps: [
          {
            id: 'choice',
            title: 'Ajustes',
            kind: 'manual',
            outputs: [
              {
                name: 'text',
                description: 'Tu respuesta original',
                type: 'string',
                required: true,
              },
            ],
          },
          {
            id: 'work',
            title: 'Continuar',
            kind: 'agent',
            dependencies: ['choice'],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Hyperion — Your work, step by step');
  await page
    .getByRole('button', { name: 'View step: Ajustes', exact: true })
    .click();
  await page
    .getByLabel('Tu respuesta original', { exact: true })
    .fill('Guardar elección — texto del usuario');
  await expect(
    page.getByRole('button', { name: 'Save choice', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Close result', exact: true }).click();
  await chooseFromAppMenu(page, 'Settings');
  await page
    .getByRole('combobox', { name: 'Language', exact: true })
    .selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(
    page.getByRole('heading', { name: 'Ajustes', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar popup', exact: true }).click();
  await page
    .getByRole('button', { name: 'Ver paso: Ajustes', exact: true })
    .click();
  await expect(
    page.getByLabel('Tu respuesta original', { exact: true }),
  ).toHaveValue('Guardar elección — texto del usuario');
  await expect(
    page.getByRole('button', { name: 'Guardar elección', exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await chooseFromAppMenu(page, 'Ajustes');
  await page
    .getByRole('combobox', { name: 'Idioma', exact: true })
    .selectOption('en');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('[data-id="work"]')).toContainText('Pending');
  await expect(page.locator('[data-id="work"]')).toContainText('Continuar');
  await page
    .getByRole('button', { name: 'View step: Ajustes', exact: true })
    .click();
  await page
    .getByLabel('Tu respuesta original', { exact: true })
    .fill('Mi respuesta');
  await page.getByRole('button', { name: 'Save choice', exact: true }).click();
  await expect(page.locator('[data-id="work"]')).toContainText(
    'Waiting for agent',
  );
  const saved = await (
    await request.get(`/api/runs/${run.id}`, { headers })
  ).json();
  expect(saved.steps[0].outputValues.text).toBe('Mi respuesta');
  expect(saved.steps.map((s: { title: string }) => s.title)).toEqual([
    'Ajustes',
    'Continuar',
  ]);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await chooseFromAppMenu(page, 'Settings');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('combobox', { name: 'Language', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/language-${colorScheme}.png` });
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
  }
});
