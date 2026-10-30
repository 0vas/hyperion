import { test, expect, type Page } from '@playwright/test';
import { appMenuTrigger, chooseFromAppMenu, openAppMenu } from './app-menu';
import { readFileSync } from 'node:fs';
const token = () =>
  JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8'))
    .agentToken as string;
/** Step inspect docks in Resultado (aside), not a modal dialog. */
const resultado = (page: Page) => page.getByTestId('resultado-stage');

test('an agent creates a workflow; the human supplies input and approves; the agent resumes', async ({
  page,
  request,
}) => {
  const headers = { authorization: `Bearer ${token()}` };
  const created = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Prueba funcional con Codex',
        description: 'A real human handoff',
        steps: [
          { id: 'inspect', title: 'Inspeccionar proyecto', kind: 'agent' },
          {
            id: 'human',
            title: 'Elegir el objetivo',
            kind: 'manual',
            dependencies: ['inspect'],
          },
          {
            id: 'gate',
            title: 'Aprobar el siguiente paso',
            kind: 'approval',
            dependencies: ['human'],
          },
          {
            id: 'finish',
            title: 'Preparar resultado',
            kind: 'agent',
            dependencies: ['gate'],
          },
        ],
      },
    },
  });
  expect(created.status()).toBe(201);
  const run = await created.json();
  const command = async (type: string, stepId: string) =>
    request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: {
        type,
        stepId,
        message: 'Evidencia de la prueba automatizada',
        commandId: crypto.randomUUID(),
      },
    });
  await command('start', 'inspect');
  await command('complete', 'inspect');
  await page.goto(`/?run=${run.id}`);
  await expect(
    page.getByRole('heading', { name: 'Prueba funcional con Codex' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Ver paso: Elegir el objetivo' })
    .click();
  await page
    .getByLabel('Tu respuesta')
    .fill('Quiero preparar una guía de contribución.');
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await page
    .getByRole('button', { name: 'Ver paso: Aprobar el siguiente paso' })
    .click();
  await page.getByRole('button', { name: 'Aprobar paso' }).click();
  await expect(
    page
      .locator('.canvas-next strong')
      .filter({ hasText: 'Continuar desde el chat' }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Ver paso: Elegir el objetivo' })
    .click();
  await expect(
    page
      .getByText('Quiero preparar una guía de contribución.', { exact: true })
      .first(),
  ).toBeVisible();
  expect((await command('start', 'finish')).status()).toBe(200);
  expect((await command('complete', 'finish')).status()).toBe(200);
  await expect(page.getByTestId('run-status')).toHaveText('Completado');
  await page.screenshot({
    path: 'test-results/workflow-desktop.png',
    fullPage: true,
  });
});

test('narrow viewport stays usable', async ({ page, request }) => {
  const created = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Vista estrecha',
        steps: [{ id: 'a', title: 'Paso móvil', kind: 'manual' }],
      },
    },
  });
  const run = await created.json();
  await page.goto(`/?run=${run.id}`);
  await page.getByRole('region', { name: 'Canvas del workflow' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const node = page.getByRole('button', { name: /^Ver paso:/ }).first();
  await expect
    .poll(async () => {
      const box = await node.boundingBox();
      return Boolean(box && box.x >= 0 && box.x + box.width <= 390);
    })
    .toBeTruthy();
  await node.click();
  await expect(resultado(page)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Volver al canvas', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/canvas-mobile-popup.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('banner')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: 'test-results/workflow-mobile.png',
    fullPage: true,
  });
});

test('human handoff meets automated WCAG AA checks', async ({
  page,
  request,
}) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const response = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Accesibilidad del flujo',
        steps: [{ id: 'human', title: 'Definir el objetivo', kind: 'manual' }],
      },
    },
  });
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  const canvasAccessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(canvasAccessibility.violations).toEqual([]);
  await page
    .getByRole('button', { name: 'Ver paso: Definir el objetivo' })
    .click();
  await expect(page.getByLabel('Tu respuesta')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
      details: v.nodes.map((n) => n.failureSummary),
    })),
  ).toEqual([]);
});

test('connection help supports keyboard dismissal and restores focus', async ({
  page,
}) => {
  await page.goto('/');
  const menu = appMenuTrigger(page);
  await chooseFromAppMenu(page, 'Ayuda de conexión');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cerrar ayuda' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(menu).toBeFocused();
});

