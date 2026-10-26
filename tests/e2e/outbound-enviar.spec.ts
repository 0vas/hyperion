import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const credentials = JSON.parse(
  readFileSync('.hyperion-e2e/credentials.json', 'utf8'),
) as { agentToken: string; agentId?: string };

test('continuation Enviar stays hidden without host connector and enqueues with a fixture', async ({
  page,
  request,
}) => {
  const harness = credentials.agentId || 'codex';
  const headers = { authorization: `Bearer ${credentials.agentToken}` };
  const created = await request.post('/api/runs', {
    headers,
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Outbound Enviar',
        steps: [
          { id: 'alpha', title: 'Alpha ready', kind: 'agent' },
          { id: 'beta', title: 'Beta ready', kind: 'agent' },
        ],
      },
    },
  });
  expect(created.status()).toBe(201);
  const run = await created.json();

  await page.goto(`/?run=${run.id}`);
  await expect(
    page.getByRole('heading', { name: 'Outbound Enviar' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Continuar desde el chat/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Enviar/ })).toHaveCount(0);

  const fixture = {
    id: 'e2e-send-bridge',
    harness,
    sessionId: 'e2e-private-session',
    scope: 'managed-session',
    capabilities: { resume: true, idempotentDelivery: true },
  };
  await page.addInitScript((connector) => {
    Object.defineProperty(window, 'hyperionDesktop', {
      configurable: true,
      value: {
        resumeConnector: connector,
        getLanguage: async () => ({ preference: 'system', resolved: 'es' }),
        setLanguage: async () => {},
        onLanguageChanged: () => {},
      },
    });
  }, fixture);

  await page.goto(`/?run=${run.id}`);
  const enviar = page.getByRole('button', { name: /^Enviar/ });
  await expect(enviar).toBeVisible();
  const enqueue = page.waitForRequest(
    (req) =>
      req.method() === 'POST' &&
      req.url().includes(`/api/runs/${run.id}/outbound-prompts`),
  );
  await enviar.click();
  const posted = await enqueue;
  const body = posted.postDataJSON() as {
    text: string;
    kind: string;
    connector: { id: string; sessionId: string };
  };
  expect(body.kind).toBe('continuation_prompt');
  expect(body.connector.id).toBe('e2e-send-bridge');
  expect(body.connector.sessionId).toBe('e2e-private-session');
  expect(body.text).toContain(run.id);
  expect(body.text).toContain('Alpha ready (alpha)');
  expect(body.text).toContain('Beta ready (beta)');
  await expect(
    page.getByText(
      'Continuación encolada para el conector. Eso no significa que el agente haya ejecutado el trabajo.',
    ),
  ).toBeVisible();
  const after = await (
    await request.get(`/api/runs/${run.id}`, { headers })
  ).json();
  expect(after.outboundPrompt?.status).toBe('queued');
  expect(after.outboundPrompt?.kind).toBe('continuation_prompt');
  expect(JSON.stringify(after)).not.toContain('e2e-private-session');
  expect(after.steps[0].status).toBe('ready');
  expect(after.steps[0].attempt).toBe(0);
});
