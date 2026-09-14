import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import { chromium } from '@playwright/test';
import { createApi } from '../server/http';
import { initialState } from '../shared/game';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { generatedNodes } from '../shared/miningWorld';
import type { Action, Location } from '../shared/schema';
import { ZONES } from '../shared/world';
import { beginAssignedTravel } from '../tests/travelFixture';
import { walkZoneTo } from '../tests/e2e/zoneWalking';

const PREVIEW = 'http://127.0.0.1:4173';
const files = await readdir('dist/frontend/assets');
let bundleBytes = 0;
let gzipBytes = 0;
for (const name of files) {
  const data = await readFile(`dist/frontend/assets/${name}`);
  bundleBytes += data.length;
  gzipBytes += gzipSync(data).length;
}
const generationStart = performance.now();
for (let i = 0; i < 300; i++) generatedNodes(`synthetic-benchmark-${i}`, ZONES.LYRIA_SURFACE_01);
const nodeGenerationMs = (performance.now() - generationStart) / 300;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { stdio: 'ignore' },
);
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      ready = (await fetch(PREVIEW)).ok;
    } catch {
      /* preview still starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Production preview did not start.');
  const results: Record<string, unknown> = {
    bundleBytes,
    gzipBytes,
    nodeGenerationMs,
    conditions:
      'Chromium headless, production Vite preview on localhost, in-memory synthetic API, Node 22; physical metrics time local UI walking/zone changes; reload metrics separately time snapshot reloads',
    hardware: {
      cpu: cpus()[0]?.model,
      logicalCores: cpus().length,
      ramBytes: totalmem(),
      platform: process.platform,
    },
  };
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [layout, width, height] of [
      ['panel', 318, 500],
      ['mobile', 360, 640],
    ] as const) {
      let now = 1_800_000_000_000;
      const player = `synthetic-${layout}-performance`;
      const store = new MemoryStore();
      const starter = initialState(() => 0.5);
      starter.ships.Roc = 1;
      starter.positions.Roc = 'Lyria';
      store.states.set(player, starter);
      const service = new GameService(
        store,
        () => now,
        () => 0.5,
      );
      const api = createApi(service, async () => player, [PREVIEW]);
      const page = await browser.newPage({ viewport: { width, height } });
      await page.addInitScript(() => {
        window.Twitch = {
          ext: {
            onAuthorized(callback) {
              setTimeout(
                () =>
                  callback({
                    userId: 'Usyntheticperformance',
                    channelId: 'synthetic-channel',
                    token: 'synthetic-performance-only',
                  }),
                0,
              );
            },
          },
        };
      });
      await page.route('https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging/**', async (route) => {
        const request = route.request();
        const response = await api({
          method: request.method(),
          path: new URL(request.url()).pathname.replace(/^\/staging/, ''),
          headers: request.headers(),
          body: request.postData() ?? undefined,
        });
        await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
      });
      const start = performance.now();
      await page.goto(PREVIEW);
      await page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' }).waitFor();
      const initialReadyMs = performance.now() - start;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const heap = async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        const data = await cdp.send('Performance.getMetrics');
        return data.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? null;
      };
      const initialHeap = await heap();
      const frameTiming = (await page.evaluate(`new Promise(resolve => {
        const stamps = [];
        const frame = stamp => {
          stamps.push(stamp);
          if (stamps.length < 121) requestAnimationFrame(frame);
          else {
            const deltas = stamps.slice(1).map((time, index) => time - stamps[index]).sort((a, b) => a - b);
            resolve({ meanMs: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
              p95Ms: deltas[Math.floor(deltas.length * 0.95)] });
          }
        };
        requestAnimationFrame(frame);
      })`)) as { meanMs: number; p95Ms: number };
      const act = async (action: Action) => {
        const state = (await service.snapshot(player)).state;
        await service.mutate(player, { requestId: randomUUID(), expectedRevision: state.revision, action });
        const stamp = performance.now();
        await page.reload();
        await page.getByRole('img', { name: /Original pixel-art map/ }).waitFor();
        return performance.now() - stamp;
      };
      const stagedTravel = async (destination: Location) => {
        await beginAssignedTravel(service, player, destination);
        const stamp = performance.now();
        await page.reload();
        await page.getByRole('img', { name: /Original pixel-art map/ }).waitFor();
        return performance.now() - stamp;
      };
      const physicalTransitionMs: number[] = [];
      const physicalCross = async (to: keyof typeof ZONES) => {
        const current = store.states.get(player)!;
        const from = ZONES[current.world!.zone];
        const exit = from.exits.find((candidate) => candidate.to === to);
        if (!exit) throw new Error(`No physical exit from ${from.id} to ${to}.`);
        await walkZoneTo(page, from, current.world!.entry, [exit.x, exit.y]);
        const stamp = performance.now();
        await page.getByRole('button', { name: 'Interact' }).click();
        await page.getByRole('img', { name: `Original pixel-art map of ${ZONES[to].label}` }).waitFor();
        physicalTransitionMs.push(performance.now() - stamp);
      };
      const monitorFrames = async () => {
        await page.evaluate(`(() => {
          const frames = [];
          window.__m3Frames = frames;
          let last = 0;
          const tick = time => {
            if (window.__m3Frames !== frames) return;
            if (last) frames.push(time - last);
            last = time;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        })()`);
      };
      const stopFrames = async () =>
        page.evaluate(`(() => {
          const frames = window.__m3Frames ?? [];
          window.__m3Frames = undefined;
          frames.sort((a, b) => a - b);
          return {
            samples: frames.length,
            meanMs: frames.reduce((sum, value) => sum + value, 0) / Math.max(1, frames.length),
            p95Ms: frames[Math.floor(frames.length * 0.95)] ?? 0,
            worstMs: frames.at(-1) ?? 0,
          };
        })()`) as Promise<{ samples: number; meanMs: number; p95Ms: number; worstMs: number }>;
      await monitorFrames();
      for (const zone of ['ARC_L1_CONCOURSE', 'ARC_L1_TRANSIT', 'ARC_L1_DEPARTURE'] as const)
        await physicalCross(zone);
      const arcMovementFrames = await stopFrames();
      const transitionMs: number[] = [];
      transitionMs.push(await stagedTravel('Area-18'));
      now += 1_000_000;
      transitionMs.push(await act({ type: 'finish' }));
      await monitorFrames();
      for (const zone of [
        'AREA18_SECURITY',
        'AREA18_SPACEPORT_PLATFORM',
        'AREA18_SHUTTLE',
        'AREA18_CITY_PLATFORM',
        'AREA18_TRANSIT',
        'AREA18_PLAZA',
      ] as const)
        await physicalCross(zone);
      const area18MovementFrames = await stopFrames();
      for (const zone of [
        'AREA18_MARKET',
        'AREA18_INDUSTRIAL',
        'AREA18_ALLEY',
        'AREA18_RETAIL',
        'AREA18_PLAZA',
        'AREA18_TRANSIT',
        'AREA18_CITY_PLATFORM',
        'AREA18_SHUTTLE',
        'AREA18_SPACEPORT_PLATFORM',
        'AREA18_SECURITY',
        'AREA18_SPACEPORT',
      ] as const)
        transitionMs.push(await act({ type: 'enterZone', zone }));
      const area18Heap = await heap();
      transitionMs.push(await stagedTravel('Wala'));
      now += 1_000_000;
      transitionMs.push(await act({ type: 'finish' }));
      await monitorFrames();
      for (const zone of ['WALA_SURFACE_01', 'WALA_CAVE_01', 'WALA_SURFACE_01', 'WALA_OUTPOST_01'] as const)
        await physicalCross(zone);
      const walaCaveFrames = await stopFrames();
      for (const zone of [
        'WALA_SURFACE_01',
        'WALA_CAVE_01',
        'WALA_CAVE_02',
        'WALA_SURFACE_02',
        'WALA_SURFACE_01',
        'WALA_OUTPOST_01',
      ] as const)
        transitionMs.push(await act({ type: 'enterZone', zone }));
      transitionMs.push(await stagedTravel('Lyria'));
      now += 1_000_000;
      transitionMs.push(await act({ type: 'finish' }));
      await monitorFrames();
      await physicalCross('LYRIA_SURFACE_01');
      const pingsBefore = store.states.get(player)!.world!.scanner.pings;
      const scannerStart = performance.now();
      await page.getByRole('button', { name: 'Scan' }).click();
      for (
        let attempt = 0;
        attempt < 40 && store.states.get(player)!.world!.scanner.pings === pingsBefore;
        attempt++
      )
        await page.waitForTimeout(50);
      if (store.states.get(player)!.world!.scanner.pings === pingsBefore)
        throw new Error('Scanner did not confirm.');
      const scannerResponseMs = performance.now() - scannerStart;
      const lyriaSurfaceFrames = await stopFrames();
      await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, store.states.get(player)!.world!.entry, [28, 18]);
      await page.getByRole('button', { name: 'Interact' }).click();
      const laserDialog = page.getByRole('dialog', { name: 'Mining analysis and laser' });
      await laserDialog.getByRole('button', { name: 'Begin fracture' }).click();
      await laserDialog.getByRole('button', { name: 'Hold laser' }).waitFor();
      const holdBox = await laserDialog.getByRole('button', { name: 'Hold laser' }).boundingBox();
      if (!holdBox) throw new Error('Laser control is not visible.');
      await monitorFrames();
      await page.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(1800);
      await page.mouse.up();
      const laserFrames = await stopFrames();
      await laserDialog.getByRole('button', { name: 'Close' }).click();
      await monitorFrames();
      await physicalCross('LYRIA_CAVE_01');
      await physicalCross('LYRIA_SURFACE_01');
      await physicalCross('LYRIA_OUTPOST_01');
      const lyriaCaveFrames = await stopFrames();
      await physicalCross('LYRIA_ASOP');
      await walkZoneTo(page, ZONES.LYRIA_ASOP, store.states.get(player)!.world!.entry, [16, 12]);
      await page.getByRole('button', { name: 'Interact' }).click();
      const asopDialog = page.getByRole('dialog', { name: 'Owned vehicle retrieval' });
      await asopDialog.getByRole('button', { name: 'Retrieve owned ROC' }).click();
      await asopDialog.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: 'Enter ROC' }).click();
      await monitorFrames();
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowDown');
      const rocMovementFrames = await stopFrames();
      await page.getByRole('button', { name: 'Exit ROC' }).click();
      await walkZoneTo(page, ZONES.LYRIA_ASOP, store.states.get(player)!.world!.entry, [16, 12]);
      await page.getByRole('button', { name: 'Interact' }).click();
      await page
        .getByRole('dialog', { name: 'Owned vehicle retrieval' })
        .getByRole('button', { name: 'Store ROC' })
        .click();
      await page
        .getByRole('dialog', { name: 'Owned vehicle retrieval' })
        .getByRole('button', { name: 'Close' })
        .click();
      await physicalCross('LYRIA_OUTPOST_01');
      transitionMs.push(await stagedTravel('ARC-L1'));
      now += 1_000_000;
      transitionMs.push(await act({ type: 'finish' }));
      const firstCycleHeapBytes = await heap();
      for (const destination of ['Area-18', 'Wala', 'Lyria', 'ARC-L1'] as const) {
        transitionMs.push(await stagedTravel(destination));
        now += 1_000_000;
        transitionMs.push(await act({ type: 'finish' }));
      }
      results[layout] = {
        initialReadyMs,
        frameTiming,
        arcMovementFrames,
        area18MovementFrames,
        walaCaveFrames,
        lyriaSurfaceFrames,
        lyriaCaveFrames,
        scannerResponseMs,
        laserFrames,
        rocMovementFrames,
        physicalTransitionMeanMs:
          physicalTransitionMs.reduce((sum, value) => sum + value, 0) / physicalTransitionMs.length,
        physicalTransitionWorstMs: Math.max(...physicalTransitionMs),
        physicalTransitions: physicalTransitionMs.length,
        initialHeapBytes: initialHeap,
        area18HeapBytes: area18Heap,
        firstCycleHeapBytes,
        finalHeapBytes: await heap(),
        transitionMeanMs: transitionMs.reduce((sum, value) => sum + value, 0) / transitionMs.length,
        transitionMaxMs: Math.max(...transitionMs),
        transitions: transitionMs.length,
      };
      await page.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile('test-results/m3-performance.json', JSON.stringify(results, null, 2));
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
} finally {
  server.kill('SIGTERM');
}
