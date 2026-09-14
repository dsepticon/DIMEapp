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
