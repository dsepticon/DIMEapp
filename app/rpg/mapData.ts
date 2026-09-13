import type { WorldObject } from './world';
import { P } from './palette';

export const TILE = 16;
export const WIDTH = 34;
export const HEIGHT = 22;

export const OBJECTS: readonly WorldObject[] = [
  { id: 'dolivine', label: 'Dolivine seam', kind: 'deposit', x: 22, y: 5, color: P.green },
  { id: 'aphorite', label: 'Aphorite seam', kind: 'deposit', x: 28, y: 10, color: P.rose },
  { id: 'hadanite', label: 'Hadanite seam', kind: 'deposit', x: 23, y: 16, color: P.violet },
  { id: 'refinery', label: 'Refinery terminal', kind: 'refinery', x: 5, y: 5, color: P.cyan },
  { id: 'market', label: 'Market terminal', kind: 'market', x: 10, y: 5, color: P.amber },
  { id: 'travel', label: 'Ship / travel terminal', kind: 'travel', x: 4, y: 13, color: P.blue },
  { id: 'worker', label: 'Station worker', kind: 'npc', x: 12, y: 9, color: P.violet },
];

export const SCENERY = [
  { x: 12, y: 14, kind: 'crate' },
  { x: 13, y: 14, kind: 'crate' },
  { x: 4, y: 11, kind: 'machine' },
  { x: 3, y: 9, kind: 'rack' },
  { x: 14, y: 6, kind: 'cabinet' },
  { x: 12, y: 18, kind: 'cart' },
  { x: 13, y: 18, kind: 'crate' },
  { x: 20, y: 8, kind: 'support' },
  { x: 19, y: 14, kind: 'support' },
  { x: 24, y: 10, kind: 'cart' },
  { x: 26, y: 7, kind: 'boulder' },
  { x: 28, y: 13, kind: 'boulder' },
  { x: 25, y: 17, kind: 'support' },
  { x: 29, y: 15, kind: 'boulder' },
] as const;

export type TileKind = 'wall' | 'ground' | 'mine' | 'entrance' | 'blocked';

export function tileAt(x: number, y: number): TileKind {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return 'wall';
  if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) return 'wall';
  if (x === 16 && y !== 10 && y !== 11) return 'wall';
  if (x > 16 && ((y === 3 && x > 19 && x < 31) || (y === 19 && x > 19 && x < 31))) return 'wall';
  if (x >= 30 && x <= 32 && y >= 6 && y <= 8) return 'blocked';
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

export function areaForX(x: number): 'outpost' | 'mine' {
  return x < 16.5 ? 'outpost' : 'mine';
}

export function areaName(area: 'outpost' | 'mine'): string {
  return area === 'mine' ? 'Lyria Mine Chamber' : 'Lyria Mining Outpost';
}
