import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { originalInitialState } from '../shared/originalGame';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
import { transitionOriginalZone } from '../shared/originalWorld';
import {
  assignOriginalDeparture,
  completeOriginalDeparture,
  originalTravelService,
} from '../shared/originalTravel';
import { analyzeOriginalNode, populateOriginalZone, scanOriginalZone } from '../shared/originalDiscovery';
import { classifyHeapMeasurements } from '../shared/performanceMemory';

const durationMs = Number(process.env.DIME_PERFORMANCE_DURATION_MS ?? 600_000);
const output =
  process.env.DIME_PERFORMANCE_OUTPUT ?? '/tmp/dime-m4-original-review/m4-production-long-session.json';
const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
const errors: string[] = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => errors.push(`network:${new URL(request.url()).pathname}`));
await page.addInitScript({
  content:
    "window.Twitch={ext:{onAuthorized:function(callback){queueMicrotask(function(){callback({token:'synthetic',userId:'U-performance',channelId:'synthetic'})})},onError:function(){}}};window.__m4Frames=[];window.__m4Last=performance.now();window.__m4Frame=function(now){window.__m4Frames.push(now-window.__m4Last);if(window.__m4Frames.length>5000)window.__m4Frames.shift();window.__m4Last=now;requestAnimationFrame(window.__m4Frame)};requestAnimationFrame(window.__m4Frame);",
});
let state = originalInitialState(randomUUID(), () => 0.5);
await page.route('https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging/**', async (route) => {
  if (route.request().method() === 'GET')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ state, serverTime: Date.now() }),
    });
  const input = route.request().postDataJSON() as { action: { type: string; [key: string]: unknown } };
  const action = input.action;
  try {
    if (action.type === 'moveZone')
      state = populateOriginalZone(transitionOriginalZone(state, String(action.destination)));
    else if (action.type === 'assignDeparture')
      state = assignOriginalDeparture(
        state,
        String(action.ship) as never,
        String(action.destination) as never,
        Boolean(action.loadGroundVehicle),
      );
    else if (action.type === 'completeDeparture') state = completeOriginalDeparture(state);
    else if (action.type === 'scan') state = scanOriginalZone(state, Date.now());
    else if (action.type === 'analyze') state = analyzeOriginalNode(state, String(action.nodeId));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ state, replayed: false, serverTime: Date.now() }),
    });
  } catch {
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'ACTION_REJECTED', message: 'Synthetic action rejected.' }),
    });
  }
});
await page.goto('http://127.0.0.1:4180/mobile.html');
await page.getByText('Crew Ring Arrival', { exact: true }).waitFor();
const zone = (id: string) => ORIGINAL_CONTENT.zones.find((item) => item.id === id)!;
function routePath(from: string, to: string) {
  const queue: [string, string[]][] = [[from, []]],
    seen = new Set([from]);
  while (queue.length) {
    const [id, path] = queue.shift()!;
    if (id === to) return path;
    for (const exit of zone(id).exits)
      if (!seen.has(exit.to)) {
        seen.add(exit.to);
        queue.push([exit.to, [...path, exit.to]]);
      }
  }
  throw Error(`No path ${from} -> ${to}`);
}
const transitions: number[] = [];
async function moveTo(id: string) {
  for (const next of routePath(state.world.zone, id)) {
    const started = performance.now(),
      label = zone(next).name;
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await page.getByText(label, { exact: true }).first().waitFor();
    transitions.push(performance.now() - started);
  }
}
async function travel(destination: string) {
  const service = originalTravelService(state.location);
  await moveTo(service.assign);
  const name = ORIGINAL_CONTENT.locations.find((item) => item.id === destination)!.name;
  await page.getByRole('button', { name: `Assign ${name}` }).click();
  await moveTo(service.depart);
  await page.getByRole('button', { name: 'Depart assigned bay' }).click();
  await page.getByText(name, { exact: true }).first().waitFor();
}
type Sample = {
  cycle: number;
  phase: 'initial' | 'active' | 'final' | 'post-idle';
  at: number;
  heap: number | null;
  dom: number;
  canvas: number;
  averageFrameMs: number;
  p95FrameMs: number;
  worstFrameMs: number;
  documentScroll: boolean;
};
const samples: Sample[] = [];
async function sample(cycle: number, phase: Sample['phase'] = 'active') {
  samples.push(
    await page.evaluate(
      ({ cycle, phase }) => {
        const target = window as Window & { __m4Frames?: number[] };
        const frames = target.__m4Frames ?? [],
          sorted = [...frames].sort((a, b) => a - b);
        return {
          cycle,
          phase,
          at: Date.now(),
          heap:
            (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
            null,
          dom: document.querySelectorAll('*').length,
          canvas: document.querySelectorAll('canvas').length,
          averageFrameMs: frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length),
          p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
          worstFrameMs: sorted.at(-1) ?? 0,
          documentScroll: document.documentElement.scrollHeight > innerHeight,
        };
      },
      { cycle, phase },
    ),
  );
}
const started = Date.now();
let cycles = 0;
await sample(0, 'initial');
while (cycles < 20 || Date.now() - started < durationMs) {
  for (const destination of ['loc.l002', 'loc.l003', 'loc.l004', 'loc.l001']) {
    await travel(destination);
    if (destination === 'loc.l002') {
      await moveTo('zone.z014');
      await page.getByRole('button', { name: 'Ping signatures' }).click();
      const analyze = page.getByRole('button', { name: 'Analyze selected signature' });
      if (await analyze.isVisible()) await analyze.click();
    }
  }
  cycles++;
  if (cycles % 5 === 0) await sample(cycles);
}
await sample(cycles, 'final');
await page.waitForTimeout(30_000);
await sample(cycles, 'post-idle');
const heapMeasurement = classifyHeapMeasurements(samples.map((sample) => sample.heap));
samples.forEach((sample, index) => {
  sample.heap = heapMeasurement.values[index] ?? null;
});
const sorted = [...transitions].sort((a, b) => a - b);
const heapValues = samples.map((sample) => sample.heap).filter((value): value is number => value !== null);
const heapAt = (phase: Sample['phase']) => samples.find((sample) => sample.phase === phase)?.heap ?? null;
const report = {
  browser: browser.version(),
  platform: process.platform,
  architecture: process.arch,
  build: 'production Twitch preview',
  durationMs: Date.now() - started,
  cycles,
  transition: {
    averageMs: transitions.reduce((a, b) => a + b, 0) / transitions.length,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    worstMs: sorted.at(-1),
  },
  heapMeasurement: {
    available: heapMeasurement.available,
    method: heapMeasurement.method,
    reason: heapMeasurement.reason,
    initialBytes: heapAt('initial'),
    midpointBytes: samples[Math.floor(samples.length / 2)]?.heap ?? null,
    finalBytes: heapAt('final'),
    postIdleBytes: heapAt('post-idle'),
    minimumBytes: heapValues.length ? Math.min(...heapValues) : null,
    maximumBytes: heapValues.length ? Math.max(...heapValues) : null,
    forcedGarbageCollection: false,
  },
  samples,
  errors,
  limitations:
    'Local Chromium production-preview surrogate. Real Twitch webview and domain performance remain release gates.',
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    { durationMs: report.durationMs, cycles, transition: report.transition, errors: errors.length },
    null,
    2,
  ),
);
await browser.close();
