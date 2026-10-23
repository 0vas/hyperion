import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pages = [
  '',
  'guia/primeros-pasos',
  'guia/usar-el-flujo',
  'guia/integraciones',
  'guia/reanudacion',
  'referencia/arquitectura',
  'referencia/limites',
  'contribuir',
  'despliegue',
];
/** EN birth-story slug differs from ES (`the-landscape` vs `el-paisaje`). */
const localePaths = [
  ...pages,
  ...pages.map((path) => `en/${path}`),
  'guia/el-paisaje',
  'en/guia/the-landscape',
];
test('all guides load under the Pages subpath with working internal links and no local service', async ({
  page,
  request,
}) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).port === '4317')
      failures.push('Documentation accessed the local application');
  });
  const links = new Set();
  for (const path of localePaths) {
    const response = await page.goto(
      `/hyperion/${path}${path && !path.endsWith('/') ? '.html' : ''}`,
    );
    expect(response.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    for (const href of await page
      .locator('a[href]')
      .evaluateAll((anchors) => anchors.map((a) => a.href))) {
      const url = new URL(href);
      if (url.origin !== 'http://127.0.0.1:4175') continue;
      expect(url.pathname).toMatch(/^\/hyperion\//);
      if (url.pathname === new URL(page.url()).pathname && url.hash)
        expect(
          await page
            .locator(
              `[id=${JSON.stringify(decodeURIComponent(url.hash.slice(1)))}]`,
            )
            .count(),
        ).toBeGreaterThan(0);
      url.hash = '';
      links.add(url.href);
    }
  }
  for (const href of links)
    expect((await request.get(href)).status(), href).toBe(200);
  expect(failures).toEqual([]);
});

test('a new reader can find setup and search for retry', async ({ page }) => {
  await page.goto('/hyperion/');
  await page.getByRole('link', { name: 'Empezar', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Tu primer flujo');
  await expect(
    page.getByRole('link', { name: 'Descargar Hyperion Desktop', exact: true }),
  ).toHaveAttribute('href', /releases\/tag\/v2026.10.23.1732/);
  await page.getByRole('button', { name: /Buscar/ }).click();
  await page.locator('#localsearch-input').fill('Reintentar');
  await expect(page.locator('.VPLocalSearchBox a').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#localsearch-input')).not.toBeVisible();
});

test('mobile navigation and reading remain accessible in both themes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const path of [
      '',
      'guia/primeros-pasos.html',
      'en/',
      'en/guia/primeros-pasos.html',
    ]) {
      await page.goto(`/hyperion/${path}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: `../../test-results/docs/${theme}-${path.startsWith('en/') ? 'en-' : ''}${path.includes('primeros') ? 'guide' : 'home'}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto('/hyperion/guia/primeros-pasos.html');
  await page.getByRole('button', { name: /Navegación móvil/ }).click();
  await page.getByRole('link', { name: 'Guía', exact: true }).click();
  await expect(page.locator('h1')).toContainText(
    'Un paisaje para el trabajo de tu IA',
  );
});

test('language switch preserves the page and English search stays in English', async ({
  page,
}) => {
  await page.goto('/hyperion/referencia/arquitectura.html');
  await page.getByRole('button', { name: /Cambiar idioma/ }).click();
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/referencia\/arquitectura.html/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('Architecture');
  await page
    .getByRole('button', { name: /Search/ })
    .first()
    .click();
  await page.locator('#localsearch-input').fill('Retry');
  await expect(page.locator('.VPLocalSearchBox a').first()).toHaveAttribute(
    'href',
    /\/en\//,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Change language/ }).click();
  await page.getByRole('link', { name: 'Español', exact: true }).click();
  await expect(page).toHaveURL('/hyperion/referencia/arquitectura.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('branded pages offer direct installers and a working Archify viewer in both languages', async ({
  page,
}) => {
  for (const locale of ['', 'en/']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/hyperion/${locale}`);
    await page.screenshot({
      path: `../../test-results/docs/home-${locale ? 'en' : 'es'}-desktop.png`,
      fullPage: true,
    });
    await expect(
      page.getByRole('img', { name: /Hyperion.*solar/ }),
    ).toBeVisible();
    for (const [name, asset] of [
      ['macOS · Apple Silicon', 'mac-arm64.dmg'],
      ['Windows · x64', 'win-x64.exe'],
    ]) {
      await expect(
        page.getByRole('link', { name, exact: true }),
      ).toHaveAttribute(
        'href',
        `https://github.com/0vas/hyperion/releases/download/v2026.10.23.1732/Hyperion-2026.10.23.1732-${asset}`,
      );
    }
    await page.goto(`/hyperion/${locale}referencia/arquitectura.html`);
    await expect(
      page.frameLocator('iframe').locator('svg').first(),
    ).toBeVisible();
    await page.screenshot({
      path: `../../test-results/docs/architecture-${locale ? 'en' : 'es'}.png`,
      fullPage: true,
    });
    const fullViewer = page.getByRole('link', {
      name: locale ? 'Explore in Archify' : 'Explorar en Archify',
      exact: true,
    });
    await expect(fullViewer).toHaveAttribute('target', '_self');
    await Promise.all([
      page.waitForEvent(
        'request',
        (request) =>
          request.resourceType() === 'document' &&
          request.url().includes('/architecture/hyperion-'),
      ),
      fullViewer.click(),
    ]);
    await expect(page.locator('svg').first()).toBeVisible();
    await expect(page.locator('body')).toContainText('Hyperion');
  }
});

test('interactive quickstart teaches a human decision and review without a live agent', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });
  for (const en of [false, true]) {
    await page.goto(`/hyperion/${en ? 'en/' : ''}guia/primeros-pasos.html`);
    const demo = page.getByRole('region', {
      name: en ? 'Interactive example' : 'Ejemplo interactivo',
      exact: true,
    });
    await expect(demo).toContainText(en ? 'Simulation' : 'Simulación');
    await demo
      .getByRole('button', {
        name: en ? 'Create the plan' : 'Crear el plan',
        exact: true,
      })
      .click();
    await expect(
      demo.getByRole('button', {
        name: en ? 'Save answer' : 'Guardar respuesta',
        exact: true,
      }),
    ).toBeDisabled();
    await demo
      .getByLabel(
        en ? 'Who is the guide for?' : '¿A quién va dirigida la guía?',
        { exact: true },
      )
      .selectOption('team');
    await demo
      .getByRole('button', {
        name: en ? 'Save answer' : 'Guardar respuesta',
        exact: true,
      })
      .click();
    await expect(demo).toContainText(
      en ? 'Welcome to the team' : 'Bienvenido al equipo',
    );
    await demo
      .getByRole('button', {
        name: en ? 'Approve draft' : 'Aprobar borrador',
        exact: true,
      })
      .click();
    await expect(demo.getByRole('status')).toContainText(
      en ? 'Example completed' : 'Ejemplo completado',
    );
    await demo
      .getByRole('button', {
        name: en ? 'Restart example' : 'Reiniciar ejemplo',
        exact: true,
      })
      .click();
    await expect(
      demo.getByRole('button', {
        name: en ? 'Create the plan' : 'Crear el plan',
        exact: true,
      }),
    ).toBeVisible();
  }
  expect(requests).toEqual([]);
});

