/** Offline standalone-web rendering evidence. Every request is fulfilled locally. */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOriginalApi } from '../server/originalApi';
import { originalInitialState } from '../shared/originalGame';
import { MemoryStore } from '../server/store';
import { openOperations } from '../tests/e2e/m4Harness';
const output = process.env.DIME_SERVICES_REVIEW ?? '/tmp/dime-m44-services-review';
const build = process.env.DIME_WEB_BUILD ?? resolve(output, 'web-build');
const browser = await chromium.launch();
const evidence = [];
try {
  await mkdir(resolve(output, 'screenshots'), { recursive: true });
  for (const viewport of [
    { width: 318, height: 500 },
    { width: 360, height: 640 },
    { width: 1280, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 500 });
    const state = originalInitialState('00000000-0000-4000-8000-000000000044', () => 0.5);
    state.world.zone = 'zone.z004';
    state.orders = [
      {
        id: 'synthetic-web-order',
        source: 'extract.x003',
        ore: 'mat.m010',
        method: 'process.p001',
        rawUnits: 100,
        refinedUnits: 80,
        cost: 100,
        createdAt: 1,
        readyAt: 2,
      },
    ];
    const store = new MemoryStore();
    store.states.set('synthetic-services-web', state);
    const api = createOriginalApi(store, async () => 'synthetic-services-web', [], Date.now, {
      mode: 'ENABLED',
      testerCount: 0,
      permits: () => true,
    });
    const errors: string[] = [];
    let writes = 0;
    page.on('pageerror', () => errors.push('PAGE_ERROR'));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push('CONSOLE_ERROR');
    });
    await page.route('**/*', async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path === '/auth/status')
        await route.fulfill({ json: { signInAvailable: true, linkingAvailable: false } });
      else if (path === '/auth/session')
        await route.fulfill({
          json: { identity: 'synthetic-services-web', csrf: 'synthetic-csrf', linkingAvailable: false },
        });
      else if (path.startsWith('/api/')) {
        if (req.method() === 'POST') writes++;
        const result = await api({
          method: req.method(),
          path: path.slice(4),
          headers: {},
          body: req.postData() ?? undefined,
        });
        await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
      } else if (/^\/(?:index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)) {
        await route.fulfill({
          body: await readFile(build + path),
          contentType: path.endsWith('.html')
            ? 'text/html'
            : path.endsWith('.css')
              ? 'text/css'
              : 'application/javascript',
        });
      } else {
        errors.push('UNEXPECTED_REQUEST');
        await route.fulfill({ status: 404, body: '' });
      }
    });
    await page.goto('https://synthetic-services.invalid/index.html');
    await page.locator('canvas').waitFor();
    await openOperations(page);
    const collect = page.getByRole('button', { name: 'Collect processing order', exact: true });
    await collect.scrollIntoViewIfNeeded();
    const minimumTouch = await page
      .locator('.serviceConsole button, .serviceConsole input, .serviceConsole select')
      .evaluateAll((elements) => elements.every((e) => e.getBoundingClientRect().height >= 44));
    await page.screenshot({ path: resolve(output, `screenshots/web-${viewport.width}-processing.png`) });
    await collect.click();
    await page.waitForFunction(() =>
      document.querySelector('.status')?.textContent?.includes('Action confirmed'),
    );
    const final = store.states.get('synthetic-services-web') as typeof state;
    if (
      final.orders.length ||
      final.cargo['fleet.v001']!.refined['mat.m010.processed'] !== 80 ||
      writes !== 1 ||
      errors.length ||
      !minimumTouch
    )
      throw Error('SYNTHETIC_WEB_SERVICE_REGRESSION');
    evidence.push({
      viewport,
      synthetic: true,
      collection: true,
      minimumTouch,
      mutationCount: writes,
      errors,
    });
    await page.close();
  }
  await writeFile(resolve(output, 'web-services.json'), JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await browser.close();
}
