import { expect, test, Page } from '@playwright/test';
import { MemoryStore } from '../../server/store';
import { GameService } from '../../server/service';
import { createApi } from '../../server/http';
import { initialState } from '../../shared/game';
import { firstShiftOf } from '../../shared/firstShift';
import type { PlayerState } from '../../shared/schema';
import { randomUUID } from 'node:crypto';
import { beginAssignedTravel } from '../travelFixture';

async function fixture(page: Page, options: { legacy?: boolean; travel?: boolean } = {}) {
  const legacy = options.legacy ?? true;
  const travel = options.travel ?? true;
  let now = 1_800_000_000_000;
  let posts = 0;
  const store = new MemoryStore();
  const state = initialState(() => 0.5);
  if (legacy) state.firstShift = firstShiftOf(state);
  store.states.set('synthetic-player', state);
  const service = new GameService(
    store,
    () => now,
    () => 0.5,
  );
  const api = createApi(service, async () => 'synthetic-player', ['http://127.0.0.1:5173']);
  await page.route('https://extension-files.twitch.tv/**', (route) => route.abort());
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') posts++;
    const result = await api({
      method: request.method(),
      path: new URL(request.url()).pathname,
      headers: request.headers(),
      body: request.postData() ?? undefined,
    });
    await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
  });
  const seed = async (objective: NonNullable<PlayerState['firstShift']>['objective']) => {
    const next = structuredClone(store.states.get('synthetic-player')!);
    next.pending = null;
    next.firstShift = { ...firstShiftOf(next), status: 'ACTIVE', objective, acceptedAt: now };
    store.states.set('synthetic-player', next);
    await page.reload();
    await expect(page.getByRole('img', { name: /Pixel-art map of Lyria/ })).toBeVisible();
    await expect(page.getByLabel('DIME title scene')).toBeVisible();
    await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  };
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' })).toBeVisible();
  if (travel) {
    await beginAssignedTravel(service, 'synthetic-player', 'Lyria');
    now += 1_000_000;
    const beforeArrival = (await service.snapshot('synthetic-player')).state;
    await service.mutate('synthetic-player', {
      requestId: randomUUID(),
      expectedRevision: beforeArrival.revision,
      action: { type: 'finish' },
    });
    await page.reload();
    await expect(
      page.getByRole('img', {
        name: legacy ? /Pixel-art map of Lyria/ : /Original pixel-art map of Lyria Mining Outpost/,
      }),
    ).toBeVisible();
  }
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  return {
    store,
    seed,
    posts: () => posts,
    advance: () => {
      now += 4000;
    },
  };
}
async function walk(page: Page, key: string, duration: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  await page.keyboard.up(key);
}
test('touch cutter completes one server-authoritative extraction', async ({ browser }) => {
  test.setTimeout(30_000);
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const { store, seed, posts } = await fixture(page);
    await seed('MINE_ASSIGNED_ORE');
    await walk(page, 'ArrowRight', 4750);
    await walk(page, 'ArrowUp', 1600);
    await expect(page.getByText('E · Dolivine seam')).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    const button = page.getByRole('button', { name: 'Hold mining tool' });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2,
      y = box!.y + box!.height / 2;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(2350);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(posts).toBe(1);
    expect(store.states.get('synthetic-player')!.mining.Hand.Dolivine).toBe(400);
  } finally {
    await context.close();
  }
});

test('ARC-L1 player is directed to travel before accepting the shift', async ({ page }) => {
  const { store, posts } = await fixture(page, { legacy: false, travel: false });
  expect(store.states.get('synthetic-player')?.location).toBe('ARC-L1');
  await expect(page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' })).toBeVisible();
  await expect(page.getByText('Travel to Lyria via the ship console')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept First Shift' })).toHaveCount(0);
  expect(posts()).toBe(0);
});

test('objective notification stays clear of the collapsible tracker', async ({ page }) => {
  await page.setViewportSize({ width: 318, height: 500 });
  await fixture(page, { legacy: false });
  await walk(page, 'ArrowUp', 500);
  await expect(page.getByText(/E · Mara Voss/)).toBeVisible();
  await page.getByRole('button', { name: 'Interact' }).click();
  await page.getByRole('button', { name: 'Accept First Shift' }).click();
  const tracker = page.getByRole('button', { name: 'Toggle objective tracker' });
  const toast = page.getByRole('status');
  await expect(toast).toContainText('Objective complete');
  await expect(toast).toHaveCount(1);
  const trackerBox = await tracker.locator('..').boundingBox();
  const toastBox = await toast.boundingBox();
  expect(trackerBox).not.toBeNull();
  expect(toastBox).not.toBeNull();
  expect(toastBox!.y).toBeGreaterThanOrEqual(trackerBox!.y + trackerBox!.height);
  await tracker.click();
  await expect(tracker).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Quest Log' })).toHaveCount(0);
});

test('legacy assignment reconciles once on load and shows one correction notice', async ({ page }) => {
  const { store, posts } = await fixture(page);
  const old = store.states.get('synthetic-player')!;
  old.quantityVersion = undefined;
  old.walletRemainder = undefined;
  for (const rate of Object.values(old.refineryRates)) {
    rate.yield /= 1_000_000;
    rate.cost /= 1_000_000;
    rate.time /= 1_000_000;
  }
  old.firstShift = {
    ...firstShiftOf(old),
    version: undefined,
    reconciliation: undefined,
    status: 'ACTIVE',
    objective: 'START_REFINERY_ORDER',
    acceptedAt: 1_799_999_999_000,
    counters: { mined: 4, refined: 0, sold: 0 },
  };
  old.mining.Hand.Dolivine = 4;
  await page.reload();
  await expect.poll(() => store.states.get('synthetic-player')?.firstShift?.objective).toBe('SELL_MINED_GEM');
  expect(store.states.get('synthetic-player')?.firstShift?.reconciliation).toBe('CORRECTED');
  expect(store.states.get('synthetic-player')?.mining.Hand.Dolivine).toBe(400);
  expect(posts()).toBe(1);
  await expect(page.getByRole('status')).toContainText('First Shift updated. Continue your assignment.');
  await page.reload();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  expect(posts()).toBe(1);
});

test('ambiguous legacy output shows Contact support while other navigation remains usable', async ({
  page,
}) => {
  const { store, posts } = await fixture(page);
  const old = store.states.get('synthetic-player')!;
  old.firstShift = {
    ...firstShiftOf(old),
    version: undefined,
    reconciliation: undefined,
    status: 'ACTIVE',
    objective: 'SELL_REFINED_MATERIAL',
    acceptedAt: 1_799_999_999_000,
    counters: { mined: 4, refined: 3, sold: 0 },
    tutorialOrderId: 'synthetic-order',
  };
  old.cargo.Nomad!.refined.Dolivine = 5;
  await page.reload();
  await expect
    .poll(() => store.states.get('synthetic-player')?.firstShift?.reconciliation)
    .toBe('SUPPORT_REQUIRED');
  expect(store.states.get('synthetic-player')?.cargo.Nomad?.refined.Dolivine).toBe(5);
  expect(posts()).toBe(1);
  await page.getByRole('button', { name: 'Quest Log' }).click();
  await expect(page.getByLabel('Quest Log')).toContainText('Contact support');
  await page.reload();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  expect(posts()).toBe(1);
});
