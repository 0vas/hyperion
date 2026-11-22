import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { chooseFromAppMenu } from './app-menu';
import { mockConnectionHome, setAppearance } from './connection-fixtures';

const credentials = () =>
  JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')) as {
    agentToken: string;
  };

test('failed auth permits a provider change, preserves a draft and keeps the composer visible', async ({
  browser,
  request,
}, testInfo) => {
  const run = await createRun(request);
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await mockConnectionHome(page);
    await setAppearance(page, 'light', 'es');
    await page.addInitScript(() => {
      let listener: ((event: unknown) => void) | undefined;
      let selected = 'claude';
      const harnesses = [
        { id: 'claude', label: 'Claude Code', status: 'ready' },
        { id: 'codex', label: 'Codex', status: 'ready' },
        { id: 'cursor', label: 'Cursor Agent', status: 'ready' },
        { id: 'antigravity', label: 'Antigravity', status: 'missing' },
      ];
      Object.defineProperty(window, 'hyperionDesktop', {
        configurable: true,
        value: {
          getLanguage: async () => ({ preference: 'es', locale: 'es' }),
          onLanguageChanged: () => () => {},
          liveChat: {
            harnesses: async () => ({ selected, harnesses }),
            selectHarness: async (id: string) => {
              selected = id;
              return { selected, harnesses };
            },
            connect: async (runId: string) => {
              if (selected === 'claude') {
                listener?.({
                  type: 'connection',
                  status: 'disconnected',
                  code: 'auth-required',
                });
                return { connected: false };
              }
              listener?.({ type: 'connection', status: 'connected' });
              listener?.({ type: 'thread', runId, threadId: 'regression' });
              return { connected: true };
            },
            send: async (_id: string, text: string) => {
              listener?.({
                type: 'user-message',
                threadId: 'regression',
                text,
              });
              listener?.({
                type: 'turn',
                threadId: 'regression',
                status: 'running',
              });
              listener?.({
                type: 'assistant-delta',
                threadId: 'regression',
                itemId: `answer-${selected}`,
                text:
                  'Puedo ayudarte a planificar y revisar este flujo.\n\n' +
                  'Un paso verificable con su resultado.\n'.repeat(30),
              });
              listener?.({
                type: 'turn',
                threadId: 'regression',
                status: 'completed',
              });
            },
            onEvent: (callback: (event: unknown) => void) => {
              listener = callback;
              return () => {
                listener = undefined;
              };
            },
          },
        },
      });
    });
    await page.goto(`/?run=${run.id}`);
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    const panel = page.getByTestId('live-chat-page');
    const input = panel.getByLabel('Petición para el agente');
    const harnessTrigger = panel.getByTestId('live-chat-harness-trigger');
    const chooseHarness = async (id: string) => {
      if (!(await panel.getByTestId(`live-chat-harness-${id}`).count()))
        await harnessTrigger.click();
      await panel.getByTestId(`live-chat-harness-${id}`).click();
    };
    await expect(harnessTrigger).toContainText('Claude Code');
    await expect(harnessTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel.getByTestId('live-chat-harness-menu')).toHaveCount(0);
    await harnessTrigger.click();
    await expect(harnessTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByTestId('live-chat-harness-claude')).toContainText(
      'Disponible localmente',
    );
    await expect(
      panel.getByTestId('live-chat-harness-antigravity'),
    ).toContainText('No instalado');
    await input.fill('Ayúdame a revisar este flujo');
    await input.press('Enter');
    await expect(panel.locator('.live-chat-notice')).toContainText(
      'Tu sesión de Claude Code caducó',
    );
    await expect(input).toHaveValue('Ayúdame a revisar este flujo');
    await expect(panel.getByTestId('live-chat-message-assistant')).toHaveCount(
      0,
    );
    await chooseHarness('codex');
    await expect(harnessTrigger).toContainText('Codex');
    await expect(input).toHaveValue('Ayúdame a revisar este flujo');
    await expect(panel.locator('.live-chat-notice')).toHaveCount(0);
    await input.press('Enter');
    await expect(
      panel.getByTestId('live-chat-message-assistant'),
    ).toContainText('Puedo ayudarte');
    await expect(harnessTrigger).toBeEnabled();
    for (const [id, label] of [
      ['cursor', 'Cursor Agent'],
      ['antigravity', 'Antigravity'],
    ]) {
      await chooseHarness(id!);
      await input.fill('Revisa el flujo');
      await input.press('Enter');
      await expect(
        panel
          .getByTestId('live-chat-message-assistant')
          .last()
          .locator('.live-chat-message-role'),
      ).toHaveText(label!);
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const box = await input.boundingBox();
      expect(box!.y).toBeGreaterThan(0);
      expect(box!.y + box!.height).toBeLessThan(800);
      expect(
        await panel.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      expect(
        (await panel.getByTestId('live-chat-thread').boundingBox())!.height,
      ).toBeGreaterThanOrEqual(72);
      await page.screenshot({ path: testInfo.outputPath(`chat-${width}.png`) });
    }
  } finally {
    await context.close();
  }
});