test('home motion can be paused and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/hyperion/');
  const motion = page.locator('.home-motion .link-current').first();
  await expect(motion).toHaveCSS('animation-play-state', 'running');
  await page
    .getByRole('button', { name: 'Pausar animación', exact: true })
    .click();
  await expect(motion).toHaveCSS('animation-play-state', 'paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(motion).toHaveCSS('animation-name', 'none');
});

test('demo forms, evidence and review stay accessible in narrow layouts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const en of [false, true]) {
      await page.goto(`/hyperion/${en ? 'en/' : ''}guia/primeros-pasos.html`);
      const demo = page.getByRole('region', {
        name: en ? 'Interactive example' : 'Ejemplo interactivo',
        exact: true,
      });
      await demo
        .getByRole('button', {
          name: en ? 'Create the plan' : 'Crear el plan',
          exact: true,
        })
        .click();
      await demo.getByRole('combobox').selectOption('users');
      await demo.getByRole('combobox').focus();
      await page.keyboard.press('Tab');
      await expect(
        demo.getByRole('button', {
          name: en ? 'Save answer' : 'Guardar respuesta',
          exact: true,
        }),
      ).toBeFocused();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.keyboard.press('Enter');
      await demo.locator('summary').first().click();
      await expect(demo.locator('dd').first()).toHaveText(
        en ? 'new users' : 'nuevos usuarios',
      );
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await demo.screenshot({
        path: `../../test-results/docs/demo-review-${theme}-${en ? 'en' : 'es'}.png`,
      });
    }
  }
});

