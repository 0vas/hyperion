import { test, expect } from '@playwright/test';
import { chooseFromAppMenu } from './app-menu';

test('empty home keeps readable contrast in light and dark', async ({
  page,
}) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.goto('/');
    await chooseFromAppMenu(page, 'Ajustes');
    await page.getByLabel('Tema', { exact: true }).selectOption(theme);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.mouse.move(0, 0);
    const heading = page.locator('.empty-state h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(241, 238, 229)' : 'rgb(41, 45, 41)',
    );
    const body = page.locator('.empty-state p').first();
    await expect(body).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(187, 190, 183)' : 'rgb(98, 100, 92)',
    );
    const secondary = page.locator('.empty-actions .secondary');
    if ((await secondary.count()) > 0 && theme === 'dark') {
      await expect(secondary).toHaveCSS('color', 'rgb(223, 193, 135)');
      await expect(secondary).toHaveCSS('background-color', 'rgb(35, 44, 51)');
    }
    if (theme === 'dark') {
      const primary = page.locator('.empty-actions .primary');
      await expect(primary).toHaveCSS('color', 'rgb(32, 40, 44)');
      await expect(primary).toHaveCSS('background-color', 'rgb(223, 193, 135)');
    }
    // Typography contrast (the #30372d regression). Button faces are asserted
    // via computed styles above — axe can mis-sample rounded CTA backgrounds.
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    expect(
      (
        await new AxeBuilder({ page })
          .include('.empty-state h1')
          .include('.empty-state p')
          .include('.empty-state .eyebrow')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});
