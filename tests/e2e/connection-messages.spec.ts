import { test, expect, type Page } from '@playwright/test';
import { chooseFromAppMenu } from './app-menu';
import {
  connectionInventory,
  mockConnectionHome,
  openConnectionRow,
  setAppearance,
} from './connection-fixtures';

async function changeLanguage(page: Page, locale: 'es' | 'en') {
  await page.evaluate(
    (value) =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'hyperion.language.v1',
          newValue: value,
        }),
      ),
    locale,
  );
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

test('real inventory explanations follow the language while original diagnostics and paths remain intact', async ({
  page,
}) => {
  const inventory = structuredClone(connectionInventory);
  inventory.integrations[0]!.detail =
    'Ya existe otra conexión Hyperion en codex. No se sobrescribió.';
  inventory.integrations[1]!.status = 'unknown';
  inventory.integrations[1]!.detail =
    'No se pudo leer la configuración de cursor.';
  const original = 'Diagnóstico del proveedor: Ajustes {0} /synthetic/mi ruta';
  inventory.integrations[3]!.detail = original;
  await mockConnectionHome(page, inventory);
  await setAppearance(page, 'dark', 'en');
  const writes: string[] = [];
  await page.route('**/api/connections/setup', (route) => {
    writes.push(route.request().postData() || '');
    return route.fulfill({
      status: 500,
      json: { message: 'Unexpected setup' },
    });
  });
  await page.goto('/');
  await chooseFromAppMenu(page, 'Connections');
  const rows = page.locator('.connection-row');
  for (const locale of ['en', 'es', 'en'] as const) {
    await changeLanguage(page, locale);
    await openConnectionRow(page, 'codex');
    await expect(rows.nth(0)).toContainText(
      locale === 'en'
        ? 'The existing Hyperion entry differs. It has been left unchanged.'
        : 'La entrada de Hyperion existente es distinta. Se conserva sin cambios.',
    );
    await expect(rows.nth(0).locator('.connection-path')).toHaveText(
      inventory.integrations[0]!.path!,
    );
    await openConnectionRow(page, 'cursor');
    await expect(rows.nth(1)).toContainText(
      locale === 'en'
        ? "Could not read Cursor's local configuration."
        : 'No se pudo leer la configuración local de Cursor.',
    );
    await openConnectionRow(page, 'claude-code');
    await expect(
      rows.nth(3).locator('.connection-original-diagnostic'),
    ).toContainText(original);
    await expect(
      rows.nth(3).locator('.connection-original-diagnostic'),
    ).toContainText(
      locale === 'en'
        ? 'Original diagnostic message'
        : 'Mensaje de diagnóstico original',
    );
    await expect(
      page.locator('.connection-row-toggle[aria-expanded="true"]'),
    ).toHaveCount(1);
  }
  expect(writes).toEqual([]);
});

test('inventory product failures update in place after a language change', async ({
  page,
}) => {
  await mockConnectionHome(page);
  await page.route('**/api/connections', (route) =>
    route.fulfill({
      status: 500,
      json: { message: 'No se pudo leer la configuración de cursor.' },
    }),
  );
  await setAppearance(page, 'light', 'es');
  await page.goto('/');
  await chooseFromAppMenu(page, 'Conexiones');
  const alert = page.locator('.connections-popup').getByRole('alert');
  await expect(alert).toHaveText(
    'No se pudo leer la configuración local de Cursor.',
  );
  await changeLanguage(page, 'en');
  await expect(alert).toHaveText(
    "Could not read Cursor's local configuration.",
  );
  await changeLanguage(page, 'es');
  await expect(alert).toHaveText(
    'No se pudo leer la configuración local de Cursor.',
  );
});

