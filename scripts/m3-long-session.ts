import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cpus, totalmem } from 'node:os';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { chromium, expect } from '@playwright/test';
import { createApi } from '../server/http';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { initialState } from '../shared/game';
import { generatedNodes, NODE_RESPAWN_MS } from '../shared/miningWorld';
import type { Action, Location } from '../shared/schema';
import { ZONES, type ZoneId } from '../shared/world';
import { beginAssignedTravel } from '../tests/travelFixture';
import { walkZoneTo } from '../tests/e2e/zoneWalking';

const PREVIEW = 'http://127.0.0.1:4173';
const OUTPUT = 'test-results/m3-long-session-performance.json';
const DEBUG = process.env.M3_BENCH_DEBUG === '1';
const MIN_DURATION_MS = DEBUG ? 0 : 600_000;
const MIN_CYCLES = DEBUG ? 1 : 20;
const assetNames = await readdir('dist/frontend/assets');
const assets = await Promise.all(
  ['.js', '.css'].map((extension) =>
    readFile('dist/frontend/assets/' + assetNames.find((name) => name.endsWith(extension))),
  ),
);
const buildSha256 = createHash('sha256').update(assets[0]).update(assets[1]).digest('hex');
const startedAt = new Date().toISOString();
const started = performance.now();
let now = 1_800_000_000_000;
const player = 'synthetic-long-session-player';
const store = new MemoryStore();
const initial = initialState(() => 0.5);
initial.ships.Roc = 1;
initial.positions.Roc = 'Lyria';
store.states.set(player, initial);
const service = new GameService(
  store,
  () => now,
  () => 0.5,
);
const api = createApi(service, async () => player, [PREVIEW]);
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { stdio: 'ignore' },
);
const errors: { console: number; page: number; network: number } = { console: 0, page: 0, network: 0 };
const recentActions: Array<{ action: string; status: number; code: string | null }> = [];
const samples: Array<Record<string, unknown>> = [];
const report: Record<string, unknown> = {
  startedAt,
  status: 'RUNNING',
  conditions:
    'Production Vite preview, one synthetic in-memory player and browser context; staging URL intercepted locally; logical travel uses the real revision-controlled service, while zone walking and laser input use the rendered UI.',
  hardware: {
    cpu: cpus()[0]?.model,
    logicalCores: cpus().length,
    ramBytes: totalmem(),
    platform: process.platform,
    node: process.version,
  },
  productionBuildSha256: buildSha256,
  targetCycles: MIN_CYCLES,
  targetDurationMs: MIN_DURATION_MS,
  garbageCollection:
    'Raw heap sampled every cycle; Chromium garbage collection forced only at cycles 0, 10 and final, with both readings recorded.',
  listenerAndTimerCounts:
    'Unavailable through stable browser APIs; DOM and canvas counts are measured instead.',
  samples,
  errors,
  recentActions,
};
const save = async () => writeFile(OUTPUT, JSON.stringify(report, null, 2));

