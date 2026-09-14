import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { initialState } from '../../shared/game';
import { generatedNodes } from '../../shared/miningWorld';
import type { Action } from '../../shared/schema';
import { ZONES } from '../../shared/world';
import { walkZoneTo } from './zoneWalking';
import { beginAssignedTravel } from '../travelFixture';

test.use({ video: 'on' });
for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: owned ROC retrieval and surface mining`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    let now = 1_800_000_000_000;
    const player = `synthetic-${layout}-roc-owner`;
    const store = new MemoryStore();
    const state = initialState(() => 0.5);
    state.ships.Roc = 1;
    state.positions.Roc = 'Lyria';
    store.states.set(player, state);
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    const act = async (action: Action) => {
      const current = (await service.snapshot(player)).state;
      await service.mutate(player, { requestId: randomUUID(), expectedRevision: current.revision, action });
      await page.reload();
    };
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
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' }),
    ).toBeVisible();
    await beginAssignedTravel(service, player, 'Lyria');
    now += 1_000_000;
    await act({ type: 'finish' });
    await act({ type: 'enterZone', zone: 'LYRIA_ASOP' });
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Lyria Vehicle Bay' }),
    ).toBeVisible();
    await walkZoneTo(page, ZONES.LYRIA_ASOP, store.states.get(player)!.world!.entry, [16, 12]);
    await expect(page.getByText(/E · Owned vehicle terminal/)).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    const dialog = page.getByRole('dialog', { name: 'Owned vehicle retrieval' });
    await expect(dialog).toContainText('Owned ROC: Available');
    await page.screenshot({ path: `test-results/m3-world/${layout}-asop-owned-roc.png` });
    await dialog.getByRole('button', { name: 'Retrieve owned ROC' }).click();
    await expect.poll(() => store.states.get(player)?.world?.roc?.active).toBe(true);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Enter ROC' }).click();
    await expect.poll(() => store.states.get(player)?.world?.roc?.occupied).toBe(true);
    await expect(page.getByRole('button', { name: 'Exit ROC' })).toBeEnabled();
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 5_000 });
    await page.screenshot({ path: `test-results/m3-world/${layout}-roc-retrieval.png` });
    await act({ type: 'enterZone', zone: 'LYRIA_OUTPOST_01' });
    await act({ type: 'enterZone', zone: 'LYRIA_SURFACE_01' });
    await act({ type: 'enterZone', zone: 'LYRIA_SURFACE_02' });
    await act({ type: 'scanZone' });
    const node = generatedNodes(store.states.get(player)!.saveGeneration!, ZONES.LYRIA_SURFACE_02)[0];
    await act({ type: 'analyzeNode', nodeId: node.id });
    await act({ type: 'beginFracture', nodeId: node.id, source: 'Roc' });
    now += 20_000;
    await act({ type: 'completeFracture', nodeId: node.id });
    const pieces = store.states.get(player)!.world!.nodes[node.id].fragments;
    for (const piece of pieces) await act({ type: 'collectPiece', nodeId: node.id, pieceId: piece.id });
    await expect(page.getByRole('img', { name: 'Original pixel-art map of Lyria Haul Trail' })).toBeVisible();
    await page.screenshot({ path: `test-results/m3-world/${layout}-roc-mining.png` });
    const finished = store.states.get(player)!;
    expect(finished.mining.Roc[node.ore] ?? 0).toBe(node.yieldUnits);
    expect(finished.mining.Hand[node.ore] ?? 0).toBe(0);
  });
}
