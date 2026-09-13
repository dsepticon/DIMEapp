import { expect, test, Page } from '@playwright/test';
import { MemoryStore } from '../../server/store';
import { GameService } from '../../server/service';
import { createApi } from '../../server/http';
import { initialState } from '../../shared/game';
import { firstShiftOf } from '../../shared/firstShift';
import type { PlayerState } from '../../shared/schema';

async function fixture(page: Page) {
  let now = 1_800_000_000_000;
  let posts = 0;
  const store = new MemoryStore();
  const state = initialState(() => 0.5);
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  store.states.set('synthetic-player', state);
  const api = createApi(
    new GameService(
      store,
      () => now,
      () => 0.5,
    ),
    async () => 'synthetic-player',
    ['http://127.0.0.1:5173'],
  );
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
  await expect(page.getByRole('img', { name: /Pixel-art map of Lyria/ })).toBeVisible();
  await expect(page.getByLabel('DIME title scene')).toBeVisible();
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
async function foreman(page: Page) {
  await walk(page, 'ArrowRight', 1050);
  await walk(page, 'ArrowUp', 360);
  await expect(page.getByText('E · Shift Foreman Mara Voss')).toBeVisible();
  await page.keyboard.press('e');
}
async function capture(page: Page, size: string, name: string) {
  await page.screenshot({ path: `test-results/m2-${size}-${name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
}

for (const [size, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`First Shift ${size} presentation and authoritative UI flow`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    const { store, seed, posts, advance } = await fixture(page);
    await foreman(page);
    await expect(page.getByRole('button', { name: 'Accept assignment' })).toBeVisible();
    await capture(page, size, 'foreman-introduction');
    await page.getByRole('button', { name: 'Accept assignment' }).click();
    await expect(page.getByRole('status')).toContainText('Objective complete');
    await capture(page, size, 'assignment-acceptance');
    await capture(page, size, 'objective-tracker');
    await page.getByRole('button', { name: 'Quest Log' }).click();
    await expect(page.getByRole('heading', { name: 'Quest Log' })).toBeVisible();
    await capture(page, size, 'quest-log');
    await seed('ENTER_MINE');
    await walk(page, 'ArrowRight', 1800);
    await expect(page.getByLabel('Area introduction')).toHaveCount(0, { timeout: 5000 });
    await capture(page, size, 'mine-entrance');
    await seed('MINE_ASSIGNED_ORE');
    await walk(page, 'ArrowRight', 4750);
    await walk(page, 'ArrowUp', 1600);
    await expect(page.getByText('E · Dolivine seam')).toBeVisible();
    await page.keyboard.press('e');
    await expect(page.getByRole('dialog', { name: 'Dolivine mining sequence' })).toBeVisible();
    await capture(page, size, 'mining-interaction');
    const before = posts();
    if (size === 'panel') {
      await page.getByRole('button', { name: 'Cancel extraction' }).click();
      expect(posts()).toBe(before);
      expect(store.states.get('synthetic-player')!.mining.Hand.Dolivine ?? 0).toBe(0);
      await page.keyboard.press('e');
      await page.keyboard.down('e');
      await page.waitForTimeout(1500);
      await page.keyboard.up('e');
      await expect(page.getByRole('dialog', { name: 'Dolivine mining sequence' })).toContainText(
        'Extraction failed',
        { timeout: 6000 },
      );
      expect(posts()).toBe(before);
      await page.getByRole('button', { name: 'Close' }).click();
      await page.keyboard.press('e');
    }
    await page.keyboard.down('e');
    await page.waitForTimeout(2350);
    await page.keyboard.up('e');
    await expect.poll(posts).toBe(before + 1);
    expect(store.states.get('synthetic-player')!.mining.Hand.Dolivine).toBe(4);
    await capture(page, size, 'mining-success');
    await seed('START_REFINERY_ORDER');
    store.states.get('synthetic-player')!.mining.Hand.Dolivine = 4;
    await page.getByRole('button', { name: 'Open game menu' }).click();
    await page
      .getByRole('navigation', { name: 'Game menu' })
      .getByRole('button', { name: 'Refinery' })
      .click();
    await expect(page.getByRole('button', { name: 'Start tutorial order' })).toBeVisible();
    await capture(page, size, 'refinery-tutorial');
    await seed('SELL_REFINED_MATERIAL');
    store.states.get('synthetic-player')!.cargo.Nomad!.refined.Dolivine = 3;
    await page.getByRole('button', { name: 'Open game menu' }).click();
    await page.getByRole('navigation', { name: 'Game menu' }).getByRole('button', { name: 'Market' }).click();
    await expect(page.getByRole('button', { name: 'Sell tutorial material' })).toBeVisible();
    await capture(page, size, 'market-sale');
    await seed('RETURN_TO_FOREMAN');
    await foreman(page);
    await expect(page.getByRole('button', { name: /Complete shift/ })).toBeVisible();
    await capture(page, size, 'quest-completion');
    await page.getByRole('button', { name: /Complete shift/ }).click();
    await expect(page.getByRole('status')).toContainText('First Shift complete');
    await page.getByRole('button', { name: 'Quest Log' }).click();
    await expect(page.getByText('Reward claimed: 500 aUEC')).toBeVisible();
    await capture(page, size, 'reward-summary');
    advance();
  });
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
    expect(store.states.get('synthetic-player')!.mining.Hand.Dolivine).toBe(4);
  } finally {
    await context.close();
  }
});

test('ARC-L1 player is directed to travel before accepting the shift', async ({ page }) => {
  const { store, posts } = await fixture(page);
  const current = store.states.get('synthetic-player')!;
  current.location = 'ARC-L1';
  current.positions.Nomad = 'ARC-L1';
  await page.reload();
  await expect(page.getByLabel('DIME title scene')).toBeVisible();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  await expect(page.getByText('Travel to Lyria via the ship console')).toBeVisible();
  await foreman(page);
  await expect(page.getByRole('button', { name: 'Open Travel' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Travel' }).click();
  await expect(page.getByRole('dialog', { name: 'travel menu' })).toBeVisible();
  expect(posts()).toBe(0);
});