async function createRun(request: APIRequestContext, title = 'Live chat UI') {
  const { agentToken } = credentials();
  const created = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${agentToken}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title,
        steps: [{ id: 'work', title: 'Agent work', kind: 'agent' }],
      },
    },
  });
  expect(created.status()).toBe(201);
  return created.json();
}

test('browser SPA does not expose the Desktop-only chat navigation', async ({
  page,
}) => {
  await mockConnectionHome(page);
  await setAppearance(page, 'light', 'es');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Chat' })).toHaveCount(0);
  await expect(page.getByTestId('live-chat-page')).toHaveCount(0);
});

type ChatCall = { method: string; runId: string | null; text?: string };

async function installContextBridge(page: Page, locale: 'es' | 'en' = 'es') {
  await page.addInitScript((locale) => {
    const calls: ChatCall[] = [];
    let threadId = '';
    Object.assign(window, { chatTestCalls: calls });
    const emit = (event: Record<string, unknown>) =>
      window.dispatchEvent(
        new CustomEvent('chat-test-event', { detail: event }),
      );
    Object.defineProperty(window, 'hyperionDesktop', {
      configurable: true,
      value: {
        getLanguage: async () => ({ preference: locale, locale }),
        onLanguageChanged: () => () => {},
        setLanguage: async () => {},
        liveChat: {
          harnesses: async () => ({
            selected: 'codex',
            harnesses: [{ id: 'codex', label: 'Codex', status: 'ready' }],
          }),
          connect: async (runId: string | null) => {
            calls.push({ method: 'connect', runId });
            threadId = `thread-${runId ?? 'new'}`;
            emit({ type: 'connection', status: 'connected' });
            emit({ type: 'thread', runId, threadId });
            return { connected: true };
          },
          send: async (runId: string | null, text: string) => {
            calls.push({ method: 'send', runId, text });
            emit({ type: 'user-message', threadId, text });
            emit({ type: 'turn', threadId, status: 'running' });
            emit({
              type: 'approval',
              threadId,
              token: `permission-${threadId}`,
            });
          },
          approve: async (
            runId: string | null,
            token: string,
            decision: string,
          ) => {
            calls.push({ method: 'approve', runId });
            emit({
              type: 'approval-resolved',
              threadId,
              token,
              decision: decision === 'allow' ? 'allowed' : 'denied',
            });
          },
          stop: async (runId: string | null) => {
            calls.push({ method: 'stop', runId });
            emit({ type: 'turn', threadId, status: 'interrupted' });
          },
          onEvent: (callback: (event: unknown) => void) => {
            const receive = (event: Event) =>
              callback((event as CustomEvent).detail);
            window.addEventListener('chat-test-event', receive);
            return () => window.removeEventListener('chat-test-event', receive);
          },
        },
      },
    });
  }, locale);
}

const chatCalls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { chatTestCalls: ChatCall[] }).chatTestCalls,
  );

