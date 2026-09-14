import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { generatedNodes } from '../../shared/miningWorld';
import { ZONES, zoneArrival, type ZoneId } from '../../shared/world';
import { beginAssignedTravel } from '../travelFixture';
import { playerClearOfHud, waitForWorldPaint, walkZoneTo } from './zoneWalking';

test.use({ video: { mode: 'on', size: { width: 360, height: 640 } } });
for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: Wala cave return, local scan, and second outpost remain physical`, async ({
    page,
  }: {
    page: Page;
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    let now = 1_800_000_000_000;
    const player = `synthetic-wala-explorer-${layout}`;
    const store = new MemoryStore();
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    await beginAssignedTravel(service, player, 'Wala');
    now += 1_000_000;
    const travelling = (await service.snapshot(player)).state;
    await service.mutate(player, {
      requestId: randomUUID(),
      expectedRevision: travelling.revision,
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
    const current = () => store.states.get(player)!;
    await page.goto('/');
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Wala Ridge Outpost' }),
    ).toBeVisible();
    const cross = async (to: ZoneId) => {
      const state = current();
      const zone = ZONES[state.world!.zone];
      const exit = zone.exits.find((candidate) => candidate.to === to);
      expect(exit).toBeDefined();
      await walkZoneTo(page, zone, state.world!.entry, [exit!.x, exit!.y]);
      await expect(page.getByText(`E · Route to ${ZONES[to].label}`)).toBeVisible();
      await page.getByRole('button', { name: 'Interact' }).click();
      await expect.poll(() => current().world?.zone).toBe(to);
      await expect(
        page.getByRole('img', { name: `Original pixel-art map of ${ZONES[to].label}` }),
      ).toBeVisible();
      await waitForWorldPaint(page);
      await expect.poll(() => playerClearOfHud(page, ZONES[to])).toBe(true);
    };
    await cross('WALA_SURFACE_01');
    await cross('WALA_CAVE_01');
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-wala-cave-entry.png` });
    await cross('WALA_SURFACE_01');
    expect(current().world?.entry).toBe('from:WALA_CAVE_01');
    const arrival = zoneArrival(ZONES.WALA_SURFACE_01, current().world?.entry);
    await expect(page.getByRole('region', { name: 'Wala Broken Shelf game' })).toHaveAttribute(
      'data-player-tile',
      `${Math.floor(arrival.x)},${Math.floor(arrival.y)}`,
    );
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-wala-matching-cave-exit.png` });
    await page.getByRole('button', { name: 'Scan' }).click();
    await expect.poll(() => current().world?.scanner.scannedZones?.includes('WALA_SURFACE_01')).toBe(true);
    const node = generatedNodes(
      current().saveGeneration ?? 'legacy',
      ZONES.WALA_SURFACE_01,
      current().world?.nodes ?? {},
      now,
    ).find((candidate) => candidate.status === 'INTACT');
    expect(node).toBeDefined();
    await walkZoneTo(page, ZONES.WALA_SURFACE_01, current().world!.entry, [node!.x, node!.y]);
    await expect(page.getByText('E · Mineral signature')).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    const analysis = page.getByRole('dialog', { name: 'Mining analysis and laser' });
    await expect(analysis).toContainText(node!.ore);
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-wala-node-analysis.png` });
    await analysis.getByRole('button', { name: 'Begin fracture' }).click();
    await expect.poll(() => current().world?.miningSession?.nodeId).toBe(node!.id);
    const hold = analysis.getByRole('button', { name: 'Hold laser' });
    await hold.scrollIntoViewIfNeeded();
    const box = await hold.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(analysis.getByRole('button', { name: 'Fracture node' })).toBeEnabled({ timeout: 20_000 });
    await page.mouse.up();
    now += 20_000;
    await analysis.getByRole('button', { name: 'Fracture node' }).click();
    await expect.poll(() => current().world?.nodes[node!.id]?.status).toBe('FRACTURED');
    await expect(analysis).toHaveCount(0);
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-wala-fractured-node.png` });
    const firstPiece = current().world!.nodes[node!.id].fragments[0];
    await walkZoneTo(page, ZONES.WALA_SURFACE_01, current().world!.entry, [firstPiece.x, firstPiece.y]);
    await expect(page.getByText(new RegExp(`E · ${node!.ore} fragment`))).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    await expect
      .poll(() => current().world?.nodes[node!.id]?.fragments.filter((piece) => piece.collected).length)
      .toBe(1);
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-wala-partial-collection.png` });
    await cross('WALA_SURFACE_02');
    await cross('WALA_OUTPOST_02');
    await page.screenshot({ path: `test-results/m3-world/${layout}-physical-wala-south-yard.png` });
    await page.reload();
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Wala South Processing Yard' }),
    ).toBeVisible();
    expect(current().world?.zone).toBe('WALA_OUTPOST_02');
  });
}
