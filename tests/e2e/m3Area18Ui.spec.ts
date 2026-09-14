import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { ZONES, type ZoneId } from '../../shared/world';
import { beginAssignedTravel } from '../travelFixture';
import { playerClearOfHud, waitForWorldPaint, walkZoneTo } from './zoneWalking';

test.use({ video: { mode: 'on', size: { width: 360, height: 640 } } });

for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: Area18 transit is entered at its platforms and has a physical return route`, async ({
    page,
  }: {
    page: Page;
  }) => {
    test.setTimeout(360_000);
    await page.setViewportSize({ width, height });
    let now = 1_800_000_000_000;
    const player = `synthetic-area18-route-${layout}`;
    const store = new MemoryStore();
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    await beginAssignedTravel(service, player, 'Area-18');
    now += 1_000_000;
    const pending = (await service.snapshot(player)).state;
    await service.mutate(player, {
      requestId: randomUUID(),
      expectedRevision: pending.revision,
      action: { type: 'finish' },
    });
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
    expect(current().world?.zone).toBe('AREA18_SPACEPORT');
    const route: ZoneId[] = [
      'AREA18_SECURITY',
      'AREA18_SPACEPORT_PLATFORM',
      'AREA18_SHUTTLE',
      'AREA18_CITY_PLATFORM',
      'AREA18_TRANSIT',
      'AREA18_PLAZA',
    ];
    const cross = async (to: ZoneId, phase = 'outbound') => {
      const state = current();
      const from = ZONES[state.world!.zone];
      const exit = from.exits.find((candidate) => candidate.to === to);
      expect(exit, `${from.id} → ${to}`).toBeDefined();
      await walkZoneTo(page, from, state.world!.entry, [exit!.x, exit!.y]);
      await expect(page.getByText(`E · Route to ${ZONES[to].label}`)).toBeVisible();
      await page.getByRole('button', { name: 'Interact' }).click();
      await expect.poll(() => current().world?.zone).toBe(to);
      await expect(
        page.getByRole('img', { name: `Original pixel-art map of ${ZONES[to].label}` }),
      ).toBeVisible();
      await waitForWorldPaint(page);
      await expect.poll(() => playerClearOfHud(page, ZONES[to])).toBe(true);
      await page.screenshot({ path: `test-results/m3-world/${layout}-${phase}-${to.toLowerCase()}.png` });
    };
    for (const zone of route) await cross(zone);
    await walkZoneTo(page, ZONES.AREA18_PLAZA, current().world!.entry, [32, 21]);
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-area18-plaza-center.png` });
    await cross('AREA18_MARKET', 'market');
    await walkZoneTo(page, ZONES.AREA18_MARKET, current().world!.entry, [32, 21]);
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-area18-commodity-center.png` });
    await cross('AREA18_PLAZA', 'market-return');
    await page.reload();
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Area18 Central Plaza' }),
    ).toBeVisible();
    for (const zone of [...route.slice(0, -1)].reverse().concat('AREA18_SPACEPORT' as ZoneId))
      await cross(zone, 'return');
    expect(current().world?.zone).toBe('AREA18_SPACEPORT');
  });
}
