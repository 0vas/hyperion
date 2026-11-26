import { test, expect, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { HyperionClient } from '../../src/adapters/client';
import { expectReadableText, setAppearance } from './connection-fixtures';

async function expectSeparatedHeader(panel: Locator) {
  const geometry = await panel
    .locator('.resultado-header')
    .evaluate((header) => {
      const box = (node: Element) => {
        const { left, right, top, bottom, width, height } =
          node.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      };
      return {
        header: box(header),
        items: [
          header.querySelector('.resultado-heading')!,
          ...header.querySelectorAll('button'),
        ]
          .map(box)
          .filter((rect) => rect.width && rect.height),
      };
    });
  for (const [index, item] of geometry.items.entries()) {
    expect(
      item.left,
      'Header controls must stay inside the panel',
    ).toBeGreaterThanOrEqual(geometry.header.left);
    expect(
      item.right,
      'Header controls must stay inside the panel',
    ).toBeLessThanOrEqual(geometry.header.right);
    expect(item.top).toBeGreaterThanOrEqual(geometry.header.top);
    expect(item.bottom).toBeLessThanOrEqual(geometry.header.bottom);
    for (const other of geometry.items.slice(index + 1)) {
      expect(
        item.left < other.right &&
          item.right > other.left &&
          item.top < other.bottom &&
          item.bottom > other.top,
        'Heading and controls must not overlap',
      ).toBe(false);
    }
  }
}

async function expectSeparatedGuidance(hint: Locator) {
  await hint.scrollIntoViewIfNeeded();
  const geometry = await hint.evaluate((element) => {
    const box = (node: Element) => {
      const { left, right, top, bottom } = node.getBoundingClientRect();
      return { left, right, top, bottom };
    };
    const paragraph = element.querySelector('p')!;
    const textRects = [...paragraph.childNodes]
      .filter(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      )
      .flatMap((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].map(
          ({ left, right, top, bottom }) => ({ left, right, top, bottom }),
        );
      });
    return {
      textRects,
      buttons: [...element.querySelectorAll('button')].map(box),
      hint: box(element),
      panel: box(element.closest('.resultado-stage')!),
      footer: box(
        element
          .closest('.resultado-stage')!
          .querySelector('.resultado-secondary')!,
      ),
    };
  });
  expect(geometry.textRects.length).toBeGreaterThan(0);
  expect(geometry.buttons.length).toBeGreaterThan(0);
  const textBottom = Math.max(...geometry.textRects.map((rect) => rect.bottom));
  for (const button of geometry.buttons) {
    expect(
      button.top,
      'Actions must start below the complete notice text',
    ).toBeGreaterThanOrEqual(textBottom + 6);
    expect(button.left).toBeGreaterThanOrEqual(geometry.hint.left);
    expect(button.right).toBeLessThanOrEqual(geometry.hint.right);
    expect(button.bottom).toBeLessThanOrEqual(geometry.hint.bottom);
    expect(button.left).toBeGreaterThanOrEqual(geometry.panel.left);
    expect(button.right).toBeLessThanOrEqual(geometry.panel.right);
    expect(button.bottom).toBeLessThanOrEqual(geometry.footer.top);
    for (const text of geometry.textRects) {
      expect(
        button.left < text.right &&
          button.right > text.left &&
          button.top < text.bottom &&
          button.bottom > text.top,
      ).toBe(false);
    }
  }
  for (let index = 1; index < geometry.buttons.length; index++) {
    const previous = geometry.buttons[index - 1]!;
    const next = geometry.buttons[index]!;
    expect(next.top >= previous.bottom || next.left >= previous.right).toBe(
      true,
    );
  }
}

