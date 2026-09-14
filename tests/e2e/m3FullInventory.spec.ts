import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { CAPACITIES } from '../../shared/catalog';
import { initialState } from '../../shared/game';
import { exactMinorSum, wholeCscuToMinor } from '../../shared/mineralUnits';
import type { Action } from '../../shared/schema';
import { ZONES } from '../../shared/world';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { beginAssignedTravel } from '../travelFixture';
import { walkZoneTo } from './zoneWalking';

test.use({ video: 'on' });

for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: full Hand hold rejects a ground piece, then transfer frees space for that same piece`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    let now = 1_800_000_000_000;
    const player = `synthetic-full-inventory-${layout}`;
    const store = new MemoryStore();
    const starting = initialState(() => 0.5);
    starting.mining.Hand.Dolivine = wholeCscuToMinor(CAPACITIES.Hand);
    store.states.set(player, starting);
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    const current = () => store.states.get(player)!;
    const act = async (action: Action) => {
      const state = (await service.snapshot(player)).state;
      return service.mutate(player, { requestId: randomUUID(), expectedRevision: state.revision, action });
    };
    await beginAssignedTravel(service, player, 'Lyria');
    now += 1_000_000;
    await act({ type: 'finish' });
    await act({ type: 'enterZone', zone: 'LYRIA_SURFACE_01' });
    await act({ type: 'scanZone' });
    const nodeId = 'LYRIA_SURFACE_01-tutorial';
    await act({ type: 'analyzeNode', nodeId });
    await act({ type: 'beginFracture', nodeId, source: 'Hand' });
    now += 20_000;
    await act({ type: 'completeFracture', nodeId });
    const node = current().world!.nodes[nodeId];
    const fragment = node.fragments[1];
    expect(fragment.units).toBe(125);
    const initialQuantity = current().mining.Hand.Dolivine;
    const initialObjective = current().firstShift?.objective;
    const initialRevision = current().revision;
    expect(initialQuantity).toBe(1200);
    expect(exactMinorSum(node.fragments.map((piece) => piece.units))).toBe(node.yieldUnits);
    const api = createApi(service, async () => player, ['http://127.0.0.1:5173']);
    const collectRequests: string[] = [];
    const collectPieceIds: string[] = [];
    const collectCodes: string[] = [];
    await page.route('https://extension-files.twitch.tv/**', (route) => route.abort());
    await page.route('http://127.0.0.1:8787/**', async (route) => {
      const request = route.request();
      const body = request.postData();
      const input = body ? (JSON.parse(body) as { requestId?: string; action?: Action }) : null;
      const result = await api({
        method: request.method(),
        path: new URL(request.url()).pathname,
        headers: request.headers(),
        body: body ?? undefined,
      });
      if (input?.action?.type === 'collectPiece') {
        collectRequests.push(input.requestId ?? '');
        collectPieceIds.push(input.action.pieceId);
        if (result.statusCode >= 400) collectCodes.push((JSON.parse(result.body) as { code: string }).code);
      }
      await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
    });
    await page.goto('/');
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of Lyria Frost Flats' }),
    ).toBeVisible();
    await walkZoneTo(page, ZONES.LYRIA_SURFACE_01, current().world!.entry, [fragment.x + 1, fragment.y]);
    await expect(page.getByText('E · Dolivine fragment · 1.25 cSCU')).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    await expect.poll(() => collectCodes).toEqual(['INSUFFICIENT_CAPACITY']);
    expect(collectPieceIds[0]).toBe(fragment.id);
    const recovery = page.getByRole('dialog', { name: 'game menu' });
    await expect(recovery.getByText('Mining hold is full.', { exact: false })).toBeVisible();
    await expect(recovery.getByText('Hand hold 12/12 cSCU · Fragment 1.25 cSCU')).toBeVisible();
    expect(current().mining.Hand.Dolivine).toBe(initialQuantity);
    expect(current().revision).toBe(initialRevision);
    expect(current().firstShift?.objective).toBe(initialObjective);
    expect(current().world!.nodes[nodeId].fragments[1].collected).toBe(false);
    expect(exactMinorSum(current().world!.nodes[nodeId].fragments.map((piece) => piece.units))).toBe(400);
    const visibility = await page.evaluate((piece) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        'canvas[aria-label="Original pixel-art map of Lyria Frost Flats"]',
      )!;
      const rect = canvas.getBoundingClientRect();
      const region = document.querySelector('[aria-label="Lyria Frost Flats game"]')!;
      const [playerX, playerY] = (region.getAttribute('data-player-tile') ?? '').split(',').map(Number);
      const cameraX = Math.max(
        0,
        Math.min(48 * 16 - canvas.width, Math.round((playerX + 0.5) * 16 - canvas.width / 2)),
      );
      const cameraY = Math.max(
        0,
        Math.min(34 * 16 - canvas.height, Math.round((playerY + 0.5) * 16 - canvas.height / 2)),
      );
      const x = rect.left + ((piece.x * 16 - cameraX + 8) * rect.width) / canvas.width;
      const y = rect.top + ((piece.y * 16 - cameraY + 8) * rect.height) / canvas.height;
      const panel = document.querySelector('[aria-label="game menu"]')!.getBoundingClientRect();
      return {
        visible: x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom,
        clearOfPanel: x < panel.left || x > panel.right || y < panel.top || y > panel.bottom,
        separateFromPlayer: piece.x !== playerX || piece.y !== playerY,
      };
    }, fragment);
    expect(visibility).toEqual({ visible: true, clearOfPanel: true, separateFromPlayer: true });
    const targetPixel = async () =>
      page.evaluate((piece) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          'canvas[aria-label="Original pixel-art map of Lyria Frost Flats"]',
        )!;
        const region = document.querySelector('[aria-label="Lyria Frost Flats game"]')!;
        const [playerX, playerY] = (region.getAttribute('data-player-tile') ?? '').split(',').map(Number);
        const cameraX = Math.max(
          0,
          Math.min(48 * 16 - canvas.width, Math.round((playerX + 0.5) * 16 - canvas.width / 2)),
        );
        const cameraY = Math.max(
          0,
          Math.min(34 * 16 - canvas.height, Math.round((playerY + 0.5) * 16 - canvas.height / 2)),
        );
        return [
          ...canvas
            .getContext('2d')!
            .getImageData(piece.x * 16 - cameraX + 5, piece.y * 16 - cameraY + 7, 1, 1).data,
        ].slice(0, 3);
      }, fragment);
    expect(await targetPixel()).toEqual([103, 224, 222]);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await page.screenshot({ path: `test-results/m3-world/m3-full-inventory-${layout}.png` });
    await recovery.getByRole('button', { name: 'Retry pending action' }).click();
    await expect.poll(() => collectCodes.length).toBe(2);
    expect(collectCodes).toEqual(['INSUFFICIENT_CAPACITY', 'INSUFFICIENT_CAPACITY']);
    expect(collectRequests).toHaveLength(2);
    expect(collectRequests[1]).toBe(collectRequests[0]);
    expect(current().revision).toBe(initialRevision);
    expect(current().mining.Hand.Dolivine).toBe(initialQuantity);
    expect(current().world!.nodes[nodeId].fragments[1].collected).toBe(false);
    page.once('dialog', (dialog) => dialog.accept());
    await recovery.getByRole('button', { name: 'Cancel pending action' }).click();
    await expect(recovery).toHaveCount(0);
    await page.getByRole('button', { name: 'Open game menu' }).click();
    await page.getByRole('navigation', { name: 'Game menu' }).getByRole('button', { name: 'Cargo' }).click();
    await page.getByRole('group', { name: 'Transfer amount' }).getByRole('button', { name: 'Max' }).click();
    await expect(page.getByLabel('Transfer amount in cSCU')).toHaveValue('12');
    await page.getByRole('button', { name: 'Transfer raw cargo' }).click();
    await expect.poll(() => current().mining.Hand.Dolivine).toBe(0);
    expect(current().cargo.Nomad?.raw.Dolivine).toBe(1200);
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(page.getByText('E · Dolivine fragment · 1.25 cSCU')).toBeVisible();
    await page.getByRole('button', { name: 'Interact' }).click();
    await expect.poll(() => current().world!.nodes[nodeId].fragments[1].collected).toBe(true);
    expect(collectPieceIds).toEqual([fragment.id, fragment.id, fragment.id]);
    expect(current().mining.Hand.Dolivine).toBe(125);
    expect(current().cargo.Nomad?.raw.Dolivine).toBe(1200);
    expect(current().firstShift?.objective).toBe(initialObjective);
    expect(
      current()
        .world!.nodes[nodeId].fragments.filter((piece) => piece.collected)
        .reduce((sum, piece) => sum + piece.units, 0) +
        current()
          .world!.nodes[nodeId].fragments.filter((piece) => !piece.collected)
          .reduce((sum, piece) => sum + piece.units, 0),
    ).toBe(400);
    await expect.poll(targetPixel).not.toEqual([103, 224, 222]);
    const clearOfTouchControls = await page.evaluate(
      (pieces) => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          'canvas[aria-label="Original pixel-art map of Lyria Frost Flats"]',
        )!;
        const rect = canvas.getBoundingClientRect();
        const region = document.querySelector('[aria-label="Lyria Frost Flats game"]')!;
        const [playerX, playerY] = (region.getAttribute('data-player-tile') ?? '').split(',').map(Number);
        const cameraX = Math.max(
          0,
          Math.min(48 * 16 - canvas.width, Math.round((playerX + 0.5) * 16 - canvas.width / 2)),
        );
        const cameraY = Math.max(
          0,
          Math.min(34 * 16 - canvas.height, Math.round((playerY + 0.5) * 16 - canvas.height / 2)),
        );
        const controls = [
          ...document.querySelectorAll(
            '[aria-label="Touch movement"], [aria-label="Game controls"] button, [aria-label="Nearby interaction prompt"]',
          ),
        ].map((element) => element.getBoundingClientRect());
        return pieces.every((piece) => {
          const x = rect.left + ((piece.x * 16 - cameraX + 8) * rect.width) / canvas.width;
          const y = rect.top + ((piece.y * 16 - cameraY + 8) * rect.height) / canvas.height;
          return controls.every(
            (control) => x < control.left || x > control.right || y < control.top || y > control.bottom,
          );
        });
      },
      current().world!.nodes[nodeId].fragments.filter((piece) => !piece.collected),
    );
    expect(clearOfTouchControls).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await page.screenshot({ path: `test-results/m3-world/m3-full-inventory-recovered-${layout}.png` });
  });
}
