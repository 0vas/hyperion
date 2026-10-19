import { test, expect } from '@playwright/test';
import { appMenuTrigger, chooseFromAppMenu, openAppMenu } from './app-menu';
import {
  connectionInventory,
  expectReadableText,
  mockConnectionHome,
  setAppearance,
} from './connection-fixtures';

for (const locale of ['es', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`menu is compact and keyboard accessible (${locale}, ${theme})`, async ({
      page,
    }, testInfo) => {
      await mockConnectionHome(page);
      await setAppearance(page, theme, locale);
      await page.goto('/');
      await openAppMenu(page);
      const menu = page.getByRole('menu');
      await expect(menu.locator(':scope > :first-child')).toContainText(
        'Hyperion 2026.10.18.2241 UTC · preview',
      );
      await expect(menu.locator('.app-menu-section')).toHaveText(
        locale === 'es'
          ? ['Aplicación', 'Ayuda', 'Más']
          : ['Application', 'Help', 'More'],
      );
      const box = (await menu.boundingBox())!;
      // The visual-parity brief supersedes the earlier 360px menu spec.
      expect(box.width).toBeGreaterThanOrEqual(420);
      expect(box.width).toBeLessThanOrEqual(480);
      const rows = menu.getByRole('menuitem');
      await expect(rows).toHaveCount(7);
      const first = (await rows.nth(0).boundingBox())!;
      const second = (await rows.nth(1).boundingBox())!;
      expect(first.height).toBeGreaterThanOrEqual(44);
      expect(second.y - first.y - first.height).toBe(4);
      await expect(menu).toHaveCSS('animation-name', 'none');
      await expectReadableText(
        menu.locator('.app-menu-version, .app-menu-section, .app-menu-row'),
      );
      await expect(rows.first()).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(rows.last()).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(rows.first()).toBeFocused();
      const focusClearance = await rows.first().evaluate((el) => {
        const row = el.getBoundingClientRect();
        const label = el.parentElement!.previousElementSibling!;
        const style = getComputedStyle(el);
        const ring = Math.max(
          0,
          parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset),
        );
        const labelBottom =
          label.getBoundingClientRect().bottom -
          parseFloat(getComputedStyle(label).paddingBottom);
        return row.top - ring - labelBottom;
      });
      expect(
        focusClearance,
        'Focus ring clears the section label',
      ).toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath('menu-desktop.png') });
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(appMenuTrigger(page)).toBeFocused();
      await page.setViewportSize({ width: 390, height: 844 });
      await openAppMenu(page);
      const narrow = (await menu.boundingBox())!;
      expect(narrow.x).toBeGreaterThanOrEqual(0);
      expect(narrow.x + narrow.width).toBeLessThanOrEqual(390);
      await page.screenshot({ path: testInfo.outputPath('menu-narrow.png') });
      await page.setViewportSize({ width: 320, height: 740 });
      await menu.evaluate((el) => {
        for (const node of el.querySelectorAll<HTMLElement>(
          '.app-menu-version,.app-menu-section,.app-menu-row,.app-menu-row-copy small',
        )) {
          node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) * 2}px`;
        }
      });
      expect(
        await menu.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await rows.first().focus();
      await page.keyboard.press('Shift+Tab');
      await expect(rows.last()).toBeFocused();
      await expect(rows.last()).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath('menu-320-double-text.png'),
      });
    });

    test(`guide list numbers have readable contrast (${locale}, ${theme})`, async ({
      page,
    }, testInfo) => {
      await mockConnectionHome(page);
      await setAppearance(page, theme, locale);
      await page.goto('/');
      await chooseFromAppMenu(
        page,
        locale === 'es' ? 'Guía de uso' : 'User guide',
      );
      await expectReadableText(page.locator('.usage-guide li'));
      for (const [width, height] of [
        [1440, 1000],
        [900, 900],
        [390, 844],
        [320, 740],
      ] as const) {
        await page.setViewportSize({ width, height });
        const dialog = page.getByRole('dialog');
        expect(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`guide-${width}.png`),
        });
      }
    });

    test(`connection cards retain contrast, hierarchy and an opaque header (${locale}, ${theme})`, async ({
      page,
    }, testInfo) => {
      await mockConnectionHome(page);
      await setAppearance(page, theme, locale);
      await page.goto('/');
      await chooseFromAppMenu(
        page,
        locale === 'es' ? 'Conexiones' : 'Connections',
      );
      const popup = page.locator('.connections-popup');
      await expect(popup.locator('.modal-close')).toHaveCount(0);
      await expect(popup.locator('.connection-card')).toHaveCount(5);
      await expectReadableText(
        popup.locator(
          '.connection-card strong, .connection-path:visible, .connection-status-badge, .connection-row-actions button',
        ),
      );
      for (const [width, height] of [
        [1440, 1000],
        [900, 900],
        [390, 844],
        [320, 740],
      ] as const) {
        await page.setViewportSize({ width, height });
        const panelBox = (await popup.boundingBox())!;
        if (width === 1440) expect.soft(panelBox.width).toBe(1040);
        expect.soft(panelBox.x).toBeGreaterThanOrEqual(16);
        expect
          .soft(panelBox.x + panelBox.width)
          .toBeLessThanOrEqual(width - 16);
        expect
          .soft(await popup.evaluate((el) => el.scrollWidth <= el.clientWidth))
          .toBe(true);
        await expect(
          popup.locator('.connections-identity .connections-calver'),
        ).toBeInViewport();
        for (const card of await popup.locator('.connection-card').all()) {
          expect(await card.locator('.primary').count()).toBeLessThanOrEqual(1);
          if (width >= 900)
            expect((await card.boundingBox())!.width).toBeGreaterThanOrEqual(
              260,
            );
          const status = (await card
            .locator('.connection-card-status')
            .boundingBox())!;
          const buttonBoxes = [];
          for (const button of await card
            .locator('.connection-row-actions button')
            .all()) {
            const buttonBox = (await button.boundingBox())!;
            buttonBoxes.push(buttonBox);
            if (width <= 390) {
              const actions = (await card
                .locator('.connection-row-actions')
                .boundingBox())!;
              expect
                .soft(buttonBox.width, 'Narrow card actions fill their row')
                .toBeCloseTo(actions.width, 0);
              if (buttonBoxes.length > 1) {
                const previous = buttonBoxes.at(-2)!;
                expect.soft(buttonBox.y - previous.y - previous.height).toBe(8);
              }
            }
            expect(buttonBox.height).toBeGreaterThanOrEqual(40);
            expect(
              buttonBox.y - (status.y + status.height),
            ).toBeGreaterThanOrEqual(8);
          }
          for (const a of buttonBoxes) {
            for (const b of buttonBoxes) {
              if (a.y < b.y + b.height && b.y < a.y + a.height) {
                expect(a.y, 'Buttons on the same row align').toBe(b.y);
              }
            }
          }
        }
        expect
          .soft(
            await popup
              .locator('.connections-view')
              .evaluate((el) => el.scrollWidth <= el.clientWidth),
            'Connections body has no horizontal scroll',
          )
          .toBe(true);
        const identity = popup.locator('.connections-identity');
        const top = (await identity.boundingBox())!.y;
        await page.screenshot({
          path: testInfo.outputPath(`connections-${width}-top.png`),
        });
        await popup.locator('.connections-view').evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        expect((await identity.boundingBox())!.y).toBe(top);
        await expect(identity).toHaveCSS(
          'background-color',
          theme === 'dark' ? 'rgb(35, 44, 51)' : 'rgb(255, 254, 250)',
        );
        expect(
          await identity.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return el.contains(
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.bottom - 2,
              ),
            );
          }),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`connections-${width}.png`),
        });
        await popup.locator('.connections-view').evaluate((el) => {
          el.scrollTop = 0;
        });
      }
    });
  }

  test(`conflict replacement requires the backup confirmation (${locale})`, async ({
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
      .locator('.connection-card.status-conflict')
      .getByRole('button', { name: /Resolver conflicto|Resolve conflict/ })
      .click();
    const resolver = page.locator('.conflict-resolver');
    await expect(resolver).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(
      resolver.getByRole('heading', {
        name: locale === 'es' ? 'Entrada actual' : 'Current entry',
      }),
    ).toBeVisible();
    await expect(
      resolver.getByRole('heading', {
        name: locale === 'es' ? 'Entrada esperada' : 'Expected entry',
      }),
    ).toBeVisible();
    await expect(resolver).toContainText('old-runtime');
    await expect(resolver).toContainText('hyperion-runtime');
    expect(writes).toEqual([]);
    await resolver
      .getByRole('button', { name: /Reemplazar conexión|Replace connection/ })
      .click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toContainText(
      locale === 'es'
        ? 'Se crea un respaldo del archivo.'
        : 'A backup of the file is created.',
    );
    expect(writes).toEqual([]);
    await confirmation
      .getByRole('button', { name: /Reemplazar conexión|Replace connection/ })
      .click();
    await expect(confirmation).toHaveCount(0);
    expect(writes).toEqual([{ client: 'codex', replace: true }]);
  });
}
