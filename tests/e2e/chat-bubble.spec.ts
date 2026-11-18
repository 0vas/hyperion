import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  connectionInventory,
  mockConnectionHome,
  setAppearance,
} from './connection-fixtures';

const credentials = () =>
  JSON.parse(readFileSync('.hyperion-e2e/credentials.json', 'utf8')) as {
    agentToken: string;
    agentId?: string;
  };

test('browser SPA does not show the Desktop chat bubble', async ({ page }) => {
  await mockConnectionHome(page);
  await setAppearance(page, 'light', 'es');
  await page.goto('/');
  await expect(page.getByTestId('chat-bubble')).toHaveCount(0);
});

test('Desktop live Codex chat renders protocol events and sends a real stop request', async ({
  browser,
  request,
}) => {
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
  const run = await created.json();
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
            },
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
                label:
                  'Codex requests permission to use the bounded Hyperion action.',
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
                itemId: 'action-live',
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
    await page.getByRole('button', { name: 'Abrir chat con tu IA' }).click();
    const panel = page.getByRole('dialog');
    await panel.getByTestId('live-chat-connect').click();
    await expect(panel.getByTestId('live-chat-status')).toContainText(
      'hilo local activo',
    );
    await panel.getByLabel('Petición para el agente').fill('Inicia la tarea');
    await panel.getByTestId('live-chat-send').click();
    await expect(panel.getByTestId('chat-bubble-msg-you')).toContainText(
      'Inicia la tarea',
    );
    await expect(panel.getByTestId('live-chat-approval-allow')).toBeVisible();
    await expect(panel.getByTestId('live-chat-approval-deny')).toBeVisible();
    await expect(panel).not.toContainText('not rendered');
    await panel.getByTestId('live-chat-approval-allow').click();
    await expect(panel.getByTestId('chat-bubble-msg-assistant')).toContainText(
      'La tarea empezó.',
    );
    await expect(panel.getByText('Hyperion: hyperion_step')).toBeVisible();
    await panel.getByTestId('live-chat-stop').click();
    await expect(panel.getByTestId('chat-bubble-msg-assistant')).toContainText(
      'interrupted',
    );
    await expect(panel.getByTestId('live-chat-status')).toContainText(
      'hilo local activo',
    );
  } finally {
    await context.close();
  }
});