test('an unknown run URL never silently selects a different workflow', async ({
  page,
}) => {
  await page.goto('/?run=00000000-0000-0000-0000-000000000000');
  await expect(
    page.getByRole('heading', { name: 'No encontramos ese flujo' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Aprobar paso' }),
  ).not.toBeVisible();
});

test('request-derived plans flow top to bottom with parallel branches and retain the original request', async ({
  page,
  request,
}) => {
  const original =
    'Usa Hyperion para revisar un proyecto: pregúntame el alcance, revisa documentación y pruebas en paralelo, y pide mi aprobación.';
  const response = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Plan generado desde una petición',
        request: original,
        steps: [
          { id: 'scope', title: 'Definir alcance', kind: 'manual' },
          {
            id: 'docs',
            title: 'Revisar documentación',
            kind: 'agent',
            dependencies: ['scope'],
          },
          {
            id: 'tests',
            title: 'Revisar pruebas',
            kind: 'agent',
            dependencies: ['scope'],
          },
          {
            id: 'approve',
            title: 'Aprobar propuesta',
            kind: 'approval',
            dependencies: ['docs', 'tests'],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  await expect(page.getByLabel('Ir a tarea')).toBeVisible();
  await page.getByText('Petición original', { exact: true }).click();
  await expect(page.getByText(original, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const bounds = async (name: string) =>
    (await page
      .getByRole('button', { name: `Ver paso: ${name}` })
      .boundingBox())!;
  const scope = await bounds('Definir alcance');
  const docs = await bounds('Revisar documentación');
  const tests = await bounds('Revisar pruebas');
  const approval = await bounds('Aprobar propuesta');
  expect(docs.y).toBeGreaterThan(scope.y + scope.height);
  expect(Math.abs(docs.y - tests.y)).toBeLessThan(2);
  expect(approval.y).toBeGreaterThan(docs.y + docs.height);
  await page.screenshot({
    path: 'test-results/request-vertical.png',
    fullPage: true,
  });
});

test('the workflow is a landscape canvas with information and human actions in accessible popups', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Canvas desde Codex',
        request: 'Codex, guía mi revisión en un solo canvas.',
        steps: [
          { id: 'input', title: 'Compartir observaciones', kind: 'manual' },
          {
            id: 'approval',
            title: 'Confirmar resultado',
            kind: 'approval',
            dependencies: ['input'],
          },
        ],
      },
    },
  });
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  const canvas = page.getByRole('region', { name: 'Canvas del workflow' });
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  expect(bounds.x).toBe(0);
  expect(bounds.y).toBe(0);
  expect(bounds.width).toBe(1440);
  expect(bounds.height).toBe(900);
  expect(bounds.width).toBeGreaterThan(bounds.height);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Tu respuesta')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Petición original', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Petición original' }),
  ).toContainText('Codex, guía mi revisión');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Petición original', exact: true }),
  ).toBeFocused();
  const node = page.getByRole('button', {
    name: 'Ver paso: Compartir observaciones',
  });
  await node.click();
  await expect(resultado(page)).toBeVisible();
  await expect(
    resultado(page).getByRole('heading', { name: 'Compartir observaciones' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cerrar resultado' }),
  ).toBeVisible();
  await page
    .getByLabel('Tu respuesta')
    .fill('El canvas funciona y mantiene mi contexto.');
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await expect(resultado(page)).toHaveCount(0);
  await expect(node).toBeFocused();
  await page
    .getByRole('button', { name: 'Ver paso: Confirmar resultado' })
    .click();
  await expect(resultado(page)).toBeVisible();
  await expect(
    resultado(page).getByRole('heading', { name: 'Confirmar resultado' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Aprobar paso', exact: true }).click();
  await expect(resultado(page)).toHaveCount(0);
  await expect(page.getByTestId('run-status')).toHaveText('Completado');
  await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Historial del flujo' }),
  ).toContainText('El canvas funciona');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('run-status')).toHaveText('Completado');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/canvas-landscape.png' });
});

test('rejection stays in the canvas popup and reports command errors before retrying', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Revisar y rechazar',
        steps: [{ id: 'gate', title: 'Revisar propuesta', kind: 'approval' }],
      },
    },
  });
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  await page
    .getByRole('button', { name: 'Ver paso: Revisar propuesta' })
    .click();
  await page
    .getByRole('button', { name: 'Rechazar y detener este flujo' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page
    .getByLabel('Motivo del rechazo')
    .fill('Falta evidencia de la propuesta.');
  await page.route(`**/api/runs/${run.id}/commands`, (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'REVISION_CONFLICT' }),
    }),
  );
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'El flujo cambió',
  );
  await expect(page.getByLabel('Motivo del rechazo')).toHaveValue(
    'Falta evidencia de la propuesta.',
  );
  await page.unroute(`**/api/runs/${run.id}/commands`);
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('run-status')).toHaveText('Rechazado');
});

