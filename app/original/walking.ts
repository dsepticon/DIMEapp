import { originalWalkable, type OriginalZoneMap } from '../../shared/originalWorld';
export type Position = { x: number; y: number };
export type WalkingInput = { up: boolean; down: boolean; left: boolean; right: boolean };
export function arrivalPosition(map: OriginalZoneMap, entry: string): Position {
  const exit = entry.startsWith('from:') ? map.exits.find((item) => item.to === entry.slice(5)) : undefined;
  const tile = exit
    ? {
        x: exit.x + (exit.facing === 'E' ? -1 : exit.facing === 'W' ? 1 : 0),
        y: exit.y + (exit.facing === 'S' ? -1 : exit.facing === 'N' ? 1 : 0),
      }
    : map.spawn;
  return originalWalkable(map, tile.x, tile.y)
    ? { x: tile.x + 0.5, y: tile.y + 0.5 }
    : { x: map.spawn.x + 0.5, y: map.spawn.y + 0.5 };
}
export function walk(
  map: OriginalZoneMap,
  position: Position,
  input: WalkingInput,
  seconds: number,
): Position {
  const dx = Number(input.right) - Number(input.left),
    dy = Number(input.down) - Number(input.up),
    length = Math.hypot(dx, dy);
  if (!length) return position;
  const distance = (4 * Math.min(0.05, Math.max(0, seconds))) / length,
    radius = 0.2;
  const free = (x: number, y: number) =>
    [-radius, radius].every((ox) =>
      [-radius, radius].every((oy) => originalWalkable(map, Math.floor(x + ox), Math.floor(y + oy))),
    );
  const x = free(position.x + dx * distance, position.y) ? position.x + dx * distance : position.x;
  const y = free(x, position.y + dy * distance) ? position.y + dy * distance : position.y;
  return { x, y };
}
