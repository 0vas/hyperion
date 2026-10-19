import { test, expect } from '@playwright/test';
import {
  connectionInventory,
  expectReadableText,
  mockConnectionHome,
  setAppearance,
} from './connection-fixtures';

for (const locale of ['es', 'en'] as const) {
  for (const theme of ['light', 'dark', 'system'] as const) {
    for (const configured of [0, 1]) {
      test(`empty home contrast (${locale}, ${theme}, ${configured} configured)`, async ({
        page,
      }, testInfo) => {
        await mockConnectionHome(page, {
          ...connectionInventory,
          summary: { configured, conflicts: 0, total: 5 },
        });
        await setAppearance(page, theme, locale);
        await page.emulateMedia({
          colorScheme: 'dark',
          reducedMotion: 'reduce',
        });
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute(
          'data-theme',
          theme === 'system' ? 'dark' : theme,
        );
        const home = page.locator('.empty-state');
        await expect(home.getByRole('heading')).toHaveText(
          locale === 'es'
            ? 'Tu trabajo, paso a paso.'
            : 'Your work, step by step.',
        );
        await expect(home.locator('.secondary')).toHaveCount(configured);
        await expectReadableText(home.locator('h1, p, .eyebrow, button'));
        await expect(home.locator('.empty-symbol')).toHaveCSS(
          'background-color',
          theme === 'light' ? 'rgb(233, 227, 208)' : 'rgb(35, 44, 51)',
        );
        for (const button of await home.getByRole('button').all()) {
          await button.focus();
          await expect(button).toBeFocused();
          await expect(button).toHaveCSS('outline-style', 'solid');
          await button.hover();
          await expectReadableText(button);
        }
        await page.screenshot({
          path: testInfo.outputPath('home-desktop.png'),
        });
        await page.setViewportSize({ width: 390, height: 844 });
        for (const button of await home.getByRole('button').all())
          await expect(button).toBeInViewport();
        await expectReadableText(home.locator('h1, p, .eyebrow, button'));
        await page.screenshot({ path: testInfo.outputPath('home-narrow.png') });
      });
    }
  }
}