test('BPMN nodes expose typed inputs/outputs and public traces through their own icons', async ({
  page,
  request,
}) => {
  const plan = JSON.parse(readFileSync('examples/process-review.json', 'utf8'));
  const headers = { authorization: `Bearer ${token()}` };
  const response = await request.post('/api/runs', {
    headers,
    data: { commandId: crypto.randomUUID(), plan },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  await expect(
    page.getByRole('button', { name: 'Ver paso: Inicio', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(
      'svg[data-bpmn="parallel"], svg[data-bpmn="exclusive"], svg[data-bpmn="inclusive"]',
    ),
  ).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Ver datos: Elegir revisiones', exact: true })
    .click();
  await expect(resultado(page)).toBeVisible();
  await expect(resultado(page)).toContainText('boolean');
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Ver paso: Elegir revisiones', exact: true })
    .click();
  await expect(page.locator('#human-answer')).toHaveCount(0);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .locator('.decision-item')
    .nth(0)
    .getByRole('radio', { name: 'Sí', exact: true })
    .check();
  await page
    .locator('.decision-item')
    .nth(1)
    .getByRole('radio', { name: 'No', exact: true })
    .check();
  await page.getByRole('button', { name: 'Guardar elección' }).click();
  await expect(resultado(page)).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="code"]')).toContainText(
    'Omitido',
  );
  await page
    .getByRole('button', {
      name: 'Ver datos: Revisar documentación',
      exact: true,
    })
    .click();
  await expect(resultado(page)).toContainText('Hyperion');
  await page.keyboard.press('Escape');
  const command = async (data: Record<string, unknown>) =>
    request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: { commandId: crypto.randomUUID(), stepId: 'docs', ...data },
    });
  expect((await command({ type: 'start' })).status()).toBe(200);
  expect(
    (
      await command({
        type: 'log',
        message: 'Lectura de README',
        trace: { kind: 'action', tool: 'read_file' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await command({
        type: 'complete',
        message: 'Guía comprobada',
        outputs: { report: 'README y CONTRIBUTING revisados' },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole('button', {
      name: 'Ver trazas: Revisar documentación',
      exact: true,
    })
    .click();
  await expect(resultado(page)).toBeVisible();
  await expect(resultado(page)).toContainText('read_file');
  await expect(resultado(page)).toContainText('Lectura de README');
  await page.screenshot({ path: 'test-results/process-traces.png' });
  await page.keyboard.press('Escape');
  // A readable camera no longer shrinks a long flow to fit every future step.
  await page
    .getByRole('button', { name: 'Enfocar paso actual', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Ver datos: Aprobar la revisión',
      exact: true,
    })
    .click();
  await expect(resultado(page)).toContainText(
    'README y CONTRIBUTING revisados',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Tu turno ·/ }).click();
  await expect(resultado(page)).toBeVisible();
  await page.getByRole('button', { name: 'Aprobar paso', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('Completado');
  await page.screenshot({ path: 'test-results/process-canvas.png' });
});

test('the canvas renders start/end and all three gateway symbols together', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: JSON.parse(readFileSync('examples/process-gateways.json', 'utf8')),
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  await expect(
    page.locator(
      'svg[data-bpmn="parallel"], svg[data-bpmn="exclusive"], svg[data-bpmn="inclusive"]',
    ),
  ).toHaveCount(6);
  await expect(
    page.locator('svg[data-bpmn="start"], svg[data-bpmn="end"]'),
  ).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Ver datos: Definir el alcance', exact: true })
    .click();
  await expect(resultado(page)).toContainText('docs');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/process-gateways.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Enfocar paso actual' }).click();
  const scope = page.locator('.react-flow__node[data-id="scope"]');
  await expect
    .poll(async () => (await scope.boundingBox())!.width)
    .toBeGreaterThan(270);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/process-focus.png' });
});

test('follow tracks the next task, manual navigation releases it, and any task can be focused', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const headers = { authorization: `Bearer ${token()}` };
  const response = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Seguir mi tarea',
        steps: [
          { id: 'a', title: 'Revisar archivos', kind: 'agent' },
          {
            id: 'b',
            title: 'Elegir siguiente acción',
            kind: 'manual',
            dependencies: ['a'],
          },
          {
            id: 'c',
            title: 'Entregar resultado',
            kind: 'agent',
            dependencies: ['b'],
          },
        ],
      },
    },
  });
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  const follow = page.getByRole('button', {
    name: 'Seguir actividad',
    exact: true,
  });
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Ir a tarea')).toHaveValue('a');
  const command = async (type: string, message: string) => {
    expect(
      (
        await request.post(`/api/runs/${run.id}/commands`, {
          headers,
          data: { type, stepId: 'a', message, commandId: crypto.randomUUID() },
        })
      ).ok(),
    ).toBeTruthy();
  };
  await command('start', 'Revisión iniciada');
  await expect(page.getByLabel('Ir a tarea')).toContainText('En curso');
  await command('log', 'Inspección registrada');
  await page.getByRole('button', { name: 'Logs de la tarea enfocada' }).click();
  await expect(resultado(page)).toContainText('Inspección registrada');
  // Opening Resultado may reflow the camera; follow stays pressed.
  await command('complete', 'Archivos revisados');
  await expect(resultado(page)).toContainText('Archivos revisados');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Ir a tarea')).toHaveValue('b');
  const box = (await page
    .locator('.react-flow__node[data-id="b"]')
    .boundingBox())!;
  expect(box.width).toBeGreaterThan(270);
  await page
    .getByRole('button', { name: 'Datos de la tarea enfocada' })
    .click();
  await expect(resultado(page)).toBeVisible();
  await expect(resultado(page)).toContainText('Entradas y salidas');
  await page.keyboard.press('Escape');
  await page.mouse.move(1000, 450);
  await page.mouse.down();
  await page.mouse.move(1080, 480, { steps: 5 });
  await page.mouse.up();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Ir a tarea').selectOption('a');
  await expect(page.getByLabel('Ir a tarea')).toHaveValue('a');
  await page.getByRole('button', { name: 'Abrir tarea enfocada' }).click();
  await expect(resultado(page)).toBeVisible();
  await expect(
    resultado(page).getByRole('heading', { name: 'Revisar archivos' }),
  ).toBeVisible();
  await resultado(page)
    .getByRole('button', { name: 'Detalle', exact: true })
    .click();
  await resultado(page)
    .getByRole('button', { name: 'Enfocar tarea', exact: true })
    .click();
  await expect(resultado(page)).toBeVisible();
  await page
    .getByRole('button', { name: 'Vista general', exact: true })
    .click();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await chooseFromAppMenu(page, 'Guía de uso');
  await expect(
    page.getByRole('dialog', { name: 'De la conversación al flujo' }),
  ).toContainText('Seguir actividad');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/task-follow.png' });
  await follow.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  const mobileTask = page.locator('.react-flow__node[data-id="b"]');
  await expect
    .poll(async () => (await mobileTask.boundingBox())!.width)
    .toBeGreaterThan(270);
  const mobileBox = (await mobileTask.boundingBox())!;
  // Keep the followed task clear of the top chrome; Resultado sheet insets
  // recenter the camera higher than the old modal-popup band.
  expect(mobileBox.y).toBeGreaterThan(80);
  expect(mobileBox.y + mobileBox.height).toBeLessThan(720);
  await page.screenshot({ path: 'test-results/task-follow-mobile.png' });
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await chooseFromAppMenu(page, 'Guía de uso');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('following survives a paused agent completion and resumes on the next task', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const headers = { authorization: `Bearer ${token()}` };
  const response = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Pausa de seguimiento',
        steps: [
          { id: 'work', title: 'Comprobar cambios', kind: 'agent' },
          {
            id: 'review',
            title: 'Validar cambios',
            kind: 'approval',
            dependencies: ['work'],
          },
        ],
      },
    },
  });
  const run = await response.json();
  const command = async (type: string) =>
    request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: {
        type,
        stepId: 'work',
        message: 'Cambios comprobados',
        commandId: crypto.randomUUID(),
      },
    });
  expect((await command('start')).ok()).toBeTruthy();
  await page.goto(`/?run=${run.id}`);
  const follow = page.getByRole('button', {
    name: 'Seguir actividad',
    exact: true,
  });
  await follow.click();
  await expect(page.getByLabel('Ir a tarea')).toHaveValue('work');
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(page.getByTestId('run-status')).toHaveText('En pausa');
  const camera = await page
    .locator('.react-flow__viewport')
    .getAttribute('style');
  expect((await command('complete')).ok()).toBeTruthy();
  await expect(page.locator('.react-flow__node[data-id="work"]')).toContainText(
    'Completado',
  );
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.locator('.react-flow__viewport').getAttribute('style'),
  ).toBe(camera);
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await expect(page.getByLabel('Ir a tarea')).toHaveValue('review');
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
});

