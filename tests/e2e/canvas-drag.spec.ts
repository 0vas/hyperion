import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('a long flow stays readable; dragging persists without changing execution and can be reset', async ({
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
        title: 'Revisar entregables',
        steps: Array.from({ length: 7 }, (_, i) => ({
          id: `step${i}`,
          title: `Entregable ${i + 1}`,
          kind: 'agent',
          dependencies: i ? [`step${i - 1}`] : [],
        })),
      },
    },
  });
  const run = await response.json();
  await page.setViewportSize({ width: 506, height: 980 });
  await page.goto(`/?run=${run.id}`);
  const node = page.locator('.react-flow__node[data-id="step0"]');
  await expect(node).toBeVisible();
  await expect
    .poll(async () => (await node.boundingBox())!.width)
    .toBeGreaterThanOrEqual(220);
  const transform = () => node.evaluate((el) => el.style.transform);
  const initial = await transform();
  const snapshot = await (
    await request.get(`/api/runs/${run.id}`, { headers })
  ).json();
  const handle = node.locator('.node-drag-handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 65,
    box.y + box.height / 2 + 55,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect.poll(transform).not.toBe(initial);
  await expect(
    page.getByRole('button', { name: 'Ordenar flujo', exact: true }),
  ).toBeEnabled();
  const moved = await transform();
  expect(
    await (await request.get(`/api/runs/${run.id}`, { headers })).json(),
  ).toEqual(snapshot);
  // A new snapshot must not discard a user's arrangement.
  await request.post(`/api/runs/${run.id}/commands`, {
    headers,
    data: { type: 'start', stepId: 'step0', commandId: crypto.randomUUID() },
  });
  await expect(node).toContainText('En curso');
  await expect.poll(transform).toBe(moved);
  await node.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await expect.poll(transform).not.toBe(moved);
  const keyboardMoved = await transform();
  await page.waitForTimeout(300); // local layout persistence debounce
  await page.reload();
  await expect.poll(transform).toBe(keyboardMoved);
  await page
    .getByRole('button', { name: 'Ordenar flujo', exact: true })
    .click();
  await expect.poll(transform).toBe(initial);
  await expect(
    page.getByRole('button', { name: 'Ordenar flujo', exact: true }),
  ).toBeDisabled();
  await expect(node).toContainText('En curso');
  const camera = await page
    .locator('.react-flow__viewport')
    .getAttribute('style');
  for (let i = 0; i < 7; i++) {
    for (const type of i === 0 ? ['complete'] : ['start', 'complete']) {
      const result = await request.post(`/api/runs/${run.id}/commands`, {
        headers,
        data: {
          type,
          stepId: `step${i}`,
          commandId: crypto.randomUUID(),
          message: 'Entregable listo',
        },
      });
      expect(result.ok()).toBe(true);
    }
  }
  await expect(page.getByTestId('run-status')).toHaveText('Completado');
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute(
    'style',
    camera!,
  );
  await page.screenshot({ path: 'test-results/canvas-readable-drag.png' });
  await page
    .getByRole('button', { name: 'Vista general', exact: true })
    .click();
  await expect(
    page.locator('.react-flow__node[data-id="step6"]'),
  ).toBeInViewport();
  await page
    .getByRole('button', { name: 'Ver paso: Entregable 1', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cerrar resultado', exact: true }),
  ).toBeVisible();
});
