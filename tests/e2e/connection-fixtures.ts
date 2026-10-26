import { expect, type Locator, type Page } from '@playwright/test';
import type { ConnectionInventory } from '../../src/client/Connections';

export const connectionInventory: ConnectionInventory = {
  version: '2026.10.26.1533',
  channel: 'preview',
  serviceUrl: 'http://127.0.0.1:4318',
  summary: { configured: 1, conflicts: 1, total: 5 },
  integrations: [
    {
      id: 'codex',
      name: 'Codex',
      status: 'conflict',
      path: '/synthetic/home/.codex/config.toml',
      existing: { command: 'old-runtime', envKeys: ['API_TOKEN'] },
      expected: {
        command: 'hyperion-runtime',
        envKeys: ['HYPERION_URL'],
        url: 'http://127.0.0.1:4318',
      },
    },
    {
      id: 'cursor',
      name: 'Cursor',
      status: 'configured',
      path: '/synthetic/home/.cursor/mcp.json',
    },
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      status: 'missing',
      path: '/synthetic/home/Library/Application Support/Claude/claude_desktop_config.json',
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      status: 'unknown',
      path: '/synthetic/home/.claude/skills/hyperion/SKILL.md',
    },
    {
      id: 'antigravity',
      name: 'Antigravity',
      status: 'missing',
      path: '/synthetic/home/.gemini/antigravity/mcp_config.json',
    },
  ],
};

export async function mockConnectionHome(
  page: Page,
  inventory = connectionInventory,
) {
  await page.route('**/api/runs', (route) => route.fulfill({ json: [] }));
  // A full-suite server also contains runs created by earlier scenarios.
  // Keep the live snapshot consistent with this synthetic empty home.
  await page.route('**/api/events', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: 'event: snapshot\ndata: []\n\n',
    }),
  );
  await page.route('**/api/connections', (route) =>
    route.fulfill({ json: inventory }),
  );
}

export async function setAppearance(
  page: Page,
  theme: 'light' | 'dark' | 'system',
  locale: 'es' | 'en',
  reduceMotion = true,
) {
  await page.addInitScript(
    ({ theme, locale, reduceMotion }) => {
      localStorage.setItem(
        'hyperion.preferences.v1',
        JSON.stringify({ theme, reduceMotion }),
      );
      localStorage.setItem('hyperion.language.v1', locale);
    },
    { theme, locale, reduceMotion },
  );
}

export async function openConnectionRow(page: Page, id: string) {
  const row = page.locator(`[data-client-id="${id}"]`);
  const toggle = row.locator('.connection-row-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return row;
}

// Resolve computed CSS colors, including color-mix and alpha, against the solid
// surfaces used by these views. Sampling avoids rounded-button axe false alarms.
export async function expectReadableText(
  locator: Locator,
  {
    property = 'color',
    min = 4.5,
  }: { property?: 'color' | 'outlineColor'; min?: number } = {},
) {
  const samples = await locator.evaluateAll((elements, property) => {
    const context = document.createElement('canvas').getContext('2d')!;
    function rgba(color: string) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].map((v) => v / 255);
    }
    function over(front: number[], back: number[]) {
      return back.map((v, i) => front[i]! * front[3]! + v * (1 - front[3]!));
    }
    function luminance(color: number[]) {
      const linear = color
        .slice(0, 3)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
    }
    return elements.map((element) => {
      const ancestors = [];
      for (let node: Element | null = element; node; node = node.parentElement)
        ancestors.unshift(node);
      let background = [1, 1, 1];
      for (const node of ancestors) {
        if (property === 'outlineColor' && node === element) continue;
        background = over(
          rgba(getComputedStyle(node).backgroundColor),
          background,
        );
      }
      const foreground = over(
        rgba(getComputedStyle(element)[property]),
        background,
      );
      const values = [luminance(foreground), luminance(background)].sort(
        (a, b) => b - a,
      );
      return {
        text: element.textContent,
        ratio: (values[0]! + 0.05) / (values[1]! + 0.05),
      };
    });
  }, property);
  expect(samples.length).toBeGreaterThan(0);
  expect(
    samples.filter((sample) => sample.ratio < min),
    `${property} below ${min}:1 contrast`,
  ).toEqual([]);
}
