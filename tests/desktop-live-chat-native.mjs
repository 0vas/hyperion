// Opt-in real provider smoke: node --test tests/desktop-live-chat-native.mjs
// Uses HYPERION_TEST_HARNESS (default codex) and an isolated Hyperion data directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from '@playwright/test';
const harness = process.env.HYPERION_TEST_HARNESS || 'codex';
assert.ok(['codex', 'claude', 'cursor', 'antigravity'].includes(harness));

test(
  process.env.HYPERION_EXPECT_AUTH_REQUIRED === '1'
    ? `real Desktop reports missing ${harness} authentication without trapping the provider selector`
    : `real Desktop chat sends through ${harness}, switches providers and retains its draft`,
  { timeout: 120000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'hyperion-chat-native-'));
    const directory = join(home, 'data');
    const profile = join(home, 'profile');
    const workflowTitle = `Verificación local ${crypto.randomUUID()}`;
    mkdirSync(profile);
    writeFileSync(
      join(profile, 'language.json'),
      JSON.stringify({ language: 'es' }),
    );
    writeFileSync(
      join(profile, 'live-harness-launcher.json'),
      JSON.stringify({ selected: harness }),
    );
    const url = 'http://127.0.0.1:4349';
    const env = {
      ...process.env,
      HYPERION_HOME: home,
      HYPERION_DATA_DIR: directory,
      HYPERION_PORT: '4349',
      HYPERION_URL: url,
      HYPERION_DISABLE_UPDATE_CHECK: '1',
    };
    const service = spawn(process.execPath, ['dist/server/main.js'], {
      env,
      stdio: 'ignore',
    });
    let app;
    try {
      const deadline = Date.now() + 10000;
      while (true) {
        try {
          if ((await fetch(url + '/api/health')).ok) break;
        } catch {}
        if (Date.now() > deadline)
          throw new Error('Isolated service did not start');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const { agentToken } = JSON.parse(
        readFileSync(join(directory, 'credentials.json'), 'utf8'),
      );
      const response = await fetch(url + '/api/runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${agentToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          plan: {
            title: workflowTitle,
            steps: [
              { id: 'verify', title: 'Verificar conversación', kind: 'agent' },
            ],
          },
        }),
      });
      assert.equal(response.status, 201);
      const run = await response.json();
      const args = [
        `--user-data-dir=${profile}`,
        `--hyperion-run=${run.id}`,
        `--hyperion-url=${url}`,
        `--hyperion-directory=${directory}`,
      ];
      app = await _electron.launch({
        ...(process.env.HYPERION_DESKTOP_EXECUTABLE
          ? { executablePath: process.env.HYPERION_DESKTOP_EXECUTABLE }
          : {}),
        args: process.env.HYPERION_DESKTOP_EXECUTABLE
          ? args
          : ['desktop/main.mjs', ...args],
        env,
      });
      const page = await app.firstWindow();
      await page.getByRole('button', { name: 'Chat', exact: true }).click();
      const input = page.getByLabel('Petición para el agente');
      await input.fill(
        'Sin usar herramientas, responde exactamente: Conversación nativa verificada.',
      );
      await input.press('Enter');
      if (process.env.HYPERION_EXPECT_AUTH_REQUIRED === '1') {
        await page
          .locator('.live-chat-notice code')
          .waitFor({ timeout: 45000 });
        assert.ok(
          (await input.inputValue()).includes('Conversación nativa verificada'),
        );
        await page.getByTestId('live-chat-harness').selectOption('codex');
        assert.equal(
          await page.getByTestId('live-chat-harness').inputValue(),
          'codex',
        );
        console.log(
          `Verified ${harness} auth recovery, not an authenticated conversation.`,
        );
        return;
      }
      await page
        .getByTestId('live-chat-message-assistant')
        .filter({ hasText: 'Conversación nativa verificada' })
        .waitFor({ timeout: 60000 });
      await page
        .getByTestId('live-chat-status')
        .filter({ hasText: 'Sesión lista' })
        .waitFor();
      if (process.env.HYPERION_TEST_MCP === '1') {
        await input.fill(
          'Usa solamente hyperion_get_run para leer el flujo activo. Responde con su título exacto obtenido de la herramienta. No crees agentes ni modifiques nada.',
        );
        await input.press('Enter');
        const answer = page
          .getByTestId('live-chat-message-assistant')
          .filter({ hasText: workflowTitle });
        const permission = page.getByTestId('live-chat-approval-allow');
        await Promise.race([
          answer.waitFor({ timeout: 60000 }),
          permission.waitFor({ timeout: 60000 }),
        ]);
        if (await permission.isVisible()) {
          // Only the read-only operation on this isolated test workflow is authorized.
          const card = permission.locator('..').locator('..');
          assert.match(await card.innerText(), /hyperion_get_run/);
          await permission.click();
        }
        await answer.waitFor({ timeout: 60000 });
        await page
          .getByTestId('live-chat-status')
          .filter({ hasText: 'Sesión lista' })
          .waitFor();
      }
      await input.fill('Borrador conservado');
      await page.getByRole('button', { name: 'Volver al canvas' }).click();
      await page.getByRole('button', { name: 'Chat', exact: true }).click();
      assert.equal(await input.inputValue(), 'Borrador conservado');
      for (const provider of ['claude', 'codex', 'cursor', 'antigravity']) {
        await page.getByTestId('live-chat-harness').selectOption(provider);
      }
      await page.getByTestId('live-chat-harness').selectOption(harness);
      assert.equal(await input.inputValue(), 'Borrador conservado');
      await page.screenshot({ path: join(home, 'chat-native.png') });
      await page.evaluate(() => window.hyperionDesktop.setLanguage('en'));
      await page.getByPlaceholder('Write your message…').waitFor();
      assert.equal(
        await page.getByPlaceholder('Write your message…').inputValue(),
        'Borrador conservado',
      );
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      await page.screenshot({ path: join(home, 'chat-native-dark-en.png') });
      console.log(`Native chat evidence: ${join(home, 'chat-native.png')}`);
    } catch (error) {
      const page = app?.windows()[0];
      if (page) {
        await page
          .screenshot({ path: join(home, 'chat-failure.png') })
          .catch(() => {});
        console.log(
          `Native failure evidence: ${join(home, 'chat-failure.png')}`,
        );
        console.log(
          await page
            .getByTestId('live-chat-page')
            .innerText()
            .catch(() => 'Page unavailable'),
        );
      }
      throw error;
    } finally {
      await app?.close();
      service.kill('SIGTERM');
    }
  },
);
