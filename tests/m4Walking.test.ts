import { describe, expect, it } from 'vitest';
import { arrivalPosition, walk, type WalkingInput } from '../app/original/walking';
import { originalWalkable, originalZoneMap } from '../shared/originalWorld';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
const idle: WalkingInput = { up: false, down: false, left: false, right: false };
describe('original local walking', () => {
  it('spawns inside walkable terrain at every zone and connected arrival', () => {
    for (const zone of ORIGINAL_CONTENT.zones) {
      const map = originalZoneMap(zone.id);
      for (const entry of ['arrival', ...map.exits.map((exit) => `from:${exit.to}`)]) {
        const p = arrivalPosition(map, entry);
        expect(originalWalkable(map, Math.floor(p.x), Math.floor(p.y))).toBe(true);
      }
    }
  });
  it('moves in every direction, normalizes diagonals and caps suspended-frame time', () => {
    const map = originalZoneMap('zone.z001'),
      p = arrivalPosition(map, 'arrival');
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const next = walk(map, p, { ...idle, [direction]: true }, 0.05);
      expect(Math.hypot(next.x - p.x, next.y - p.y)).toBeCloseTo(0.2);
    }
    const next = walk(map, p, { ...idle, up: true, right: true }, 60);
    expect(Math.hypot(next.x - p.x, next.y - p.y)).toBeCloseTo(0.2);
    expect(walk(map, p, idle, 1)).toEqual(p);
  });
  it('stops at walls instead of tunneling outside the map', () => {
    const map = originalZoneMap('zone.z001');
    let p = arrivalPosition(map, 'arrival');
    for (let i = 0; i < 1000; i++) p = walk(map, p, { ...idle, left: true }, 0.05);
    expect(originalWalkable(map, Math.floor(p.x - 0.2), Math.floor(p.y))).toBe(true);
    expect(walk(map, p, { ...idle, left: true }, 0.05)).toEqual(p);
  });
});
