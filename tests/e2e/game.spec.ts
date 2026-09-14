import { expect, test, Page } from '@playwright/test';
import { MemoryStore } from '../../server/store';
import { GameService } from '../../server/service';
import { createApi } from '../../server/http';
import { initialState } from '../../shared/game';
import { Ore } from '../../shared/schema';
import { firstShiftOf } from '../../shared/firstShift';
import { randomUUID } from 'node:crypto';
import { beginAssignedTravel } from '../travelFixture';
import { zoneRoute } from '../travelFixture';
import { DEPARTURE_POINTS, ZONES } from '../../shared/world';
import { walkZoneTo } from './zoneWalking';
const navigate = async (page: Page, name: string) => {
  if (name === 'game') {
    await page.getByRole('button', { name: 'Close menu' }).click();
    return;
  }
  const closeMenu = page.getByRole('button', { name: 'Close menu' });
  if (await closeMenu.isVisible()) await closeMenu.click();
  await page.getByRole('button', { name: 'Open game menu' }).click();
  await page
    .getByRole('navigation', { name: 'Game menu' })
    .getByRole('button', {
      name: name === 'mining' ? 'Mining operations' : name[0].toUpperCase() + name.slice(1),
      exact: true,
    })
    .click();
};
const choice = (page: Page, label: string, value: string) =>
  page.getByRole('group', { name: label }).getByRole('button', { name: value, exact: true });
