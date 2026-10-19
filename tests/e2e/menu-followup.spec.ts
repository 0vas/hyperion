import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseFromAppMenu, appMenuTrigger } from './app-menu';
import {
  connectionInventory,
  mockConnectionHome,
  openConnectionRow,
  setAppearance,
} from './connection-fixtures';

async function createRun(request: APIRequestContext) {
  const token = JSON.parse(
    readFileSync('.hyperion-e2e/credentials.json', 'utf8'),
  ).agentToken;
  const response = await request.post('/api/runs', {
    headers: { authorization: `Bearer ${token}` },
    data: {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Synthetic Menu callback workflow',
        request: 'Keep this original request literal: Ajustes {0}.',
        steps: [{ id: 'work', title: 'Synthetic agent step', kind: 'agent' }],
      },
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

for (const mode of ['unavailable', 'rejected'] as const)
  for (const surface of ['home', 'run'] as const)
    test(`native Updates notice remains reachable and translates live (${mode}, ${surface})`, async ({
      browser,
      request,
    }, info) => {
      const context = await browser.newContext({
        userAgent: 'Hyperion synthetic Electron/44.0',
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();
      try {
        if (surface === 'home') await mockConnectionHome(page);
        else
          await page.route('**/api/connections', (route) =>
            route.fulfill({ json: connectionInventory }),
          );
        await setAppearance(page, 'dark', 'en');
        await page.addInitScript((mode) => {
          let listener:
            | ((snapshot: {
                preference: 'en' | 'es';
                locale: 'en' | 'es';
              }) => void)
            | undefined;
          Object.defineProperty(window, 'hyperionDesktop', {
            value: {
              getLanguage: async () => ({ preference: 'en', locale: 'en' }),
              onLanguageChanged: (callback: typeof listener) => {
                listener = callback;
                return () => {};
              },
              setLanguage: async (locale: 'en' | 'es') => {
                listener?.({ preference: locale, locale });
              },
              ...(mode === 'rejected'
                ? {
                    checkForUpdates: async () => {
                      document.documentElement.dataset.syntheticUpdateCalls =
                        String(
                          Number(
                            document.documentElement.dataset
                              .syntheticUpdateCalls || 0,
                          ) + 1,
                        );
                      throw new Error('SYNTHETIC_UPDATE_BRIDGE_FAILURE');
                    },
                  }
                : {}),
            },
          });
        }, mode);
        const run = surface === 'run' ? await createRun(request) : null;
        await page.goto(`http://127.0.0.1:4318/${run ? `?run=${run.id}` : ''}`);
        const commands: unknown[] = [];
        page.on('request', (request) => {
          if (request.method() === 'POST') commands.push(request.postData());
        });
        await chooseFromAppMenu(page, 'Check for updates…');
        await expect(page.getByRole('menu')).toHaveCount(0);
        const notice = page.locator('.canvas-notice');
        const copy =
          mode === 'unavailable'
            ? {
                en: 'To check for updates, use Hyperion → Check for updates… in the application menu.',
                es: 'Para buscar actualizaciones usa Hyperion → Buscar actualizaciones… en el menú de la aplicación.',
              }
            : {
                en: 'Could not check for updates. Try again from Hyperion → Check for updates…',
                es: 'No se pudo buscar actualizaciones. Inténtalo de nuevo desde Hyperion → Buscar actualizaciones…',
              };
        for (const locale of ['en', 'es', 'en'] as const) {
          await page.evaluate(
            (locale) => window.hyperionDesktop!.setLanguage(locale),
            locale,
          );
          await expect(page.locator('html')).toHaveAttribute('lang', locale);
          await expect.soft(notice).toBeVisible();
          await expect.soft(notice).toContainText(copy[locale]);
          await expect.soft(notice).toBeInViewport({ ratio: 1 });
        }
        await page.screenshot({
          path: info.outputPath(`updates-${mode}-${surface}.png`),
        });
        await expect(page.locator('.about-panel')).toHaveCount(0);
        expect(commands).toEqual([]);
        expect(
          await page
            .locator('html')
            .getAttribute('data-synthetic-update-calls'),
        ).toBe(mode === 'rejected' ? '1' : null);
        await notice.getByRole('button', { name: 'Dismiss notice' }).click();
        await expect(notice).toHaveCount(0);
      } finally {
        await context.close();
      }
    });

test('recognized row explanations preserve their complete original diagnostics through live locale changes', async ({
  page,
}) => {
  const inventory = structuredClone(connectionInventory);
  const examples = [
    {
      id: 'codex',
      raw: 'Ya existe otra conexión Hyperion en codex. No se sobrescribió.',
      en: 'The existing Hyperion entry differs. It has been left unchanged.',
      es: 'La entrada de Hyperion existente es distinta. Se conserva sin cambios.',
    },
    {
      id: 'cursor',
      raw: 'No se pudo leer la configuración de cursor.',
      en: "Could not read Cursor's local configuration.",
      es: 'No se pudo leer la configuración local de Cursor.',
    },
    {
      id: 'claude-desktop',
      raw: 'La conexión de Claude Desktop está disponible para macOS y Windows. Usa Claude Code en este sistema.',
      en: 'The Claude Desktop connection is available on macOS and Windows.',
      es: 'La conexión de Claude Desktop está disponible en macOS y Windows.',
    },
  ];
  for (const example of examples)
    inventory.integrations.find((row) => row.id === example.id)!.detail =
      example.raw;
  await mockConnectionHome(page, inventory);
  await setAppearance(page, 'light', 'en');
  await page.goto('/');
  await chooseFromAppMenu(page, 'Connections');
  for (const example of examples) {
    const row = await openConnectionRow(page, example.id);
    for (const locale of ['en', 'es', 'en'] as const) {
      await page.evaluate(
        (locale) =>
          window.dispatchEvent(
            new StorageEvent('storage', {
              key: 'hyperion.language.v1',
              newValue: locale,
            }),
          ),
        locale,
      );
      await expect
        .soft(row.locator('.connection-explanation'))
        .toHaveText(example[locale]);
      await expect
        .soft(row.locator('.connection-original-diagnostic summary'))
        .toHaveText(
          locale === 'en'
            ? 'Original diagnostic message'
            : 'Mensaje de diagnóstico original',
        );
      const original = row.locator('.connection-original-diagnostic summary');
      await row
        .getByRole('button', {
          name: locale === 'en' ? 'Copy path' : 'Copiar ruta',
          exact: true,
        })
        .focus();
      await page.keyboard.press('Tab');
      await expect(original).toBeFocused();
      expect((await original.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      await expect(original).toBeInViewport({ ratio: 1 });
      await page.keyboard.press('Enter');
      await expect
        .soft(row.locator('.connection-original-diagnostic p'))
        .toHaveText(example.raw);
      await expect(
        row.locator('.connection-original-diagnostic p'),
      ).toBeVisible();
      await page.keyboard.press('Space');
      await expect(row.locator('.connection-row-toggle')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(row.locator('.connection-path')).toHaveText(
        inventory.integrations.find((r) => r.id === example.id)!.path!,
      );
    }
  }
});

test('Menu About, Activity and Pause invoke their actual destinations and command', async ({
  page,
  request,
}) => {
  const run = await createRun(request);
  await setAppearance(page, 'light', 'en');
  await page.goto(`/?run=${run.id}`);
  const commands: { type: string }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/commands'))
      commands.push(r.postDataJSON());
  });
  await chooseFromAppMenu(page, 'About Hyperion');
  await expect(page.locator('.about-panel')).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(appMenuTrigger(page)).toBeFocused();
  await chooseFromAppMenu(page, 'Activity');
  await expect(page.locator('.activity-list')).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(commands).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(appMenuTrigger(page)).toBeFocused();
  await chooseFromAppMenu(page, 'Pause');
  await expect(page.getByTestId('run-status')).toHaveText('Paused');
  expect(commands.map((c) => c.type)).toEqual(['pause']);
  const after = await (await page.request.get(`/api/runs/${run.id}`)).json();
  expect(after.status).toBe('paused');
  expect(after.request).toBe(run.request);
});

test('configured Help and unknown Recheck work behind the accordion without setup', async ({
  page,
}) => {
  await mockConnectionHome(page);
  await setAppearance(page, 'light', 'en');
  await page.goto('/');
  await chooseFromAppMenu(page, 'Connections');
  const writes: unknown[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') writes.push(r.postData());
  });
  const configured = await openConnectionRow(page, 'cursor');
  await configured.locator('.connection-main-action').click();
  await expect(
    page.getByRole('heading', { name: 'Your agent, connected to Hyperion.' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await chooseFromAppMenu(page, 'Connections');
  const unknown = await openConnectionRow(page, 'claude-code');
  const refreshed = page.waitForRequest(
    (r) =>
      r.method() === 'GET' && new URL(r.url()).pathname === '/api/connections',
  );
  await unknown.locator('.connection-main-action').click();
  await refreshed;
  await expect(unknown.locator('.connection-row-toggle')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(writes).toEqual([]);
});