for (const locale of ['en', 'es'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      test(`result guidance separates actions: ${locale} ${theme} ${width}`, async ({
        browser,
      }, testInfo) => {
        const agent = new HyperionClient({
          url: 'http://127.0.0.1:4318',
          token: JSON.parse(
            readFileSync('.hyperion-e2e/credentials.json', 'utf8'),
          ).agentToken,
        });
        const run = await agent.create({
          title: 'Synthetic guidance layout',
          steps: [
            { id: 'work', title: 'Synthetic result', kind: 'agent' },
            { id: 'ready', title: 'Synthetic continuation', kind: 'agent' },
          ],
        });
        await agent.command(run.id, { type: 'start', stepId: 'work' });
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          userAgent: 'Hyperion synthetic Electron/44.0',
        });
        const page = await context.newPage();
        try {
          await setAppearance(page, theme, locale);
          await page.addInitScript(
            ({ locale, width }) => {
              Object.defineProperty(window, 'hyperionDesktop', {
                value: {
                  ...(width === 1440
                    ? {
                        resumeConnector: {
                          id: 'synthetic-guidance-connector',
                          harness: 'codex',
                          sessionId: 'synthetic-guidance-session',
                          scope: 'managed-session',
                          capabilities: {
                            resume: true,
                            idempotentDelivery: true,
                          },
                        },
                      }
                    : {}),
                  getLanguage: async () => ({ preference: locale, locale }),
                  onLanguageChanged: () => () => {},
                  liveChat: {
                    harnesses: async () => ({
                      selected: 'codex',
                      harnesses: [
                        { id: 'codex', label: 'Codex', status: 'ready' },
                      ],
                    }),
                    onEvent: () => () => {},
                  },
                },
              });
              Object.defineProperty(navigator, 'clipboard', {
                value: {
                  writeText: async (text: string) => {
                    (
                      window as unknown as { copiedGuidance: string }
                    ).copiedGuidance = text;
                  },
                },
              });
            },
            { locale, width },
          );
          await page.goto(`/?run=${run.id}`);
          if (width === 1440) {
            await page.getByTestId('chat-bubble').click();
            await expect(page.getByTestId('live-chat-page')).toBeVisible();
          }
          const panel = page.getByTestId('resultado-stage');
          await page
            .getByRole('button', {
              name:
                locale === 'es' ? 'Abrir tarea enfocada' : 'Open focused task',
              exact: true,
            })
            .click();
          const hint = panel.locator('.step-hint').first();
          await expect(hint.getByRole('button')).toHaveCount(2);
          await page.screenshot({
            path: testInfo.outputPath('recovery-notice.png'),
          });
          await expectSeparatedHeader(panel);
          if (width < 960) {
            const toggle = panel.locator('.resultado-sheet-toggle');
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            await expectSeparatedHeader(panel);
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          }
          await expectSeparatedGuidance(hint);
          await expectReadableText(hint.locator('p'));
          expect(
            (
              await new AxeBuilder({ page })
                .include('.resultado-stage .step-hint')
                .withTags(['wcag2a', 'wcag2aa'])
                .analyze()
            ).violations,
          ).toEqual([]);
          const recover = hint.getByRole('button', {
            name: locale === 'es' ? 'Recuperar tarea' : 'Recover task',
            exact: true,
          });
          await recover.focus();
          await page.keyboard.press('Tab');
          const copy = hint.getByRole('button', {
            name: locale === 'es' ? 'Copiar continuación' : 'Copy continuation',
            exact: true,
          });
          await expect(copy).toBeFocused();
          await page.keyboard.press('Enter');
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  (window as unknown as { copiedGuidance: string })
                    .copiedGuidance,
              ),
            )
            .toContain(run.id);
          await expectSeparatedGuidance(hint);
          await recover.focus();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('dialog')).toBeVisible();
          await page
            .getByRole('button', {
              name: locale === 'es' ? 'Volver' : 'Back',
              exact: true,
            })
            .click();
          expect((await agent.get(run.id)).steps[0]!.status).toBe('running');
          await agent.command(run.id, {
            type: 'log',
            stepId: 'work',
            message: 'Permission denied: synthetic fixture',
          });
          await expect(hint).toContainText(
            locale === 'es' ? 'acceso denegado' : 'access was denied',
          );
          await expectSeparatedGuidance(hint);
          await panel
            .getByRole('button', {
              name: locale === 'es' ? 'Cerrar resultado' : 'Close result',
              exact: true,
            })
            .click();
          await page
            .getByRole('combobox', {
              name: locale === 'es' ? 'Ir a tarea' : 'Go to task',
              exact: true,
            })
            .selectOption('ready');
          await page
            .getByRole('button', {
              name:
                locale === 'es' ? 'Abrir tarea enfocada' : 'Open focused task',
              exact: true,
            })
            .click();
          const continuation = panel.locator('.wake-continuation-cta');
          await expect(continuation.getByRole('button')).toHaveCount(
            width === 1440 ? 2 : 1,
          );
          await expectSeparatedGuidance(continuation);
          // Text-only enlargement exercises wrapping without modifying application styles.
          await continuation.evaluate((element) => {
            element.querySelector('p')!.style.fontSize = '20px';
            element.querySelectorAll('button').forEach((button) => {
              button.style.fontSize = '20px';
            });
          });
          await panel.locator('.resultado-header').evaluate((header) => {
            header
              .querySelectorAll<HTMLElement>('h2, button')
              .forEach((element) => {
                element.style.fontSize = '20px';
              });
          });
          if (width < 960) {
            const toggle = panel.locator('.resultado-sheet-toggle');
            await toggle.click();
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
            // Keyboard operation remains additional coverage, not a pointer workaround.
            await toggle.focus();
            await page.keyboard.press('Enter');
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
            await page.keyboard.press('Enter');
            await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          }
          await expectSeparatedHeader(panel);
          await expectSeparatedGuidance(continuation);
          await page.screenshot({
            path: testInfo.outputPath('continuation-enlarged.png'),
          });
          await panel
            .getByRole('button', {
              name: locale === 'es' ? 'Cerrar resultado' : 'Close result',
              exact: true,
            })
            .click();
          await expect(panel).toHaveCount(0);
          expect(
            (await agent.get(run.id)).events.filter(
              (event) => event.type === 'retry',
            ),
          ).toHaveLength(0);
        } finally {
          await context.close();
        }
      });
    }
  }
}