test('an interrupted turn expires unanswered permission cards and releases context switching', async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
  });
  const page = await context.newPage();
  try {
    await mockConnectionHome(page);
    await setAppearance(page, 'light', 'es');
    await installContextBridge(page);
    await page.goto('/');
    await page.getByTestId('chat-bubble').click();
    await page.getByLabel('Petición para el agente').fill('Create a workflow');
    await page.getByTestId('live-chat-send').click();
    await expect(page.getByTestId('live-chat-approval-allow')).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('chat-test-event', {
          detail: {
            type: 'connection',
            runId: 'previous-workflow',
            status: 'disconnected',
          },
        }),
      );
    });
    await expect(page.getByTestId('live-chat-approval-allow')).toBeVisible();
    await expect(page.getByTestId('live-chat-context')).toBeDisabled();
    await page.getByTestId('live-chat-stop').click();
    await expect(page.getByTestId('live-chat-approval-allow')).toHaveCount(0);
    await expect(page.getByTestId('live-chat-context')).toBeEnabled();
    await expect(page.getByTestId('live-chat-page')).toContainText(
      'Permiso ya no disponible',
    );
  } finally {
    await context.close();
  }
});

test('new workflow sends explicit null without an existing run and closing preserves the active turn', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await mockConnectionHome(page);
    await setAppearance(page, 'dark', 'en');
    await installContextBridge(page, 'en');
    await page.goto('/');
    await page.getByTestId('chat-bubble').click();
    const panel = page.getByTestId('live-chat-page');
    await expect(panel.getByTestId('live-chat-context')).toHaveValue('');
    const input = panel.getByLabel('Request for the agent');
    await input.fill('Create a release workflow');
    await panel.getByTestId('live-chat-send').click();
    await expect(panel.getByTestId('live-chat-stop')).toBeVisible();
    await input.fill('Keep this next message');
    await panel.getByRole('button', { name: 'Close chat' }).click();
    await expect(page.getByTestId('chat-bubble')).toContainText(
      'Permission pending',
    );
    expect(await chatCalls(page)).toEqual([
      { method: 'connect', runId: null },
      { method: 'send', runId: null, text: 'Create a release workflow' },
    ]);
    await page.getByTestId('chat-bubble').click();
    await expect(input).toHaveValue('Keep this next message');
    await expect(panel.getByTestId('live-chat-context')).toBeDisabled();
    await expect(panel.getByTestId('live-chat-message-you')).toContainText(
      'Create a release workflow',
    );
    await panel.getByTestId('live-chat-approval-deny').click();
    await panel.getByTestId('live-chat-stop').click();
    expect((await chatCalls(page)).slice(-2)).toEqual([
      { method: 'approve', runId: null },
      { method: 'stop', runId: null },
    ]);
    for (const [width, height] of [
      [1280, 800],
      [390, 800],
      [320, 568],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(input).toBeVisible();
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      const sendBox = await panel.getByTestId('live-chat-send').boundingBox();
      expect(sendBox!.y + sendBox!.height).toBeLessThan(box!.y + box!.height);
      expect(
        (await panel.getByTestId('live-chat-thread').boundingBox())!.height,
      ).toBeGreaterThanOrEqual(72);
      expect(
        await panel.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`chat-new-en-dark-${width}.png`),
      });
      expect(
        (
          await new AxeBuilder({ page })
            .include('#hyperion-chat-panel')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
  } finally {
    await context.close();
  }
});

