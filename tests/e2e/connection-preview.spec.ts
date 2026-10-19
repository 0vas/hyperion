import { test, expect } from '@playwright/test';
import { sanitizeConnectionEntry } from '../../src/adapters/connection-status';
import { chooseFromAppMenu } from './app-menu';
import {
  connectionInventory,
  mockConnectionHome,
  setAppearance,
} from './connection-fixtures';

for (const locale of ['es', 'en'] as const) {
  test(`resolver never renders withheld credential values (${locale})`, async ({
    page,
  }, testInfo) => {
    const secret = 'SYNTHETIC_RENDER_SECRET';
    const url = `http://synthetic-user:${secret}@127.0.0.1:4317/path/${secret}?api_key=${secret}#${secret}`;
    const existing = sanitizeConnectionEntry({
      command: '/synthetic/node',
      args: ['/synthetic/mcp-launcher.js', '--url', url, '--token', secret],
      url,
      env: {
        HYPERION_URL: url,
        HYPERION_AGENT_ID: 'codex',
        HYPERION_DATA_DIR: '/synthetic/data',
        API_TOKEN: secret,
      },
    });
    const inventory = {
      ...connectionInventory,
      integrations: [
        {
          ...connectionInventory.integrations[0]!,
          existing,
          expected: sanitizeConnectionEntry({
            command: '/synthetic/node',
            args: ['/synthetic/mcp-launcher.js'],
            env: {
              HYPERION_URL: 'http://127.0.0.1:4317',
              HYPERION_AGENT_ID: 'codex',
            },
          }),
        },
      ],
    };
    expect(JSON.stringify(inventory)).not.toContain(secret);
    await mockConnectionHome(page, inventory);
    await setAppearance(page, 'dark', locale);
    await page.goto('/');
    await chooseFromAppMenu(
      page,
      locale === 'es' ? 'Conexiones' : 'Connections',
    );
    await page
      .getByRole('button', { name: /Resolver conflicto|Resolve conflict/ })
      .click();
    const resolver = page.locator('.conflict-resolver');
    await expect(resolver).toBeVisible();
    expect(await resolver.evaluate((el) => el.outerHTML)).not.toContain(secret);
    await expect(resolver).toContainText('/synthetic/mcp-launcher.js');
    await expect(resolver).toContainText('http://127.0.0.1:4317');
    await expect(resolver).toContainText('HYPERION_DATA_DIR=/synthetic/data');
    await expect(resolver).toContainText('API_TOKEN');
    await expect(resolver).toContainText('••••');
    await page.screenshot({
      path: testInfo.outputPath('resolver-preview-desktop.png'),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(resolver).toBeInViewport();
    expect(await resolver.evaluate((el) => el.outerHTML)).not.toContain(secret);
    await page.screenshot({
      path: testInfo.outputPath('resolver-preview-narrow.png'),
    });
  });

  test(`resolver explains preservation and offers localized cancellation (${locale})`, async ({
    page,
  }) => {
    await mockConnectionHome(page);
    await setAppearance(page, 'dark', locale);
    const writes: unknown[] = [];
    await page.route('**/api/connections/setup', (route) => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { inventory: connectionInventory } });
    });
    await page.goto('/');
    await chooseFromAppMenu(
      page,
      locale === 'es' ? 'Conexiones' : 'Connections',
    );
    await page
      .getByRole('button', { name: /Resolver conflicto|Resolve conflict/ })
      .click();
    const resolver = page.locator('.conflict-resolver');
    await expect
      .soft(resolver)
      .toContainText(
        locale === 'es'
          ? 'Se conservarán los demás servidores MCP.'
          : 'Other MCP servers are preserved.',
      );
    await expect(resolver).toContainText(
      locale === 'es'
        ? 'Se creará un respaldo del archivo'
        : 'A backup of the file is created',
    );
    await resolver
      .getByRole('button', { name: /Reemplazar conexión|Replace connection/ })
      .click();
    const confirmation = page.getByRole('alertdialog');
    await confirmation
      .getByRole('button', {
        name: locale === 'es' ? 'Cancelar' : 'Cancel',
        exact: true,
      })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.locator('.connections-popup')).toBeVisible();
    expect(writes).toEqual([]);
  });

  test(`resolver highlights changed visible env values with unchanged keys (${locale})`, async ({
    page,
  }) => {
    const inventory = {
      ...connectionInventory,
      integrations: [
        {
          ...connectionInventory.integrations[0]!,
          existing: sanitizeConnectionEntry({
            env: {
              HYPERION_AGENT_ID: 'codex',
              HYPERION_DATA_DIR: '/synthetic/old',
            },
          }),
          expected: sanitizeConnectionEntry({
            env: {
              HYPERION_AGENT_ID: 'cursor',
              HYPERION_DATA_DIR: '/synthetic/new',
            },
          }),
        },
      ],
    };
    await mockConnectionHome(page, inventory);
    await setAppearance(page, 'dark', locale);
    await page.goto('/');
    await chooseFromAppMenu(
      page,
      locale === 'es' ? 'Conexiones' : 'Connections',
    );
    await page
      .getByRole('button', { name: /Resolver conflicto|Resolve conflict/ })
      .click();
    const rows = page
      .locator('.conflict-compare dl > div')
      .filter({ has: page.getByText('env', { exact: true }) });
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('HYPERION_AGENT_ID=codex');
    await expect(rows.last()).toContainText('HYPERION_AGENT_ID=cursor');
    await expect(rows.first()).toHaveClass(/is-diff/);
    await expect(rows.last()).toHaveClass(/is-diff/);
  });
}
