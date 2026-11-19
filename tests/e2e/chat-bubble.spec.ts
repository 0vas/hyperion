import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
        { id: 'antigravity', label: 'Antigravity', status: 'ready' },
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
    await input.fill('Ayúdame a revisar este flujo');
    await input.press('Enter');
    await expect(panel.locator('.live-chat-notice')).toContainText(
      'Tu sesión de Claude Code caducó',
    );
    await expect(input).toHaveValue('Ayúdame a revisar este flujo');
    await expect(panel.getByTestId('live-chat-message-assistant')).toHaveCount(
      0,
    );
    await panel.getByTestId('live-chat-harness').selectOption('codex');
    await expect(input).toHaveValue('Ayúdame a revisar este flujo');
    await expect(panel.locator('.live-chat-notice')).toHaveCount(0);
    await input.press('Enter');
    await expect(
      panel.getByTestId('live-chat-message-assistant'),
    ).toContainText('Puedo ayudarte');
    await expect(panel.getByTestId('live-chat-harness')).toBeEnabled();
    for (const [id, label] of [
      ['cursor', 'Cursor Agent'],
      ['antigravity', 'Antigravity'],
    ]) {
      await panel.getByTestId('live-chat-harness').selectOption(id!);
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
      await page.screenshot({ path: testInfo.outputPath(`chat-${width}.png`) });
    }
  } finally {
    await context.close();
  }
});

async function createRun(request: APIRequestContext) {
  const { agentToken } = credentials();
  const created = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${agentToken}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Live chat UI',
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

test('Desktop chat is a dedicated navbar view, not a canvas drawer', async ({
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
    await page.getByRole('button', { name: 'Chat' }).click();
    await expect(page.getByTestId('live-chat-page')).toBeVisible();
    await expect(page.getByTestId('chat-bubble')).toHaveCount(0);
    await page.getByRole('button', { name: 'Volver al canvas' }).click();
    await expect(page.getByTestId('live-chat-page')).not.toBeVisible();
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
