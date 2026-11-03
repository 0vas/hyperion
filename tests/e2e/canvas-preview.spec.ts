import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const complexHtmlFixture = readFileSync(
  'tests/fixtures/complex-preview.html',
  'utf8',
);

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
  const longHtmlName = 'demo-hyperion-guia-de-contenido-final.html';
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
      name: longHtmlName,
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
      name: 'demo-hyperion-presentacion-final.pptx',
      mediaType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      contentBase64: Buffer.from('presentation bytes').toString('base64'),
    },
  });
  expect(officeUploaded.ok()).toBe(true);
  const spreadsheetUploaded = await request.post(
    `/api/runs/${run.id}/artifacts`,
    {
      headers,
      data: {
        commandId: 'upload-canvas-preview-spreadsheet',
        stepId: 'write',
        attempt: 1,
        name: 'presupuesto-anual-de-licencias.xlsx',
        mediaType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: Buffer.from('spreadsheet bytes').toString('base64'),
      },
    },
  );
  expect(spreadsheetUploaded.ok()).toBe(true);
  await command('complete');
  await page.goto(`/?run=${run.id}`);
  const tile = page.getByTestId('rf__node-preview:write');
  await expect(tile).toBeVisible();
  const initialBubble = tile.locator('.artifact-preview-bubble');
  await expect(initialBubble).toBeVisible();
  await expect(initialBubble.locator('.preview-artifact-icon')).toHaveAttribute(
    'data-kind',
    'markup',
  );
  const showArtifact = initialBubble.getByRole('button', {
    name: `Mostrar artefacto: ${longHtmlName}`,
  });
  await expect(initialBubble.locator('.artifact-bubble-type-label')).toHaveText(
    'HTML',
  );
  await expect(showArtifact).toHaveAttribute(
    'title',
    `Mostrar artefacto: ${longHtmlName}`,
  );
  await expect(showArtifact).toHaveAttribute(
    'aria-label',
    `Mostrar artefacto: ${longHtmlName}`,
  );
  const tooltipId = await showArtifact.getAttribute('aria-describedby');
  expect(tooltipId).toBeTruthy();
  const tooltip = page.locator(`#${tooltipId}`);
  await expect(tooltip).toHaveText(longHtmlName);
  await expect(tooltip).toBeHidden();
  await showArtifact.focus();
  await expect(tooltip).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: 'Ver paso: Preparar guía' })
      .locator('.node-status-footer'),
  ).toBeVisible();
  await expect(tile.locator('.preview-tile')).toHaveCount(0);
  await page.keyboard.press('Enter');
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
    '.artifact-download-bubble .artifact-bubble-action[download="demo-hyperion-presentacion-final.pptx"]',
  );
  await expect(officeBubble).toBeVisible();
  await expect(officeBubble.locator('.preview-office-icon')).toBeVisible();
  await expect(officeBubble).toHaveAttribute(
    'download',
    'demo-hyperion-presentacion-final.pptx',
  );
  await expect(officeBubble).toHaveAttribute(
    'title',
    'Descargar demo-hyperion-presentacion-final.pptx',
  );
  await expect(officeBubble).toHaveAttribute(
    'aria-label',
    'Descargar demo-hyperion-presentacion-final.pptx',
  );
  await expect(officeBubble.locator('.artifact-bubble-type-label')).toHaveText(
    'PPTX',
  );
  await expect(
    page.locator(
      '.artifact-download-bubble .artifact-bubble-action[download="presupuesto-anual-de-licencias.xlsx"] .artifact-bubble-type-label',
    ),
  ).toHaveText('XLSX');
  await expect(officeBubble).toHaveAttribute(
    'href',
    new RegExp(`/api/runs/${run.id}/artifacts/`),
  );
  await expect(
    page.locator('[data-testid^="rf__edge-preview-tether:write:"]'),
  ).toHaveCount(3);
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
  ).toHaveCount(3);
  await hiddenBubble
    .getByRole('button', { name: /^Mostrar artefacto:/ })
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

