import { test, expect } from '@playwright/test';
import { chooseFromAppMenu, openAppMenu } from './app-menu';
import {
  connectionInventory,
  expectReadableText,
  mockConnectionHome,
  setAppearance,
} from './connection-fixtures';

for (const locale of ['es', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`apps and primary actions lead the Connections view (${locale}, ${theme})`, async ({
      page,
    }, info) => {
      await mockConnectionHome(page);
      await setAppearance(page, theme, locale);
      await page.goto('/');
      await chooseFromAppMenu(
        page,
        locale === 'es' ? 'Conexiones' : 'Connections',
      );
      const panel = page.locator('.connections-popup');
      const cards = panel.locator('.connection-card');
      await expect(cards).toHaveCount(5);
      const initialPanel = (await panel.boundingBox())!;
      const initialCard = (await cards.first().boundingBox())!;
      expect
        .soft(initialCard.y - initialPanel.y, 'First card starts within 220px')
        .toBeLessThanOrEqual(220);
      await expect(panel.locator('.connections-summary')).toHaveText(
        locale === 'es'
          ? '1 configuradas · 1 en conflicto'
          : '1 configured · 1 in conflict',
      );
      await expect(panel.locator('.connection-overview')).toContainText(
        locale === 'es'
          ? 'Herramientas en este chat: desconocidas.'
          : 'Tools in this chat: unknown.',
      );
      await expect(
        panel.locator('.connections-hero, .connection-service-strip'),
      ).toHaveCount(0);
      await expect(panel.locator('.connection-path:visible')).toHaveCount(0);
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
        const box = (await panel.boundingBox())!;
        const first = (await cards.first().boundingBox())!;
        expect(first.y - box.y).toBeLessThanOrEqual(width >= 900 ? 220 : 260);
        const columns = await panel
          .locator('.connection-card-grid')
          .evaluate(
            (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
          );
        expect(columns).toBe(width === 1440 ? 3 : width === 900 ? 2 : 1);
        expect(
          await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await expect(
          cards.first().locator('.connection-main-action'),
        ).toBeInViewport({ ratio: 1 });
        if (width === 1440)
          for (const card of await cards.all())
            await expect(
              card.locator('.connection-main-action'),
            ).toBeInViewport({ ratio: 1 });
        if (width === 900) await expect(cards.nth(2)).toBeInViewport();
        for (const control of await panel
          .locator(
            '.connection-row-actions button, .connections-identity-actions button',
          )
          .all()) {
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
            40,
          );
        }
        await expectReadableText(
          panel.locator(
            '.connection-card strong, .connection-status-badge, .connections-calver, .connection-subtype, .connections-summary, .connection-overview > p, .connections-apps-heading h3',
          ),
        );
        await page.screenshot({ path: info.outputPath(`apps-${width}.png`) });
      }
      // Double text size without scaling the viewport or suppressing wrapping.
      await panel.evaluate((el) => {
        for (const node of el.querySelectorAll<HTMLElement>(
          'h2,h3,p,strong,button,.connection-status-badge,.connection-subtype',
        )) {
          node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) * 2}px`;
        }
      });
      expect(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      expect(
        await panel
          .locator('.connections-view')
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath('apps-320-double-text.png'),
      });
    });
  }

  test(`Details retain full paths and state through refresh and language changes (${locale})`, async ({
    page,
    context,
  }, info) => {
    const inventory = structuredClone(connectionInventory);
    inventory.integrations[1]!.path =
      '/synthetic/a very long user folder/another long folder/.cursor/mcp.json';
    await mockConnectionHome(page, inventory);
    await setAppearance(page, 'dark', locale);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await chooseFromAppMenu(
      page,
      locale === 'es' ? 'Conexiones' : 'Connections',
    );
    const card = page.locator('.connection-card').nth(1);
    const toggle = card.getByRole('button', { name: /^(Detalles|Details)$/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(card.locator('.connection-path')).toHaveText(
      inventory.integrations[1]!.path!,
    );
    await card
      .getByRole('button', { name: /^(Copiar ruta|Copy path)$/ })
      .click();
    await expect(card.getByRole('status')).toHaveText(
      locale === 'es' ? 'Ruta copiada' : 'Path copied',
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      inventory.integrations[1]!.path,
    );
    await card.getByRole('button', { name: /^(Comprobar|Recheck)$/ }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const nextLocale = locale === 'es' ? 'en' : 'es';
    await page.evaluate(
      (value) =>
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'hyperion.language.v1',
            newValue: value,
          }),
        ),
      nextLocale,
    );
    await expect(toggle).toHaveText(
      nextLocale === 'es' ? 'Detalles' : 'Details',
    );
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(card.locator('.connection-path')).toHaveText(
      inventory.integrations[1]!.path!,
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async () => {
          throw new Error('Synthetic clipboard denial');
        },
      }),
    );
    await card
      .getByRole('button', { name: /^(Copiar ruta|Copy path)$/ })
      .click();
    await expect(card.getByRole('status')).toHaveText(
      nextLocale === 'es'
        ? 'No se pudo copiar la ruta.'
        : 'Could not copy the path.',
    );
    await page.setViewportSize({ width: 320, height: 740 });
    await card.scrollIntoViewIfNeeded();
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('details-long-path.png') });
  });

  for (const theme of ['light', 'dark'] as const)
    test(`adapter evidence stays distinct from configuration and chat tools (${locale}, ${theme})`, async ({
      page,
    }, info) => {
      await mockConnectionHome(page);
      await setAppearance(page, theme, locale);
      await page.setViewportSize({ width: 320, height: 740 });
      await page.goto('/');
      await chooseFromAppMenu(
        page,
        locale === 'es' ? 'Conexiones' : 'Connections',
      );
      const panel = page.locator('.connections-popup');
      const overview = panel.locator('.connection-overview');
      await overview
        .getByRole('button', { name: /Servicio local|Local service/ })
        .click();
      await expect(overview).toContainText(
        locale === 'es' ? 'Sin comprobar' : 'Not checked',
      );
      await expect(panel.locator('.connection-runtime-notice')).toHaveCount(0);
      await expect(overview.locator('time')).toHaveCount(0);
      for (const target of ['executable', 'launcher'] as const) {
        for (const code of [
          'readable_file',
          'missing',
          'not_regular_file',
          'read_denied',
          'check_failed',
        ] as const) {
          const runtimePreflight = {
            scope: 'expected_mcp_files',
            checkedAt: '2026-10-19T04:00:00.000Z',
            executable: { code: 'readable_file' },
            launcher: { code: 'readable_file' },
            mcpInitialization: 'not_checked',
            toolCall: 'not_checked',
            chatTools: 'unknown',
          };
          runtimePreflight[target].code = code;
          await page.route('**/api/connections', (route) =>
            route.fulfill({
              json: { ...connectionInventory, runtimePreflight },
            }),
          );
          await panel
            .locator('.connections-identity')
            .getByRole('button', { name: /^(Comprobar|Recheck)$/ })
            .click();
          await expect(
            overview.locator(`[data-runtime-target="${target}"]`),
          ).toHaveAttribute('data-code', code);
          const labels =
            locale === 'es'
              ? {
                  readable_file: 'Archivo legible',
                  missing: 'Archivo no encontrado',
                  not_regular_file: 'No es un archivo normal',
                  read_denied: 'Hyperion no pudo leerlo por permisos',
                  check_failed: 'No se pudo comprobar',
                }
              : {
                  readable_file: 'Readable file',
                  missing: 'File not found',
                  not_regular_file: 'Not a regular file',
                  read_denied: 'Hyperion could not read it due to permissions',
                  check_failed: 'Could not check',
                };
          await expect(
            overview.locator(`[data-runtime-target="${target}"]`),
          ).toContainText(labels[code]);
          await expect(overview).toContainText(
            locale === 'es'
              ? 'Inicio MCP y llamada de herramienta: sin comprobar.'
              : 'MCP startup and tool call: not checked.',
          );
          await expect(overview).toContainText(
            locale === 'es'
              ? 'Herramientas en este chat: desconocidas.'
              : 'Tools in this chat: unknown.',
          );
          await expect(
            panel.locator('.connection-card.status-conflict'),
          ).toHaveCount(1);
          await expect(panel.locator('.connection-card').nth(3)).toHaveClass(
            /status-unknown/,
          );
          if (code === 'readable_file') {
            await expect(
              panel.locator('.connection-runtime-notice'),
            ).toHaveCount(0);
            await expect(overview).toContainText(
              locale === 'es'
                ? 'Hyperion puede leer los archivos del adaptador.'
                : 'Hyperion can read the adapter files.',
            );
          } else {
            const notice = panel.locator('.connection-runtime-notice');
            await expect(notice).toContainText(labels[code]);
            await expect(notice).toHaveAttribute(
              'data-severity',
              code === 'check_failed' ? 'unknown' : 'warning',
            );
            await overview
              .getByRole('button', { name: /Servicio local|Local service/ })
              .click();
            await panel.locator('.connections-view').evaluate((el) => {
              el.scrollTop = 0;
            });
            await expect(notice.locator('p').first()).toBeInViewport({
              ratio: 1,
            });
            await page.screenshot({
              path: info.outputPath(`runtime-${target}-${code}-notice.png`),
            });
            await notice
              .getByRole('button', { name: /Ver detalles|View details/ })
              .click();
            await expect(
              overview.getByRole('button', {
                name: /Servicio local|Local service/,
              }),
            ).toHaveAttribute('aria-expanded', 'true');
            await expect(
              overview.locator('.connection-runtime-details'),
            ).toBeFocused();
            await page.screenshot({
              path: info.outputPath(`runtime-${target}-${code}.png`),
            });
          }
        }
      }
      const writes: string[] = [];
      await page.route('**/api/connections/setup', (route) => {
        writes.push(route.request().postData() || '');
        return route.fulfill({
          status: 500,
          json: { message: 'Unexpected setup' },
        });
      });
      await page.route('**/api/connections', (route) =>
        route.fulfill({
          json: {
            ...connectionInventory,
            runtimePreflight: {
              scope: 'expected_mcp_files',
              checkedAt: '2026-10-19T04:00:00.000Z',
              executable: {
                code: 'missing',
                path: 'SYNTHETIC_PRIVATE_RUNTIME_PATH',
              },
              launcher: { code: 'check_failed', error: 'SYNTHETIC_RAW_ERROR' },
              mcpInitialization: 'not_checked',
              toolCall: 'not_checked',
              chatTools: 'unknown',
            },
          },
        }),
      );
      await panel
        .locator('.connections-identity')
        .getByRole('button', { name: /^(Comprobar|Recheck)$/ })
        .click();
      const notice = panel.locator('.connection-runtime-notice');
      await expect(notice).toContainText(
        locale === 'es'
          ? 'Los archivos del adaptador requieren atención'
          : 'Adapter files need attention',
      );
      await expect(notice).toContainText(
        locale === 'es' ? 'Archivo no encontrado' : 'File not found',
      );
      await expect(notice).toContainText(
        locale === 'es' ? 'No se pudo comprobar' : 'Could not check',
      );
      expect(await panel.evaluate((el) => el.outerHTML)).not.toMatch(
        /SYNTHETIC_PRIVATE_RUNTIME_PATH|SYNTHETIC_RAW_ERROR/,
      );
      await expectReadableText(notice.locator('p,strong'));
      expect(
        await panel
          .locator('.connections-view')
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.route('**/api/connections', (route) =>
        route.fulfill({ json: connectionInventory }),
      );
      await panel
        .locator('.connections-identity')
        .getByRole('button', { name: /^(Comprobar|Recheck)$/ })
        .click();
      await expect(notice).toHaveCount(0);
      await expect(overview.locator('time')).toHaveCount(0);
      expect(writes).toEqual([]);
    });
}

test('menu features Connections with one divider and preserves exact groups', async ({
  page,
}) => {
  await mockConnectionHome(page);
  await setAppearance(page, 'light', 'en');
  await page.goto('/');
  await openAppMenu(page);
  const menu = page.getByRole('menu');
  const featured = menu.getByRole('menuitem', { name: 'Connections' });
  await expect(featured).toContainText('Set up your AI apps');
  expect((await featured.boundingBox())!.height).toBeGreaterThanOrEqual(60);
  await expect(
    menu.locator('.app-menu-group').nth(1).getByRole('menuitem'),
  ).toHaveText(['User guide', 'Connection help', 'Workflow colors']);
  await expect(
    menu.locator('.app-menu-group').nth(2).getByRole('menuitem'),
  ).toHaveText(['Open in a window', 'About Hyperion']);
  await expect(menu.locator('.app-menu-version')).toHaveCSS(
    'border-bottom-width',
    '0px',
  );
});

test('inventory loading and errors never imply zero configured applications', async ({
  page,
}) => {
  await mockConnectionHome(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/connections', async (route) => {
    await pending;
    await route.fulfill({
      status: 500,
      json: { message: 'Synthetic inventory unavailable' },
    });
  });
  await setAppearance(page, 'light', 'en');
  await page.goto('/');
  await chooseFromAppMenu(page, 'Connections');
  const panel = page.locator('.connections-popup');
  await expect(panel.locator('.connections-summary')).toHaveText(
    'Checking local configuration…',
  );
  release();
  await expect(panel.locator('.connections-summary')).toHaveText(
    'Could not check',
  );
  await expect(panel.getByRole('alert')).toHaveText(
    'Synthetic inventory unavailable',
  );
  const aboveGrid = await panel.evaluate(
    (el) =>
      el
        .querySelector('[role="alert"]')!
        .compareDocumentPosition(el.querySelector('.connection-card-grid')!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(aboveGrid).toBeTruthy();
  await expect(panel).not.toContainText('0 of');
});

for (const scale of [1, 2])
  test(`keyboard controls stay visible below the sticky identity at text scale ${scale}`, async ({
    page,
  }) => {
    await mockConnectionHome(page);
    await setAppearance(page, 'dark', 'en', false);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');
    await chooseFromAppMenu(page, 'Connections');
    const panel = page.locator('.connections-popup');
    await panel.evaluate((el, scale) => {
      if (scale === 1) return;
      for (const node of el.querySelectorAll<HTMLElement>(
        'h2,h3,p,strong,button,.connection-status-badge,.connection-subtype',
      )) {
        node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) * scale}px`;
      }
    }, scale);
    await panel.locator('.connections-identity button').first().focus();
    for (const direction of ['Tab', 'Shift+Tab']) {
      for (let index = 0; index < 16; index++) {
        await page.keyboard.press(direction);
        const focused = await page.evaluate(() => {
          const el = document.activeElement!;
          const rect = el.getBoundingClientRect();
          return {
            label: el.textContent,
            visible: el.contains(
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              ),
            ),
          };
        });
        expect(
          focused.visible,
          `Focused control is obscured: ${focused.label}`,
        ).toBe(true);
      }
    }
  });
