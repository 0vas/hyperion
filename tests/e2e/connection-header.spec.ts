import { test, expect, type Locator } from '@playwright/test';
import { appMenuTrigger, chooseFromAppMenu, openAppMenu } from './app-menu';
import { mockConnectionHome, setAppearance } from './connection-fixtures';

async function expectIntactWords(control: Locator) {
  const words = await control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const samples = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const match of (node.textContent || '').matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rects = [...range.getClientRects()];
        samples.push({
          word: match[0],
          lines: rects.length,
          inside: rects.every(
            (rect) =>
              rect.left >= bounds.left &&
              rect.right <= bounds.right &&
              rect.top >= bounds.top &&
              rect.bottom <= bounds.bottom,
          ),
        });
      }
    }
    return samples;
  });
  expect(words.length).toBeGreaterThan(0);
  expect
    .soft(words.filter((word) => word.lines !== 1 || !word.inside))
    .toEqual([]);
}

for (const locale of ['es', 'en'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const scale of [1, 2])
      test(`narrow header keeps whole words and usable targets (${locale}, ${theme}, ${scale}x)`, async ({
        page,
      }, info) => {
        await mockConnectionHome(page);
        await setAppearance(page, theme, locale);
        await page.setViewportSize({ width: 320, height: 740 });
        await page.goto('/');
        const opener = appMenuTrigger(page);
        await opener.evaluate((el, scale) => {
          el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * scale}px`;
        }, scale);
        await opener.focus();
        expect
          .soft((await opener.boundingBox())!.height)
          .toBeGreaterThanOrEqual(40);
        await expect(opener).toBeInViewport({ ratio: 1 });
        await expectIntactWords(opener);
        await page.screenshot({ path: info.outputPath('menu-opener.png') });
        await page.keyboard.press('Enter');
        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        if (scale === 2)
          await menu.evaluate((el) => {
            for (const node of el.querySelectorAll<HTMLElement>(
              '.app-menu-version,.app-menu-row',
            ))
              node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) * 2}px`;
          });
        for (const row of await menu.getByRole('menuitem').all())
          expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        expect(
          await menu.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await page.keyboard.press('Shift+Tab');
        await expect(menu.getByRole('menuitem').last()).toBeFocused();
        await expect(menu.getByRole('menuitem').last()).toBeInViewport({
          ratio: 1,
        });
        await page.screenshot({ path: info.outputPath('menu.png') });
        await page.keyboard.press('Escape');
        await expect(opener).toBeFocused();
        await chooseFromAppMenu(
          page,
          locale === 'es' ? 'Conexiones' : 'Connections',
        );
        const panel = page.locator('.connections-popup');
        if (scale === 2)
          await panel.evaluate((el) => {
            for (const node of el.querySelectorAll<HTMLElement>(
              'h2,h3,p,strong,button,.connection-status,.connection-subtype',
            ))
              node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) * 2}px`;
          });
        const actions = panel.locator('.connections-identity-actions button');
        await actions.first().focus();
        await page.screenshot({
          path: info.outputPath('connections-header.png'),
        });
        for (const action of await actions.all()) {
          expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(
            40,
          );
          await expectIntactWords(action);
          await expect(action).toBeInViewport({ ratio: 1 });
        }
        expect(
          await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        if (scale === 1) {
          const boxes = await actions.evaluateAll((elements) =>
            elements.map((el) => el.getBoundingClientRect().y),
          );
          expect(boxes[0]).toBe(boxes[1]);
          for (const item of await panel
            .locator('.connection-row-label strong,.connection-status')
            .all())
            await expect(item).toBeInViewport({ ratio: 1 });
        }
        for (const direction of ['Tab', 'Shift+Tab'])
          for (let index = 0; index < 16; index++) {
            await page.keyboard.press(direction);
            const visible = await page.evaluate(() => {
              const el = document.activeElement!;
              const rect = el.getBoundingClientRect();
              return el.contains(
                document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                ),
              );
            });
            expect(visible, `Obscured focus after ${direction}`).toBe(true);
          }
        await page.keyboard.press('Escape');
        await expect(panel).toHaveCount(0);
        await expect(opener).toBeFocused();
        await openAppMenu(page);
        await expect(menu.getByRole('menuitem').first()).toBeFocused();
      });