test('compact artifact type tokens stay bounded in Spanish and English', async ({
  page,
}) => {
  const labels = [
    'HTML',
    'SVG',
    'CSV',
    'DOCX',
    'XLSX',
    'PPTX',
    'Nota',
    'Imagen',
    'Archivo',
    'Texto',
    'Note',
    'Image',
    'File',
    'Text',
  ];
  const css = readFileSync('src/client/workspace.css', 'utf8');
  await page.setContent(`
    <style>:root { --artifact-bubble-size: 72px; } ${css}</style>
    <div>${labels
      .map(
        (label) =>
          `<span class="artifact-bubble-type-label" data-label="${label}">${label}</span>`,
      )
      .join('')}</div>
  `);

  const measured = await page
    .locator('.artifact-bubble-type-label')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          label: element.textContent,
          bounded: element.scrollWidth <= element.clientWidth,
          overflow: style.overflow,
          whiteSpace: style.whiteSpace,
        };
      }),
    );
  expect(measured).toHaveLength(labels.length);
  for (const label of measured) {
    expect(label.bounded, `${label.label} should fit its token box`).toBe(true);
    expect(label.overflow).toBe('hidden');
    expect(label.whiteSpace).toBe('nowrap');
  }
});

test('a complex self-contained HTML artifact stays inert across preview, source and expand', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const headers = {
    authorization: `Bearer ${JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')).agentToken}`,
  };
  const created = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Muestra HTML compleja',
        profile: 'bpmn-lite',
        request: 'Renderiza un informe HTML complejo',
        steps: [
          { id: 'begin', title: 'Inicio', kind: 'start' },
          {
            id: 'render',
            title: 'Renderizar informe',
            kind: 'agent',
            dependencies: ['begin'],
          },
          { id: 'end', title: 'Fin', kind: 'end', dependencies: ['render'] },
        ],
      },
    },
  });
  expect(created.status()).toBe(201);
  const run = await created.json();
  for (const type of ['start', 'complete']) {
    const response = await request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: {
        type,
        stepId: 'render',
        attempt: type === 'complete' ? 1 : undefined,
        message: 'Informe generado',
        commandId: crypto.randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
    if (type === 'start') {
      const uploaded = await request.post(`/api/runs/${run.id}/artifacts`, {
        headers,
        data: {
          commandId: 'upload-complex-html-preview',
          stepId: 'render',
          attempt: 1,
          name: 'informe-accesibilidad-rendimiento.html',
          mediaType: 'text/html',
          contentBase64: Buffer.from(complexHtmlFixture).toString('base64'),
        },
      });
      expect(uploaded.ok()).toBe(true);
    }
  }

  await page.goto(`/?run=${run.id}`);
  const tile = page.getByTestId('rf__node-preview:render');
  await tile
    .getByRole('button', {
      name: 'Mostrar artefacto: informe-accesibilidad-rendimiento.html',
    })
    .click();
  const frame = tile.locator('iframe.preview-tile-html-frame');
  await expect(frame).toHaveAttribute('sandbox', '');
  const preview = page.frameLocator('iframe.preview-tile-html-frame');
  await expect(
    preview.getByRole('heading', {
      name: 'Informe muy extenso de accesibilidad, rendimiento y cobertura de entregables para la revisión humana',
    }),
  ).toBeVisible();
  await expect(
    preview.getByRole('navigation', { name: 'Navegación del informe' }),
  ).toBeVisible();
  await expect(preview.locator('svg[role="img"]')).toBeVisible();
  await expect(
    preview.getByRole('textbox', { name: 'Responsable' }),
  ).toHaveValue('Ana García');
  await expect(preview.locator('pre code')).toContainText('sandbox');
  await expect(preview.locator('html')).not.toHaveAttribute(
    'data-script-executed',
    'true',
  );
  await expect
    .poll(() =>
      preview
        .locator('[data-testid="complex-table-scroll"]')
        .evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);

  await tile
    .getByRole('button', { name: 'Código fuente', exact: true })
    .click();
  await expect(tile.locator('iframe.preview-tile-html-frame')).toHaveCount(0);
  await expect(tile.locator('pre.artifact-text')).toContainText(
    'Informe muy extenso de accesibilidad',
  );
  await tile.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(tile.locator('iframe.preview-tile-html-frame')).toBeVisible();

  await tile
    .getByRole('button', { name: 'Ampliar vista', exact: true })
    .click();
  const shell = page.locator('.preview-open-shell');
  await expect(shell).toBeVisible();
  const immersive = shell.frameLocator('iframe.artifact-html-frame');
  await expect(
    immersive.getByRole('heading', {
      name: /Informe muy extenso de accesibilidad/,
    }),
  ).toBeVisible();
  await shell.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(shell).toHaveCount(0);
  await expect(tile.locator('iframe.preview-tile-html-frame')).toBeVisible();
});
