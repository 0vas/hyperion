import { test, expect, type Locator, type Page } from '@playwright/test';
import { appMenuTrigger, chooseFromAppMenu } from './app-menu';
import {
  connectionInventory,
  mockConnectionHome,
  setAppearance,
  expectReadableText,
} from './connection-fixtures';

const replaceName = /Reemplazar conexión|Replace connection/;
const conflictName = /Resolver conflicto|Resolve conflict/;

test('replacement stays protected while pending and recovers from failure', async ({
  page,
}) => {
  await mockConnectionHome(page);
  await setAppearance(page, 'dark', 'en');
  const writes: unknown[] = [];
  let finish: (() => void) | undefined;
  await page.route('**/api/connections/setup', async (route) => {
    writes.push(route.request().postDataJSON());
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route.fulfill(
      writes.length === 1
        ? { status: 500, json: { message: 'Synthetic setup failure' } }
        : {
            json: {
              inventory: {
                ...connectionInventory,
                integrations: connectionInventory.integrations.map((row) =>
                  row.id === 'codex' ? { ...row, status: 'configured' } : row,
                ),
              },
            },
          },
    );
  });
  await page.goto('/');
  await chooseFromAppMenu(page, 'Connections');
  await page.getByRole('button', { name: conflictName }).click();
  await page
    .locator('.conflict-resolver')
    .getByRole('button', { name: replaceName })
    .click();
  const confirm = page.getByRole('alertdialog', {
    name: 'Replace the Hyperion connection?',
  });
  const submit = confirm.getByRole('button', { name: replaceName });
  await submit.click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(submit).toBeDisabled();
  await expect(
    confirm.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(2, 2);
  await expect(confirm).toBeVisible();
  await page.keyboard.press('Tab');
  expect
    .soft(
      await confirm.evaluate((el) =>
        el.parentElement!.contains(document.activeElement),
      ),
      'Pending focus stays in the top layer',
    )
    .toBe(true);
  finish!();
  await expect(confirm.getByRole('alert')).toHaveText(
    'Synthetic setup failure',
  );
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => writes.length).toBe(2);
  finish!();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator('.conflict-resolver')).toHaveCount(0);
  await expect(page.locator('.connection-card.status-configured')).toHaveCount(
    2,
  );
  await expect(
    page.locator('.connections-identity-actions button').first(),
  ).toBeFocused();
  expect(writes).toEqual([
    { client: 'codex', replace: true },
    { client: 'codex', replace: true },
  ]);
});

async function expectTrapped(page: Page, layer: Locator) {
  const buttons = layer.getByRole('button');
  await buttons.first().focus();
  await page.keyboard.press('Shift+Tab');
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(buttons.first()).toBeFocused();
  await expect(buttons.first()).toHaveCSS('outline-style', 'solid');
  await expectReadableText(buttons.first(), {
    property: 'outlineColor',
    min: 3,
  });
}

for (const locale of ['es', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const reduceMotion of [false, true]) {
      test(`connection dialogs restore each layer and focus (${locale}, ${theme}, motion=${!reduceMotion})`, async ({
        page,
      }, testInfo) => {
        await mockConnectionHome(page, {
          ...connectionInventory,
          integrations: [
            ...connectionInventory.integrations.slice(1),
            connectionInventory.integrations[0]!,
          ],
        });
        await setAppearance(page, theme, locale, reduceMotion);
        await page.emulateMedia({
          reducedMotion: reduceMotion ? 'reduce' : 'no-preference',
        });
        const writes: unknown[] = [];
        await page.route('**/api/connections/setup', (route) => {
          writes.push(route.request().postDataJSON());
          return route.fulfill({ json: { inventory: connectionInventory } });
        });
        await page.goto('/');
        for (const [width, height] of [
          [1440, 1000],
          [900, 900],
          [390, 844],
          [320, 740],
        ] as const) {
          await page.setViewportSize({ width, height });
          await appMenuTrigger(page).focus();
          await page.keyboard.press('Enter');
          await expect(
            page.getByRole('menuitem', {
              name: locale === 'es' ? 'Conexiones' : 'Connections',
              exact: true,
            }),
          ).toBeFocused();
          await page.keyboard.press('Enter');
          const connections = page.locator('.connections-popup');
          const origin = connections.getByRole('button', {
            name: conflictName,
          });
          await origin.click();
          const resolver = page.locator('.conflict-resolver');
          const replace = resolver.getByRole('button', { name: replaceName });
          await expect(replace).toBeFocused();
          await expectTrapped(page, resolver);
          expect
            .soft(
              await resolver.evaluate((el) => el.scrollWidth <= el.clientWidth),
              'Resolver actions do not overflow',
            )
            .toBe(true);
          const resolverBox = (await resolver.boundingBox())!;
          for (const button of await resolver.getByRole('button').all()) {
            const box = (await button.boundingBox())!;
            expect
              .soft(box.x, 'Resolver button left edge stays visible')
              .toBeGreaterThanOrEqual(resolverBox.x);
            expect
              .soft(box.x + box.width)
              .toBeLessThanOrEqual(resolverBox.x + resolverBox.width);
          }
          // Covered controls cannot be reached through the keyboard or focus().
          await connections
            .locator('button')
            .first()
            .evaluate((el) => el.focus());
          await expect(replace).toBeFocused();
          for (const dismissal of ['cancel', 'escape', 'backdrop']) {
            await replace.click();
            const confirm = page.getByRole('alertdialog', {
              name: /¿Reemplazar|Replace the/,
            });
            await expect(confirm).toBeVisible();
            await expect(page.getByRole('alertdialog')).toHaveCount(1);
            await expectTrapped(page, confirm);
            if (dismissal === 'cancel')
              await confirm
                .getByRole('button', { name: /^(Cancel|Cancelar)$/ })
                .click();
            else if (dismissal === 'escape')
              await page.keyboard.press('Escape');
            else await page.mouse.click(2, 2);
            await expect(confirm).toHaveCount(0);
            await expect(resolver).toBeVisible();
            await expect(replace).toBeFocused();
          }
          await page.screenshot({
            path: testInfo.outputPath(`resolver-${width}.png`),
          });
          if (width === 1440)
            await resolver
              .getByRole('button', { name: /^(Cerrar|Close)$/ })
              .click();
          else if (width === 900) await page.mouse.click(2, 2);
          else await page.keyboard.press('Escape');
          await expect(resolver).toHaveCount(0);
          await expect(origin).toBeFocused();
          await expect.soft(origin).toBeInViewport();
          expect
            .soft(
              await origin.evaluate((el) => {
                const r = el.getBoundingClientRect();
                return el.contains(
                  document.elementFromPoint(
                    r.x + r.width / 2,
                    r.y + r.height / 2,
                  ),
                );
              }),
              'Restored card focus is visible below sticky identity',
            )
            .toBe(true);
          await expectTrapped(page, connections);
          if (width === 1440)
            await connections
              .getByRole('button', { name: /Volver al canvas|Back to canvas/ })
              .click();
          else if (width === 900) await page.mouse.click(2, 2);
          else await page.keyboard.press('Escape');
          await expect(connections).toHaveCount(0);
          await expect(appMenuTrigger(page)).toBeFocused();
        }
        expect(writes).toEqual([]);
      });
    }
  }
}
