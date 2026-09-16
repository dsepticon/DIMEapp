import { journey } from './journey';
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { originalZoneMap } from '../../shared/originalWorld';
import { walkTo, openOperations, resumeGame } from '../e2e/m4Harness';
const origin = 'https://destroyaindustriesminingextension.com';
for (const viewport of [
  { width: 318, height: 500 },
  { width: 360, height: 640 },
  { width: 1280, height: 900 },
]) {
  test(`memory-only guest ${viewport.width}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 500,
      reducedMotion: viewport.width === 360 ? 'reduce' : 'no-preference',
    });
    const traffic: string[] = [],
      errors: string[] = [];
    const manifest = JSON.parse(readFileSync('docs/dime-m43-game-publication-manifest.json', 'utf8'));
    const allowed = new Set([
      '/game/',
      '/game/index.html',
      '/game/status',
      ...manifest.entries.map((e: { key: string }) => '/' + e.key),
    ]);
    await context.route('**/*', async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const names = Object.keys(req.headers()).map((s) => s.toLowerCase());
      const safe =
        url.origin === origin &&
        allowed.has(url.pathname) &&
        !url.search &&
        req.method() === 'GET' &&
        !names.includes('authorization') &&
        !names.includes('cookie');
      traffic.push(safe ? `GET ${url.pathname}` : 'UNEXPECTED REQUEST BLOCKED');
      if (!safe) {
        errors.push('Unexpected or credential-bearing request blocked');
        await route.abort();
        return;
      }
      await route.continue(); // Real public HTTPS: no mocked capability, assets, authentication or API.
    });
    context.on('response', (response) => {
      const names = Object.keys(response.headers()).map((s) => s.toLowerCase());
      if (names.includes('set-cookie')) errors.push('Unexpected cookie response');
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}`);
    });
    context.on('requestfailed', () => errors.push('Network failure'));
    const page = await context.newPage();
    page.on('pageerror', () => errors.push('Page error'));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push('Console error');
    });
    await page.goto(origin + '/game/');
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-zone', 'zone.z001');
    await expect(page.getByText('Guest Demo — progress is not saved', { exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/dime-m43-game-publication/screenshots/guest-${viewport.width}.png` });
    const performance = await page.evaluate(async () => {
      const frames: number[] = [];
      await new Promise<void>((done) => {
        let previous = 0;
        const tick = (time: number) => {
          if (previous) frames.push(time - previous);
          previous = time;
          if (frames.length < 120) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      frames.sort((a, b) => a - b);
      const rects = Array.from(document.querySelectorAll('button, .place, .guestNotice'))
        .filter((el) => el.getClientRects().length)
        .map((el) => el.getBoundingClientRect());
      let covered = 0;
      for (let y = 0; y < innerHeight; y++)
        for (let x = 0; x < innerWidth; x++)
          if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered++;
      return {
        p95: frames[114],
        worst: frames[119],
        unobstructed: 100 * (1 - covered / (innerWidth * innerHeight)),
        canvas: document.querySelectorAll('canvas').length,
        dom: document.querySelectorAll('*').length,
        documentScroll: document.documentElement.scrollHeight > innerHeight,
      };
    });
    expect(performance.canvas).toBe(1);
    expect(performance.documentScroll).toBe(false);
    expect(performance.unobstructed).toBeGreaterThanOrEqual(80);
    writeFileSync(
      `/tmp/dime-m43-game-publication/performance-${viewport.width}.json`,
      JSON.stringify(performance, null, 2),
    );
    const map = originalZoneMap('zone.z001'),
      exit = map.exits[0]!;
    await walkTo(page, map, exit, viewport.width < 500);
    await page.getByRole('button', { name: /^Use / }).click();
    await expect(canvas).toHaveAttribute('data-zone', exit.to);
    await openOperations(page);
    await expect(page.getByRole('button', { name: 'PROFILE', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: /sign in with twitch/i })).toHaveCount(0);
    await expect(page.getByText(/Online saves and Twitch linking/)).toBeVisible();
    await expect(canvas).toHaveAttribute('data-paused', 'true');
    await resumeGame(page);
    const second = await context.newPage();
    await second.goto(origin + '/game/');
    await expect(second.locator('canvas')).toHaveAttribute('data-zone', 'zone.z001');
    await expect(canvas).toHaveAttribute('data-zone', exit.to);
    await second.close();
    await page.bringToFront();
    await page.reload();
    await expect(canvas).toHaveAttribute('data-zone', 'zone.z001');
    expect(
      await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
    ).toEqual({ local: 0, session: 0 });
    await journey(page, viewport.width < 500, viewport.width);
    expect((await context.cookies()).length).toBe(0);
    expect(
      await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
    ).toEqual({ local: 0, session: 0 });
    await page.reload();
    await expect(canvas).toHaveAttribute('data-zone', 'zone.z001');
    expect(traffic.every((x) => x.startsWith('GET '))).toBeTruthy();
    expect(errors).toEqual([]);
    writeFileSync(
      `/tmp/dime-m43-game-publication/browser-${viewport.width}.json`,
      JSON.stringify(
        {
          width: viewport.width,
          requests: traffic,
          errors,
          gameplay: 'passed',
          independentTabs: true,
          reloadClearsProgress: true,
          browserStorageEmpty: true,
          noCookies: true,
        },
        null,
        2,
      ),
    );
    await context.close();
  });
}
