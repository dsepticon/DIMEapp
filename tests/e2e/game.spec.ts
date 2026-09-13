import { expect, test, Page } from '@playwright/test';
import { MemoryStore } from '../../server/store';
import { GameService } from '../../server/service';
import { createApi } from '../../server/http';
import { initialState } from '../../shared/game';
import { Ore } from '../../shared/schema';
const navigate = async (page: Page, name: string) => {
  if (name === 'game') {
    await page.getByRole('button', { name: 'Close menu' }).click();
    return;
  }
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await page.getByRole('button', { name: 'Close menu' }).click();
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await page
    .getByRole('navigation', { name: 'Game menu' })
    .getByRole('button', {
      name:
        name === 'cargo'
          ? /Backpack/
          : name === 'profile'
            ? /Character/
            : name === 'travel'
              ? /Ship/
              : name === 'mining'
                ? /Mining controls/
                : name,
      exact: name === 'refinery' || name === 'market',
    })
    .click();
};
async function fixture(page: Page, funded = true) {
  let now = 1_800_000_000_000;
  let actionRequests = 0;
  const store = new MemoryStore(),
    state = initialState(() => 0.1);
  if (funded) {
    state.wallet = 10000;
    state.ships.Prospector = 1;
    state.positions.Prospector = 'ARC-L1';
  }
  store.states.set('test', state);
  const api = createApi(
    new GameService(
      store,
      () => now,
      () => 0.1,
    ),
    async () => 'test',
    ['http://127.0.0.1:5173'],
  );
  let loseResponse = false;
  let rejectAction = false;
  await page.route('https://extension-files.twitch.tv/**', (route) => route.abort());
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') actionRequests++;
    if (rejectAction && request.method() === 'POST') {
      rejectAction = false;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INVALID_REQUEST', message: 'Synthetic rejection.' }),
      });
      return;
    }
    const result = await api({
      method: request.method(),
      path: new URL(request.url()).pathname,
      headers: request.headers(),
      body: request.postData() ?? undefined,
    });
    if (loseResponse && request.method() === 'POST') {
      loseResponse = false;
      await route.abort();
      return;
    }
    await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
  });
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Pixel-art map of Lyria/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open game menu' })).toBeVisible();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  return {
    store,
    actionRequests: () => actionRequests,
    drop: () => {
      loseResponse = true;
    },
    failNextAction: () => {
      rejectAction = true;
    },
    advance: async () => {
      now += 1_000_000;
      await navigate(page, 'profile');
      await page.getByRole('button', { name: 'Refresh authoritative state' }).click();
      await expect(page.getByRole('status')).toHaveText('State synchronized.');
      await navigate(page, 'travel');
    },
  };
}
async function reachDolivine(page: Page, store: MemoryStore) {
  store.states.get('test')!.location = 'Lyria';
  await navigate(page, 'profile');
  await page.getByRole('button', { name: 'Refresh authoritative state' }).click();
  await navigate(page, 'game');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(3800);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  await expect(page.getByText('E · Dolivine seam')).toBeVisible();
}
test('mine → refine → collect → sell persists across refresh with accurate quantities', async ({ page }) => {
  const { store, advance } = await fixture(page);
  await navigate(page, 'travel');
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Travel ship', exact: true }).selectOption('Prospector');
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('Halo');
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'mining');
  await page.getByRole('button', { name: 'Prospector', exact: false }).click();
  await page.getByRole('button', { name: 'Scan and mine Prospector' }).click();
  await advance();
  await page.getByRole('button', { name: 'Collect mined ore' }).click();
  await expect.poll(() => store.states.get('test')!.pending).toBeNull();
  const inventory = store.states.get('test')!.mining.Prospector;
  const ore = Object.keys(inventory)[0] as Ore;
  expect(inventory[ore]).toBeGreaterThan(0);
  await navigate(page, 'travel');
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('ARC-L1');
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'refinery');
  await page.getByRole('combobox', { name: 'Mining hold', exact: true }).selectOption('Prospector');
  await page.getByRole('combobox', { name: 'Ore', exact: true }).selectOption(ore);
  await page.getByLabel('Amount (SCU)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Create work order' }).click();
  await expect.poll(() => store.states.get('test')!.orders.length).toBe(1);
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await page.reload();
  await navigate(page, 'refinery');
  await expect(page.getByText('Dinyx Solventation', { exact: true }).last()).toBeVisible();
  await advance();
  await navigate(page, 'refinery');
  await page.getByRole('combobox', { name: 'Cargo ship', exact: true }).selectOption('Nomad');
  await page.getByRole('button', { name: 'Collect into Nomad' }).click();
  await expect.poll(() => store.states.get('test')!.orders.length).toBe(0);
  const units = store.states.get('test')!.cargo.Nomad!.refined[ore]!;
  const balance = store.states.get('test')!.wallet;
  await navigate(page, 'travel');
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Travel ship', exact: true }).selectOption('Nomad');
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('Area-18');
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'market');
  await page.getByRole('combobox', { name: 'Ore', exact: true }).selectOption(ore);
  await page.getByRole('combobox', { name: 'Material', exact: true }).selectOption('refined');
  await page.getByLabel('Amount (SCU)', { exact: true }).fill(String(units / 100));
  await page.getByRole('button', { name: 'Sell material' }).click();
  await expect.poll(() => store.states.get('test')!.wallet).toBeGreaterThan(balance);
  expect(store.states.get('test')!.cargo.Nomad!.refined[ore]).toBe(0);
  const soldBalance = store.states.get('test')!.wallet;
  await page.reload();
  await expect(page.getByText(soldBalance.toLocaleString('en-US') + ' aUEC', { exact: true })).toBeVisible();
});

