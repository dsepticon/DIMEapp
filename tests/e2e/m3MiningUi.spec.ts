import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import type { Action } from '../../shared/schema';
import { ZONES } from '../../shared/world';
import { walkZoneTo } from './zoneWalking';
import { beginAssignedTravel } from '../travelFixture';

test.use({ video: 'on' });
for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: scan, analyze, hold laser and show overcharge`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    let now = 1_800_000_000_000;
    const store = new MemoryStore();
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    const player = `synthetic-${layout}-miner`;
    const act = async (action: Action) => {
      const state = (await service.snapshot(player)).state;
      return service.mutate(player, { requestId: randomUUID(), expectedRevision: state.revision, action });
    };
    await beginAssignedTravel(service, player, 'Lyria');
    now += 1_000_000;
    await act({ type: 'finish' });
    await act({ type: 'enterZone', zone: 'LYRIA_SURFACE_01' });
    await act({ type: 'scanZone' });
    await act({ type: 'analyzeNode', nodeId: 'LYRIA_SURFACE_01-tutorial' });
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
      if (result.statusCode >= 400) {
        const failure = JSON.parse(result.body) as { error?: { code?: string } };
        throw new Error(
          `Synthetic mining action failed: ${result.statusCode} ${failure.error?.code ?? 'UNKNOWN'}`,
        );
      }
      await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
    });
    await page.goto('/');
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Lyria Frost Flats' }),
    ).toBeVisible();
    await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, store.states.get(player)!.world!.entry, [28, 18]);
    await expect(page.getByText('E · Mineral signature')).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    const dialog = page.getByRole('dialog', { name: 'Mining analysis and laser' });
    await expect(dialog).toContainText('Dolivine');
    await page.screenshot({ path: `test-results/m3-world/${layout}-node-analysis.png` });
    await dialog.getByRole('button', { name: 'Begin fracture' }).click();
    await expect
      .poll(() => store.states.get(player)?.world?.miningSession?.nodeId)
      .toBe('LYRIA_SURFACE_01-tutorial');
    const hold = dialog.getByRole('button', { name: 'Hold laser' });
    await expect(hold).toBeVisible();
    await page.screenshot({ path: `test-results/m3-world/${layout}-laser-below-optimal.png` });
    await hold.scrollIntoViewIfNeeded();
    const box = await hold.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect
      .poll(async () => Number(/Charge (\d+)%/.exec((await dialog.textContent()) ?? '')?.[1] ?? 0), {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(45);
    await page.screenshot({ path: `test-results/m3-world/${layout}-laser-optimal.png` });
    await page.mouse.up();
    await dialog.getByRole('slider', { name: 'Laser power' }).fill('200');
    await hold.scrollIntoViewIfNeeded();
    const hotBox = await hold.boundingBox();
    expect(hotBox).not.toBeNull();
    await page.mouse.move(hotBox!.x + hotBox!.width / 2, hotBox!.y + hotBox!.height / 2);
    await page.mouse.down();
    await expect
      .poll(async () => Number(/Risk (\d+)%/.exec((await dialog.textContent()) ?? '')?.[1] ?? 0), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    await page.mouse.up();
    await page.screenshot({ path: `test-results/m3-world/${layout}-laser-overcharge.png` });
    await dialog.getByRole('slider', { name: 'Laser power' }).fill('100');
    await expect
      .poll(async () => Number(/Charge (\d+)%/.exec((await dialog.textContent()) ?? '')?.[1] ?? 100), {
        timeout: 15_000,
      })
      .toBeLessThanOrEqual(50);
    await hold.scrollIntoViewIfNeeded();
    const stableBox = await hold.boundingBox();
    expect(stableBox).not.toBeNull();
    await page.mouse.move(stableBox!.x + stableBox!.width / 2, stableBox!.y + stableBox!.height / 2);
    await page.mouse.down();
    await expect(dialog.getByRole('button', { name: 'Fracture node' })).toBeEnabled({ timeout: 15_000 });
    await page.mouse.up();
    now += 20_000;
    await dialog.getByRole('button', { name: 'Fracture node' }).click();
    await expect
      .poll(() => store.states.get(player)?.world?.nodes['LYRIA_SURFACE_01-tutorial']?.status)
      .toBe('FRACTURED');
    await expect(dialog).toHaveCount(0);
    await page.screenshot({ path: `test-results/m3-world/${layout}-fractured-ground-pieces.png` });
    const collected = () =>
      store.states
        .get(player)
        ?.world?.nodes['LYRIA_SURFACE_01-tutorial']?.fragments.filter((piece) => piece.collected).length ?? 0;
    await expect(page.getByText(/E · Dolivine fragment/)).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    await expect.poll(collected).toBe(1);
    for (const count of [2, 3]) {
      const state = store.states.get(player)!;
      const piece = state.world!.nodes['LYRIA_SURFACE_01-tutorial'].fragments.find(
        (fragment) => !fragment.collected,
      )!;
      await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, state.world!.entry, [piece.x, piece.y]);
      await expect(page.getByText(/E · Dolivine fragment/)).toBeVisible();
      await page.getByRole('button', { name: 'Interact' }).click();
      await expect.poll(collected).toBe(count);
      if (count === 2)
        await page.screenshot({ path: `test-results/m3-world/${layout}-partial-ground-collection.png` });
    }
    expect(store.states.get(player)?.mining.Hand.Dolivine).toBe(400);
    await page.screenshot({ path: `test-results/m3-world/${layout}-ground-collection-complete.png` });
  });
}