test('the demo uses the Hyperion canvas and keeps SVG task states in sync', async ({
  page,
}) => {
  await page.goto('/hyperion/guia/primeros-pasos.html');
  const demo = page.getByRole('region', {
    name: 'Ejemplo interactivo',
    exact: true,
  });
  await expect(demo.locator('.product-canvas')).toBeVisible();
  await demo
    .getByRole('button', { name: 'Crear el plan', exact: true })
    .click();
  await expect(demo.locator('[data-task="audience"]').first()).toHaveAttribute(
    'data-state',
    'waiting',
  );
  await demo.getByRole('combobox').selectOption('team');
  await demo
    .getByRole('button', { name: 'Guardar respuesta', exact: true })
    .click();
  await expect(demo.locator('[data-task="draft"]').first()).toHaveAttribute(
    'data-state',
    'completed',
  );
  await expect(demo.locator('[data-task="review"]').first()).toHaveAttribute(
    'data-state',
    'waiting',
  );
  await demo
    .getByRole('button', { name: 'Aprobar borrador', exact: true })
    .click();
  await expect(demo.locator('[data-task="review"]').first()).toHaveAttribute(
    'data-state',
    'completed',
  );
});

test('quickstart offers specific use cases, copyable prompts and source commands', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const en of [false, true]) {
    await page.goto(`/hyperion/${en ? 'en/' : ''}guia/primeros-pasos.html`);
    await page
      .getByRole('button', {
        name: en ? 'Code review' : 'Revisión de código',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: en ? 'Copy request' : 'Copiar petición',
        exact: true,
      })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      en ? 'Use Hyperion to review' : 'Usa Hyperion para revisar',
    );
    await page
      .getByText(en ? 'Try it from source' : 'Probar desde el código fuente', {
        exact: true,
      })
      .click();
    await expect(
      page.locator('pre').filter({ hasText: 'npm run build' }),
    ).toBeVisible();
  }
});

test('video landing uses a centered headline, wide product view and controllable media', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const en of [false, true]) {
    await page.goto(`/hyperion/${en ? 'en/' : ''}`);
    const hero = page.locator('.landscape-hero');
    await expect(hero.locator('.cinema-menu')).toHaveCount(0);
    await expect(hero.locator('.landscape-copy .landscape-motion')).toHaveCount(
      1,
    );
    const title = await hero.locator('h1').boundingBox();
    expect(Math.abs(title.x + title.width / 2 - 720)).toBeLessThan(5);
    expect(
      (await hero.locator('.landscape-product').boundingBox()).width,
    ).toBeGreaterThan(1000);
    const video = page.locator('.cinema-video').first();
    await expect(page.locator('.cinema-video')).toHaveCount(2);
    await expect(video).toHaveAttribute('src', /cloudfront.*mp4/);
    await expect(video).toHaveJSProperty('muted', true);
    await expect(video).toHaveJSProperty('loop', false);
    await hero
      .getByRole('button', {
        name: en ? 'Pause background' : 'Pausar fondo',
        exact: true,
      })
      .click();
    await expect(video).toHaveJSProperty('paused', true);
    await expect(
      hero.getByRole('button', {
        name: en ? 'Resume background' : 'Reanudar fondo',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(video).not.toHaveAttribute('src');
    await expect(hero.locator('.headline-active .headline-accent')).toHaveCSS(
      'animation-name',
      'none',
    );
    await expect(hero.locator('.headline-active')).toHaveText(
      en ? 'Your ideas.In motion.' : 'Tus ideas.En movimiento.',
    );
    await expect(hero.locator('.headline-active .headline-caret')).toHaveCount(
      0,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `../../test-results/docs/cinema-${en ? 'en' : 'es'}.png`,
    });
    await hero
      .getByRole('link', {
        name: en ? 'Try the canvas' : 'Probar el canvas',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', {
        name: en ? 'Interactive example' : 'Ejemplo interactivo',
        exact: true,
      }),
    ).toBeInViewport();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
});

