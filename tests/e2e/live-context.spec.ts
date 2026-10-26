import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test('SSE carries real logs and context without polling; split canvas explains continuation', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  const headers = {
    authorization: `Bearer ${JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')).agentToken}`,
  };
  const response = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Live context test',
        request: 'Prepare a team report',
        context: { audience: 'Design team' },
        steps: [
          {
            id: 'a',
            title: 'Research',
            kind: 'agent',
            outputs: [{ name: 'report', type: 'string', required: true }],
          },
          {
            id: 'b',
            title: 'Write report',
            kind: 'agent',
            dependencies: ['a'],
            inputs: [
              {
                name: 'audience',
                type: 'string',
                contextKey: 'audience',
                required: true,
              },
            ],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  const command = async (data: unknown) => {
    const r = await request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: { ...(data as object), commandId: crypto.randomUUID() },
    });
    expect(r.status()).toBe(200);
  };
  // No snapshot polling can satisfy this test: only the event stream is available.
  await page.route('**/api/runs', (route) => route.abort());
  await page.goto(`/?run=${run.id}`);
  await expect(
    page.getByRole('heading', { name: 'Live context test' }),
  ).toBeVisible();
  await expect(page.locator('.canvas-next')).toContainText(
    'Copiar continuación',
  );
  await expect(
    page.locator('.node-kind-icon .harness-icon[aria-label="Codex"]'),
  ).toHaveCount(2);
  await command({ type: 'start', stepId: 'a' });
  await page.getByRole('button', { name: 'Ver trazas: Research' }).click();
  await command({
    type: 'log',
    stepId: 'a',
    message: 'Verified three source files',
    trace: { kind: 'observation', tool: 'read' },
  });
  await expect(page.locator('.trace-view')).toContainText(
    'Verified three source files',
  );
  await expect(
    page.getByRole('button', {
      name: 'Ver trazas: Research',
      includeHidden: true,
    }),
  ).toHaveAttribute('data-receiving', 'true');
  await page
    .getByRole('button', { name: 'Cerrar resultado', exact: true })
    .click();
  await command({
    type: 'complete',
    stepId: 'a',
    message: 'Sources checked',
    outputs: { report: 'Verified findings' },
  });
  await expect(
    page.getByRole('button', { name: 'Ver datos: Write report' }),
  ).toHaveAttribute('data-receiving', 'true');
  await page.getByRole('button', { name: 'Ver datos: Write report' }).click();
  await page
    .locator('.context-sources summary')
    .filter({ hasText: 'Research' })
    .click();
  await expect(page.locator('.context-sources')).toContainText(
    'Verified findings',
  );
  await expect(page.locator('.contract-view')).toContainText('Design team');
  await expect(
    page.getByRole('button', {
      name: 'Ver datos: Write report',
      includeHidden: true,
    }),
  ).toHaveAttribute('data-receiving', 'false', { timeout: 6000 });
  await page.screenshot({ path: 'test-results/context-split.png' });
});
