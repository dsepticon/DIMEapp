import { type Page } from '@playwright/test';
import { originalWalkable, type OriginalZoneMap } from '../../shared/originalWorld';
import { createOriginalApi } from '../../server/originalApi';
import { MemoryStore } from '../../server/store';
import type { VersionedContentState } from '../../server/contentConversion';
const endpoint = 'https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging';
export async function setup(page: Page, store = new MemoryStore<VersionedContentState>()) {
  const api = createOriginalApi(store, async () => 'synthetic-walking', [], Date.now, {
    mode: 'ENABLED',
    testerCount: 0,
    permits: () => true,
  });
  const faults = { dropOnceAfterCommit: false, unknownOnceBeforeCommit: false };
  const posts: string[] = [],
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => errors.push(new URL(request.url()).pathname));
  await page.route('https://extension-files.twitch.tv/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.addInitScript(() => {
    Object.assign(window, {
      Twitch: {
        ext: {
          onAuthorized(callback: (auth: unknown) => void) {
            queueMicrotask(() =>
              callback({ token: 'synthetic', userId: 'U-synthetic-walking', channelId: 'synthetic' }),
            );
          },
          onError() {},
        },
      },
    });
  });
  await page.route(endpoint + '/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.replace('/staging', '');
    if (request.method() === 'POST') {
      posts.push(path);
      if (faults.unknownOnceBeforeCommit) {
        faults.unknownOnceBeforeCommit = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'UNAVAILABLE' }),
        });
        return;
      }
    }
    const response = await api({
      method: request.method(),
      path,
      headers: {},
      body: request.postData() ?? undefined,
    });
    if (response.statusCode >= 400) errors.push(`${path}: ${response.statusCode}`);
    if (request.method() === 'POST' && response.statusCode === 200 && faults.dropOnceAfterCommit) {
      faults.dropOnceAfterCommit = false;
      await route.abort('failed');
      return;
    }
    await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
  });
  return { store, posts, errors, faults };
}
export async function walkTo(
  page: Page,
  map: OriginalZoneMap,
  target: { x: number; y: number },
  touch = false,
) {
  await resumeGame(page);
  const position = () =>
    page.locator('canvas').evaluate((c) => ({ x: Number(c.dataset.playerX), y: Number(c.dataset.playerY) }));
  const initial = await position(),
    start = { x: Math.floor(initial.x), y: Math.floor(initial.y) };
  const queue = [start],
    parents = new Map<string, { x: number; y: number } | null>([[`${start.x},${start.y}`, null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    if (p.x === target.x && p.y === target.y) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: p.x + dx!, y: p.y + dy! },
        key = `${next.x},${next.y}`;
      if (!parents.has(key) && originalWalkable(map, next.x, next.y)) {
        parents.set(key, p);
        queue.push(next);
      }
    }
  }
  const points: { x: number; y: number }[] = [];
  let cursor: { x: number; y: number } | null = { x: target.x, y: target.y };
  if (!parents.has(`${target.x},${target.y}`)) throw Error('Synthetic route is not walkable');
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
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  try {
    for (const target of waypoints)
      for (const axis of ['x', 'y'] as const) {
        for (let attempt = 0; attempt < 100; attempt++) {
          const p = await position(),
            delta = target[axis] + 0.5 - p[axis];
          if (Math.abs(delta) < 0.2) break;
          const direction = axis === 'x' ? (delta > 0 ? 'right' : 'left') : delta > 0 ? 'down' : 'up';
          const key = { right: 'd', left: 'a', up: 'w', down: 's' }[direction];
          if (cdp) {
            const b = (await page
              .getByRole('button', { name: `Walk ${direction}`, exact: true })
              .boundingBox())!;
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
            });
          } else await page.keyboard.down(key);
          await page.waitForTimeout(Math.max(20, Math.min(150, (Math.abs(delta) / 4) * 650)));
          if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          else await page.keyboard.up(key);
          if (attempt === 99)
            throw Error(
              `Synthetic walking stalled at ${JSON.stringify(await position())} toward ${JSON.stringify(target)} on ${axis}`,
            );
        }
      }
  } finally {
    if (cdp) await cdp.detach();
  }
}

/** Navigate the production operations overlay through its public controls. */
export async function openOperations(page: Page) {
  if (
    (await page.getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-expanded')) !== 'true'
  )
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
}
export async function resumeGame(page: Page) {
  if (await page.getByRole('button', { name: 'Resume game', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Resume game', exact: true }).click();
}