test('birth story page and home teaser ship in both languages with static diagrams', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/hyperion/');
  await expect(page.locator('.landscape-hero')).toBeVisible();
  const teaser = page.locator('.landscape-teaser');
  await expect(teaser.getByRole('heading', { level: 2 })).toHaveText(
    'Del chat que responde al proceso que guías',
  );
  await expect(
    teaser.getByRole('link', { name: 'Leer el paisaje', exact: true }),
  ).toHaveAttribute('href', '/hyperion/guia/el-paisaje.html');
  await expect(teaser.locator('.landscape-compare.compact')).toBeVisible();
  await expect(teaser.locator('.mini-flow li').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  await teaser
    .getByRole('link', { name: 'Leer el paisaje', exact: true })
    .click();
  await expect(page.locator('h1')).toContainText(
    'Un paisaje para el trabajo de tu IA',
  );
  await expect(
    page.getByText(
      'Cuando la IA deja de solo responder y empieza a actuar, necesitas un paisaje — no solo un chat.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('.landscape-compare')).toBeVisible();
  await expect(page.locator('.landscape-loop')).toBeVisible();
  await expect(page.locator('.mini-flow li').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  await expect(
    page.getByRole('link', {
      name: 'Empieza con tu primer flujo',
      exact: true,
    }),
  ).toHaveAttribute('href', /primeros-pasos/);
  await expect(
    page
      .locator('.VPSidebar')
      .getByRole('link', { name: 'El paisaje', exact: true }),
  ).toBeVisible();
  await page.goto('/hyperion/en/');
  await expect(
    page
      .locator('.landscape-teaser')
      .getByRole('link', { name: 'Read the landscape', exact: true }),
  ).toHaveAttribute('href', '/hyperion/en/guia/the-landscape.html');
  await page
    .locator('.landscape-teaser')
    .getByRole('link', { name: 'Read the landscape', exact: true })
    .click();
  await expect(page.locator('h1')).toContainText('A landscape for your AI');
  await expect(
    page.getByRole('heading', { name: /You in the loop/ }),
  ).toBeVisible();
  await expect(page.locator('.landscape-loop .loop-box').nth(3)).toHaveText(
    'Your decision',
  );
  await expect(
    page
      .locator('.VPSidebar')
      .getByRole('link', { name: 'The landscape', exact: true }),
  ).toBeVisible();
});

for (const { path, first, next, pause, resume } of [
  {
    path: '/hyperion/',
    first: ['Tus ideas.', 'En movimiento.'],
    next: ['De un chat.', 'A un plan.'],
    pause: 'Pausar fondo',
    resume: 'Reanudar fondo',
  },
  {
    path: '/hyperion/en/',
    first: ['Your ideas.', 'In motion.'],
    next: ['From a chat.', 'To a plan.'],
    pause: 'Pause background',
    resume: 'Resume background',
  },
]) {
  test(`hero headline records phrase transitions and freezes on pause or reduced motion: ${path}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.clock.install();
    await page.goto(path);
    const title = page.locator('#landscape-title');
    const active = title.locator('.headline-active');
    const live = page.locator('.headline-live');
    await expect(title).toBeVisible();
    await expect(active).toHaveText(first.join(''));
    await expect(title).toHaveAttribute('aria-label', first.join(' '));
    await expect(active).toHaveAttribute('aria-hidden', 'true');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveText(first.join(' '));

    // The empty gap is only 400 ms. Capture DOM transitions and their geometry
    // together; polling the current text can miss the entire gap between samples.
    const observation = await title.evaluateHandle((heading) => {
      const text = heading.querySelector('.headline-active');
      const announcement =
        heading.parentElement.querySelector('.headline-live');
      const samples = [];
      const record = () => {
        samples.push({
          text: text.innerText.replace(/\s+/g, ''),
          height: heading.getBoundingClientRect().height,
          label: heading.getAttribute('aria-label'),
          announcement: announcement.textContent,
        });
      };
      const observer = new MutationObserver(record);
      observer.observe(text, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      observer.observe(announcement, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      record();
      return { samples, disconnect: () => observer.disconnect() };
    });
    try {
      await expect
        .poll(
          () =>
            observation.evaluate(
              ({ samples }, label) =>
                samples.some(
                  (sample) =>
                    sample.text === label.replace(/\s+/g, '') &&
                    sample.announcement === label,
                ),
              next.join(' '),
            ),
          { timeout: 12_000 },
        )
        .toBe(true);
      const samples = await observation.evaluate(({ samples }) => samples);
      expect(samples.some(({ text }) => text === '')).toBe(true);
      const heightBefore = samples[0].height;
      expect(heightBefore).toBeGreaterThan(0);
      for (const sample of samples) {
        expect(Math.abs(sample.height - heightBefore)).toBeLessThan(2);
        expect(sample.label).toBe(first.join(' '));
      }
    } finally {
      await observation.evaluate(({ disconnect }) => disconnect());
      await observation.dispose();
    }

    await page.getByRole('button', { name: pause, exact: true }).click();
    await expect(active).toHaveText(first.join(''));
    await expect(active.locator('.headline-caret')).toHaveCount(0);
    // Advance browser timers beyond a whole phrase cycle without a wall-clock sleep.
    await page.clock.runFor(6000);
    await expect(active).toHaveText(first.join(''));
    await expect(active.locator('.headline-caret')).toHaveCount(0);

    // Release manual pause before reduced motion hides the motion control.
    await page.getByRole('button', { name: resume, exact: true }).click();
    await expect(
      page.getByRole('button', { name: pause, exact: true }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(active).toHaveText(first.join(''));
    await expect(active.locator('.headline-caret')).toHaveCount(0);
    await page.clock.runFor(6000);
    await expect(active).toHaveText(first.join(''));
    await expect(active.locator('.headline-caret')).toHaveCount(0);
    await expect(title).toHaveAttribute('aria-label', first.join(' '));
  });
}

test('cinematic landing stays readable in split windows and small phones', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 820, 1024]) {
    await page.setViewportSize({ width, height: 768 });
    await page.goto('/hyperion/');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const hero = page.locator('.landscape-hero');
    for (const selector of ['h1', '.landscape-actions', '.landscape-product']) {
      const bounds = await hero.locator(selector).boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    if (width === 320) {
      await page.getByRole('button', { name: /Navegación móvil/ }).click();
      await page.getByRole('link', { name: 'Guía', exact: true }).click();
      await expect(page.locator('h1')).toContainText(
        'Un paisaje para el trabajo de tu IA',
      );
    } else {
      await page.screenshot({
        path: `../../test-results/docs/cinema-split-${width}.png`,
      });
    }
  }
});

test('video failure keeps the poster, navigation and download actions usable', async ({
  page,
}) => {
  await page.route('https://d8j0ntlcm91z4.cloudfront.net/**', (route) =>
    route.abort(),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const failure = page.waitForEvent('requestfailed', (request) =>
    request.url().includes('cloudfront.net'),
  );
  await page.goto('/hyperion/');
  await failure;
  const video = page.locator('.cinema-video').first();
  await expect(page.locator('.cinema-video')).toHaveCount(2);
  await expect(video).not.toHaveAttribute('src');
  await expect(video).toHaveAttribute(
    'poster',
    '/hyperion/brand/cinema-poster.svg',
  );
  await expect(page.locator('#landscape-title .headline-active')).toHaveText(
    'Tus ideas.En movimiento.',
  );
  await page
    .getByRole('link', { name: 'Descargar Hyperion', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'macOS · Apple Silicon', exact: true }),
  ).toBeInViewport();
});

test('home theme switch changes the actual page and preserves it across navigation', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/hyperion/');
  await expect(page.locator('.cinema-guides')).toHaveCount(0);
  const title = page.locator('#landscape-title');
  const lightColor = await title.evaluate((el) => getComputedStyle(el).color);
  await page.getByRole('switch', { name: 'Cambiar tema' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(title).not.toHaveCSS('color', lightColor);
  const darkColor = await title.evaluate((el) => getComputedStyle(el).color);
  await page.getByRole('switch', { name: 'Cambiar tema' }).click();
  await expect(title).toHaveCSS('color', lightColor);
  await page.reload();
  await expect(title).toHaveCSS('color', lightColor);
  await expect(title).not.toHaveCSS('color', darkColor);
  await page.getByRole('link', { name: 'Contribuir', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('repository is discoverable with Shields badges and SVG actions in both languages', async ({
  page,
}) => {
  for (const en of [false, true]) {
    await page.goto(`/hyperion/${en ? 'en/' : ''}`);
    const badges = page.locator('.project-badges img');
    await expect(badges).toHaveCount(3);
    for (const badge of await badges.all())
      await expect(badge).toHaveAttribute('src', /^https:\/\/img.shields.io\//);
    await expect(page.locator('.landscape-primary svg')).toHaveCount(2);
    await page.goto(`/hyperion/${en ? 'en/' : ''}contribuir.html`);
    const repo = page.getByRole('link', {
      name: en ? 'Open repository on GitHub' : 'Abrir repositorio en GitHub',
      exact: true,
    });
    await expect(repo).toBeVisible();
    await expect(repo).toHaveAttribute(
      'href',
      'https://github.com/0vas/hyperion',
    );
    await expect(repo.locator('svg')).toHaveCount(2);
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: `../../test-results/docs/contribute-${theme}-${en ? 'en' : 'es'}.png`,
      });
    }
  }
});

test('downloads identify platforms and illustrated guides reveal contextual annotations', async ({
  page,
}) => {
  for (const locale of ['', 'en/']) {
    await page.goto(`/hyperion/${locale}`);
    await expect(
      page.locator('.download-card svg[data-platform="macos"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('.download-card svg[data-platform="windows"]'),
    ).toHaveCount(1);
    for (const guide of ['guia/usar-el-flujo', 'guia/reanudacion']) {
      await page.goto(`/hyperion/${locale}${guide}.html`);
      const lens = page.locator('.guide-lens');
      await expect(lens).toBeVisible();
      const buttons = lens.getByRole('button');
      await expect(buttons).toHaveCount(3);
      const initial = await lens.locator('.guide-annotation').innerText();
      await buttons.nth(2).focus();
      await page.keyboard.press('Enter');
      await expect(buttons.nth(2)).toHaveAttribute('aria-pressed', 'true');
      await expect(lens.locator('.guide-annotation')).not.toHaveText(initial);
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        await page.setViewportSize({ width: 390, height: 844 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          (
            await new AxeBuilder({ page })
              .include('.guide-lens')
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
      }
    }
  }
});

test('slow external badges do not block the landing page', async ({ page }) => {
  const pending = [];
  await page.route('https://img.shields.io/**', (route) => pending.push(route));
  try {
    await page.goto('/hyperion/', { waitUntil: 'load', timeout: 5000 });
    await expect(page.locator('h1')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Descargar Hyperion', exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.allSettled(pending.map((route) => route.abort()));
  }
});

test('home explores six goals with isolated decisions and copyable requests', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const en of [false, true]) {
    await page.goto(`/hyperion/${en ? 'en/' : ''}`);
    await expect(
      page.getByText(
        en
          ? 'The same request can open different paths.'
          : 'Una misma petición puede abrir caminos distintos.',
      ),
    ).toBeVisible();
    const explorer = page.getByRole('region', {
      name: en ? 'Explore use cases' : 'Explora los casos de uso',
      exact: true,
    });
    await expect(explorer).toBeVisible();
    await expect(explorer.locator('.goal-kicker')).toHaveText(
      en ? 'ONE REQUEST, DIFFERENT PATHS' : 'UNA PETICIÓN, DISTINTOS CAMINOS',
    );
    await expect(
      explorer.locator('.goal-preview-title span').last(),
    ).toHaveText(en ? 'Simulation · not running' : 'Simulación · no ejecuta');
    const categories = explorer.locator('.goal-categories button');
    await expect(categories).toHaveCount(6);
    const prompts = new Set();
    for (let i = 0; i < 6; i++) {
      await categories.nth(i).click();
      await expect(explorer.locator('.goal-output')).toHaveCount(0);
      await expect(explorer.locator('.goal-flow')).toBeVisible();
      prompts.add(await explorer.locator('.goal-prompt').innerText());
      await explorer.locator('.goal-choices button').last().focus();
      await page.keyboard.press('Enter');
      await expect(explorer.locator('.goal-output')).toBeVisible();
      await expect(explorer.locator('.goal-flow')).toHaveClass(/is-settled/);
      await expect(
        explorer.locator(
          '.goal-fork-lane.is-active-branch, .goal-node.state-active, .goal-parallel',
        ),
      ).not.toHaveCount(0);
      await expect(
        explorer.locator('.goal-choices button').last(),
      ).toHaveAttribute('aria-pressed', 'true');
      await explorer
        .getByRole('button', {
          name: en ? 'Copy request' : 'Copiar petición',
          exact: true,
        })
        .click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        await explorer.locator('.goal-prompt').innerText(),
      );
    }
    expect(prompts.size).toBe(6);
    // Operar: asymmetric short vs long end
    await categories.nth(4).click();
    await explorer.locator('.goal-choices button').first().click();
    await expect(
      explorer.locator('.goal-fork-lane.is-active-branch'),
    ).toContainText(en ? 'Document hypotheses' : 'Documentar diagnóstico');
    await expect(
      explorer.locator('.goal-fork-lane.is-alt-branch'),
    ).toContainText(en ? 'Prepare a fix' : 'Preparar corrección');
    // Coordinar: sequence vs parallel join
    await categories.nth(5).click();
    await explorer.locator('.goal-choices button').first().click();
    await expect(explorer.locator('.goal-flow')).toContainText(
      en ? 'Review code' : 'Revisar código',
    );
    await expect(explorer.locator('.goal-parallel')).toHaveCount(0);
    await explorer
      .getByRole('button', {
        name: en ? 'Reset example' : 'Reiniciar ejemplo',
        exact: true,
      })
      .click();
    await explorer.locator('.goal-choices button').last().click();
    await expect(explorer.locator('.goal-parallel')).toBeVisible();
    await expect(
      explorer.locator('.goal-gateway.kind-parallelJoin'),
    ).toBeVisible();
    await explorer
      .getByRole('button', {
        name: en ? 'Reset example' : 'Reiniciar ejemplo',
        exact: true,
      })
      .click();
    await expect(explorer.locator('.goal-output')).toHaveCount(0);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .include('.goal-explorer')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
  }
});

test('floating navigation keeps a generated brand and working actions across layouts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const en of [false, true]) {
    await page.goto(`/hyperion/${en ? 'en/' : ''}`);
    const nav = page.locator('.VPNavBar');
    await expect(nav.locator('.logo')).toHaveAttribute(
      'src',
      /brand\/hyperion-titan\.png$/,
    );
    await expect(nav.locator('.logo')).toHaveJSProperty('complete', true);
    expect(
      await nav.locator('.logo').evaluate((img) => img.naturalWidth),
    ).toBeGreaterThan(0);
    await expect(nav.locator('.wrapper > .container')).toHaveCSS(
      'border-radius',
      '20px',
    );
    const initial = await nav
      .locator('.wrapper > .container')
      .evaluate((el) => getComputedStyle(el).boxShadow);
    await page.evaluate(() => scrollTo(0, 600));
    await expect(nav).not.toHaveClass(/\btop\b/);
    await expect(nav.locator('.wrapper > .container')).not.toHaveCSS(
      'box-shadow',
      initial,
    );
    await nav
      .getByRole('link', {
        name: en ? 'Try Hyperion' : 'Probar Hyperion',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', {
        name: en ? 'Interactive example' : 'Ejemplo interactivo',
        exact: true,
      }),
    ).toBeInViewport();
    expect(
      (
        await new AxeBuilder({ page })
          .include('.VPNavBar')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto(`/hyperion/${en ? 'en/' : ''}guia/reanudacion.html`);
    await expect(
      nav.getByRole('link', { name: en ? 'Guide' : 'Guía', exact: true }),
    ).toHaveClass(/active/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/hyperion/');
  await page.getByRole('button', { name: /Navegación móvil/ }).click();
  await page
    .locator('.VPNavScreen')
    .getByRole('link', { name: 'Probar Hyperion', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Ejemplo interactivo', exact: true }),
  ).toBeInViewport();
});

test('architecture views explain execution, data and resumption in both languages', async ({
  page,
}) => {
  for (const en of [false, true]) {
    await page.goto(`/hyperion/${en ? 'en/' : ''}referencia/arquitectura.html`);
    const explorer = page.getByRole('region', {
      name: en ? 'Architecture explorer' : 'Explorador de arquitectura',
    });
    for (const [label, file] of [
      [en ? 'Execution' : 'Ejecución', 'hyperion'],
      [en ? 'Data and decisions' : 'Datos y decisiones', 'process'],
      [en ? 'Pause and resume' : 'Pausa y reanudación', 'continuation'],
    ]) {
      const button = explorer.getByRole('button', { name: label, exact: true });
      await button.click({ timeout: 3000 });
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(explorer.locator('iframe')).toHaveAttribute(
        'src',
        new RegExp(`/architecture/${file}-${en ? 'en' : 'es'}\\.html`),
      );
      await expect(
        explorer.getByRole('link', {
          name: en ? 'Explore in Archify' : 'Explorar en Archify',
          exact: true,
        }),
      ).toHaveAttribute(
        'href',
        `/hyperion/architecture/${file}-${en ? 'en' : 'es'}.html`,
      );
      await expect(
        page
          .frameLocator('iframe')
          .locator(
            file === 'hyperion'
              ? '#node-agent'
              : file === 'process'
                ? '#node-context'
                : '#node-queue',
          ),
      ).toBeVisible();
    }
    await expect(
      page.getByRole('heading', {
        name: en
          ? 'Deployment and trust boundaries'
          : 'Despliegue y límites de confianza',
        exact: false,
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await explorer
      .getByRole('button', {
        name: en ? 'Execution' : 'Ejecución',
        exact: true,
      })
      .click();
    await expect(explorer.locator('iframe')).toHaveAttribute(
      'src',
      /hyperion-/,
    );
    const accessibility = await new AxeBuilder({ page })
      .include('.architecture-explorer')
      // The pinned third-party viewer has its own generated markup; audit our controls.
      .exclude('iframe')
      .analyze();
    expect(accessibility.violations).toEqual([]);
  }
});

test('architecture leads with an interactive visual journey and hides reference tables', async ({
  page,
}) => {
  for (const en of [false, true]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/hyperion/${en ? 'en/' : ''}referencia/arquitectura.html`);
    const journey = page.getByRole('region', {
      name: en ? 'From request to result' : 'De la petición al resultado',
      exact: true,
    });
    await expect(journey.locator('svg.architecture-journey')).toBeVisible({
      timeout: 3000,
    });
    expect((await journey.boundingBox()).width).toBeGreaterThan(900);
    await journey
      .getByRole('button', {
        name: en ? 'Human decision' : 'Decisión humana',
        exact: true,
      })
      .click();
    await expect(journey.getByRole('status')).toContainText(
      en ? 'audience' : 'audiencia',
    );
    const reference = page.locator('details.architecture-reference');
    await expect(reference).not.toHaveAttribute('open');
    await expect(page.locator('.architecture-deployment')).toBeVisible();
    await expect(page.locator('.VPNavBarTitle img')).toHaveAttribute(
      'src',
      /hyperion-titan\.png/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await journey
      .getByRole('button', {
        name: en ? 'Verified result' : 'Resultado verificado',
        exact: true,
      })
      .focus();
    await page.keyboard.press('Enter');
    await expect(journey.getByRole('status')).toContainText(
      en ? 'evidence' : 'evidencia',
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await reference.locator(':scope > summary').click();
    await expect(reference.locator('table').first()).toBeVisible();
    for (const dark of [false, true]) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle('dark', dark),
        dark,
      );
      const a11y = await new AxeBuilder({ page })
        .include('.architecture-atlas')
        .analyze();
      expect(a11y.violations).toEqual([]);
    }
  }
});

test('Antigravity has an SVG identity and an honest MCP setup path in both languages', async ({
  page,
}) => {
  for (const locale of ['', 'en/']) {
    await page.goto(`/hyperion/${locale}`);
    const mark = page
      .locator('.harness-marks a')
      .filter({ hasText: 'Antigravity' });
    await expect(mark).toBeVisible();
    await expect(mark.locator('svg')).toHaveCount(1);
    await mark.click();
    await expect(page.locator('#antigravity')).toBeVisible();
    await expect(
      page.getByRole('row').filter({ hasText: 'Antigravity' }),
    ).toContainText('MCP');
    await expect(page.locator('.vp-doc')).toContainText('0.4.0-preview.1');
    await expect(
      page.getByRole('link', { name: /MCP.*Antigravity|Antigravity.*MCP/ }),
    ).toHaveAttribute('href', 'https://antigravity.google/docs/mcp');
    await expect(page.locator('.vp-doc')).toContainText('mcpServers.hyperion');
    await page.goto(`/hyperion/${locale}guia/reanudacion.html`);
    const row = page.getByRole('row').filter({ hasText: 'Antigravity' });
    await expect(row).toContainText(locale ? 'pending' : 'pendiente');
  }
});

test('CalVer minute and macOS opening instructions remain visible in both themes, languages and narrow layouts', async ({
  page,
}) => {
  for (const locale of ['', 'en/']) {
    for (const dark of [false, true]) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({
          colorScheme: dark ? 'dark' : 'light',
          reducedMotion: 'reduce',
        });
        await page.goto(`/hyperion/${locale}guia/primeros-pasos.html`);
        const downloads = page.locator('.downloads');
        await downloads.scrollIntoViewIfNeeded();
        await expect(downloads.locator('time')).toHaveText('2026.10.23.1732');
        await expect(downloads.locator('time')).toHaveAttribute(
          'datetime',
          '2026-10-23T17:32:00Z',
        );
        await expect(downloads.locator('.download-status')).toContainText(
          locale
            ? 'notarized with Developer ID'
            : 'notarizado con Developer ID',
        );
        await expect(
          page.getByRole('link', { name: 'macOS · Intel', exact: true }),
        ).toHaveCount(0);
        await downloads
          .getByRole('link', {
            name: locale
              ? 'View installation steps'
              : 'Ver pasos de instalación',
          })
          .click();
        await expect(page).toHaveURL(
          locale ? /#macos-blocks-the-app$/ : /#macos-bloquea-la-app$/,
        );
        await expect(
          page.locator(
            locale ? '#macos-blocks-the-app' : '#macos-bloquea-la-app',
          ),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        const a11y = await new AxeBuilder({ page })
          .include('.downloads')
          .analyze();
        expect(a11y.violations).toEqual([]);
        await downloads.screenshot({
          path: `../../test-results/docs/downloads-${locale ? 'en' : 'es'}-${dark ? 'dark' : 'light'}-${width}.png`,
        });
      }
    }
  }
});