test('canvas navigation never retargets a running chat and context changes retain separate drafts', async ({
  browser,
  request,
}, testInfo) => {
  const first = await createRun(request, 'Workflow Alpha');
  const second = await createRun(request, 'Workflow Beta');
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await mockConnectionHome(page);
    await page.route('**/api/runs', (route) =>
      route.fulfill({ json: [first, second] }),
    );
    await page.route('**/api/events', (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: `event: snapshot\ndata: ${JSON.stringify([first, second])}\n\n`,
      }),
    );
    await setAppearance(page, 'light', 'es');
    await installContextBridge(page);
    await page.goto(`/?run=${first.id}`);
    await expect(
      page.getByRole('heading', { name: 'Workflow Alpha' }),
    ).toBeVisible();
    await page.getByTestId('chat-bubble').click();
    const panel = page.getByTestId('live-chat-page');
    const input = panel.getByLabel('Petición para el agente');
    const selector = panel.getByTestId('live-chat-context');
    await input.fill('Work on Alpha');
    await panel.getByTestId('live-chat-send').click();
    await expect(selector).toBeDisabled();
    await page.getByRole('button', { name: 'Mis flujos', exact: true }).click();
    await page.getByRole('button', { name: /Workflow Beta/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Workflow Beta' }),
    ).toBeVisible();
    await expect(selector).toHaveValue(first.id);
    await expect(selector).toBeDisabled();
    await panel.getByTestId('live-chat-approval-allow').click();
    await panel.getByTestId('live-chat-stop').click();
    expect((await chatCalls(page)).map(({ runId }) => runId)).toEqual([
      first.id,
      first.id,
      first.id,
      first.id,
    ]);
    await expect(selector).toBeEnabled();
    await expect(panel).toContainText('Este chat sigue vinculado a otro flujo');
    await input.fill('Alpha draft');
    await selector.selectOption(second.id);
    await expect(input).toHaveValue('');
    await expect(panel.getByTestId('live-chat-message-you')).toHaveCount(0);
    await input.fill('Beta draft');
    await selector.selectOption('');
    await input.fill('New workflow draft');
    await selector.selectOption(second.id);
    await expect(input).toHaveValue('Beta draft');
    await page.getByRole('button', { name: 'Ver paso: Agent work' }).click();
    await expect(page.getByTestId('resultado-stage')).toBeVisible();
    await expect(panel).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include('#hyperion-chat-panel')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('chat-current-es-light.png'),
    });
    await chooseFromAppMenu(page, 'Ajustes');
    await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(
      panel.getByRole('heading', { name: 'Chat with Hyperion' }),
    ).toBeVisible();
    await expect(panel.getByLabel('Request for the agent')).toHaveValue(
      'Beta draft',
    );
    await expect(selector).toHaveValue(second.id);
    expect(
      (await chatCalls(page)).filter((call) => call.method === 'send'),
    ).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test('chat keeps every canvas action reachable without overlapping the continuation or zoom controls', async ({
  browser,
  request,
}, testInfo) => {
  const run = await createRun(request, 'Native-size canvas controls');
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1200, height: 788 },
  });
  const page = await context.newPage();
  try {
    await setAppearance(page, 'light', 'es');
    await installContextBridge(page);
    await page.goto(`/?run=${run.id}`);
    await page.getByTestId('chat-bubble').click();
    const toolbar = page.locator('.canvas-workspace > .canvas-tools');
    await expect(
      toolbar.getByRole('button', { name: 'Pausar', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.canvas-next')).toContainText(
      'Continuar desde el chat',
    );
    for (const width of [1200, 1000, 1440]) {
      await page.setViewportSize({ width, height: 788 });
      for (const resultOpen of [false, true]) {
        if (resultOpen) {
          await page
            .getByRole('button', { name: 'Ver paso: Agent work' })
            .click();
          await expect(page.getByTestId('resultado-stage')).toBeVisible();
        }
        const layout = await page
          .locator('.canvas-workspace')
          .evaluate((workspace) => {
            const canvas = workspace.getBoundingClientRect();
            const tools = workspace.querySelector('.canvas-tools')!;
            const buttons = [...tools.querySelectorAll('button')];
            const obstacles = [
              ...workspace.querySelectorAll(
                '.canvas-next, .react-flow__controls, .resultado-stage',
              ),
            ].map((element) => element.getBoundingClientRect());
            const overlaps = (a: DOMRect, b: DOMRect) =>
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
            return buttons.map((button) => {
              const box = button.getBoundingClientRect();
              const hit = document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
              );
              return {
                name:
                  button.textContent?.trim() ||
                  button.getAttribute('aria-label'),
                visible: box.width > 0 && box.height > 0,
                withinCanvas:
                  box.left >= canvas.left &&
                  box.right <= canvas.right &&
                  box.bottom <= canvas.bottom,
                textFits: button.scrollWidth <= button.clientWidth + 1,
                reachable: hit === button || button.contains(hit),
                overlapping:
                  obstacles.some((other) => overlaps(box, other)) ||
                  buttons.some(
                    (other) =>
                      other !== button &&
                      overlaps(box, other.getBoundingClientRect()),
                  ),
              };
            });
          });
        expect(layout.length).toBeGreaterThanOrEqual(6);
        expect(
          layout.filter(
            (button) =>
              !button.visible ||
              !button.withinCanvas ||
              !button.textFits ||
              !button.reachable ||
              button.overlapping,
          ),
        ).toEqual([]);
        await page.screenshot({
          path: testInfo.outputPath(
            `canvas-actions-${width}-${resultOpen ? 'result' : 'canvas'}.png`,
          ),
        });
        if (resultOpen)
          await page
            .getByRole('button', { name: 'Cerrar resultado', exact: true })
            .click();
      }
    }
    await toolbar.getByRole('button', { name: 'Petición original' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('Desktop chat opens beside the canvas and preserves its draft on Escape', async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await mockConnectionHome(page);
    await setAppearance(page, 'light', 'es');
    await page.addInitScript(() => {
      Object.defineProperty(window, 'hyperionDesktop', {
        configurable: true,
        value: {
          getLanguage: async () => ({ preference: 'es', locale: 'es' }),
          onLanguageChanged: () => () => {},
          setLanguage: async () => {},
          liveChat: {
            connect: async () => ({ connected: false }),
            chooseCodex: async () => ({ selected: false }),
            send: async () => {},
            stop: async () => {},
            approve: async () => {},
            resolveUncertain: async () => {},
            onEvent: () => () => {},
          },
        },
      });
    });
    await page.goto('/');
    const bubble = page.getByTestId('chat-bubble');
    await expect(bubble).toBeVisible();
    await bubble.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('live-chat-page')).toBeVisible();
    await expect(page.locator('.canvas-main')).toBeVisible();
    const input = page.getByLabel('Petición para el agente');
    await expect(input).toBeFocused();
    await input.fill('Crea un workflow nuevo');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('live-chat-page')).not.toBeVisible();
    await expect(bubble).toBeFocused();
    await bubble.click();
    await expect(input).toHaveValue('Crea un workflow nuevo');
    await expect(page.getByTestId('live-chat-send')).toBeEnabled();
  } finally {
    await context.close();
  }
});

