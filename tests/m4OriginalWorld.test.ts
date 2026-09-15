import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
import { originalInitialState } from '../shared/originalGame';
import { originalWalkable, originalZoneMap, transitionOriginalZone } from '../shared/originalWorld';

function reachable(map: ReturnType<typeof originalZoneMap>) {
  const visited = new Set<string>([`${map.spawn.x},${map.spawn.y}`]);
  const queue = [map.spawn];
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = tile.x + dx,
        y = tile.y + dy,
        key = `${x},${y}`;
      if (originalWalkable(map, x, y) && !visited.has(key)) {
        visited.add(key);
        queue.push({ x, y });
      }
    }
  }
  return visited;
}

describe('original connected zone geometry', () => {
  it('loads all 43 maps on demand with distinct location palettes and safe exits', () => {
    const palettes = new Set<string>();
    for (const zone of ORIGINAL_CONTENT.zones) {
      const map = originalZoneMap(zone.id);
      palettes.add(map.palette);
      expect(map.tiles).toHaveLength(zone.width * zone.height);
      expect(originalWalkable(map, map.spawn.x, map.spawn.y)).toBe(true);
      const found = reachable(map);
      for (const exit of map.exits) {
        expect(found.has(`${exit.x},${exit.y}`)).toBe(true);
        const reverse = originalZoneMap(exit.to).exits.find((item) => item.to === map.id);
        expect(reverse).toBeDefined();
        expect({ N: 'S', S: 'N', E: 'W', W: 'E' }[exit.facing]).toBe(reverse?.facing);
      }
      for (const service of map.services) expect(found.has(`${service.x},${service.y}`)).toBe(true);
      expect(originalZoneMap(zone.id).tiles).toEqual(map.tiles);
    }
    expect(palettes).toEqual(new Set(['STATION', 'LOAM', 'MICA', 'CITY', 'CLAIM']));
  });

  it('applies every local transition with server-selected arrival and rejects remote jumps', () => {
    for (const zone of ORIGINAL_CONTENT.zones) {
      for (const exit of zone.exits) {
        const state = originalInitialState(randomUUID(), () => 0.5);
        state.location = zone.location;
        state.world.zone = zone.id;
        const next = transitionOriginalZone(state, exit.to);
        expect(next.location).toBe(zone.location);
        expect(next.world.zone).toBe(exit.to);
        expect(next.world.entry).toBe(`from:${zone.id}`);
        expect(next.revision).toBe(state.revision + 1);
        const back = transitionOriginalZone(next, zone.id);
        expect(back.world.zone).toBe(zone.id);
      }
    }
    const state = originalInitialState(randomUUID(), () => 0.5);
    expect(() => transitionOriginalZone(state, 'zone.z014')).toThrow('ZONE_EXIT_UNAVAILABLE');
    expect(state.world.zone).toBe('zone.z001');
  });
});
