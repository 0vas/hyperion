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
      page.getByText(
        'Continuación encolada para el conector. Eso no significa que el agente haya ejecutado el trabajo.',
      ),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
