export const TILE = 16;
export const WIDTH = 34;
export const HEIGHT = 22;
export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 208;

export type Direction = 'up' | 'down' | 'left' | 'right';
export type InputState = Record<Direction, boolean>;
export type WorldState = { x: number; y: number; facing: Direction; moving: boolean; clock: number };
export type ObjectKind = 'deposit' | 'refinery' | 'market' | 'travel';
export type WorldObject = {
  id: string;
  label: string;
  kind: ObjectKind;
  x: number;
  y: number;
  color: string;
};

export const OBJECTS: readonly WorldObject[] = [
  { id: 'dolivine', label: 'Dolivine seam', kind: 'deposit', x: 22, y: 5, color: '#54d4a3' },
  { id: 'aphorite', label: 'Aphorite seam', kind: 'deposit', x: 28, y: 10, color: '#d869c7' },
  { id: 'hadanite', label: 'Hadanite seam', kind: 'deposit', x: 23, y: 16, color: '#ba7aff' },
  { id: 'refinery', label: 'Refinery terminal', kind: 'refinery', x: 5, y: 5, color: '#ffa964' },
  { id: 'market', label: 'Market terminal', kind: 'market', x: 10, y: 5, color: '#69dfe2' },
  { id: 'travel', label: 'Ship / travel terminal', kind: 'travel', x: 5, y: 16, color: '#89baff' },
];

const objectTiles = new Set(OBJECTS.map((item) => `${item.x},${item.y}`));
export function tileAt(x: number, y: number): 'wall' | 'ground' | 'mine' | 'entrance' {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return 'wall';
  if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) return 'wall';
  if (x === 16 && y !== 10 && y !== 11) return 'wall';
  if (x > 16 && ((y === 3 && x > 19 && x < 31) || (y === 19 && x > 19 && x < 31))) return 'wall';
  if (
    x < 16 &&
    ((x >= 3 && x <= 11 && (y === 3 || y === 7)) || ((x === 3 || x === 11) && y >= 3 && y <= 7))
  ) {
    if ((x === 7 || x === 8) && y === 7) return 'ground';
    return 'wall';
  }
  if (x === 16 && (y === 10 || y === 11)) return 'entrance';
  return x > 16 ? 'mine' : 'ground';
}

export function canStand(x: number, y: number): boolean {
  const radius = 0.27;
  for (const dx of [-radius, radius])
    for (const dy of [-radius, radius]) {
      const tx = Math.floor(x + dx);
      const ty = Math.floor(y + dy);
      if (tileAt(tx, ty) === 'wall' || objectTiles.has(`${tx},${ty}`)) return false;
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
