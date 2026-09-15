/** Separate application retention from repeated Playwright selector/evaluation instrumentation. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setup } from '../tests/e2e/m4Harness';
import { originalZoneMap, originalWalkable } from '../shared/originalWorld';
import { zoneRoute, exitKind } from '../shared/originalNavigation';

const origin = 'http://127.0.0.1:4188';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4188'],
  { stdio: 'ignore' },
);
const browser = await chromium.launch();
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* startup */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = await browser.newPage({ viewport: { width: 318, height: 500 } });
  const fixture = await setup(page);
  // tsx's function-name helper is needed only by the injected benchmark closure.
  await page.addInitScript({ content: 'globalThis.__name = (value) => value;' });
  await page.goto(origin + '/panel.html');
  await page.locator('canvas[data-player-x]').waitFor();
  const outward = zoneRoute('zone.z001', 'zone.z008');
  const route = [...outward.slice(1), ...[...outward].reverse().slice(1)];
  const maps = Object.fromEntries(
    outward.map((id) => {
      const map = originalZoneMap(id);
      return [
        id,
        {
          width: map.width,
          height: map.height,
          walkable: Array.from(map.tiles, (_, i) =>
            originalWalkable(map, i % map.width, Math.floor(i / map.width)),
          ),
          exits: map.exits.map((exit) => ({
            ...exit,
            label: `Use ${exitKind(id, exit)} · ${originalZoneMap(exit.to).name}`,
          })),
        },
      ];
    }),
  );
  await page.evaluate(
    ({ route, maps }) => {
      const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
      const canvas = () => document.querySelector('canvas')!;
      const position = () => ({ x: Number(canvas().dataset.playerX), y: Number(canvas().dataset.playerY) });
      const run = async (cycles: number) => {
        for (let cycle = 0; cycle < cycles; cycle++)
          for (const next of route) {
            const map = maps[canvas().dataset.zone!]!;
            const exit = map.exits.find((e) => e.to === next)!;
            const p = position(),
              start = { x: Math.floor(p.x), y: Math.floor(p.y) };
            const queue = [start],
              parents = new Map<string, typeof start | null>([[`${start.x},${start.y}`, null]]);
            for (let i = 0; i < queue.length; i++) {
              const at = queue[i]!;
              if (at.x === exit.x && at.y === exit.y) break;
              for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ]) {
                const n = { x: at.x + dx!, y: at.y + dy! },
                  key = `${n.x},${n.y}`;
                if (
                  n.x >= 0 &&
                  n.y >= 0 &&
                  n.x < map.width &&
                  n.y < map.height &&
                  map.walkable[n.y * map.width + n.x] &&
                  !parents.has(key)
                ) {
                  parents.set(key, at);
                  queue.push(n);
                }
              }
            }
            const points: (typeof start)[] = [];
            let cursor: typeof start | null = { x: exit.x, y: exit.y };
            if (!parents.has(`${cursor.x},${cursor.y}`)) throw Error('Unreachable synthetic exit');
            while (cursor) {
              points.unshift(cursor);
              cursor = parents.get(`${cursor.x},${cursor.y}`) ?? null;
            }
            const waypoints = points.filter(
              (_p, i) =>
                i === 0 ||
                i === points.length - 1 ||
                (points[i - 1]!.x !== points[i + 1]!.x && points[i - 1]!.y !== points[i + 1]!.y),
            );
            for (const target of waypoints)
              for (const axis of ['x', 'y'] as const) {
                for (let attempt = 0; attempt < 100; attempt++) {
                  const delta = target[axis] + 0.5 - position()[axis];
                  if (Math.abs(delta) < 0.2) break;
                  const code = axis === 'x' ? (delta > 0 ? 'KeyD' : 'KeyA') : delta > 0 ? 'KeyS' : 'KeyW';
                  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
                  await delay(Math.max(20, Math.min(150, (Math.abs(delta) / 4) * 650)));
                  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
                  if (attempt === 99) throw Error('Synthetic walking stalled');
                }
              }
            const button = [...document.querySelectorAll('button')].find((b) => b.textContent === exit.label);
            if (!button || button.disabled) throw Error('Physical exit unavailable');
            button.click();
            for (let i = 0; canvas().dataset.zone !== next; i++) {
              if (i === 500) throw Error('Physical transit timed out');
              await delay(20);
            }
          }
      };
      Object.assign(window, { dimeHeapJourney: run });
    },
    { route, maps },
  );
  const journey = (cycles: number) =>
    page.evaluate(
      (count) =>
        (window as Window & { dimeHeapJourney: (n: number) => Promise<void> }).dimeHeapJourney(count),
      cycles,
    );
  const cdp = await page.context().newCDPSession(page);
  const samples = [];
  await journey(6);
  for (let batch = 0; batch < 5; batch++) {
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage'),
      dom = await cdp.send('Memory.getDOMCounters');
    samples.push({
      cycles: 6 + batch * 6,
      heapBytes: heap.usedSize,
      documents: dom.documents,
      nodes: dom.nodes,
      listeners: dom.jsEventListeners,
    });
    console.log(JSON.stringify(samples.at(-1)));
    if (batch < 4) await journey(6);
  }
  const result = {
    samples,
    errors: fixture.errors,
    transitions: fixture.posts.length,
    method:
      'Compiled Panel; actual synthetic API. One browser-owned physical pathfinding loop; no per-step Playwright polling, frame-history array or repeated function injection. GC and heap usage sampled directly through CDP after six warmup cycles, then every six cycles.',
  };
  await writeFile('/tmp/dime-m43-release/heap-stability.json', JSON.stringify(result, null, 2) + '\n');
  if (fixture.errors.length) throw Error('Long-session request or browser error');
} finally {
  await browser.close();
  server.kill();
}
