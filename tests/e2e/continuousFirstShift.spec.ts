import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { MemoryStore } from '../../server/store';
import { GameService } from '../../server/service';
import { createApi } from '../../server/http';
import { FIRST_SHIFT_REWARD, TUTORIAL_SALE_AUEC } from '../../shared/firstShift';
import type { Action } from '../../shared/schema';
import { formatCscuMinor } from '../../shared/mineralUnits';
import { ZONES } from '../../shared/world';
import { walkZoneTo } from './zoneWalking';

test.use({ video: 'on' });

for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`continuous physical First Shift accounting and screenshots: ${layout}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    const player = 'synthetic-persistent-twitch-identity';
    let now = 1_800_000_000_000;
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
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' }),
    ).toBeVisible();
    const current = () => store.states.get(player)!;
    const requests: object[] = [];
    const manifest: object[] = [];
    const act = async (action: Action) => {
      const input = { requestId: randomUUID(), expectedRevision: current().revision, action };
      const result = await service.mutate(player, input);
      requests.push(input);
      expect(result.state.revision).toBe(input.expectedRevision + 1);
      await page.reload();
      return result.state;
    };
    const capture = async (step: string) => {
      const state = current();
      const filename = `test-results/m3-first-shift-${layout}-${step}.png`;
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
      await page.screenshot({ path: filename });
      manifest.push({
        scenarioStep: step,
        expectedObjective: state.firstShift?.objective ?? 'SPEAK_TO_FOREMAN',
        expectedWallet: state.wallet,
        expectedRawCscu: formatCscuMinor(state.mining.Hand.Dolivine ?? 0),
        expectedRefinedCscu: formatCscuMinor(state.cargo.Nomad?.refined.Dolivine ?? 0),
        expectedCounters: state.firstShift?.counters ?? { mined: 0, refined: 0, sold: 0 },
        screenshotFilename: filename,
      });
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    };
    expect(current().location).toBe('ARC-L1');
    expect(current().world?.zone).toBe('ARC_L1_START');
    await capture('arc-l1-opening');
    await act({ type: 'enterZone', zone: 'ARC_L1_CONCOURSE' });
    await act({ type: 'enterZone', zone: 'ARC_L1_TRANSIT' });
    await act({ type: 'enterZone', zone: 'ARC_L1_DEPARTURE' });
    await capture('departure');
    await act({ type: 'assignDeparture', ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    await capture('assigned-departure');
    await act({ type: 'enterZone', zone: 'ARC_L1_HANGAR' });
    await capture('assigned-hangar');
    await act({ type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    now += 1_000_000;
    await act({ type: 'finish' });
    expect(current().location).toBe('Lyria');
    expect(current().world?.zone).toBe('LYRIA_OUTPOST_01');
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Lyria Mining Outpost' }),
    ).toBeVisible();
    await capture('lyria-arrival');
    await act({ type: 'firstShift', step: 'accept' });
    await capture('mara-assignment');
    await act({ type: 'firstShift', step: 'checkTool' });
    expect(current().equipment['Hand mining tool']).toBe(1);
    await act({ type: 'enterZone', zone: 'LYRIA_SURFACE_01' });
    await act({ type: 'scanZone' });
    await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, current().world!.entry, [25, 18]);
    const signal = page.getByText(/signal ·/);
    await expect(signal).toBeVisible();
    await expect(signal).not.toContainText('Dolivine');
    await capture('scanner');
    const nodeId = 'LYRIA_SURFACE_01-tutorial';
    await act({ type: 'analyzeNode', nodeId });
    await capture('analysis');
    await act({ type: 'beginFracture', nodeId, source: 'Hand' });
    now += 20_000;
    await act({ type: 'completeFracture', nodeId });
    const pieces = current().world!.nodes[nodeId].fragments;
    expect(pieces.map((piece) => piece.units)).toEqual([125, 125, 150]);
    expect(new Set(pieces.map((piece) => `${piece.x},${piece.y}`)).size).toBe(3);
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Lyria Frost Flats' }),
    ).toBeVisible();
    await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, current().world!.entry, [25, 18]);
    const visiblePieces = await page.evaluate((parts) => {
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      const playerTile = document
        .querySelector('[aria-label="Lyria Frost Flats game"]')
        ?.getAttribute('data-player-tile')
        ?.split(',')
        .map(Number) ?? [24, 17];
      const cameraX = Math.max(
        0,
        Math.min(48 * 16 - canvas.width, Math.round((playerTile[0] + 0.5) * 16 - canvas.width / 2)),
      );
      const cameraY = Math.max(
        0,
        Math.min(34 * 16 - canvas.height, Math.round((playerTile[1] + 0.5) * 16 - canvas.height / 2)),
      );
      const overlays = [
        document.querySelector('[aria-label="Toggle objective tracker"]')?.parentElement,
        document.querySelector('[aria-label="Game controls"]'),
        document.querySelector('[aria-label="Open game menu"]')?.parentElement,
        document.querySelector('[aria-label="Open local map"]'),
        document.querySelector('[aria-label="Scanner signal"]'),
        [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Scan'),
      ]
        .filter((element) => !!element)
        .map((element) => element!.getBoundingClientRect());
      return parts.map((part) => {
        const x = rect.left + ((part.x * 16 - cameraX + 8) * rect.width) / canvas.width;
        const y = rect.top + ((part.y * 16 - cameraY + 8) * rect.height) / canvas.height;
        return (
          x >= rect.left &&
          x < rect.right &&
          y >= rect.top &&
          y < rect.bottom &&
          overlays.every((box) => x < box.left || x > box.right || y < box.top || y > box.bottom)
        );
      });
    }, pieces);
    expect(visiblePieces).toEqual([true, true, true]);
    await capture('three-ground-pieces');
    for (const [index, piece] of pieces.entries()) {
      await act({ type: 'collectPiece', nodeId, pieceId: piece.id });
      if (index < 2) {
        expect(current().firstShift?.objective).toBe('COLLECT_ASSIGNED_GEMS');
        await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, current().world!.entry, [25, 18]);
        await capture(`partial-${index + 1}`);
      }
    }
    expect(current().firstShift?.objective).toBe('RETURN_TO_OUTPOST');
    expect(current().mining.Hand.Dolivine).toBe(400);
    await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, current().world!.entry, [25, 18]);
    await capture('collection-complete');
    await act({ type: 'enterZone', zone: 'LYRIA_OUTPOST_01' });
    await act({ type: 'firstShift', step: 'sell' });
    expect(current().wallet).toBe(TUTORIAL_SALE_AUEC);
    expect(current().mining.Hand.Dolivine).toBe(0);
    await capture('raw-sale');
    await act({ type: 'firstShift', step: 'complete' });
    expect(current().wallet).toBe(TUTORIAL_SALE_AUEC + FIRST_SHIFT_REWARD);
    expect(current().wallet).toBe(5_700);
    expect(current().firstShift?.counters).toEqual({ mined: 4, refined: 0, sold: 4 });
    await capture('reward');
    await page.reload();
    expect(current().wallet).toBe(5_700);
    await capture('refresh');
    const final = structuredClone(current());
    for (const input of requests) {
      const replay = await service.mutate(player, input);
      expect(replay.replayed).toBe(true);
      expect(replay.state).toEqual(final);
    }
    expect(current()).toEqual(final);
    await writeFile(
      `test-results/m3-first-shift-${layout}-manifest.json`,
      JSON.stringify(
        {
          player: 'synthetic',
          rawMinedMinor: 400,
          rawSoldMinor: 400,
          saleRevenue: 5_200,
          questReward: 500,
          finalWallet: 5_700,
          screenshots: manifest,
        },
        null,
        2,
      ),
    );
  });
}
