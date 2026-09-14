import { expect, test, type Page } from '@playwright/test';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { ZONES, zoneArrival, type ZoneId } from '../../shared/world';
import { playerClearOfHud, waitForWorldPaint, walkZoneTo } from './zoneWalking';

test.use({ video: { mode: 'on', size: { width: 360, height: 640 } } });
for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: physically assign and board an owned ship at ARC-L1`, async ({ page }: { page: Page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height });
    let now = 1_800_000_000_000;
    const player = `synthetic-physical-departure-${layout}`;
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
      const result = await api({
        method: request.method(),
        path: new URL(request.url()).pathname,
        headers: request.headers(),
        body: request.postData() ?? undefined,
      });
      await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
    });
    await page.goto('/');
    const current = () => store.states.get(player)!;
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' }),
    ).toBeVisible();
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-arc-arrival.png` });
    const openingZone = current().world!.zone;
    await page.getByRole('button', { name: 'Open local map' }).click();
    const navigation = page.getByRole('dialog', { name: 'Local navigation map' });
    await expect(navigation.getByText('ARC-L1 · ARC-L1 Habitation')).toBeVisible();
    await expect(navigation.getByText('ARC-L1 Main Concourse')).toBeVisible();
    await expect(navigation.getByLabel('Player position')).toContainText('Facing');
    await page.screenshot({ path: `test-results/m3-world/${layout}-local-navigation.png` });
    expect(current().world!.zone).toBe(openingZone);
    await navigation.getByRole('button', { name: 'Close local map' }).click();
    await page.getByRole('button', { name: 'Open game menu' }).click();
    await page.getByRole('navigation', { name: 'Game menu' }).getByRole('button', { name: 'Travel' }).click();
    await expect(page.getByRole('button', { name: 'Request ship assignment' })).toBeDisabled();
    await page.screenshot({ path: `test-results/m3-world/${layout}-remote-departure-rejected.png` });
    await page.getByRole('button', { name: 'Close menu' }).click();
    const cross = async (to: ZoneId, from?: readonly [number, number]) => {
      const state = current();
      const zone = ZONES[state.world!.zone];
      const exit = zone.exits.find((candidate) => candidate.to === to);
      expect(exit, `Missing ${zone.id} → ${to}`).toBeDefined();
      await walkZoneTo(page, zone, state.world!.entry, [exit!.x, exit!.y], from);
      await expect(page.getByText(`E · Route to ${ZONES[to].label}`)).toBeVisible();
      await page.getByRole('button', { name: 'Interact' }).click();
      await expect.poll(() => current().world?.zone).toBe(to);
      await expect(
        page.getByRole('img', { name: `Original pixel-art map of ${ZONES[to].label}` }),
      ).toBeVisible();
      await waitForWorldPaint(page);
      await expect.poll(() => playerClearOfHud(page, ZONES[to])).toBe(true);
    };
    await cross('ARC_L1_CONCOURSE');
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-arc-concourse.png` });
    await cross('ARC_L1_TRANSIT');
    await cross('ARC_L1_DEPARTURE');
    await walkZoneTo(page, ZONES.ARC_L1_DEPARTURE, current().world!.entry, [14, 10]);
    await expect(page.getByText(/E · Owned ship terminal/)).toBeVisible();
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-ship-service.png` });
    await page.getByRole('button', { name: 'Interact' }).click();
    await page.getByRole('button', { name: 'Request ship assignment' }).click();
    await page.getByRole('button', { name: 'Confirm assignment' }).click();
    await expect.poll(() => current().world?.departure?.destination).toBe('Lyria');
    await expect(page.getByText('Saving...', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/An action is pending confirmation/)).toHaveCount(0);
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-assigned-hangar.png` });
    await page.getByRole('button', { name: 'Close menu' }).click();
    await cross('ARC_L1_HANGAR', [14, 10]);
    await walkZoneTo(page, ZONES.ARC_L1_HANGAR, current().world!.entry, [14, 10]);
    await expect(page.getByText(/E · Assigned ship departure point/)).toBeVisible();
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-hangar.png` });
    await page.getByRole('button', { name: 'Interact' }).click();
    await page.getByRole('button', { name: 'Depart in assigned ship' }).click();
    await expect.poll(() => current().pending?.kind).toBe('travel');
    await expect(page.getByRole('button', { name: 'Complete arrival' })).toBeVisible();
    await expect(page.getByText(/An action is pending confirmation/)).toHaveCount(0);
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-departure.png` });
    now += 1_000_000;
    await page.getByRole('button', { name: 'Complete arrival' }).click();
    await expect.poll(() => current().location).toBe('Lyria');
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Lyria Mining Outpost' }),
    ).toBeVisible();
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-lyria-arrival.png` });
    expect(current().world?.zone).toBe('LYRIA_OUTPOST_01');
    await cross('LYRIA_SURFACE_01');
    await cross('LYRIA_CAVE_01');
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-lyria-cave-entry.png` });
    await cross('LYRIA_SURFACE_01');
    expect(current().world?.entry).toBe('from:LYRIA_CAVE_01');
    const caveReturn = zoneArrival(ZONES.LYRIA_SURFACE_01, current().world?.entry);
    await expect(page.getByRole('region', { name: 'Lyria Frost Flats game' })).toHaveAttribute(
      'data-player-tile',
      `${Math.floor(caveReturn.x)},${Math.floor(caveReturn.y)}`,
    );
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-lyria-matching-cave-exit.png` });
  });
}