try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      ready = (await fetch(PREVIEW)).ok;
    } catch {
      /* preview starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Local production preview did not start.');
  const browser = await chromium.launch({ headless: true });
  report.browserVersion = browser.version();
  try {
    const page = await browser.newPage({ viewport: { width: 318, height: 500 } });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.console++;
    });
    page.on('pageerror', () => {
      errors.page++;
    });
    page.on('requestfailed', () => {
      errors.network++;
    });
    await page.addInitScript(() => {
      window.Twitch = {
        ext: {
          onAuthorized(callback) {
            setTimeout(
              () =>
                callback({
                  userId: 'Usyntheticlongsession',
                  channelId: 'synthetic-channel',
                  token: 'synthetic-only',
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
      if (request.method() === 'POST') {
        const action = JSON.parse(request.postData() ?? '{}') as { action?: { type?: string } };
        let code: string | null = null;
        if (response.statusCode >= 400) code = (JSON.parse(response.body) as { code?: string }).code ?? null;
        recentActions.push({ action: action.action?.type ?? 'unknown', status: response.statusCode, code });
        if (recentActions.length > 12) recentActions.shift();
      }
      await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
    });
    // Keep the browser's render clock aligned with the synthetic server clock when
    // a depleted node passes its documented respawn time between travel cycles.
    await page.clock.install({ time: new Date(now) });
    const initialLoadStart = performance.now();
    await page.goto(PREVIEW);
    await page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' }).waitFor();
    report.initialArcLoadMs = performance.now() - initialLoadStart;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const current = () => store.states.get(player)!;
    const heap = async () =>
      (await cdp.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'JSHeapUsedSize')
        ?.value ?? null;
    const frameSample = async () =>
      page.evaluate(
        `new Promise(resolve => { const data=[]; let last=0; const step=t=>{if(last)data.push(t-last);last=t;if(data.length<90)requestAnimationFrame(step);else {data.sort((a,b)=>a-b);resolve({samples:data.length,meanMs:data.reduce((a,b)=>a+b,0)/data.length,p95Ms:data[Math.floor(data.length*.95)],worstMs:data.at(-1)})}};requestAnimationFrame(step)})`,
      ) as Promise<{ samples: number; meanMs: number; p95Ms: number; worstMs: number }>;
    const measure = async (cycle: number, phase: string, durations: number[] = []) => {
      const generationStart = performance.now();
      for (let sample = 0; sample < 20; sample++)
        generatedNodes(
          current().saveGeneration ?? 'legacy',
          ZONES.LYRIA_SURFACE_01,
          current().world!.nodes,
          now,
        );
      const nodeGenerationMeanMs = (performance.now() - generationStart) / 20;
      const rawHeapBytes = await heap();
      const dom = await page.evaluate(() => ({
        nodes: document.querySelectorAll('*').length,
        canvases: document.querySelectorAll('canvas').length,
        documentScroll: document.documentElement.scrollHeight > innerHeight,
      }));
      const frames = await frameSample();
      const sample: Record<string, unknown> = {
        cycle,
        phase,
        elapsedMs: performance.now() - started,
        location: current().location,
        zone: current().world?.zone,
        revision: current().revision,
        rawHeapBytes,
        ...dom,
        frames,
        transitionMeanMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
        transitionWorstMs: durations.length ? Math.max(...durations) : null,
        nodeGenerationMeanMs,
        errors: { ...errors },
      };
      if ([0, 10].includes(cycle) || phase === 'final') {
        await cdp.send('HeapProfiler.collectGarbage');
        sample.afterForcedGcHeapBytes = await heap();
      }
      samples.push(sample);
      await save();
    };
    const act = async (action: Action, durations: number[]) => {
      const state = (await service.snapshot(player)).state;
      await service.mutate(player, { requestId: randomUUID(), expectedRevision: state.revision, action });
      await page.clock.setFixedTime(new Date(now));
      const stamp = performance.now();
      await page.reload();
      await page
        .getByRole('img', { name: `Original pixel-art map of ${ZONES[current().world!.zone].label}` })
        .waitFor();
      durations.push(performance.now() - stamp);
    };
    const cross = async (to: ZoneId, durations: number[]) => {
      const zone = ZONES[current().world!.zone];
      report.activeStep = `walk:${zone.id}->${to}`;
      const exit = zone.exits.find((item) => item.to === to);
      if (!exit) throw new Error(`Missing local zone link ${zone.id} → ${to}.`);
      await walkZoneTo(page, zone, current().world!.entry, [exit.x, exit.y]);
      const stamp = performance.now();
      await page.getByRole('button', { name: 'Interact' }).click();
      await page.getByRole('img', { name: `Original pixel-art map of ${ZONES[to].label}` }).waitFor();
      if (current().world?.zone !== to) throw new Error('Rendered zone and server state disagree.');
      durations.push(performance.now() - stamp);
    };
    const zoneStep = async (to: ZoneId, durations: number[], physical: boolean) =>
      physical ? cross(to, durations) : act({ type: 'enterZone', zone: to }, durations);
    const travel = async (destination: Location, durations: number[]) => {
      await beginAssignedTravel(service, player, destination);
      now += 1_000_000;
      await act({ type: 'finish' }, durations);
      if (current().location !== destination || ZONES[current().world!.zone].location !== destination)
        throw new Error('Arrival location disagrees with rendered world.');
    };
    await measure(0, 'initial');
    for (let cycle = 1; cycle <= MIN_CYCLES || performance.now() - started < MIN_DURATION_MS; cycle++) {
      report.activeCycle = cycle;
      const durations: number[] = [];
      const physical = !DEBUG && (cycle === 1 || cycle % 5 === 0);
      if (cycle === 11) await page.setViewportSize({ width: 360, height: 640 });
      if (current().location !== 'ARC-L1' || current().world?.zone !== 'ARC_L1_START')
        throw new Error('Cycle must begin at ARC-L1.');
      await zoneStep('ARC_L1_CONCOURSE', durations, physical);
      await zoneStep('ARC_L1_TRANSIT', durations, physical);
      await zoneStep('ARC_L1_DEPARTURE', durations, physical);
      await travel('Lyria', durations);
      await zoneStep('LYRIA_SURFACE_01', durations, physical);
      const pingBefore = current().world!.scanner.pings;
      const scannerStart = performance.now();
      await page.getByRole('button', { name: 'Scan' }).click();
      for (let attempt = 0; attempt < 40 && current().world!.scanner.pings === pingBefore; attempt++)
        await page.waitForTimeout(50);
      if (current().world!.scanner.pings === pingBefore) throw new Error('Scanner response missing.');
      const scannerMs = performance.now() - scannerStart;
      const nodeId = 'LYRIA_SURFACE_01-tutorial';
      report.activeStep = 'analyze-tutorial-node';
      await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, current().world!.entry, [28, 18]);
      await page.getByRole('button', { name: 'Interact' }).click({ timeout: 5_000 });
      const laser = page.getByRole('dialog', { name: 'Mining analysis and laser' });
      await laser.getByRole('button', { name: 'Begin fracture' }).click();
      const hold = laser.getByRole('button', { name: 'Hold laser' });
      const box = await hold.boundingBox();
      if (!box) throw new Error('Laser control invisible.');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const laserStamp = performance.now();
      await page.mouse.down();
      await expect(laser.getByRole('button', { name: 'Fracture node' })).toBeEnabled({ timeout: 15_000 });
      await page.mouse.up();
      now += 20_000;
      await laser.getByRole('button', { name: 'Fracture node' }).click();
      const laserMs = performance.now() - laserStamp;
      await expect.poll(() => current().world!.nodes[nodeId]?.status).toBe('FRACTURED');
      const fragments = [...current().world!.nodes[nodeId].fragments];
      const groundStamp = performance.now();
      for (const fragment of fragments)
        await act({ type: 'collectPiece', nodeId, pieceId: fragment.id }, durations);
      const groundCollectionMs = performance.now() - groundStamp;
      const node = current().world!.nodes[nodeId];
      if (node.status !== 'DEPLETED' || node.fragments.some((piece) => !piece.collected))
        throw new Error('Ground yield did not deplete exactly.');
      await zoneStep('LYRIA_CAVE_01', durations, physical);
      await zoneStep('LYRIA_SURFACE_01', durations, physical);
      await zoneStep('LYRIA_OUTPOST_01', durations, physical);
      await act(
        { type: 'transferMinor', source: 'Hand', ship: 'Nomad', ore: 'Dolivine', unitsMinor: 400 },
        durations,
      );
      await zoneStep('LYRIA_ASOP', durations, physical);
      await act({ type: 'retrieveRoc' }, durations);
      await act({ type: 'enterRoc', occupied: true }, durations);
      const rocStamp = performance.now();
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(500);
      await page.keyboard.up('ArrowDown');
      const rocMovementMs = performance.now() - rocStamp;
      await act({ type: 'enterRoc', occupied: false }, durations);
      await act({ type: 'stowRoc' }, durations);
      await zoneStep('LYRIA_OUTPOST_01', durations, physical);
      await travel('Wala', durations);
      await zoneStep('WALA_SURFACE_01', durations, physical);
      await zoneStep('WALA_CAVE_01', durations, physical);
      await zoneStep('WALA_SURFACE_01', durations, physical);
      await zoneStep('WALA_OUTPOST_01', durations, physical);
      await travel('Area-18', durations);
      const areaStart = performance.now();
      for (const zone of [
        'AREA18_SECURITY',
        'AREA18_SPACEPORT_PLATFORM',
        'AREA18_SHUTTLE',
        'AREA18_CITY_PLATFORM',
        'AREA18_TRANSIT',
        'AREA18_PLAZA',
      ] as const)
        await zoneStep(zone, durations, physical);
      const area18TransitMs = performance.now() - areaStart;
      const area18Frames = await frameSample();
      for (const zone of [
        'AREA18_TRANSIT',
        'AREA18_CITY_PLATFORM',
        'AREA18_SHUTTLE',
        'AREA18_SPACEPORT_PLATFORM',
        'AREA18_SECURITY',
        'AREA18_SPACEPORT',
      ] as const)
        await act({ type: 'enterZone', zone }, durations);
      await travel('ARC-L1', durations);
      now += NODE_RESPAWN_MS + 1;
      await page.clock.setFixedTime(new Date(now));
      if (current().world?.zone !== 'ARC_L1_START') throw new Error('Return did not reach ARC-L1 start.');
      await measure(cycle, cycle === 10 ? 'mid' : 'returned-to-arc-l1', durations);
      const latest = samples.at(-1)!;
      latest.laserMs = laserMs;
      latest.scannerMs = scannerMs;
      latest.groundCollectionMs = groundCollectionMs;
      latest.rocMovementMs = rocMovementMs;
      latest.area18TransitMs = area18TransitMs;
      latest.area18Frames = area18Frames;
      latest.physicalWalkingCycle = physical;
      await save();
    }
    await measure(samples.length - 1, 'final');
    await page.close();
  } finally {
    await browser.close();
  }
  report.status = 'COMPLETE';
} catch (error) {
  report.status = 'FAILED';
  report.failure = error instanceof Error ? error.message : 'Unknown local benchmark failure.';
} finally {
  report.finishedAt = new Date().toISOString();
  report.durationMs = performance.now() - started;
  report.completedCycles = samples.filter(
    (sample) => sample.phase === 'returned-to-arc-l1' || sample.phase === 'mid',
  ).length;
  await save();
  server.kill('SIGTERM');
}
if (report.status !== 'COMPLETE') throw new Error(String(report.failure));
process.stdout.write(
  JSON.stringify(
    { status: report.status, completedCycles: report.completedCycles, durationMs: report.durationMs, errors },
    null,
    2,
  ) + '\n',
);
