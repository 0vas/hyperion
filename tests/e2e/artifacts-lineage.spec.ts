import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
test('step artifacts preview safely and a finished graph links to a requested new beginning live', async ({
  page,
  request,
}) => {
  const headers = {
    authorization: `Bearer ${JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')).agentToken}`,
  };
  const create = async (data: unknown) => {
    const r = await request.post('/api/runs', { headers, data });
    expect(r.status()).toBe(201);
    return r.json();
  };
  const plan = {
    title: 'Guía con artefacto',
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
  const run = await create({ commandId: crypto.randomUUID(), plan });
  const command = async (type: string) => {
    const r = await request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: {
        type,
        stepId: 'write',
        attempt: type === 'complete' ? 1 : undefined,
        message: 'Guía preparada',
        commandId: crypto.randomUUID(),
      },
    });
    expect(r.ok()).toBe(true);
  };
  await command('start');
  await page.goto(`/?run=${run.id}`);
  const uploaded = await request.post(`/api/runs/${run.id}/artifacts`, {
    headers,
    data: {
      commandId: 'upload',
      stepId: 'write',
      attempt: 1,
      name: 'guia.html',
      mediaType: 'text/html',
      contentBase64: Buffer.from(
        '<h1>Guía real</h1><script>window.attacked=true</script>',
      ).toString('base64'),
    },
  });
  expect(uploaded.ok()).toBe(true);
  await page
    .getByRole('button', { name: 'Ver artefactos: Preparar guía', exact: true })
    .click();
  await expect(page.getByTestId('resultado-stage')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Preparar guía', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Artefactos 1' }),
  ).toBeVisible();
  const resultado = page.getByTestId('resultado-stage');
  await resultado
    .getByRole('button', { name: 'Ver artefacto', exact: true })
    .click();
  await expect(resultado.locator('.artifact-preview-stage')).toBeVisible();
  const iframe = resultado.locator('iframe.artifact-html-frame');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute('sandbox', '');
  await expect(
    resultado.getByText(
      'Vista previa inerte: sin JavaScript ni red. El aspecto puede diferir del navegador completo.',
      { exact: true },
    ),
  ).toBeVisible();
  const preview = resultado.frameLocator('iframe.artifact-html-frame');
  await expect(
    preview.getByRole('heading', { name: 'Guía real' }),
  ).toBeVisible();
  expect(await page.evaluate(() => 'attacked' in window)).toBe(false);
  await resultado
    .getByRole('button', { name: 'Código fuente', exact: true })
    .click();
  await expect(resultado.locator('.artifact-text')).toContainText(
    '<h1>Guía real</h1>',
  );
  await expect(
    resultado.getByText(
      'Vista previa inerte: sin JavaScript ni red. El aspecto puede diferir del navegador completo.',
      { exact: true },
    ),
  ).toHaveCount(0);
  await resultado
    .getByRole('button', { name: 'Vista previa', exact: true })
    .click();
  await expect(iframe).toBeVisible();
  await expect(
    resultado.getByText(
      'Vista previa inerte: sin JavaScript ni red. El aspecto puede diferir del navegador completo.',
      { exact: true },
    ),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await resultado.getByRole('link', { name: 'Descargar', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('guia.html');
  await page
    .getByRole('button', { name: 'Cerrar resultado', exact: true })
    .click();
  await command('complete');
  await expect(page.getByTestId('run-status')).toHaveText('Completado');
  // Aligned SVG paths have zero bounding-box width; assert drawn geometry instead.
  await expect(
    page.locator(
      '.react-flow__edge[data-id="lineage:new:end"] path.react-flow__edge-path',
    ),
  ).toHaveAttribute('d', /^M.+/);
  await page
    .getByRole('button', { name: 'Continuar desde aquí', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Un nuevo inicio', exact: true }),
  ).toBeVisible();
  const copy = page.getByRole('button', {
    name: 'Copiar petición para el chat',
    exact: true,
  });
  await expect(copy).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Enviar', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Enviar al chat', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      'Pega la petición en el chat conectado. El envío automático al chat requiere un conector de envío; MCP solo no despierta el chat.',
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByLabel('¿Qué quieres hacer ahora?')
    .fill('Ahora quiero traducirla');
  await expect(copy).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Enviar', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar popup', exact: true }).click();
  const next = await create({
    commandId: 'new-cycle',
    parentRunId: run.id,
    plan: {
      ...plan,
      title: 'Traducir guía',
      request: 'Ahora quiero traducirla',
    },
  });
  // The parent revision remains unchanged; its projected graph must still update over SSE.
  await page
    .getByRole('button', {
      name: 'Abrir recorrido: Traducir guía',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Traducir guía', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Abrir recorrido: Guía con artefacto',
      exact: true,
    }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get('run')).toBe(next.id);
  await expect(
    page.locator(
      '.react-flow__edge[data-id="lineage:' +
        run.id +
        ':begin"] path.react-flow__edge-path',
    ),
  ).toHaveAttribute('d', /^M.+/);
  for (const orientation of ['vertical', 'horizontal']) {
    if (orientation === 'horizontal')
      await page
        .getByRole('button', { name: 'Ver flujo horizontal', exact: true })
        .click();
    await page
      .getByRole('button', { name: 'Vista general', exact: true })
      .click();
    await page.screenshot({ path: `test-results/lineage-${orientation}.png` });
  }
  await page
    .getByRole('button', {
      name: 'Abrir recorrido: Guía con artefacto',
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole('button', {
      name: 'Abrir recorrido: Traducir guía',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Ver paso: Preparar guía', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Artefactos del paso' }),
  ).toContainText('guia.html');
});

test('English artifacts and continuation are usable on narrow light and dark layouts', async ({
  browser,
  request,
}) => {
  const headers = {
    authorization: `Bearer ${JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')).agentToken}`,
  };
  const created = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'My deliverables',
        steps: [{ id: 'work', title: 'Prepare file', kind: 'agent' }],
      },
    },
  });
  const run = await created.json();
  const command = async (type: string) => {
    const r = await request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: {
        type,
        stepId: 'work',
        commandId: crypto.randomUUID(),
        message: 'Prepared file',
      },
    });
    expect(r.ok()).toBe(true);
  };
  await command('start');
  const artifact = await request.post(`/api/runs/${run.id}/artifacts`, {
    headers,
    data: {
      commandId: 'text',
      stepId: 'work',
      attempt: 1,
      name: 'report.md',
      mediaType: 'text/markdown',
      contentBase64: Buffer.from('# My report').toString('base64'),
    },
  });
  expect(artifact.ok()).toBe(true);
  await command('complete');
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      locale: 'en-US',
      colorScheme,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4318/?run=${run.id}`);
    await page
      .getByRole('button', {
        name: 'View artifacts: Prepare file',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', { name: 'Step artifacts' }),
    ).toContainText('report.md');
    await page
      .getByRole('button', { name: 'Preview artifact', exact: true })
      .click();
    await expect(page.locator('.preview-note-body')).toHaveText('# My report');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/artifacts-en-${colorScheme}.png`,
    });
    expect(
      (await new AxeBuilder({ page }).include('.step-artifacts').analyze())
        .violations,
    ).toEqual([]);
    await page
      .getByRole('button', { name: 'Close result', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Continue from here', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'A new beginning', exact: true }),
    ).toBeVisible();
    await context.close();
  }
});