test('known setup failures translate live without modifying the original path or retrying', async ({
  page,
}) => {
  await mockConnectionHome(page);
  const path = 'C:\\Synthetic\\Ajustes {0}\\claude_desktop_config.json';
  const writes: unknown[] = [];
  await page.route('**/api/connections/setup', (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      status: 400,
      json: {
        error: 'CONNECTION_SETUP',
        message: `No se pudo leer la configuración de claude-desktop. No se modificó: ${path}`,
      },
    });
  });
  await setAppearance(page, 'light', 'en');
  await page.goto('/');
  await chooseFromAppMenu(page, 'Connections');
  await openConnectionRow(page, 'claude-desktop');
  await page
    .locator('.connection-row')
    .filter({ hasText: 'Claude Desktop' })
    .getByRole('button', { name: 'Set up…', exact: true })
    .click();
  const alert = page.locator('.connections-popup').getByRole('alert');
  for (const locale of ['en', 'es', 'en'] as const) {
    await changeLanguage(page, locale);
    await expect(alert).toHaveText(
      locale === 'en'
        ? `Could not read the configuration for Claude Desktop. It was not modified: ${path}`
        : `No se pudo leer la configuración de Claude Desktop. No se modificó: ${path}`,
    );
  }
  expect(writes).toEqual([{ client: 'claude-desktop' }]);
});

test('known replacement errors translate in the confirmation without changing consent', async ({
  page,
}) => {
  await mockConnectionHome(page);
  const writes: unknown[] = [];
  await page.route('**/api/connections/setup', (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      status: 400,
      json: {
        error: 'CONNECTION_SETUP',
        message:
          'La configuración cambió durante la conexión. Vuelve a intentarlo.',
      },
    });
  });
  await setAppearance(page, 'dark', 'es');
  await page.goto('/');
  await chooseFromAppMenu(page, 'Conexiones');
  await openConnectionRow(page, 'codex');
  await page
    .getByRole('button', { name: 'Resolver conflicto…', exact: true })
    .click();
  await page
    .locator('.conflict-resolver')
    .getByRole('button', { name: 'Reemplazar conexión', exact: true })
    .click();
  const confirmation = page.locator('[aria-labelledby="replace-title"]');
  await confirmation
    .getByRole('button', { name: 'Reemplazar conexión', exact: true })
    .click();
  await expect(confirmation.getByRole('alert')).toHaveText(
    'La configuración cambió durante la conexión. Vuelve a intentarlo.',
  );
  await changeLanguage(page, 'en');
  await expect(confirmation.getByRole('alert')).toHaveText(
    'The configuration changed during setup. Try again.',
  );
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(page.locator('.conflict-resolver')).toBeVisible();
  expect(writes).toEqual([{ client: 'codex', replace: true }]);
});

for (const replace of [false, true])
  test(`setup success notices follow live language changes (replace=${replace})`, async ({
    page,
  }) => {
    await mockConnectionHome(page);
    const writes: unknown[] = [];
    await page.route('**/api/connections/setup', (route) => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { inventory: connectionInventory } });
    });
    await setAppearance(page, 'light', 'es');
    await page.goto('/');
    await chooseFromAppMenu(page, 'Conexiones');
    if (replace) {
      await openConnectionRow(page, 'codex');
      await page
        .getByRole('button', { name: 'Resolver conflicto…', exact: true })
        .click();
      await page
        .locator('.conflict-resolver')
        .getByRole('button', { name: 'Reemplazar conexión', exact: true })
        .click();
      await page
        .locator('[aria-labelledby="replace-title"]')
        .getByRole('button', { name: 'Reemplazar conexión', exact: true })
        .click();
    } else {
      await openConnectionRow(page, 'claude-desktop');
      await page
        .locator('.connection-row')
        .filter({ hasText: 'Claude Desktop' })
        .getByRole('button', { name: 'Configurar…', exact: true })
        .click();
    }
    const notice = page.locator('.connection-setup-notice');
    for (const locale of ['es', 'en', 'es'] as const) {
      await changeLanguage(page, locale);
      await expect(notice).toHaveText(
        locale === 'en'
          ? `Connection ${replace ? 'replaced' : 'configured'}. Restart your AI app and open a new chat.`
          : `Conexión ${replace ? 'reemplazada' : 'configurada'}. Reinicia tu aplicación de IA y abre un chat nuevo.`,
      );
    }
    expect(writes).toEqual([
      replace
        ? { client: 'codex', replace: true }
        : { client: 'claude-desktop' },
    ]);
  });
