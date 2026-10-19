import { test, expect } from '@playwright/test';
import { chooseFromAppMenu, openAppMenu } from './app-menu';
import {
  mockConnectionHome,
  setAppearance,
  openConnectionRow,
} from './connection-fixtures';

for (const locale of ['es', 'en'] as const)
  for (const theme of ['light', 'dark'] as const)
    test(`compact menu and collapsed list expose every app (${locale}, ${theme})`, async ({
      page,
    }, info) => {
      await mockConnectionHome(page);
      await setAppearance(page, theme, locale);
      await page.goto('/');
      await openAppMenu(page);
      const menu = page.getByRole('menu');
      expect.soft((await menu.boundingBox())!.width).toBe(336);
      await expect.soft(menu.locator('.is-featured')).toHaveCount(0);
      await expect
        .soft(menu.locator(':scope > :last-child'))
        .toContainText('Hyperion');
      for (const row of await menu.getByRole('menuitem').all())
        expect.soft((await row.boundingBox())!.height).toBe(44);
      await page.screenshot({ path: info.outputPath('menu-1440.png') });
      await page.keyboard.press('Escape');
      await chooseFromAppMenu(
        page,
        locale === 'es' ? 'Conexiones' : 'Connections',
      );
      const panel = page.locator('.connections-popup');
      expect.soft((await panel.boundingBox())!.width).toBe(760);
      await expect
        .soft(panel.locator('.connection-main-action:visible'))
        .toHaveCount(0);
      await expect
        .soft(panel.locator('.connection-path:visible'))
        .toHaveCount(0);
      const list = panel.locator('.connections-view > ul');
      for (const [width, height] of [
        [1440, 1000],
        [900, 900],
        [390, 844],
        [320, 740],
      ] as const) {
        await page.setViewportSize({ width, height });
        await panel.locator('.connections-view').evaluate((el) => {
          el.scrollTop = 0;
        });
        const rows = list.locator(':scope > li');
        await expect(rows).toHaveCount(5);
        const bounds = await rows.evaluateAll((elements) =>
          elements.map((el) => {
            const b = el.getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width };
          }),
        );
        expect.soft(new Set(bounds.map((b) => b.x)).size).toBe(1);
        for (let index = 1; index < bounds.length; index++)
          expect.soft(bounds[index]!.y).toBeGreaterThan(bounds[index - 1]!.y);
        for (const name of [
          'Codex',
          'Cursor',
          'Claude Desktop',
          'Claude Code',
          'Antigravity',
        ])
          await expect
            .soft(list.getByText(name, { exact: true }))
            .toBeInViewport({ ratio: 1 });
        for (const status of await list.locator('.connection-status').all())
          await expect.soft(status).toBeInViewport({ ratio: 1 });
        expect
          .soft(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth))
          .toBe(true);
        await page.screenshot({ path: info.outputPath(`list-${width}.png`) });
      }
    });

for (const locale of ['es', 'en'] as const)
  test(`one selected app survives rechecks, locale changes and Diagnostics (${locale})`, async ({
    page,
  }, info) => {
    await mockConnectionHome(page);
    await setAppearance(page, 'dark', locale, false);
    await page.setViewportSize({ width: 320, height: 740 });
    const writes: unknown[] = [];
    await page.route('**/api/connections/setup', (route) => {
      writes.push(route.request().postDataJSON());
      return route.fulfill({
        status: 500,
        json: { message: 'Unexpected setup' },
      });
    });
    await page.goto('/');
    await chooseFromAppMenu(
      page,
      locale === 'es' ? 'Conexiones' : 'Connections',
    );
    const panel = page.locator('.connections-popup');
    const claude = panel.locator('[data-client-id="claude-desktop"]');
    const toggle = claude.locator('.connection-row-toggle');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(claude.locator('.connection-main-action')).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({ path: info.outputPath('claude-expanded-320.png') });
    await page.keyboard.press('Tab');
    await expect(claude.locator('.connection-main-action')).toBeFocused();
    await expect(claude.locator('.connection-main-action')).toBeInViewport({
      ratio: 1,
    });
    const cursor = await openConnectionRow(page, 'cursor');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(panel.locator('.connection-app-details:visible')).toHaveCount(
      1,
    );
    await panel.locator('.connections-identity-actions button').first().click();
    await expect(cursor.locator('.connection-row-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.evaluate(
      (value) =>
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'hyperion.language.v1',
            newValue: value,
          }),
        ),
      locale === 'es' ? 'en' : 'es',
    );
    await expect(cursor.locator('.connection-row-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await panel.locator('.connection-diagnostics-toggle').click();
    await expect(panel.locator('.connection-runtime-details')).toBeFocused();
    await expect(cursor.locator('.connection-row-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await panel.locator('.connection-diagnostics-toggle').click();
    await cursor.locator('.connection-row-toggle').focus();
    await page.keyboard.press('Space');
    await expect(cursor.locator('.connection-row-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(writes).toEqual([]);
  });

for (const locale of ['es', 'en'] as const)
  test(`Desktop menu keeps its update callback without the web window action (${locale})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      userAgent: 'Hyperion synthetic browser fixture Electron/44.0',
    });
    const page = await context.newPage();
    try {
      await mockConnectionHome(page);
      await setAppearance(page, 'dark', locale);
      await page.addInitScript(() => {
        Object.defineProperty(window, 'hyperionDesktop', {
          value: {
            checkForUpdates: async () => {
              document.documentElement.dataset.syntheticUpdateCalls = String(
                Number(
                  document.documentElement.dataset.syntheticUpdateCalls || 0,
                ) + 1,
              );
            },
          },
        });
      });
      await page.goto('http://127.0.0.1:4318/');
      await openAppMenu(page);
      const menu = page.getByRole('menu');
      await expect(
        menu.getByRole('menuitem', {
          name: /Abrir en ventana|Open in a window/,
        }),
      ).toHaveCount(0);
      const updates = menu.getByRole('menuitem', {
        name: /Buscar actualizaciones|Check for updates/,
      });
      await expect(updates).toBeVisible();
      await updates.click();
      await expect(menu).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute(
        'data-synthetic-update-calls',
        '1',
      );
      await expect(page.locator('.about-popup')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