test('Desktop live Codex chat renders protocol events and makes a real stop request', async ({
  browser,
  request,
}) => {
  const run = await createRun(request);
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await mockConnectionHome(page);
    await setAppearance(page, 'light', 'es');
    await page.addInitScript(() => {
      let listener: ((event: unknown) => void) | undefined;
      Object.defineProperty(window, 'hyperionDesktop', {
        configurable: true,
        value: {
          getLanguage: async () => ({ preference: 'es', locale: 'es' }),
          onLanguageChanged: () => () => {},
          setLanguage: async () => {},
          liveChat: {
            connect: async (runId: string) => {
              listener?.({ type: 'connection', status: 'connected' });
              listener?.({ type: 'thread', runId, threadId: 'thread-live' });
              return { connected: true };
            },
            chooseCodex: async () => ({ selected: true }),
            send: async () => {
              listener?.({
                type: 'user-message',
                threadId: 'thread-live',
                text: 'Inicia la tarea',
              });
              listener?.({
                type: 'turn',
                threadId: 'thread-live',
                turnId: 'turn-live',
                status: 'running',
              });
              listener?.({
                type: 'approval',
                threadId: 'thread-live',
                token: 'approval-1',
                arguments: { forbidden: 'not rendered' },
              });
            },
            approve: async (
              _runId: string,
              token: string,
              decision: string,
            ) => {
              listener?.({
                type: 'approval-resolved',
                threadId: 'thread-live',
                token,
                decision: decision === 'allow' ? 'allowed' : 'denied',
              });
              if (decision !== 'allow') return;
              listener?.({
                type: 'action',
                threadId: 'thread-live',
                status: 'running',
                label: 'Hyperion: hyperion_step',
                arguments: { forbidden: 'not rendered' },
              });
              listener?.({
                type: 'assistant-delta',
                threadId: 'thread-live',
                itemId: 'assistant-live',
                text: 'La tarea empezó.',
              });
            },
            resolveUncertain: async () => {},
            stop: async () =>
              listener?.({
                type: 'turn',
                threadId: 'thread-live',
                turnId: 'turn-live',
                status: 'interrupted',
              }),
            onEvent: (callback: (event: unknown) => void) => {
              listener = callback;
              return () => {
                listener = undefined;
              };
            },
          },
        },
      });
    });
    await page.goto(`/?run=${run.id}`);
    await page.getByRole('button', { name: 'Chat' }).click();
    const panel = page.getByTestId('live-chat-page');
    await panel.getByRole('button', { name: 'Opciones de conexión' }).click();
    await panel.getByTestId('live-chat-connect').click();
    await expect(panel.getByTestId('live-chat-status')).toContainText(
      'Sesión lista',
    );
    await panel.getByLabel('Petición para el agente').fill('Inicia la tarea');
    await panel.getByTestId('live-chat-send').click();
    await expect(panel.getByTestId('live-chat-message-you')).toContainText(
      'Inicia la tarea',
    );
    await expect(panel.getByTestId('live-chat-approval-allow')).toBeVisible();
    await expect(panel.getByTestId('live-chat-approval-deny')).toBeVisible();
    await expect(panel).not.toContainText('not rendered');
    await panel.getByTestId('live-chat-approval-allow').click();
    await expect(
      panel.getByTestId('live-chat-message-assistant'),
    ).toContainText('La tarea empezó.');
    await expect(panel.getByText('Hyperion: hyperion_step')).toBeVisible();
    await panel.getByTestId('live-chat-stop').click();
    await expect(
      panel.getByTestId('live-chat-message-assistant'),
    ).toContainText('interrupted');
  } finally {
    await context.close();
  }
});

