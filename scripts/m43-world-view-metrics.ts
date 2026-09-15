/** Synthetic production viewport coverage. Transparent hit rectangles count as covered. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setup } from '../tests/e2e/m4Harness';
import { originalInitialState } from '../shared/originalGame';
import { originalZoneMap } from '../shared/originalWorld';
const root = '/tmp/dime-m43-world-ui',
  origin = 'http://127.0.0.1:4195';
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4195'],
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
  const results = [];
  for (const layout of [
    { name: 'panel', width: 318, height: 500, file: 'panel.html' },
    { name: 'mobile', width: 360, height: 640, file: 'mobile.html' },
    { name: 'desktop', width: 1280, height: 900, file: 'index.html' },
  ]) {
    const page = await browser.newPage({ viewport: layout }),
      f = await setup(page);
    for (const scene of ['station', 'node', 'laser', 'fragments'] as const) {
      const s = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5);
      if (scene !== 'station') {
        const map = originalZoneMap('zone.z014'),
          id = map.id + '.node.visibility';
        s.location = 'loc.l002';
        s.world.zone = map.id;
        s.world.nodes[id] = {
          id,
          ore: 'mat.m001',
          source: 'extract.x001',
          x: map.spawn.x + 1,
          y: map.spawn.y,
          size: 1,
          resistance: 0.6,
          instability: 0.2,
          yieldUnits: 300,
          status: scene === 'fragments' ? 'FRACTURED' : 'INTACT',
          respawnAt: null,
          fragments:
            scene === 'fragments'
              ? [
                  { id: 'piece-a', x: map.spawn.x + 1, y: map.spawn.y, units: 100, collected: false },
                  { id: 'piece-b', x: map.spawn.x - 1, y: map.spawn.y, units: 100, collected: false },
                  { id: 'piece-c', x: map.spawn.x, y: map.spawn.y + 1, units: 100, collected: false },
                ]
              : [],
        };
        s.world.scanner.analyzed = [id];
        s.world.scanner.scannedZones = [map.id];
      }
      f.store.states.set('synthetic-walking', s);
      await page.goto(origin + '/' + layout.file);
      await page.locator('canvas[data-player-x]').waitFor();
      if (scene === 'laser') await page.getByRole('button', { name: 'Target node', exact: true }).click();
      if (scene === 'fragments')
        await page.getByRole('button', { name: 'Hold Vacuum', exact: true }).waitFor();
      if (scene !== 'station') {
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await page.getByRole('button', { name: 'NAV', exact: true }).click();
        await page.getByRole('button', { name: 'Avenbolt', exact: true }).click();
        await page.getByRole('button', { name: 'Close map', exact: true }).click();
      }
      await page.waitForTimeout(250);
      const coverage = await page.evaluate(() => {
        const rects = Array.from(
          document.querySelectorAll(
            'button, .place, .objective, .nodeTargetStatus, .charge, .fragmentPrompt, .miningConsole > small, .miningOutcome, .vacuumFeedback',
          ),
        )
          .filter((el) => el.getClientRects().length)
          .map((el) => el.getBoundingClientRect());
        let covered = 0;
        for (let y = 0; y < innerHeight; y++)
          for (let x = 0; x < innerWidth; x++)
            if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered++;
        return { unobstructed: 100 * (1 - covered / (innerWidth * innerHeight)), coveredPixels: covered };
      });
      results.push({ layout: layout.name, scene, activeDestination: scene !== 'station', ...coverage });
      await page.screenshot({ path: `${root}/screenshots/after-${layout.name}-${scene}.png` });
      if (coverage.unobstructed < 80)
        throw Error(`${layout.name} ${scene} visibility below 80%: ${coverage.unobstructed}`);
    }
    if (f.errors.length) throw Error('Synthetic preview errors');
    await page.close();
  }
  await writeFile(root + '/coverage.json', JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  server.kill();
}
