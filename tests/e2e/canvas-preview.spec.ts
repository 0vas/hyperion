import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('canvas preview tiles select the producer and collapse under 900px', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const headers = {
    authorization: `Bearer ${JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')).agentToken}`,
  };
  const plan = {
    title: 'Guía con mosaico',
    profile: 'bpmn-lite',
    request: 'Prepara la guía',
    steps: [
      { id: 'begin', title: 'Inicio', kind: 'start' },
      {
        id: 'write',
        title: 'Preparar guía',
        kind: 'agent',
        dependencies: ['begin'],
      },
      { id: 'end', title: 'Fin', kind: 'end', dependencies: ['write'] },
    ],
  };
  const created = await request.post('/api/runs', {
    headers,
    data: { commandId: crypto.randomUUID(), plan },
  });
  expect(created.status()).toBe(201);
  const run = await created.json();
  const command = async (type: string) => {
    const response = await request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: {
        type,
        stepId: 'write',
        attempt: type === 'complete' ? 1 : undefined,
        message: 'Guía preparada',
        commandId: crypto.randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
  };
  await command('start');
  const uploaded = await request.post(`/api/runs/${run.id}/artifacts`, {
    headers,
    data: {
      commandId: 'upload-canvas-preview',
      stepId: 'write',
      attempt: 1,
      name: 'guia.html',
      mediaType: 'text/html',
      contentBase64: Buffer.from(
        '<h1>Guía en canvas</h1><script>window.attacked=true</script>',
      ).toString('base64'),
    },
  });
  expect(uploaded.ok()).toBe(true);
  const officeUploaded = await request.post(`/api/runs/${run.id}/artifacts`, {
    headers,
    data: {
      commandId: 'upload-canvas-preview-presentation',
      stepId: 'write',
      attempt: 1,
      name: 'guia.pptx',
      mediaType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      contentBase64: Buffer.from('presentation bytes').toString('base64'),
    },
  });
  expect(officeUploaded.ok()).toBe(true);
  await command('complete');
  await page.goto(`/?run=${run.id}`);
  const tile = page.getByTestId('rf__node-preview:write');
  await expect(tile).toBeVisible();
  await expect(
    tile.getByRole('group', { name: 'Vista previa del paso Preparar guía' }),
  ).toBeVisible();
  await expect(tile.locator('.artifact-preview-stage')).toBeVisible();
  await expect(tile).toHaveCSS('width', '480px');
  const frame = tile.locator('iframe.preview-tile-html-frame');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(
    tile.getByText(
      'Vista previa inerte: sin JavaScript ni red. El aspecto puede diferir del navegador completo.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => 'attacked' in window)).toBe(false);
  const officeBubble = page.locator(
    '.artifact-download-bubble .artifact-bubble-action[download="guia.pptx"]',
  );
  await expect(officeBubble).toBeVisible();
  await expect(officeBubble.locator('.preview-office-icon')).toBeVisible();
  await expect(officeBubble).toHaveAttribute('download', 'guia.pptx');
  await expect(officeBubble).toHaveAttribute(
    'href',
    new RegExp(`/api/runs/${run.id}/artifacts/`),
  );
  await expect(
    page.locator('[data-testid^="rf__edge-preview-tether:write:"]'),
  ).toHaveCount(2);
  const officeNode = page.locator('.react-flow__node').filter({
    has: officeBubble,
  });
  const officeDrag = officeNode.locator('.artifact-bubble-drag');
  await expect(officeDrag).toBeVisible();
  const officeTransform = () => officeNode.evaluate((el) => el.style.transform);
  const initialOfficeTransform = await officeTransform();
  const officeDragBox = (await officeDrag.boundingBox())!;
  await page.mouse.move(
    officeDragBox.x + officeDragBox.width / 2,
    officeDragBox.y + officeDragBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    officeDragBox.x + officeDragBox.width / 2 + 48,
    officeDragBox.y + officeDragBox.height / 2 + 36,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(officeTransform).not.toBe(initialOfficeTransform);
  await tile
    .getByRole('button', { name: 'Ocultar artefacto', exact: true })
    .click();
  const hiddenBubble = page.locator('.artifact-preview-bubble');
  await expect(hiddenBubble).toBeVisible();
  await expect(tile.locator('.preview-tile')).toHaveCount(0);
  const hiddenNode = page.locator('.react-flow__node').filter({
    has: hiddenBubble,
  });
  const hiddenTransform = () => hiddenNode.evaluate((el) => el.style.transform);
  const initialHiddenTransform = await hiddenTransform();
  const hiddenDrag = hiddenNode.locator('.artifact-bubble-drag');
  const hiddenDragBox = (await hiddenDrag.boundingBox())!;
  await page.mouse.move(
    hiddenDragBox.x + hiddenDragBox.width / 2,
    hiddenDragBox.y + hiddenDragBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    hiddenDragBox.x + hiddenDragBox.width / 2 + 36,
    hiddenDragBox.y + hiddenDragBox.height / 2 + 28,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect.poll(hiddenTransform).not.toBe(initialHiddenTransform);
  await expect(
    page.locator('[data-testid^="rf__edge-preview-tether:write:"]'),
  ).toHaveCount(2);
  await hiddenBubble
    .getByRole('button', { name: 'Mostrar artefacto', exact: true })
    .click();
  await expect(tile.locator('.preview-tile')).toBeVisible();
  await tile.locator('.preview-tile-chrome-main').click();
  const resultado = page.getByTestId('resultado-stage');
  await expect(resultado).toBeVisible();
  await expect(
    resultado.getByRole('heading', { name: 'Preparar guía', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Cerrar resultado', exact: true })
    .click();
  await expect(resultado).toHaveCount(0);
  await expect(tile).toBeVisible();
  await tile
    .getByRole('button', { name: 'Ampliar vista', exact: true })
    .click();
  const shell = page.locator('.preview-open-shell');
  await expect(shell).toBeVisible();
  await expect(shell).toHaveCSS('position', 'fixed');
  const box = await shell.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(1280);
  expect(box!.height).toBeGreaterThanOrEqual(800);
  const expandedFrame = shell.locator('iframe.artifact-html-frame');
  await expect(expandedFrame).toBeVisible();
  await expect(shell.locator('.preview-open-shell-chrome')).toHaveCount(0);
  await expect(
    shell.getByRole('button', { name: 'Volver', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await expandedFrame.boundingBox())!.height)
    .toBeGreaterThan(760);
  await expect
    .poll(async () => (await expandedFrame.boundingBox())!.width)
    .toBeGreaterThan(1240);
  await shell.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(shell).toHaveCount(0);
  await expect(resultado).toBeVisible();
  await page.setViewportSize({ width: 880, height: 800 });
  await expect
    .poll(async () => page.evaluate(() => window.innerWidth))
    .toBeLessThan(900);
  await expect(page.getByTestId('rf__node-preview:write')).toHaveCount(0);
  await resultado
    .getByRole('button', { name: 'Artefactos', exact: true })
    .click();
  await resultado
    .getByRole('button', { name: 'Ver artefacto', exact: true })
    .click();
  await expect(
    resultado.getByText(
      'Vista previa inerte: sin JavaScript ni red. El aspecto puede diferir del navegador completo.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(resultado.locator('iframe.artifact-html-frame')).toBeVisible();
});
