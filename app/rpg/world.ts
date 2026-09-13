import { OBJECTS, SCENERY, tileAt } from './mapData';
export { HEIGHT, OBJECTS, SCENERY, TILE, tileAt, WIDTH } from './mapData';
export const VIEW_WIDTH = 160;
export const VIEW_HEIGHT = 250;

export type Direction = 'up' | 'down' | 'left' | 'right';
export type InputState = Record<Direction, boolean>;
export type WorldState = { x: number; y: number; facing: Direction; moving: boolean; clock: number };
export type ObjectKind = 'deposit' | 'refinery' | 'market' | 'travel' | 'npc';
export type WorldObject = {
  id: string;
  label: string;
  kind: ObjectKind;
  x: number;
  y: number;
  color: string;
};

const objectTiles = new Set([...OBJECTS, ...SCENERY].map((item) => `${item.x},${item.y}`));

export function canStand(x: number, y: number): boolean {
  const radius = 0.27;
  for (const dx of [-radius, radius])
    for (const dy of [-radius, radius]) {
      const tx = Math.floor(x + dx);
      const ty = Math.floor(y + dy);
      if (['wall', 'blocked'].includes(tileAt(tx, ty)) || objectTiles.has(`${tx},${ty}`)) return false;
    }
  return true;
}

export function initialWorld(): WorldState {
  return { x: 8.5, y: 11.5, facing: 'down', moving: false, clock: 0 };
}

export function advance(world: WorldState, input: InputState, seconds: number): WorldState {
  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.down) - Number(input.up);
  if (!horizontal && !vertical) return { ...world, moving: false, clock: world.clock + seconds };
  const distance = Math.min(Math.max(seconds, 0), 0.05) * 3.4;
  const diagonal = horizontal && vertical ? Math.SQRT1_2 : 1;
  const dx = horizontal * diagonal * distance;
  const dy = vertical * diagonal * distance;
  const x = canStand(world.x + dx, world.y) ? world.x + dx : world.x;
  const y = canStand(x, world.y + dy) ? world.y + dy : world.y;
  const facing: Direction =
    Math.abs(horizontal) > Math.abs(vertical)
      ? horizontal > 0
        ? 'right'
        : 'left'
      : vertical > 0
        ? 'down'
        : 'up';
  return { x, y, facing, moving: x !== world.x || y !== world.y, clock: world.clock + seconds };
}

export function nearestObject(world: WorldState, maxDistance = 1.65): WorldObject | undefined {
  return OBJECTS.filter(
    (item) => Math.hypot(item.x + 0.5 - world.x, item.y + 0.5 - world.y) <= maxDistance,
  ).sort(
    (a, b) =>
      Math.hypot(a.x + 0.5 - world.x, a.y + 0.5 - world.y) -
      Math.hypot(b.x + 0.5 - world.x, b.y + 0.5 - world.y),
  )[0];
}