for (const locale of ['es', 'en'] as const) {
  test(`Desktop picker honesty and Copiar without Enviar (${locale})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: 'Hyperion synthetic Electron/44.0',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    try {
      await mockConnectionHome(page, connectionInventory);
      await setAppearance(page, 'light', locale);
      await page.addInitScript((preferred) => {
        Object.defineProperty(window, 'hyperionDesktop', {
          value: {
            getLanguage: async () => ({
              preference: preferred,
              locale: preferred,
            }),
            onLanguageChanged: () => () => {},
            setLanguage: async () => {},
          },
        });
      }, locale);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');

      const fab = page.getByRole('button', {
        name:
          locale === 'es' ? 'Abrir chat con tu IA' : 'Open chat with your AI',
      });
      await fab.click();
      const panel = page.getByRole('dialog');
      await expect(panel.getByTestId('chat-bubble-thread')).toBeVisible();
      await expect(panel.getByTestId('chat-bubble-composer')).toBeVisible();
      await expect(panel.getByTestId('chat-bubble-empty')).toBeVisible();
      const select = panel.getByTestId('chat-bubble-harness');
      await expect(select).toBeEnabled();

      for (const row of connectionInventory.integrations) {
        const option = select.locator(`option[value="${row.id}"]`);
        await expect(option).toHaveAttribute('data-status', row.status);
        const text = (await option.textContent())?.toLowerCase() || '';
        expect(text).not.toMatch(/\bconnected\b|\bconectado\b/);
      }

      await select.selectOption('cursor');
      await panel
        .getByLabel(
          locale === 'es' ? 'Petición para el agente' : 'Request for the agent',
        )
        .fill('preparar una guía breve');

      const copy = panel.getByTestId('chat-bubble-copy');
      await expect(copy).toBeEnabled();
      await expect(panel.getByTestId('chat-bubble-send')).toHaveCount(0);
      await expect(panel.getByTestId('chat-bubble-send-hint')).toBeVisible();
      await expect(panel.getByTestId('chat-bubble-send-hint')).toContainText(
        locale === 'es' ? 'flujo abierto' : 'open workflow',
      );

      await select.selectOption('codex'); // conflict
      await expect(panel.getByTestId('chat-bubble-send')).toHaveCount(0);

      await expect(panel).toContainText(
        locale === 'es'
          ? 'MCP solo no despierta el chat'
          : 'MCP alone cannot wake the chat',
      );
      await expect(panel).toContainText(
        locale === 'es'
          ? 'sin fabricar respuestas del agente'
          : 'does not invent agent replies',
      );
    } finally {
      await context.close();
    }
  });
}

test('Desktop Enviar enqueues when ResumeConnector matches configured primary harness', async ({
  browser,
  request,
}) => {
  const { agentToken, agentId } = credentials();
  const harness = agentId || 'codex';
  const created = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${agentToken}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Bubble handoff',
        steps: [{ id: 'work', title: 'Agent work', kind: 'agent' }],
      },
    },
  });
  expect(created.status()).toBe(201);
  const run = await created.json();
  expect(run.coordinator).toBe(harness);

  const inventory = {
    ...connectionInventory,
    integrations: connectionInventory.integrations.map((row) =>
      row.id === harness
        ? { ...row, status: 'configured' as const }
        : { ...row, status: 'missing' as const },
    ),
    summary: { configured: 1, conflicts: 0, total: 5 },
  };

  const connector = {
    id: 'e2e-bubble-bridge',
    harness,
    sessionId: 'e2e-bubble-session',
    scope: 'managed-session',
    capabilities: { resume: true, idempotentDelivery: true },
  };

  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await page.route('**/api/connections', (route) =>
      route.fulfill({ json: inventory }),
    );
    await setAppearance(page, 'light', 'es');
    await page.addInitScript(
      ({ preferred, connector: resumeConnector }) => {
        Object.defineProperty(window, 'hyperionDesktop', {
          configurable: true,
          value: {
            resumeConnector,
            getLanguage: async () => ({
              preference: preferred,
              locale: preferred,
            }),
            onLanguageChanged: () => () => {},
            setLanguage: async () => {},
          },
        });
      },
      { preferred: 'es' as const, connector },
    );
    await page.goto(`/?run=${run.id}`);

    await page.getByRole('button', { name: 'Abrir chat con tu IA' }).click();
    const panel = page.getByRole('dialog');
    const other =
      connectionInventory.integrations.find((row) => row.id !== harness)?.id ||
      'claude-desktop';
    await panel.getByTestId('chat-bubble-harness').selectOption(harness);
    await panel
      .getByLabel('Petición para el agente')
      .fill('continuar el trabajo del canvas');

    // Missing/non-primary stay non-sendable.
    await panel.getByTestId('chat-bubble-harness').selectOption(other);
    await expect(panel.getByTestId('chat-bubble-send')).toHaveCount(0);

    await panel.getByTestId('chat-bubble-harness').selectOption(harness);
    const send = panel.getByTestId('chat-bubble-send');
    await expect(send).toBeVisible();
    const enqueue = page.waitForRequest(
      (req) =>
        req.method() === 'POST' &&
        req.url().includes(`/api/runs/${run.id}/outbound-prompts`),
    );
    await send.click();
    const posted = await enqueue;
    const body = posted.postDataJSON() as {
      text: string;
      kind: string;
      connector: { id: string; harness: string };
    };
    expect(body.kind).toBe('continuation_prompt');
    expect(body.connector.id).toBe('e2e-bubble-bridge');
    expect(body.connector.harness).toBe(harness);
    expect(body.text).toContain('continuar el trabajo del canvas');
    await expect(
      panel
        .getByTestId('chat-bubble-msg-system')
        .getByText(
          'Continuación encolada para el conector. Eso no significa que el agente haya ejecutado el trabajo.',
        ),
    ).toBeVisible();

    const afterEnqueue = await (
      await request.get(`/api/runs/${run.id}`, {
        headers: { authorization: `Bearer ${agentToken}` },
      })
    ).json();
    expect(afterEnqueue.outboundPrompt?.status).toBe('queued');
    const claim = await request.post('/api/outbound-prompts/claim', {
      headers: { authorization: `Bearer ${agentToken}` },
      data: { connectorId: 'e2e-bubble-bridge' },
    });
    expect(claim.status()).toBe(200);
    const delivery = await claim.json();
    const settled = await request.post(
      `/api/outbound-prompts/${delivery.id}/settle`,
      {
        headers: { authorization: `Bearer ${agentToken}` },
        data: {
          leaseToken: delivery.leaseToken,
          outcome: 'accepted',
        },
      },
    );
    expect(settled.status()).toBe(200);
    const afterSettle = await (
      await request.get(`/api/runs/${run.id}`, {
        headers: { authorization: `Bearer ${agentToken}` },
      })
    ).json();
    expect(afterSettle.outboundPrompt?.status).toBe('delivered');
    expect(afterSettle.steps[0].status).toBe('ready');
    // Remount picks up settled outboundPrompt and appends a delivery receipt row.
    await page.reload();
    await page.getByRole('button', { name: 'Abrir chat con tu IA' }).click();
    const after = page.getByRole('dialog');
    await expect(
      after.getByTestId('chat-bubble-msg-system').filter({
        hasText: /Entrega aceptada por el conector/,
      }),
    ).toBeVisible();
    await expect(after.getByText(/Recibo de entrega/)).toBeVisible();
  } finally {
    await context.close();
  }
});

test('Desktop chat thread rebinds when runId changes', async ({
  browser,
  request,
}) => {
  const { agentToken, agentId } = credentials();
  const harness = agentId || 'codex';
  const headers = { authorization: `Bearer ${agentToken}` };
  const makeRun = async (title: string) => {
    const created = await request.post('/api/runs', {
      headers,
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
  };
  const first = await makeRun('Bubble rebind A');
  const second = await makeRun('Bubble rebind B');
  const inventory = {
    ...connectionInventory,
    integrations: connectionInventory.integrations.map((row) =>
      row.id === harness
        ? { ...row, status: 'configured' as const }
        : { ...row, status: 'missing' as const },
    ),
    summary: { configured: 1, conflicts: 0, total: 5 },
  };
  const context = await browser.newContext({
    userAgent: 'Hyperion synthetic Electron/44.0',
    viewport: { width: 1280, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  try {
    await page.route('**/api/connections', (route) =>
      route.fulfill({ json: inventory }),
    );
    await setAppearance(page, 'light', 'es');
    await page.addInitScript(() => {
      Object.defineProperty(window, 'hyperionDesktop', {
        configurable: true,
        value: {
          getLanguage: async () => ({ preference: 'es', locale: 'es' }),
          onLanguageChanged: () => () => {},
          setLanguage: async () => {},
        },
      });
    });
    await page.goto(`/?run=${first.id}`);
    await page.getByRole('button', { name: 'Abrir chat con tu IA' }).click();
    const panel = page.getByRole('dialog');
    await panel.getByTestId('chat-bubble-harness').selectOption(harness);
    await panel
      .getByLabel('Petición para el agente')
      .fill('mensaje del primer flujo');
    await panel.getByTestId('chat-bubble-copy').click();
    await expect(
      panel
        .getByTestId('chat-bubble-msg-you')
        .getByText('mensaje del primer flujo'),
    ).toBeVisible();
    // Soft-select another run without remounting Desktop ChatBubble.
    await page.getByRole('button', { name: 'Mis flujos', exact: true }).click();
    await page
      .locator('.popup-run-list button')
      .filter({ hasText: second.title })
      .click();
    await expect(
      page.getByRole('heading', { name: second.title }),
    ).toBeVisible();
    // Bubble stays mounted; thread must clear for the new runId.
    const rebound = page.getByRole('dialog');
    await expect(rebound.getByTestId('chat-bubble-empty')).toBeVisible();
    await expect(rebound.getByText('mensaje del primer flujo')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