async function openPhysicalTravelTerminal(page: Page, state: ReturnType<typeof initialState>) {
  const zone = ZONES[state.world!.zone];
  if (zone.id === 'LYRIA_OUTPOST_01' && state.firstShift?.version !== 3) {
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(880);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(290);
    await page.keyboard.up('ArrowDown');
    await expect(page.getByText(/E · Ship \/ travel terminal/)).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Navigation console' });
    const showAll = dialogue.getByRole('button', { name: 'Show all' });
    if (await showAll.isVisible()) await showAll.click();
    await dialogue.getByRole('button', { name: 'Continue' }).click();
  } else {
    const terminal = zone.objects.find((object) => object.kind === 'travel');
    if (!terminal) throw new Error(`No ship service at ${zone.id}`);
    await walkZoneTo(page, zone, state.world!.entry, [terminal.x, terminal.y]);
    await expect(page.getByText(`E · ${terminal.label}`)).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
  }
  await expect(page.getByLabel('Travel navigation')).toBeVisible();
}
async function startTravel(
  page: Page,
  store: MemoryStore,
  service: GameService,
  destination?: string,
  ship?: string,
) {
  let current = (await service.snapshot('test')).state;
  const departure = DEPARTURE_POINTS[current.location];
  for (const zone of zoneRoute(current.world!.zone, departure.service)) {
    current = (
      await service.mutate('test', {
        requestId: randomUUID(),
        expectedRevision: current.revision,
        action: { type: 'enterZone', zone },
      })
    ).state;
  }
  await page.reload();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  await openPhysicalTravelTerminal(page, current);
  if (ship) await choice(page, 'Travel ship', ship).click();
  if (destination)
    await page
      .getByRole('group', { name: 'Location map' })
      .getByRole('button', { name: new RegExp('^' + destination + '(?: |$)') })
      .click();
  await page.getByRole('button', { name: 'Request ship assignment' }).click();
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect.poll(() => store.states.get('test')?.world?.departure).not.toBeNull();
  current = (await service.snapshot('test')).state;
  for (const zone of zoneRoute(current.world!.zone, departure.point)) {
    current = (
      await service.mutate('test', {
        requestId: randomUUID(),
        expectedRevision: current.revision,
        action: { type: 'enterZone', zone },
      })
    ).state;
  }
  await page.reload();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  await openPhysicalTravelTerminal(page, current);
  await page.getByRole('button', { name: 'Depart in assigned ship' }).click();
}
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
  // Preserve the legacy Lyria interaction tests as a compatibility route after real travel.
  state.firstShift = firstShiftOf(state);
  store.states.set('test', state);
  const service = new GameService(
    store,
    () => now,
    () => 0.1,
  );
  const api = createApi(service, async () => 'test', ['http://127.0.0.1:5173']);
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
  await expect(page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' })).toBeVisible();
  await beginAssignedTravel(service, 'test', 'Lyria');
  now += 1_000_000;
  await service.mutate('test', {
    requestId: randomUUID(),
    expectedRevision: (await service.snapshot('test')).state.revision,
    action: { type: 'finish' },
  });
  await page.reload();
  await expect(page.getByRole('img', { name: /Pixel-art map of Lyria/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open game menu' })).toBeVisible();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  return {
    store,
    service,
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
      const refreshed = page.waitForResponse(
        (response) => response.url().endsWith('/state') && response.request().method() === 'GET',
      );
      await page.getByRole('button', { name: 'Refresh authoritative state' }).click();
      expect((await refreshed).status()).toBe(200);
      await navigate(page, 'travel');
    },
  };
}
async function reachDolivine(page: Page, store: MemoryStore) {
  expect(store.states.get('test')!.location).toBe('Lyria');
  await navigate(page, 'profile');
  await page.getByRole('button', { name: 'Refresh authoritative state' }).click();
  await navigate(page, 'game');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(4750);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1600);
  await page.keyboard.up('ArrowUp');
  await expect(page.getByText('E · Dolivine seam')).toBeVisible();
}
test('mine → refine → collect → sell persists across refresh with accurate quantities', async ({ page }) => {
  test.setTimeout(90_000);
  const { store, service, advance } = await fixture(page);
  await navigate(page, 'travel');
  await startTravel(page, store, service, 'ARC-L1', 'Nomad');
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await navigate(page, 'travel');
  await startTravel(page, store, service, 'Halo', 'Prospector');
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect.poll(() => store.states.get('test')!.location).toBe('Halo');
  await expect(page.getByText(/Current location: Halo/)).toBeVisible();
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
  await startTravel(page, store, service, 'ARC-L1', 'Prospector');
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect.poll(() => store.states.get('test')!.location).toBe('ARC-L1');
  await expect(page.getByText(/Current location: ARC-L1/)).toBeVisible();
  await navigate(page, 'refinery');
  await page.getByRole('button', { name: `Select ${ore} recipe` }).click();
  await page
    .getByRole('group', { name: 'Refine amount' })
    .getByRole('button', { name: '1 SCU', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start Refining' }).click();
  await expect.poll(() => store.states.get('test')!.orders.length).toBe(1);
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('dime-pending-v2:local'))).toBeNull();
  await page.reload();
  await navigate(page, 'refinery');
  await expect(page.getByText('Dinyx Solventation', { exact: true }).last()).toBeVisible();
  await advance();
  await navigate(page, 'refinery');
  await page.getByRole('button', { name: 'Collect into Nomad' }).click();
  await expect.poll(() => store.states.get('test')!.orders.length).toBe(0);
  expect(store.states.get('test')!.cargo.Nomad!.refined[ore]).toBeGreaterThan(0);
  const balance = store.states.get('test')!.wallet;
  await navigate(page, 'travel');
  await startTravel(page, store, service, 'Area-18', 'Nomad');
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect.poll(() => store.states.get('test')!.location).toBe('Area-18');
  await expect(page.getByText(/Current location: Area-18/)).toBeVisible();
  await navigate(page, 'market');
  await choice(page, 'Trade mode', 'Sell').click();
  await choice(page, 'Material state', 'refined').click();
  await page.getByRole('button', { name: `Select ${ore} material` }).click();
  await page.getByRole('group', { name: 'Sell amount' }).getByRole('button', { name: 'Max' }).click();
  await page.getByRole('button', { name: 'Sell material' }).click();
  await expect.poll(() => store.states.get('test')!.wallet).toBeGreaterThan(balance);
  expect(store.states.get('test')!.cargo.Nomad!.refined[ore]).toBe(0);
  const soldBalance = store.states.get('test')!.wallet;
  await page.reload();
  await expect(page.getByLabel('Wallet')).toContainText(soldBalance.toLocaleString('en-US'));
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

test('Milestone 1.2 scene and game-window visual inventory at Panel, Mobile, and preview sizes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { store, actionRequests } = await fixture(page);
  const capture = async (label: string, size: 'panel' | 'mobile') => {
    await page.screenshot({ path: `test-results/m1-2-${size}-${label}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  };
  for (const [size, width, height] of [
    ['panel', 318, 500],
    ['mobile', 360, 640],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(page.getByLabel('DIME title scene')).toBeVisible();
    await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
    await expect(page.getByLabel('Area introduction')).toHaveCount(0, { timeout: 5000 });
    await capture('outpost', size);
    await reachDolivine(page, store);
    await capture('mine', size);
    await capture('interaction-prompt', size);
    await page.reload();
    await expect(page.getByLabel('DIME title scene')).toBeVisible();
    await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1050);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(360);
    await page.keyboard.up('ArrowUp');
    await expect(page.getByText('E · Shift Foreman Mara Voss')).toBeVisible();
    await page.keyboard.press('e');
    await expect(page.getByRole('dialog', { name: 'Mara Voss · Shift Foreman' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept assignment' })).toBeVisible();
    await capture('npc-dialogue', size);
    await page.keyboard.press('Escape');
    for (const name of ['cargo', 'market', 'refinery', 'travel', 'profile', 'menu'] as const) {
      if (name === 'menu') await page.getByRole('button', { name: 'Open game menu' }).click();
      else await navigate(page, name);
      await capture(name, size);
      await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await expect(page.getByLabel('DIME title scene')).toBeVisible();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  await expect(page.getByLabel('Area introduction')).toHaveCount(0, { timeout: 5000 });
  await page.screenshot({ path: 'test-results/m1-2-preview-1024x768.png' });
  expect(actionRequests()).toBe(0);
});

test('game-native windows expose selection, steppers, disabled routes and keyboard closing', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { store, service, advance } = await fixture(page);
  await navigate(page, 'cargo');
  await expect(page.getByRole('dialog', { name: 'cargo menu' }).locator('select')).toHaveCount(0);
  await choice(page, 'Cargo view', 'Ship').click();
  await expect(choice(page, 'Cargo view', 'Ship')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Select Aphorite material' }).click();
  await expect(page.getByRole('button', { name: 'Select Aphorite material' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('group', { name: 'Transfer amount' })
    .getByRole('button', { name: 'Increase Transfer amount' })
    .click();
  await expect(page.getByRole('group', { name: 'Transfer amount' }).getByRole('textbox')).toHaveValue('0');
  await expect(page.getByText('No selected raw ore in this mining hold.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await navigate(page, 'travel');
  await startTravel(page, store, service, 'ARC-L1', 'Nomad');
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await navigate(page, 'market');
  await expect(page.getByRole('dialog', { name: 'market menu' }).locator('select')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select Prospector item' }).click();
  await page.getByRole('button', { name: 'Increase item quantity' }).click();
  await expect(page.getByRole('group', { name: 'Item quantity' })).toContainText('2');
  await navigate(page, 'refinery');
  await page.getByRole('button', { name: 'Select Aluminium recipe' }).click();
  await expect(page.getByRole('button', { name: 'Select Aluminium recipe' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await navigate(page, 'travel');
  await expect(page.getByRole('button', { name: 'Frontier sector · future route' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Request ship assignment' })).toBeDisabled();
  let current = (await service.snapshot('test')).state;
  for (const zone of zoneRoute(current.world!.zone, DEPARTURE_POINTS['ARC-L1'].service)) {
    current = (
      await service.mutate('test', {
        requestId: randomUUID(),
        expectedRevision: current.revision,
        action: { type: 'enterZone', zone },
      })
    ).state;
  }
  await page.reload();
  await openPhysicalTravelTerminal(page, current);
  await page.getByRole('button', { name: 'Request ship assignment' }).click();
  await expect(page.getByText(/Assign departure to/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/Assign departure to/)).toHaveCount(0);
});

test('preserved mining operations use original survey icons and retain source selection', async ({
  page,
}) => {
  await fixture(page);
  await navigate(page, 'mining');
  const screen = page.getByRole('dialog', { name: 'mining menu' });
  await expect(screen.locator('canvas')).toHaveCount(4);
  await expect(screen.locator('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Prospector', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Scan and mine Prospector' })).toBeVisible();
  await page.getByRole('button', { name: 'Mole', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Scan and mine Mole' })).toBeVisible();
});

test('reduced-motion NPC dialogue reveals immediately and advances by keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { actionRequests } = await fixture(page);
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1050);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(360);
  await page.keyboard.up('ArrowUp');
  await expect(page.getByText('E · Shift Foreman Mara Voss')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'Mara Voss · Shift Foreman' })).toContainText('First shift?');
  await expect(page.getByRole('button', { name: 'Accept assignment' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(actionRequests()).toBe(0);
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
  await expect(page.getByRole('heading', { name: 'Backpack · Cargo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move right' })).toHaveCount(0);
  await page.mouse.click(35, 470);
  await expect(page.getByRole('heading', { name: 'Backpack · Cargo' })).toBeVisible();
  await page.screenshot({ path: 'test-results/m1-1-inventory-overlay.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const resumed = await snapshot();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowRight');
  expect(await snapshot()).not.toBe(resumed);
  await page.keyboard.press('i');
  await expect(page.getByRole('heading', { name: 'Backpack · Cargo' })).toBeVisible();
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
  await expect(page.getByRole('dialog', { name: 'Refinery console' })).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Refinery' })).toBeVisible();
  await page.screenshot({ path: 'test-results/m1-1-refinery-overlay.png' });
  await page.keyboard.press('Escape');
  await hold('ArrowRight', 1300);
  await expect(page.getByText('E · Market terminal')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'Supply counter' })).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Supply counter' })).toBeVisible();
  await page.screenshot({ path: 'test-results/m1-1-market-overlay.png' });
  await page.keyboard.press('Escape');
  await hold('ArrowLeft', 550);
  await hold('ArrowDown', 2300);
  await hold('ArrowLeft', 1050);
  await expect(page.getByText('E · Ship / travel terminal')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog', { name: 'Navigation console' })).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
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
  await expect(page.getByRole('dialog', { name: 'Dolivine mining sequence' })).toBeVisible();
  await page.keyboard.down('e');
  await page.waitForTimeout(2400);
  await page.keyboard.up('e');
  await expect.poll(actionRequests).toBe(1);
  await expect.poll(() => store.states.get('test')!.pending?.kind).toBe('mine');
  expect(store.states.get('test')!.mining.Hand).toEqual(before);
  await expect(page.getByRole('status')).toContainText(/Operation saved\.|Mining operation saved\./);
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
  await expect(page.getByRole('dialog', { name: 'Dolivine mining sequence' })).toBeVisible();
  await page.keyboard.down('e');
  await page.waitForTimeout(2400);
  await page.keyboard.up('e');
  await expect.poll(actionRequests).toBe(1);
  await expect(
    page.getByRole('status').filter({ hasText: 'Mining request was not confirmed.' }),
  ).toContainText('Mining request was not confirmed.');
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
  const before = store.states.get('test')!.revision;
  await openPhysicalTravelTerminal(page, store.states.get('test')!);
  drop();
  await page.getByRole('button', { name: 'Request ship assignment' }).click();
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeEnabled();
  expect(store.states.get('test')!.revision).toBe(before + 1);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Previous action confirmed. State synchronized.');
  await expect(page.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
  expect(store.states.get('test')!.revision).toBe(before + 1);
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
  test.setTimeout(60_000);
  const { store, service, advance } = await fixture(page, false);
  await navigate(page, 'mining');
  await page.getByRole('button', { name: 'Scan and mine Hand' }).click();
  await advance();
  await page.getByRole('button', { name: 'Collect mined ore' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'cargo');
  await page.getByRole('button', { name: 'Transfer raw cargo' }).click();
  await expect(page.getByRole('status').first()).toHaveText('Operation saved.');
  await navigate(page, 'travel');
  await startTravel(page, store, service, 'Area-18');
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'market');
  await choice(page, 'Trade mode', 'Sell').click();
  await page.getByRole('button', { name: 'Sell material' }).click();
  await expect.poll(() => store.states.get('test')!.wallet).toBeGreaterThan(0);
  expect(store.states.get('test')!.cargo.Nomad!.raw.Dolivine).toBe(0);
});
test('corrupt retry storage blocks mutations with an explicit error', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('dime-pending-v2:local', 'invalid json'));
  const { store } = await fixture(page);
  const before = store.states.get('test')!.revision;
  await expect(page.getByRole('status')).toContainText('Transactions are disabled');
  await navigate(page, 'mining');
  await expect(page.getByRole('button', { name: 'Scan and mine Hand' })).toBeDisabled();
  expect(store.states.get('test')!.revision).toBe(before);
});
