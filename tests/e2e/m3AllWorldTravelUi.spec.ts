import { expect, test } from '@playwright/test';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import type { Location } from '../../shared/schema';
import { DEPARTURE_POINTS, ZONES, zoneWalkable, type ZoneId } from '../../shared/world';
import { walkZoneTo } from './zoneWalking';

test.use({ video: { mode: 'on', size: { width: 360, height: 640 } } });

test('one player physically travels ARC-L1 → Lyria → Wala → Area18 → ARC-L1', async ({ page }) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 318, height: 500 });
  let now = 1_800_000_000_000;
  const player = 'synthetic-physical-four-location-tour';
  const store = new MemoryStore();
  const service = new GameService(
    store,
    () => now,
    () => 0.5,
  );
  const api = createApi(service, async () => player, ['http://127.0.0.1:5173']);
  await page.route('https://extension-files.twitch.tv/**', (route) => route.abort());
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    const request = route.request();
    const response = await api({
      method: request.method(),
      path: new URL(request.url()).pathname,
      headers: request.headers(),
      body: request.postData() ?? undefined,
    });
    await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
  });
  await page.goto('/');
  const state = () => store.states.get(player)!;
  const interactionTile = (zoneId: ZoneId, x: number, y: number): readonly [number, number] => {
    const zone = ZONES[zoneId];
    const options = [
      [x, y],
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const;
    const tile = options.find(([candidateX, candidateY]) => zoneWalkable(zone, candidateX, candidateY));
    if (!tile) throw new Error(`No safe interaction tile for ${zoneId}.`);
    return tile;
  };
  const cross = async (to: ZoneId) => {
    const zone = ZONES[state().world!.zone];
    const exit = zone.exits.find((candidate) => candidate.to === to);
    expect(exit, `${zone.id} must connect to ${to}`).toBeDefined();
    await walkZoneTo(page, zone, state().world!.entry, [exit!.x, exit!.y]);
    await page.getByRole('button', { name: 'Interact' }).click();
    await expect.poll(() => state().world?.zone).toBe(to);
    await expect(
      page.getByRole('img', { name: `Original pixel-art map of ${ZONES[to].label}` }),
    ).toBeVisible();
  };
  const depart = async (destination: Location) => {
    const origin = state().location;
    const departure = DEPARTURE_POINTS[origin];
    expect(state().world?.zone).toBe(departure.service);
    const serviceObject = ZONES[departure.service].objects.find((object) => object.kind === 'travel');
    expect(serviceObject).toBeDefined();
    await walkZoneTo(
      page,
      ZONES[departure.service],
      state().world!.entry,
      interactionTile(departure.service, serviceObject!.x, serviceObject!.y),
    );
    await page.getByRole('button', { name: 'Interact' }).click();
    const map = page.getByRole('group', { name: 'Location map' });
    await map.getByRole('button', { name: new RegExp(`^${destination}$`) }).click();
    await page.getByRole('button', { name: 'Request ship assignment' }).click();
    await page.getByRole('button', { name: 'Confirm assignment' }).click();
    await expect.poll(() => state().world?.departure?.destination).toBe(destination);
    await page.getByRole('button', { name: 'Close menu' }).click();
    await cross(departure.point);
    const pointObject = ZONES[departure.point].objects.find((object) => object.kind === 'travel');
    expect(pointObject).toBeDefined();
    await walkZoneTo(
      page,
      ZONES[departure.point],
      state().world!.entry,
      interactionTile(departure.point, pointObject!.x, pointObject!.y),
    );
    await page.getByRole('button', { name: 'Interact' }).click();
    await page.getByRole('button', { name: 'Depart in assigned ship' }).click();
    await expect.poll(() => state().pending?.kind).toBe('travel');
    now += 1_000_000;
    await page.getByRole('button', { name: 'Complete arrival' }).click();
    await expect.poll(() => state().location).toBe(destination);
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(
      page.getByRole('img', { name: `Original pixel-art map of ${ZONES[state().world!.zone].label}` }),
    ).toBeVisible();
  };

  await expect(page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' })).toBeVisible();
  await cross('ARC_L1_CONCOURSE');
  await cross('ARC_L1_TRANSIT');
  await cross('ARC_L1_DEPARTURE');
  await depart('Lyria');
  expect(state().world?.zone).toBe('LYRIA_OUTPOST_01');
  await depart('Wala');
  expect(state().world?.zone).toBe('WALA_OUTPOST_01');
  await depart('Area-18');
  expect(state().world?.zone).toBe('AREA18_SPACEPORT');
  await depart('ARC-L1');
  expect(state().world?.zone).toBe('ARC_L1_START');
  expect(state().location).toBe('ARC-L1');
  await page.screenshot({ path: 'test-results/m3-world/panel-physical-four-location-return.png' });
});
