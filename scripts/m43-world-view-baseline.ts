/** Capture the preserved compiled 0.9.0 baseline with synthetic state. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { setup } from '../tests/e2e/m4Harness';
import { originalInitialState } from '../shared/originalGame';
import { populateOriginalZone } from '../shared/originalDiscovery';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4193',
    '--outDir',
    '/tmp/dime-m43-world-ui/before/client',
  ],
  { stdio: 'ignore' },
);
const browser = await chromium.launch();
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4193')).ok) break;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const layout of [
    { name: 'panel', width: 318, height: 500, file: 'panel.html' },
    { name: 'mobile', width: 360, height: 640, file: 'mobile.html' },
    { name: 'desktop', width: 1280, height: 900, file: 'index.html' },
  ]) {
    const page = await browser.newPage({ viewport: layout });
    const f = await setup(page);
    for (const mining of [false, true]) {
      let s = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5);
      if (mining) {
        s.location = 'loc.l003';
        s.world.zone = 'zone.z024';
        s = populateOriginalZone(s);
      }
      f.store.states.set('synthetic-walking', s);
      await page.goto('http://127.0.0.1:4193/' + layout.file);
      await page.locator('canvas').waitFor();
      await page.screenshot({
        path: `/tmp/dime-m43-world-ui/screenshots/before-${layout.name}-${s.world.zone}.png`,
      });
    }
    if (f.errors.length) throw Error('Baseline preview error');
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