test('jobs, concrete decisions and preferences work from a conversation-generated plan', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Preparar mi guía de Hyperion',
        request: 'Usa Hyperion para preparar mi guía con ejemplos.',
        jobs: [
          { id: 'preferences', title: 'Personalizar guía' },
          { id: 'writing', title: 'Redactar guía' },
        ],
        steps: [
          {
            id: 'examples',
            jobId: 'preferences',
            title: 'Elegir ejemplos',
            kind: 'manual',
            interaction: {
              question: '¿Incluimos ejemplos de peticiones?',
              context: 'La guía se adaptará a tu elección.',
              next: 'Codex redactará la guía con el formato elegido.',
            },
            outputs: [
              {
                name: 'examples',
                type: 'boolean',
                required: true,
                description: 'Incluir ejemplos de peticiones',
              },
            ],
          },
          {
            id: 'write',
            jobId: 'writing',
            title: 'Escribir la guía',
            kind: 'agent',
            dependencies: ['examples'],
          },
          {
            id: 'verify',
            jobId: 'writing',
            title: 'Comprobar la guía',
            kind: 'agent',
            dependencies: ['write'],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  await chooseFromAppMenu(page, 'Ajustes');
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await page.getByLabel('Reducir movimiento').check();
  await page.getByLabel('Seguir al abrir un flujo').check();
  await page.getByLabel('Vista del flujo').selectOption('jobs');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('button', { name: 'Seguir actividad' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.job-node')).toHaveCount(2);
  const { default: CanvasAxe } = await import('@axe-core/playwright');
  expect(
    (
      await new CanvasAxe({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/jobs-dark.png' });
  await page
    .getByRole('button', { name: 'Ver pasos: Personalizar guía' })
    .click();
  // Waiting child opens Resultado directly (job → waiting → ready → running).
  await expect(resultado(page)).toBeVisible();
  await expect(
    resultado(page).getByRole('heading', { name: 'Elegir ejemplos' }),
  ).toBeVisible();
  await expect(
    page.getByText('¿Incluimos ejemplos de peticiones?', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('#human-answer')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Guardar elección' }),
  ).toBeDisabled();
  await page
    .getByRole('group', { name: 'Incluir ejemplos de peticiones' })
    .getByRole('radio', { name: 'Sí', exact: true })
    .check();
  await expect(page.locator('.decision-next')).toContainText(
    'Codex redactará la guía con el formato elegido.',
  );
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/decision-dark.png' });
  await page.getByRole('button', { name: 'Guardar elección' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Elección guardada' }),
  ).toBeVisible();
  const updated = await (
    await request.get(`/api/runs/${run.id}`, {
      headers: { authorization: `Bearer ${token()}` },
    })
  ).json();
  expect(updated.steps[0].outputValues).toEqual({ examples: true });
  expect(updated.steps[1].status).toBe('ready');
  await page.getByLabel('Ir a tarea').selectOption('examples');
  for (const name of [
    'Datos de la tarea enfocada',
    'Logs de la tarea enfocada',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press('Escape');
  }

  await chooseFromAppMenu(page, 'Ajustes');
  await expect(page.getByLabel('Reducir movimiento')).toBeChecked();
  await page.getByLabel('Tema', { exact: true }).selectOption('light');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/settings-mobile.png' });
  await page.keyboard.press('Escape');
  await openAppMenu(page);
  await expect(
    page.getByRole('menuitem', { name: 'Guía de uso' }),
  ).toBeVisible();
});

test('route colors and motion follow real execution; compact SVG cards remain accessible', async ({
  page,
  request,
}) => {
  const headers = { authorization: `Bearer ${token()}` };
  const response = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Ruta visible',
        profile: 'bpmn-lite',
        steps: [
          { id: 'start', title: 'Petición recibida', kind: 'start' },
          {
            id: 'work',
            title: 'Preparar el resultado',
            kind: 'agent',
            dependencies: ['start'],
          },
          {
            id: 'human',
            title: 'Revisar el resultado',
            kind: 'manual',
            dependencies: ['work'],
          },
          {
            id: 'end',
            title: 'Actividad terminada',
            kind: 'end',
            dependencies: ['human'],
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  let attempt: number | undefined;
  const command = async (type: string) => {
    const res = await request.post(`/api/runs/${run.id}/commands`, {
      headers,
      data: {
        type,
        ...(['complete', 'fail', 'log'].includes(type) ? { attempt } : {}),
        stepId: 'work',
        message: 'Resultado de prueba',
        commandId: crypto.randomUUID(),
      },
    });
    expect(res.status()).toBe(200);
    if (type === 'start')
      attempt = (await res.json()).steps.find(
        (step: { id: string }) => step.id === 'work',
      ).attempt;
  };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`/?run=${run.id}`);
  const incoming = page.locator('.react-flow__edge[data-id="start-work"]');
  const outgoing = page.locator('.react-flow__edge[data-id="work-human"]');
  await expect(incoming).toHaveClass(/route-ready/);
  await expect(outgoing).toHaveClass(/route-pending/);
  await expect(page.getByText('INICIO', { exact: true })).toBeVisible();
  await expect(page.getByText('FIN', { exact: true })).toBeVisible();
  await command('start');
  await expect(incoming).toHaveClass(/route-active/);
  await expect(incoming.locator('.flow-ribbon animate')).toHaveCount(3);
  await expect(outgoing).not.toHaveClass(/animated/);
  const task = page.locator('.step-node').first();
  expect(
    await task.evaluate(
      (el) =>
        el.getBoundingClientRect().height /
        Number(
          (
            el.closest('.react-flow__viewport') as HTMLElement
          ).style.transform.match(/scale\(([^)]+)\)/)?.[1] || 1,
        ),
    ),
  ).toBeLessThan(165);
  await expect(task.locator('.node-kind-icon svg')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(incoming).toHaveClass(/route-paused/);
  await expect(incoming).not.toHaveClass(/animated/);
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await expect(incoming).toHaveClass(/route-active/);
  await command('fail');
  await expect(incoming).toHaveClass(/route-error/);
  await expect(incoming).not.toHaveClass(/animated/);
  await command('retry');
  await expect(incoming).toHaveClass(/route-ready/);
  await command('start');
  await expect(incoming).toHaveClass(/route-active/);
  await chooseFromAppMenu(page, 'Ajustes');
  await page.getByLabel('Reducir movimiento').check();
  await page.keyboard.press('Escape');
  await expect(incoming.locator('.flow-ribbon animate')).toHaveCount(0);
  await chooseFromAppMenu(page, 'Ajustes');
  await page.getByLabel('Reducir movimiento').uncheck();
  await page.keyboard.press('Escape');
  await expect(incoming).toHaveClass(/animated/);
  await page.context().setOffline(true);
  await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible();
  await expect(incoming).not.toHaveClass(/animated/);
  await page.context().setOffline(false);
  await expect(page.getByText('Conectado', { exact: true })).toBeVisible();
  await expect(incoming).toHaveClass(/animated/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(incoming.locator('.flow-ribbon animate')).toHaveCount(0);
  await chooseFromAppMenu(page, 'Colores del flujo');
  await expect(page.getByRole('dialog')).toContainText('Gris · Pendiente');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await command('complete');
  await expect(incoming).toHaveClass(/route-completed/);
  await expect(outgoing).toHaveClass(/route-attention/);
  await expect(page.locator('[data-id="human"] .flow-node')).toHaveAttribute(
    'data-flow-state',
    'attention',
  );
  await page.screenshot({ path: 'test-results/flow-colors-light.png' });
  await chooseFromAppMenu(page, 'Ajustes');
  await page.getByLabel('Tema', { exact: true }).selectOption('dark');
  await page.keyboard.press('Escape');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/flow-colors-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await openAppMenu(page);
  await expect(
    page.getByRole('menuitem', { name: 'Colores del flujo', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/flow-colors-mobile.png' });
});

test('split windows reserve the canvas, keep focus clear and expose secondary actions on demand', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title:
          'Un flujo con un título largo para trabajar junto a la conversación',
        steps: [
          {
            id: 'review',
            title: 'Revisar el resultado y decidir el siguiente paso',
            kind: 'manual',
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.goto(`/?run=${run.id}`);
  for (const size of [
    { width: 540, height: 720 },
    { width: 720, height: 620 },
    { width: 390, height: 600 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.getByLabel('Ir a tarea').click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Enfocar paso actual' }).click();
    await expect
      .poll(() =>
        page
          .locator('.task-navigation')
          .evaluate((el) => el.getBoundingClientRect().bottom),
      )
      .toBeLessThanOrEqual(108);
    await expect
      .poll(() =>
        page
          .locator('[data-id="review"] .step-node')
          .evaluate((el) => el.getBoundingClientRect().top),
      )
      .toBeGreaterThan(108);
    await expect
      .poll(() =>
        page
          .locator('[data-id="review"] .step-node')
          .evaluate((el) => el.getBoundingClientRect().bottom),
      )
      .toBeLessThan(size.height - 58);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(size.width);
    await expect(page.locator('.mobile-steps')).toHaveCount(0);
    if (size.width <= 1100)
      await expect(
        page.locator('.canvas-workspace > .canvas-tools'),
      ).toBeHidden();
    await page.screenshot({ path: `test-results/workspace-${size.width}.png` });
  }
  await page.setViewportSize({ width: 540, height: 720 });
  await openAppMenu(page);
  await expect(page.getByRole('menu', { name: /Menú|Menu/ })).toBeVisible();
  await expect(
    page.getByText(/Hyperion \d{4}\.\d{2}\.\d{2}\.\d{4} UTC/),
  ).toBeVisible();
  await page
    .getByRole('menuitem', { name: 'Petición original', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Petición original' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(appMenuTrigger(page)).toBeFocused();
  await openAppMenu(page);
  const popupPromise = page.waitForEvent('popup');
  await page
    .getByRole('menuitem', { name: 'Abrir en ventana', exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain(`run=${run.id}`);
  await popup.close();
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('human checklist, waiting motion, SVG gateways and horizontal layout form one process', async ({
  page,
  request,
}) => {
  const plan = JSON.parse(
    readFileSync('examples/process-gateways.json', 'utf8'),
  );
  const res = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token()}` },
    data: { plan, commandId: crypto.randomUUID() },
  });
  expect(res.status()).toBe(201);
  const run = await res.json();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`/?run=${run.id}`);
  await expect(page.locator('svg[data-bpmn="parallel"]')).toHaveCount(2);
  await expect(page.locator('svg[data-bpmn="exclusive"]')).toHaveCount(2);
  await expect(page.locator('svg[data-bpmn="inclusive"]')).toHaveCount(2);
  const waiting = page.locator('.route-attention .flow-ribbon').first();
  await expect(waiting.locator('animate')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Ver flujo horizontal', exact: true })
    .click();
  const box = async (id: string) =>
    (await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox())!;
  await expect
    .poll(async () => (await box('scope')).x - (await box('start')).x)
    .toBeGreaterThan(20);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Ver flujo vertical', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Ver paso: Definir el alcance', exact: true })
    .click();
  await expect(
    page.getByRole('list', { name: 'Lista de decisiones' }),
  ).toBeVisible();
  const groups = page.locator('.decision-item fieldset');
  await expect(groups).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Guardar elección', exact: true }),
  ).toBeDisabled();
  await groups.nth(0).getByRole('radio', { name: 'Sí', exact: true }).check();
  await groups.nth(1).getByRole('radio', { name: 'No', exact: true }).check();
  await expect(
    page.getByText('2 de 2 resueltos', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/decision-checklist.png' });
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole('button', { name: 'Guardar elección', exact: true })
    .click();
  const after = await request.get(`/api/runs/${run.id}`, {
    headers: { authorization: `Bearer ${token()}` },
  });
  expect(
    (await after.json()).steps.find((s: { id: string }) => s.id === 'scope')
      .outputValues,
  ).toEqual({ docs: true, code: false });
  await page.reload();
  await page
    .getByRole('button', {
      name: 'Ver paso: Elegir ruta documental',
      exact: true,
    })
    .click();
  const gatewayEvidence = page.getByTestId('gateway-evidence');
  await expect(gatewayEvidence).toContainText('Exclusiva');
  await expect(gatewayEvidence).toContainText('División de rutas');
  await expect(gatewayEvidence).toContainText('Rutas activadas');
  await expect(gatewayEvidence).toContainText('Revisar documentación');
  await expect(gatewayEvidence).toContainText('Rutas no tomadas');
  await expect(gatewayEvidence).toContainText('Registrar exclusión documental');
  await expect(gatewayEvidence).toContainText('Datos observados');
  const observedGatewayOutput = gatewayEvidence.locator(
    '.gateway-evidence-observed',
  );
  await expect(observedGatewayOutput).toContainText('Salida registrada');
  await expect(observedGatewayOutput).toContainText('Sí');
  await expect(observedGatewayOutput).not.toContainText('docs');
  await expect(observedGatewayOutput).not.toContainText('code');
  await page.screenshot({ path: 'test-results/gateway-evidence.png' });
  await gatewayEvidence
    .getByRole('button', { name: 'Revisar documentación', exact: true })
    .click();
  await expect(resultado(page)).toContainText('Revisar documentación');
});

test('a human retries a failed task from its card without starting it or losing history', async ({
  page,
  request,
}) => {
  const headers = { authorization: `Bearer ${token()}` };
  const res = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Retry visible',
        steps: [{ id: 'work', title: 'Preparar entrega', kind: 'agent' }],
      },
    },
  });
  const run = await res.json();
  for (const type of ['start', 'fail'])
    expect(
      (
        await request.post(`/api/runs/${run.id}/commands`, {
          headers,
          data: {
            type,
            stepId: 'work',
            message: 'Conexión interrumpida',
            commandId: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
  await page.goto(`/?run=${run.id}`);
  await page
    .getByRole('button', { name: 'Reintentar: Preparar entrega', exact: true })
    .click();
  await expect(
    page.getByText('Solicitud de reintento enviada.', { exact: false }),
  ).toBeVisible();
  const after = await request.get(`/api/runs/${run.id}`, { headers });
  const state = await after.json();
  expect(state.steps[0].status).toBe('ready');
  expect(state.steps[0].attempt).toBe(1);
  expect(
    state.events.filter((e: { type: string }) => e.type === 'fail'),
  ).toHaveLength(1);
  expect(state.events.at(-1).actor).not.toBe('codex');
  await expect(
    page.getByRole('button', { name: 'Reintentar: Preparar entrega' }),
  ).toBeEnabled();
});

test('liquid current follows reached routes and BPMN symbol colors stay tied to their kind', async ({
  page,
  request,
}) => {
  const headers = { authorization: `Bearer ${token()}` };
  const plan = JSON.parse(
    readFileSync('examples/process-gateways.json', 'utf8'),
  );
  const response = await request.post('/api/runs', {
    headers,
    data: { plan, commandId: crypto.randomUUID() },
  });
  const run = await response.json();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`/?run=${run.id}`);
  const ribbons = page.locator('[data-id="start-scope"] .flow-ribbon');
  await expect(ribbons).toHaveCount(3);
  await expect(ribbons.first().locator('animate')).toHaveCount(1);
  const geometry = (el: Element) => {
    const path = el as SVGPathElement;
    return Array.from({ length: 16 }, (_, i) => {
      const point = path.getPointAtLength((path.getTotalLength() * i) / 16);
      return [point.x, point.y];
    }).flat();
  };
  const shape = await ribbons.first().evaluate(geometry);
  await expect
    .poll(() => ribbons.first().evaluate(geometry))
    .not.toEqual(shape);
  await expect(
    page.locator('[data-id="scope-parallel"] .flow-ribbon'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-id="start-scope"] .react-flow__edge-path'),
  ).not.toHaveAttribute('marker-end');
  await expect(
    page.locator('[data-id="scope-parallel"] .react-flow__edge-path'),
  ).toHaveAttribute('marker-end', /url/);
  await expect(page.locator('.liquid-stream')).toHaveCount(0);
  const seam = await ribbons.first().evaluate((el) => {
    const path = el as SVGPathElement;
    const animation = path.querySelector('animate') as SVGAnimateElement;
    const svg = path.ownerSVGElement!;
    const duration = animation.getSimpleDuration();
    const begin = animation.getStartTime();
    const originalTime = svg.getCurrentTime();
    svg.pauseAnimations();
    const sample = (time: number) => {
      svg.setCurrentTime(begin + time);
      return Array.from({ length: 32 }, (_, i) => {
        const point = path.getPointAtLength((path.getTotalLength() * i) / 32);
        return [point.x, point.y];
      }).flat();
    };
    const before = sample(duration - 0.008),
      end = sample(duration),
      after = sample(duration + 0.008),
      start = sample(0);
    const incoming = end.map((v, i) => v - before[i]!);
    const outgoing = after.map((v, i) => v - end[i]!);
    const dot = incoming.reduce((sum, v, i) => sum + v * outgoing[i]!, 0);
    const norm = (values: number[]) => Math.hypot(...values);
    svg.setCurrentTime(originalTime);
    svg.unpauseAnimations();
    return {
      closure: Math.max(...end.map((v, i) => Math.abs(v - start[i]!))),
      continuity: dot / (norm(incoming) * norm(outgoing)),
    };
  });
  expect(seam.closure).toBeLessThan(0.001);
  expect(seam.continuity).toBeGreaterThan(0.96);
  const color = (kind: string) =>
    page
      .locator(`.react-flow__node svg[data-bpmn="${kind}"]`)
      .first()
      .evaluate((el) => getComputedStyle(el).color);
  for (const theme of ['light', 'dark']) {
    await chooseFromAppMenu(page, 'Ajustes');
    await page.getByLabel('Tema', { exact: true }).selectOption(theme);
    await page.keyboard.press('Escape');
    expect(await color('start')).not.toBe(await color('end'));
    expect(await color('parallel')).toBe(await color('exclusive'));
    expect(await color('parallel')).toBe(await color('inclusive'));
    expect(await color('start')).toBe(
      theme === 'light' ? 'rgb(46, 117, 49)' : 'rgb(143, 218, 133)',
    );
    expect(await color('parallel')).toBe(
      theme === 'light' ? 'rgb(137, 103, 12)' : 'rgb(243, 210, 93)',
    );
    expect(await color('end')).toBe(
      theme === 'light' ? 'rgb(174, 56, 64)' : 'rgb(255, 155, 158)',
    );
  }
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(page.locator('.flow-ribbons.is-flowing')).toHaveCount(0);
  await expect(ribbons.first().locator('animate')).toHaveCount(0);
  expect(await color('start')).toBe('rgb(143, 218, 133)');
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
  await expect(ribbons.first().locator('animate')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(ribbons.first().locator('animate')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page
    .getByRole('button', { name: 'Ver flujo horizontal', exact: true })
    .click();
  await page.screenshot({
    path: 'test-results/information-current-horizontal.png',
  });
});
