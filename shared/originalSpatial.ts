import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalReachableCells, originalWalkable, originalZoneMap } from './originalWorld';
import type { MiningSpatialCheck } from './originalMining';

type Tile = { x: number; y: number };
function checkedTile(tile: Tile) {
  return { x: Math.floor(tile.x), y: Math.floor(tile.y) };
}
const geometries = new Map<
  string,
  { map: ReturnType<typeof originalZoneMap>; reachable: ReturnType<typeof originalReachableCells> }
>();
function geometry(zone: string) {
  let item = geometries.get(zone);
  if (!item) {
    const map = originalZoneMap(zone);
    item = { map, reachable: originalReachableCells(map) };
    geometries.set(zone, item);
  }
  return item;
}
export const originalSpatial: MiningSpatialCheck = {
  miningAllowed(zoneId, source) {
    const zone = ORIGINAL_CONTENT.zones.find((item) => item.id === zoneId);
    return (
      !!zone &&
      zone.regionCount > 0 &&
      (zone.location === 'loc.l002' || zone.location === 'loc.l003' || zone.location === 'loc.l005') &&
      (source === 'extract.x001' || source === 'extract.x002')
    );
  },
  validPosition(zoneId, player) {
    const tile = checkedTile(player);
    return geometry(zoneId).reachable.visited.has(`${tile.x},${tile.y}`);
  },
  clearLine(zoneId, from, to) {
    const { map } = geometry(zoneId);
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 5);
    for (let step = 0; step <= steps; step++) {
      const scale = steps === 0 ? 0 : step / steps;
      const x = Math.floor(from.x + (to.x - from.x) * scale);
      const y = Math.floor(from.y + (to.y - from.y) * scale);
      if (!originalWalkable(map, x, y)) return false;
    }
    return true;
  },
  reachableGroundTiles(zoneId, node) {
    const { map } = geometry(zoneId);
    return geometry(zoneId).reachable.queue.filter(
      (tile) =>
        Math.hypot(tile.x - node.x, tile.y - node.y) <= 4 &&
        [...map.exits, ...map.services].every((point) => Math.hypot(point.x - tile.x, point.y - tile.y) >= 2),
    );
  },
};
