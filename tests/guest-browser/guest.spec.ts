import { journey } from './journey';
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { originalZoneMap } from '../../shared/originalWorld';
import { walkTo, openOperations, resumeGame } from '../e2e/m4Harness';
const origin = 'https://destroyaindustriesminingextension.com';
const headers = JSON.parse(readFileSync('infra/web/guest-review/security-headers.json', 'utf8')) as Record<
  string,
  string
>;
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
    await context.route('**/*', async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      traffic.push(`${req.method()} ${url.pathname}`);
      expect(url.origin).toBe(origin);
      expect(req.method()).toBe('GET');
      expect(req.headers()['authorization']).toBeUndefined();
      expect(req.headers()['cookie']).toBeUndefined();
      if (url.pathname === '/auth/status') {
        const response = runInNewContext(
          readFileSync('infra/web/guest-review/status-function.js', 'utf8') +
            '\nhandler({request:{method:"GET",uri:"/auth/status"}})',
        ) as { statusCode: number; body: string };
        await route.fulfill({
          status: response.statusCode,
          headers: { ...headers, 'content-type': 'application/json' },
          body: response.body,
        });
        return;
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      expect(file === 'index.html' || /^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(file)).toBeTruthy();
      await route.fulfill({
        headers: {
          ...headers,
          'content-type': file.endsWith('.js')
            ? 'text/javascript'
            : file.endsWith('.css')
              ? 'text/css'
              : 'text/html',
        },
        body: readFileSync(resolve('dist/guest', file)),
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(origin);
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-zone', 'zone.z001');
    await expect(page.getByText('Guest Demo — progress is not saved', { exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/dime-m43-guest/screenshots/guest-${viewport.width}.png` });
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
      `/tmp/dime-m43-guest/performance-${viewport.width}.json`,
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
    await second.goto(origin);
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
    expect(await context.cookies()).toEqual([]);
    expect(
      await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
    ).toEqual({ local: 0, session: 0 });
    await page.reload();
    await expect(canvas).toHaveAttribute('data-zone', 'zone.z001');
    expect(traffic.every((x) => x.startsWith('GET '))).toBeTruthy();
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('proposed guest edge rejects anonymous and forged public gameplay requests before any origin', async ({
  page,
}) => {
  const source = readFileSync('infra/web/guest-review/status-function.js', 'utf8');
  let rejected = 0;
  await page.route(origin + '/**', async (route) => {
    const req = route.request(),
      uri = new URL(req.url()).pathname;
    if (uri === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><main>Guest edge boundary review</main>',
      });
    const response = runInNewContext(source + '\nhandler(event)', {
      event: { request: { method: req.method(), uri } },
    }) as { statusCode?: number; body: string };
    expect(response.statusCode).toBe(401);
    rejected++;
    await route.fulfill({ status: 401, contentType: 'application/json', body: response.body });
  });
  await page.goto(origin);
  const statuses = await page.evaluate(async () => {
    const result = [];
    for (const forged of [false, true])
      for (const path of [
        '/api/v4/state',
        '/api/v4/actions',
        '/api/v4/profile/reset',
        '/api/v4/content/convert',
      ]) {
        const r = await fetch(path, {
          method: path.endsWith('/state') ? 'GET' : 'POST',
          headers: forged ? { Authorization: 'Bearer guest-demo' } : {},
          credentials: 'omit',
        });
        result.push(r.status);
      }
    return result;
  });
  expect(statuses).toEqual(Array(8).fill(401));
  expect(rejected).toBe(8);
});
