import { test, expect } from '@playwright/test';
import { setup, openOperations, resumeGame } from './m4Harness';
import { originalInitialState } from '../../shared/originalGame';
import type { OriginalPlayerState } from '../../shared/originalSchema';
for (const layout of [
  { name: 'Panel', width: 318, height: 500, file: 'panel.html' },
  { name: 'Mobile', width: 360, height: 640, file: 'mobile.html' },
  { name: 'Twitch-Preview', width: 960, height: 720, file: 'panel.html' },
  { name: 'Desktop', width: 1280, height: 900, file: 'index.html' },
]) {
  test(`${layout.name}: explicit cargo, processing collection and market selections`, async ({ page }) => {
    await page.setViewportSize(layout);
    if (layout.name === 'Mobile') await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    const f = await setup(page);
    const state = originalInitialState('00000000-0000-4000-8000-000000000044', () => 0.5);
    state.world.zone = 'zone.z005';
    state.wallet = 5000;
    state.ships['fleet.v003'] = 1;
    state.positions['fleet.v003'] = state.location;
    state.mining['extract.x001'] = { 'mat.m001': 125, 'mat.m002': 250 };
    state.mining['extract.x003']['mat.m010'] = 400;
    f.store.states.set('synthetic-walking', state);
    const current = () => f.store.states.get('synthetic-walking') as OriginalPlayerState;
    await page.goto('/' + layout.file);
    await openOperations(page);
    const services = page.getByRole('region', { name: 'Industrial services' });
    await services.scrollIntoViewIfNeeded();
    await page
      .getByRole('combobox', { name: 'Extraction material', exact: true })
      .selectOption('extract.x001:mat.m002');
    await page.getByLabel('Quantity (cSCU)', { exact: true }).fill('1.25');
    await page.getByRole('button', { name: 'Transfer exact units to cargo', exact: true }).click();
    await expect.poll(() => current().cargo['fleet.v001']?.raw['mat.m002']).toBe(125);
    expect(current().mining['extract.x001']['mat.m001']).toBe(125);
    await openOperations(page);
    await page.getByLabel('Quantity (cSCU)', { exact: true }).fill('1.251');
    await expect(
      page.getByRole('button', { name: 'Transfer exact units to cargo', exact: true }),
    ).toBeDisabled();
    await page.getByLabel('Quantity (cSCU)', { exact: true }).fill('999999');
    await expect(page.getByText('Quantity exceeds the selected hold.', { exact: true })).toBeVisible();
    await page.getByLabel('Quantity (cSCU)', { exact: true }).fill('1');
    await services.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/dime-m44-services-review/screenshots/${layout.name}-cargo.png` });
    // Synthetic fixture changes location only to isolate the service contract; physical journeys run separately.
    const refinery = structuredClone(current());
    refinery.world.zone = 'zone.z004';
    refinery.orders = [
      {
        id: 'synthetic-ready-order',
        source: 'extract.x003',
        ore: 'mat.m010',
        method: 'process.p001',
        rawUnits: 100,
        refinedUnits: 80,
        cost: 100,
        createdAt: 1,
        readyAt: 2,
      },
    ];
    f.store.states.set('synthetic-walking', refinery);
    await page.reload();
    await openOperations(page);
    await page
      .getByRole('button', { name: 'Collect processing order', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/dime-m44-services-review/screenshots/${layout.name}-processing.png`,
    });
    await page.getByRole('button', { name: 'Collect processing order', exact: true }).click();
    await expect.poll(() => current().orders.length).toBe(0);
    expect(current().cargo['fleet.v001']?.refined['mat.m010.processed']).toBe(80);
    await page.reload();
    await openOperations(page);
    await expect(page.getByRole('button', { name: 'Collect processing order', exact: true })).toHaveCount(0);
    const market = structuredClone(current());
    market.world.zone = 'zone.z006';
    f.store.states.set('synthetic-walking', market);
    await page.reload();
    await openOperations(page);
    await page
      .getByRole('combobox', { name: 'Cargo to sell', exact: true })
      .selectOption('fleet.v001:refined:mat.m010');
    await page.getByRole('button', { name: 'Use available cargo quantity', exact: true }).click();
    await services.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/dime-m44-services-review/screenshots/${layout.name}-market.png` });
    await page.getByRole('button', { name: 'Sell selected cargo at server quote', exact: true }).click();
    await expect.poll(() => current().cargo['fleet.v001']?.refined['mat.m010.processed']).toBe(0);
    expect(current().cargo['fleet.v001']?.raw['mat.m002']).toBe(125);
    await openOperations(page);
    await expect(
      page.getByRole('button', { name: 'Sell selected cargo at server quote', exact: true }),
    ).toBeDisabled();
    await resumeGame(page);
    const writes = f.posts.length;
    await page.keyboard.down('d');
    await page.waitForTimeout(250);
    await page.keyboard.up('d');
    expect(f.posts.length).toBe(writes);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    expect(f.errors).toEqual([]);
  });
}

test('processing partial collection, second ship and original-request recovery', async ({ page }) => {
  const f = await setup(page);
  const state = originalInitialState('00000000-0000-4000-8000-000000000044', () => 0.5);
  state.world.zone = 'zone.z004';
  state.cargo['fleet.v001']!.raw['mat.m001'] = 239990;
  state.ships['fleet.v005'] = 1;
  state.positions['fleet.v005'] = state.location;
  state.orders = [
    {
      id: 'synthetic-partial-order',
      source: 'extract.x003',
      ore: 'mat.m010',
      method: 'process.p001',
      rawUnits: 100,
      refinedUnits: 80,
      cost: 100,
      createdAt: 1,
      readyAt: 2,
    },
  ];
  f.store.states.set('synthetic-walking', state);
  const current = () => f.store.states.get('synthetic-walking') as OriginalPlayerState;
  await page.goto('/panel.html');
  await openOperations(page);
  await expect(page.getByText('0.1 cSCU fits aboard Lark Skiff.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collect processing order', exact: true }).click();
  await expect.poll(() => current().orders[0]?.refinedUnits).toBe(70);
  await openOperations(page);
  await expect(page.getByRole('button', { name: 'Collect processing order', exact: true })).toBeDisabled();
  await expect(page.getByText('Cargo hold is full.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Receiving cargo ship', exact: true }).selectOption('fleet.v005');
  f.faults.dropOnceAfterCommit = true;
  await page.getByRole('button', { name: 'Collect processing order', exact: true }).click();
  await expect.poll(() => current().orders.length).toBe(0);
  await expect(page.getByRole('button', { name: 'Pending · Retry', exact: true })).toBeVisible();
  const receiptCount = f.store.receipts.size;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pending · Retry', exact: true })).toHaveCount(0);
  expect(current().cargo['fleet.v005']!.refined['mat.m010.processed']).toBe(70);
  expect(current().cargo['fleet.v001']!.refined['mat.m010.processed']).toBe(10);
  expect(f.store.receipts.size).toBe(receiptCount);
  expect(f.errors).toEqual(['/staging/v4/actions', 'Failed to load resource: net::ERR_FAILED']);
});

test('processing countdown and rejection reconcile without blocking the next service action', async ({
  page,
}) => {
  const f = await setup(page);
  const state = originalInitialState('00000000-0000-4000-8000-000000000044', () => 0.5);
  state.world.zone = 'zone.z004';
  state.orders = [
    {
      id: 'synthetic-delayed-order',
      source: 'extract.x003',
      ore: 'mat.m010',
      method: 'process.p001',
      rawUnits: 100,
      refinedUnits: 80,
      cost: 100,
      createdAt: Date.now(),
      readyAt: Date.now() + 4000,
    },
  ];
  f.store.states.set('synthetic-walking', state);
  await page.goto('/mobile.html');
  await openOperations(page);
  const collect = page.getByRole('button', { name: 'Collect processing order', exact: true });
  await expect(collect).toBeDisabled();
  await expect(collect).toBeEnabled({ timeout: 6000 });
  state.orders[0]!.readyAt = Date.now() + 60000;
  await collect.click();
  await expect(page.getByRole('button', { name: 'Pending · Retry', exact: true })).toHaveCount(0);
  await openOperations(page);
  await expect(collect).toBeDisabled();
  expect(f.store.receipts.size).toBe(0);
  expect(state.orders[0]!.refinedUnits).toBe(80);
});
