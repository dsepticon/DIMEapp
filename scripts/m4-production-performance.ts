import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { setup, walkTo } from '../tests/e2e/m4Harness';
import { originalZoneMap } from '../shared/originalWorld';
import { zoneRoute, exitKind } from '../shared/originalNavigation';
import type { OriginalPlayerState } from '../shared/originalSchema';

const duration = Number(process.env.DIME_PERFORMANCE_DURATION_MS ?? 60_000);
const output = process.env.DIME_PERFORMANCE_OUTPUT ?? '/tmp/dime-m41-vacuum/performance.json';
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
  ]) {
    const page = await browser.newPage({ viewport: layout });
    const fixture = await setup(page);
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
    const initial = await sample();
    const transitions = [];
    let cycles = 0;
    while (performance.now() - start < duration || cycles < 1) {
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
    mineralState.world.scanner.analyzed = [nodeId];
    fixture.store.states.set('synthetic-walking', mineralState);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.fragments === '8');
    await page.evaluate(() => {
      (window as Window & { dimePerformance: { frames: number[] } }).dimePerformance.frames = [];
    });
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
    const result = {
      vacuumEffects,
      initialVisibleFragments: 8,
      collectedFragmentUnits: 80,
      layout: layout.name,
      readyMs,
      durationMs: performance.now() - start,
      cycles,
      transitions: transitions.length,
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
      'Local Chromium production build, actual API service with synthetic in-memory state. Keyboard Panel and touch Mobile physical walking. Real Twitch webview/network performance requires authenticated testing. Heap samples are observational, not proof against a leak.',
  };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ assetBytes, gzipBytes, results }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