test('Desktop keeps live chat disabled offline and offers executable selection and retry guidance', async ({
  browser,
  request,
}) => {
  const run = await createRun(request);
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await mockConnectionHome(page);
    await setAppearance(page, 'light', 'es');
    await page.addInitScript(() => {
      let listener: ((event: unknown) => void) | undefined;
      Object.defineProperty(window, 'hyperionDesktop', {
        configurable: true,
        value: {
          getLanguage: async () => ({ preference: 'es', locale: 'es' }),
          onLanguageChanged: () => () => {},
          setLanguage: async () => {},
          liveChat: {
            connect: async () => {
              listener?.({
                type: 'connection',
                status: 'disconnected',
                message:
                  'Codex is not installed or is not available to Hyperion Desktop. Install Codex locally, then choose its executable and retry.',
              });
              return { connected: false, setup: 'missing' };
            },
            chooseCodex: async () => ({ selected: true }),
            send: async () => {},
            stop: async () => {},
            approve: async () => {},
            resolveUncertain: async () => {},
            onEvent: (callback: (event: unknown) => void) => {
              listener = callback;
              return () => {
                listener = undefined;
              };
            },
          },
        },
      });
    });
    await page.goto(`/?run=${run.id}`);
    await page.getByRole('button', { name: 'Chat' }).click();
    const panel = page.getByTestId('live-chat-page');
    await expect(panel.getByTestId('live-chat-send')).toBeDisabled();
    await panel.getByRole('button', { name: 'Opciones de conexión' }).click();
    await panel.getByTestId('live-chat-connect').click();
    await expect(panel.locator('.live-chat-notice')).toContainText(
      'Codex is not installed',
    );
    await panel.getByTestId('live-chat-choose-executable').click();
    await expect(panel.locator('.live-chat-notice')).toContainText(
      'Codex seleccionado',
    );
    await expect(panel.getByTestId('live-chat-connect')).toContainText(
      'Reconectar',
    );
  } finally {
    await context.close();
  }
});
