import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { setup, walkTo, openOperations, resumeGame } from '../tests/e2e/m4Harness';
import { originalZoneMap } from '../shared/originalWorld';
import { zoneRoute, exitKind } from '../shared/originalNavigation';
import type { OriginalPlayerState } from '../shared/originalSchema';
import { createOriginalApi } from '../server/originalApi';

const duration = Number(process.env.DIME_PERFORMANCE_DURATION_MS ?? 60_000);
const output = process.env.DIME_PERFORMANCE_OUTPUT ?? '/tmp/dime-m41-nodes/performance.json';
const preview = 'http://127.0.0.1:4187';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4187'],
  { stdio: 'ignore' },
);
const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      ready = (await fetch(preview)).ok;
    } catch {
      /* preview is starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw Error('Production preview unavailable');
  const results = [];
  for (const layout of [
    { name: 'Panel', file: 'panel.html', width: 318, height: 500 },
    { name: 'Mobile', file: 'mobile.html', width: 360, height: 640 },
    { name: 'Desktop', file: 'index.html', width: 1280, height: 900 },
  ]) {
    if (process.env.DIME_PERFORMANCE_LAYOUT && process.env.DIME_PERFORMANCE_LAYOUT !== layout.name) continue;
    const page = await browser.newPage({ viewport: layout });
    const fixture = await setup(page);
    if (layout.name === 'Desktop') {
      const api = createOriginalApi(fixture.store, async () => 'synthetic-walking', [], Date.now, {
        mode: 'ENABLED',
        testerCount: 0,
        permits: () => true,
      });
      await page.route(preview + '/**', async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        if (path === '/auth/status') {
          await route.fulfill({ json: { signInAvailable: true, linkingAvailable: false } });
        } else if (path === '/auth/session') {
          await route.fulfill({
            json: { identity: 'synthetic-walking', csrf: 'synthetic-csrf', linkingAvailable: false },
          });
        } else if (path.startsWith('/api/')) {
          if (request.method() === 'POST') fixture.posts.push(path);
          const response = await api({
            method: request.method(),
            path: path.slice(4),
            headers: {},
            body: request.postData() ?? undefined,
          });
          if (response.statusCode >= 400) fixture.errors.push(`${path}: ${response.statusCode}`);
          await route.fulfill({
            status: response.statusCode,
            headers: response.headers,
            body: response.body,
          });
        } else if (/^\/(?:index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)) {
          await route.fulfill({
            body: await readFile((process.env.DIME_WEB_BUILD ?? '/tmp/dime-m43-release/web-build') + path),
            contentType: path.endsWith('.html')
              ? 'text/html'
              : path.endsWith('.css')
                ? 'text/css'
                : 'application/javascript',
          });
        } else await route.fulfill({ status: 404, body: '' });
      });
    }
    console.log('Measuring ' + layout.name);
    await page.addInitScript({
      content: `window.dimePerformance={frames:[],last:0};
      function measureFrame(now) {
        var metrics=window.dimePerformance;
        if(metrics.last) metrics.frames.push(now-metrics.last);
        if(metrics.frames.length>12000) metrics.frames.shift();
        metrics.last=now;requestAnimationFrame(measureFrame);
      }
      requestAnimationFrame(measureFrame);`,
    });
    const start = performance.now();
    await page.goto(preview + '/' + layout.file);
    await page.locator('canvas[data-player-x]').waitFor();
    const readyMs = performance.now() - start;
    const sample = () =>
      page.evaluate(() => {
        const frames = (window as Window & { dimePerformance: { frames: number[] } }).dimePerformance.frames;
        const sorted = [...frames].sort((a, b) => a - b);
        return {
          p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
          worstFrameMs: sorted.at(-1) ?? 0,
          frames: frames.length,
          heapBytes:
            (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
            null,
          dom: document.querySelectorAll('*').length,
          canvas: document.querySelectorAll('canvas').length,
          documentScroll: document.documentElement.scrollHeight > innerHeight,
        };
      });
    const cdpMetrics = await page.context().newCDPSession(page);
    const retained = async () => {
      await cdpMetrics.send('HeapProfiler.collectGarbage');
      return (await sample()).heapBytes;
    };
    const heapTrend = [await retained()];
    const initial = await sample();
    const transitions = [];
    let cycles = 0;
    while (performance.now() - start < duration || cycles < 4) {
      for (const destination of ['zone.z008', 'zone.z001']) {
        const state = fixture.store.states.get('synthetic-walking') as OriginalPlayerState;
        for (const next of zoneRoute(state.world.zone, destination).slice(1)) {
          const current = fixture.store.states.get('synthetic-walking') as OriginalPlayerState;
          const map = originalZoneMap(current.world.zone),
            exit = map.exits.find((e) => e.to === next)!;
          const before = fixture.posts.length;
          await walkTo(page, map, exit, layout.name === 'Mobile');
          if (fixture.posts.length !== before) throw Error('Walking wrote to the save');
          const started = performance.now();
          await page
            .getByRole('button', {
              name: `Use ${exitKind(map.id, exit)} · ${originalZoneMap(next).name}`,
              exact: true,
            })
            .click();
          await page.waitForFunction((zone) => document.querySelector('canvas')?.dataset.zone === zone, next);
          transitions.push(performance.now() - started);
        }
      }
      cycles++;
      heapTrend.push(await retained());
    }
    const final = await sample();
    await page.waitForTimeout(1000);
    const idle = await sample();
    const sorted = [...transitions].sort((a, b) => a - b);
    const mineralState = structuredClone(
        fixture.store.states.get('synthetic-walking') as OriginalPlayerState,
      ),
      mineralMap = originalZoneMap('zone.z014');
    mineralState.location = 'loc.l002';
    mineralState.world.zone = mineralMap.id;
    mineralState.world.entry = 'arrival';
    mineralState.revision++;
    const nodeId = 'zone.z014.node.performance';
    mineralState.world.nodes = {
      [nodeId]: {
        id: nodeId,
        ore: 'mat.m001',
        source: 'extract.x001',
        x: mineralMap.spawn.x,
        y: mineralMap.spawn.y,
        size: 1,
        resistance: 0.6,
        instability: 0.2,
        yieldUnits: 80,
        status: 'FRACTURED',
        respawnAt: null,
        fragments: [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ].map(([x, y], i) => ({
          id: 'performance-piece-' + i,
          x: mineralMap.spawn.x + x!,
          y: mineralMap.spawn.y + y!,
          units: 10,
          collected: false,
        })),
      },
    };
    // Render-only stress fixture: maximum eight intact formations plus eight authoritative fragments.
    for (let i = 0; i < 8; i++) {
      const id = 'zone.z014.node.formation-stress-' + i;
      mineralState.world.nodes[id] = {
        ...mineralState.world.nodes[nodeId]!,
        id,
        x: mineralMap.spawn.x + [-4, -1, 2, 5][i % 4]!,
        y: mineralMap.spawn.y + (i < 4 ? -2 : 1),
        size: 1 + (i % 5),
        status: 'INTACT',
        fragments: [],
      };
    }
    mineralState.world.scanner.analyzed = Object.keys(mineralState.world.nodes);
    fixture.store.states.set('synthetic-walking', mineralState);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.fragments === '8');
    await page.evaluate(() => {
      (window as Window & { dimePerformance: { frames: number[] } }).dimePerformance.frames = [];
    });
    const postsBeforePing = fixture.posts.length;
    for (let ping = 0; ping < 5; ping++) {
      await page.keyboard.press('p');
      await page.waitForTimeout(200);
    }
    const scannerEffects = await sample();
    if (fixture.posts.length !== postsBeforePing) throw Error('Local scanner pulse wrote state');
    const analysisCardClose = page.getByRole('button', { name: 'Close analysis · Ping to recall' });
    if (await analysisCardClose.isVisible()) await analysisCardClose.click();
    const control = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    const touch = layout.name === 'Mobile' ? await page.context().newCDPSession(page) : null;
    if (touch) {
      const b = (await control.boundingBox())!;
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
      });
    } else await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.fragments === '0');
    if (touch) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    } else await page.keyboard.up('Space');
    const vacuumEffects = await sample();
    if (
      (fixture.store.states.get('synthetic-walking') as OriginalPlayerState).mining['extract.x001'][
        'mat.m001'
      ] !== 80
    )
      throw Error('Eight-piece quantity conservation failed');
    await openOperations(page);
    await page.getByRole('button', { name: 'Laser mode', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Nearby signature' })
      .selectOption('zone.z014.node.formation-stress-5');
    await resumeGame(page);
    await page.getByRole('button', { name: 'Target node', exact: true }).click();
    const laser = page.getByRole('button', { name: 'Hold laser · release to cool', exact: true });
    await laser.focus();
    await page.keyboard.down('Space');
    await page.waitForTimeout(1000);
    await page.keyboard.up('Space');
    await page.waitForTimeout(1000);
    const laserEffects = await sample();
    await openOperations(page);
    await page.getByRole('button', { name: 'Stop laser without yield', exact: true }).click();
    const city = ORIGINAL_CONTENT.zones
      .filter((z) => z.location === 'loc.l004')
      .sort((a, b) => originalZoneMap(b.id).services.length - originalZoneMap(a.id).services.length)[0]!;
    const cityState = structuredClone(fixture.store.states.get('synthetic-walking') as OriginalPlayerState);
    cityState.location = 'loc.l004';
    cityState.world.zone = city.id;
    cityState.world.entry = 'arrival';
    cityState.revision++;
    fixture.store.states.set('synthetic-walking', cityState);
    await page.reload();
    await page.locator('canvas[data-player-x]').waitFor();
    await page.waitForTimeout(15000);
    const cityEffects = await sample();
    const heapAfter = await retained();
    const result = {
      heapTrend,
      heapAfter,
      scannerEffects,
      laserEffects,
      busiestCityZone: city.name,
      cityEffects,
      vacuumEffects,
      initialVisibleFragments: 8,
      intactFormationStressCount: 8,
      collectedFragmentUnits: 80,
      layout: layout.name,
      readyMs,
      durationMs: performance.now() - start,
      cycles,
      transitions: transitions.length,
      transitionAverageMs: transitions.reduce((a, b) => a + b, 0) / transitions.length,
      transitionWorstMs: sorted.at(-1),
      transitionP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      initial,
      final,
      idle,
      errors: fixture.errors,
    };
    if (fixture.errors.length || final.documentScroll || final.canvas !== 1) {
      await writeFile(output, JSON.stringify(result, null, 2));
      throw Error('Production performance integrity check failed');
    }
    results.push(result);
    console.log('Completed ' + layout.name);
    await cdpMetrics.detach();
    await page.close();
  }
  let assetBytes = 0,
    gzipBytes = 0;
  for (const name of await readdir('dist/frontend/assets')) {
    const bytes = await readFile('dist/frontend/assets/' + name);
    assetBytes += bytes.length;
    gzipBytes += gzipSync(bytes).length;
  }
  const report = {
    browser: browser.version(),
    assetBytes,
    gzipBytes,
    results,
    limitations:
      'Local Chromium production builds, actual API service with synthetic in-memory state. Desktop loads the standalone web bundle with synthetic session transport; secure cookie/OAuth behavior is tested separately. Keyboard Panel and touch Mobile physical walking. Real Twitch webview/network performance requires authenticated testing. Heap trend uses forced-GC samples after repeated physical travel; frame worst includes instrumentation and GC. This is not proof against every leak.',
  };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ assetBytes, gzipBytes, results }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