test('RPG movement is local, controls survive Strict Mode remount, and focus pauses movement', async ({
  page,
}) => {
  const { actionRequests } = await fixture(page);
  const canvas = page.getByRole('img', { name: /Pixel-art map of Lyria/ });
  const pixels = () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const before = await pixels();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  expect(await pixels()).not.toBe(before);
  expect(actionRequests()).toBe(0);
  await navigate(page, 'cargo');
  await navigate(page, 'game');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(50);
  const paused = await pixels();
  await page.waitForTimeout(150);
  expect((await pixels()) === paused).toBe(true);
  await page.keyboard.up('ArrowRight');
  expect(actionRequests()).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(50);
  const hidden = await pixels();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(130);
  expect((await pixels()) === hidden).toBe(true);
  await page.keyboard.up('ArrowRight');
});

test('RPG touch controls and responsive panel/mobile/preview layouts remain usable', async ({ page }) => {
  await fixture(page);
  const canvas = page.getByRole('img', { name: /Pixel-art map of Lyria/ });
  await expect(page.getByLabel('Area introduction')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 5000 });
  const before = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const right = page.getByRole('button', { name: 'Move right' });
  await right.hover();
  await page.mouse.down();
  await page.waitForTimeout(220);
  await page.mouse.up();
  expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(before);
  expect(await right.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
  for (const [width, height, file] of [
    [318, 500, 'm1-1-panel-game.png'],
    [360, 640, 'm1-1-mobile-game.png'],
    [1024, 768, 'm1-1-preview-game.png'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('button', { name: 'Interact' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (width === 318) expect((box!.width * box!.height) / (width * height)).toBeGreaterThanOrEqual(0.85);
    expect(await canvas.evaluate((element) => getComputedStyle(element).imageRendering)).toBe('pixelated');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/${file}` });
    await page.screenshot({ path: `test-results/${file.replace('.png', '-full.png')}`, fullPage: true });
  }
});

test('HUD and game menus replace permanent navigation, pause movement, and close with Escape', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 318, height: 500 });
  await expect(page.getByLabel('Wallet')).toContainText('10,000 aUEC');
  await expect(page.getByLabel('Cargo capacity')).toContainText('Cargo');
  await expect(page.getByRole('navigation', { name: 'Mining operations' })).toHaveCount(0);
  await expect(page.getByLabel('Area introduction')).toHaveCount(0, { timeout: 5000 });
  const canvas = page.locator('canvas');
  const snapshot = () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await expect(page.getByRole('dialog', { name: 'menu menu' })).toBeVisible();
  const before = await snapshot();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(160);
  await page.keyboard.up('ArrowRight');
  expect(await snapshot()).toBe(before);
  await navigate(page, 'cargo');
  await expect(page.getByRole('heading', { name: 'Cargo inventory' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move right' })).toHaveCount(0);
  await page.mouse.click(35, 470);
  await expect(page.getByRole('heading', { name: 'Cargo inventory' })).toBeVisible();
  await page.screenshot({ path: 'test-results/m1-1-inventory-overlay.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const resumed = await snapshot();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowRight');
  expect(await snapshot()).not.toBe(resumed);
  await page.keyboard.press('i');
  await expect(page.getByRole('heading', { name: 'Cargo inventory' })).toBeVisible();
  await navigate(page, 'profile');
  await page.getByRole('button', { name: 'Refresh authoritative state' }).click();
  await expect(page.getByRole('status')).toHaveText('State synchronized.');
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 5000 });
});

test('short title scene introduces Lyria and then clears the world view', async ({ page }) => {
  await fixture(page);
  await page.reload();
  await expect(page.getByLabel('DIME title scene')).toBeVisible();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  await expect(page.getByLabel('Area introduction')).toBeVisible();
  await expect(page.getByLabel('Area introduction')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByRole('img', { name: /Pixel-art map of Lyria/ })).toBeVisible();
});

test('refinery, market, and travel terminals open distinct paused overlays', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 318, height: 500 });
  const hold = async (key: string, ms: number) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  await hold('ArrowUp', 1750);
  await hold('ArrowLeft', 550);
  await expect(page.getByText('E · Refinery terminal')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: 'Refinery & work orders' })).toBeVisible();
  await page.screenshot({ path: 'test-results/m1-1-refinery-overlay.png' });
  await page.keyboard.press('Escape');
  await hold('ArrowRight', 1300);
  await expect(page.getByText('E · Market terminal')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: 'Market & supply shop' })).toBeVisible();
  await page.screenshot({ path: 'test-results/m1-1-market-overlay.png' });
  await page.keyboard.press('Escape');
  await hold('ArrowLeft', 550);
  await hold('ArrowDown', 3200);
  await hold('ArrowLeft', 850);
  await expect(page.getByText('E · Ship / travel terminal')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'travel menu' })).toBeVisible();
  await page.screenshot({ path: 'test-results/m1-1-travel-overlay.png' });
});

test('one nearby mineral interaction starts one server action and never awards ore in the browser', async ({
  page,
}) => {
  const { store, actionRequests } = await fixture(page);
  await reachDolivine(page, store);
  const before = structuredClone(store.states.get('test')!.mining.Hand);
  await page.keyboard.press('e');
  await page.keyboard.press('e');
  await expect.poll(actionRequests).toBe(1);
  await expect.poll(() => store.states.get('test')!.pending?.kind).toBe('mine');
  expect(store.states.get('test')!.mining.Hand).toEqual(before);
  await expect(page.getByRole('status')).toContainText('Mining operation saved.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('rejected mineral action leaves authoritative inventory unchanged and shows safe feedback', async ({
  page,
}) => {
  const { store, actionRequests, failNextAction } = await fixture(page);
  await reachDolivine(page, store);
  const before = structuredClone(store.states.get('test')!.mining.Hand);
  const revision = store.states.get('test')!.revision;
  failNextAction();
  await page.getByRole('button', { name: 'Interact' }).click();
  await expect.poll(actionRequests).toBe(1);
  await expect(page.getByRole('status')).toContainText('Mining request was not confirmed.');
  await expect(page.getByText('Mining request was not confirmed.', { exact: false })).toBeVisible();
  expect(store.states.get('test')!.mining.Hand).toEqual(before);
  expect(store.states.get('test')!.revision).toBe(revision);
});

test('mobile touch D-pad moves without scrolling or API writes', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const { actionRequests } = await fixture(page);
    const canvas = page.getByRole('img', { name: /Pixel-art map of Lyria/ });
    const before = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    const control = page.getByRole('button', { name: 'Move right' });
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2,
      y = box!.y + box!.height / 2;
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())) === before).toBe(
      false,
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect(actionRequests()).toBe(0);
  } finally {
    await context.close();
  }
});
test('lost mutation response survives reload and retry without duplication', async ({ page }) => {
  const { store, drop } = await fixture(page);
  await navigate(page, 'travel');
  await page.getByText('Travel / select a claim', { exact: true }).click();
  drop();
  await page.getByRole('button', { name: 'Start travel' }).click();
  await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeEnabled();
  expect(store.states.get('test')!.revision).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Retry pending action' }).click();
  await expect(page.getByRole('status')).toHaveText('Previous action confirmed. State synchronized.');
  expect(store.states.get('test')!.revision).toBe(1);
});
test('320px panel navigation stays accessible and contains no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await fixture(page);
  for (const name of ['cargo', 'refinery', 'market', 'profile', 'mining']) {
    await navigate(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.keyboard.press('Tab');
  await page.screenshot({ path: 'test-results/dime-panel.png', fullPage: true });
});

test('new zero-balance profile can earn its first wallet credit through hand mining', async ({ page }) => {
  const { store, advance } = await fixture(page, false);
  await navigate(page, 'travel');
  await navigate(page, 'travel');
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'mining');
  await page.getByRole('button', { name: 'Scan and mine Hand' }).click();
  await advance();
  await page.getByRole('button', { name: 'Collect mined ore' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'cargo');
  await page.getByRole('button', { name: 'Transfer raw cargo' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'travel');
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('Area-18');
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'market');
  await page.getByRole('button', { name: 'Sell material' }).click();
  await expect.poll(() => store.states.get('test')!.wallet).toBeGreaterThan(0);
  expect(store.states.get('test')!.cargo.Nomad!.raw.Dolivine).toBe(0);
});
test('corrupt retry storage blocks mutations with an explicit error', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('dime-pending-v2:local', 'invalid json'));
  const { store } = await fixture(page);
  await expect(page.getByRole('status')).toContainText('Transactions are disabled');
  await navigate(page, 'mining');
  await expect(page.getByRole('button', { name: 'Scan and mine Hand' })).toBeDisabled();
  expect(store.states.get('test')!.revision).toBe(0);
});
