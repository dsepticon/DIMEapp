import type { Page } from '@playwright/test';
import { zoneArrival, zoneWalkable, type Zone } from '../../shared/world';

type Tile = readonly [number, number];
const directions = [
  [1, 0, 'ArrowRight'],
  [-1, 0, 'ArrowLeft'],
  [0, 1, 'ArrowDown'],
  [0, -1, 'ArrowUp'],
] as const;

/** Follow the actual walkable tile graph using local movement, without modifying save state. */
export async function walkZoneTo(page: Page, zone: Zone, entry: string, target: Tile, from?: Tile) {
  const arrival = zoneArrival(zone, entry);
  const marker = page.getByRole('region', { name: `${zone.label} game` });
  const visibleTile = await marker.getAttribute('data-player-tile');
  let start: Tile =
    visibleTile && /^\d+,\d+$/.test(visibleTile)
      ? (visibleTile.split(',').map(Number) as unknown as Tile)
      : (from ?? [Math.floor(arrival.x), Math.floor(arrival.y)]);
  const key = ([x, y]: Tile) => `${x},${y}`;
  for (let correction = 0; correction < 4; correction++) {
    const queue: Tile[] = [start];
    const previous = new Map<string, { tile: Tile; button: string }>();
    const seen = new Set([key(start)]);
    for (let head = 0; head < queue.length && !seen.has(key(target)); head++) {
      const tile = queue[head];
      for (const [dx, dy, button] of directions) {
        const next: Tile = [tile[0] + dx, tile[1] + dy];
        if (!zoneWalkable(zone, next[0], next[1]) || seen.has(key(next))) continue;
        seen.add(key(next));
        previous.set(key(next), { tile, button });
        queue.push(next);
      }
    }
    if (!seen.has(key(target))) throw new Error(`No walkable route to ${zone.id} tile ${key(target)}`);
    const path: string[] = [];
    for (let current = target; key(current) !== key(start); ) {
      const step = previous.get(key(current));
      if (!step) throw new Error('Broken zone route.');
      path.push(step.button);
      current = step.tile;
    }
    path.reverse();
    for (let index = 0; index < path.length; ) {
      const button = path[index];
      let count = 1;
      while (path[index + count] === button) count++;
      await page.keyboard.down(button);
      await page.waitForTimeout(Math.round((count * 1000) / 3.5));
      await page.keyboard.up(button);
      index += count;
    }
    const actual = await marker.getAttribute('data-player-tile');
    if (actual === key(target)) return;
    if (!actual || !/^\d+,\d+$/.test(actual)) throw new Error(`No player tile marker in ${zone.id}.`);
    start = actual.split(',').map(Number) as unknown as Tile;
  }
  throw new Error(`Movement did not reach ${zone.id} tile ${key(target)}.`);
}

/** Check that an authoritative arrival remains visible beside the fixed handheld HUD. */
export async function playerClearOfHud(page: Page, zone: Zone): Promise<boolean> {
  return page.evaluate(
    ({ label, width, height }) => {
      const region = document.querySelector(`[aria-label="${label} game"]`)!;
      const canvas = region.querySelector('canvas')!;
      const [x, y] = (region.getAttribute('data-player-tile') ?? '').split(',').map(Number);
      const cameraX = Math.max(0, Math.min(width * 16 - canvas.width, Math.round(x * 16 - canvas.width / 2)));
      const cameraY = Math.max(
        -100,
        Math.min(height * 16 - canvas.height + 60, Math.round(y * 16 - canvas.height / 2)),
      );
      const canvasRect = canvas.getBoundingClientRect();
      const screenX = canvasRect.left + ((x * 16 - cameraX + 8) * canvasRect.width) / canvas.width;
      const screenY = canvasRect.top + ((y * 16 - cameraY + 8) * canvasRect.height) / canvas.height;
      const player = { left: screenX - 7, right: screenX + 7, top: screenY - 16, bottom: screenY + 16 };
      const blockers = [
        region.querySelector('[aria-label="Touch movement"]'),
        ...region.querySelectorAll('[aria-label="Game controls"] button'),
        region.querySelector('[aria-label="Toggle objective tracker"]')?.parentElement,
        region.querySelector('[aria-label="Open game menu"]')?.parentElement,
        region.querySelector('[aria-label="Open local map"]'),
      ]
        .filter((element) => !!element)
        .map((element) => element!.getBoundingClientRect());
      return blockers.every(
        (blocker) =>
          player.right < blocker.left ||
          player.left > blocker.right ||
          player.bottom < blocker.top ||
          player.top > blocker.bottom,
      );
    },
    { label: zone.label, width: zone.width, height: zone.height },
  );
}

/** Wait for a painted world frame before recording transition evidence. */
export async function waitForWorldPaint(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.evaluate(
      () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
    );
    const painted = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        'canvas[aria-label^="Original pixel-art map"]',
      );
      if (!canvas) return false;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      const colours = new Set<string>();
      // Step by a value coprime to the 16-pixel tile so the sample does not
      // repeatedly hit only tile borders and miss the actual painted motifs.
      for (let pixel = 0; pixel < data.length; pixel += 52) {
        colours.add(`${data[pixel]},${data[pixel + 1]},${data[pixel + 2]}`);
        if (colours.size >= 3) return true;
      }
      return false;
    });
    if (painted) return;
  }
  throw new Error('World canvas did not paint after the zone transition.');
}
