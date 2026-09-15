import { originalReachableCells, originalWalkable, originalZoneMap } from './originalWorld';
import { originalSpatial } from './originalSpatial';
import { nodeInZone, type MineralNode, type Point } from './originalVacuum';
import type { OriginalPlayerState } from './originalSchema';

export const NODE_SEPARATION = 3;
const cache = new Map<string, Point[]>();
/** Static safe centers: a one-tile clear shoulder, no interaction footprint, reachable from spawn. */
export function nodePlacementCells(zone: string): readonly Point[] {
  let cells = cache.get(zone);
  if (!cells) {
    const map = originalZoneMap(zone),
      reachable = originalReachableCells(map);
    cells = reachable.queue
      .filter(
        (p) =>
          [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => originalWalkable(map, p.x + dx, p.y + dy))) &&
          [...map.exits, ...map.services, map.spawn].every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= 3) &&
          reachable.visited.has(`${p.x + 1},${p.y}`) &&
          originalSpatial.clearLine(zone, { x: p.x + 1.5, y: p.y + 0.5 }, { x: p.x + 0.5, y: p.y + 0.5 }),
      )
      .sort((a, b) => a.y - b.y || a.x - b.x);
    cache.set(zone, cells);
  }
  return cells;
}
export function placementAvailable(point: Point, occupied: readonly Point[], fragments: readonly Point[]) {
  return (
    occupied.every((p) => Math.hypot(p.x - point.x, p.y - point.y) >= NODE_SEPARATION) &&
    fragments.every((p) => Math.hypot(p.x - point.x, p.y - point.y) >= 1.5)
  );
}
export function nodeInteractionTiles(zone: string, node: Point) {
  return [
    { x: node.x + 1, y: node.y },
    { x: node.x - 1, y: node.y },
    { x: node.x, y: node.y + 1 },
    { x: node.x, y: node.y - 1 },
  ].filter(
    (p) =>
      originalSpatial.validPosition(zone, { x: p.x + 0.5, y: p.y + 0.5 }) &&
      originalSpatial.clearLine(zone, { x: p.x + 0.5, y: p.y + 0.5 }, { x: node.x + 0.5, y: node.y + 0.5 }),
  );
}
/** Called only within revision-controlled actions. Never move fractured nodes or their pieces. */
export function relocateInvalidOriginalNodes(state: OriginalPlayerState) {
  const nodes = Object.values(state.world.nodes)
    .filter((n) => nodeInZone(state, n))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!nodes.some((n) => n.status === 'INTACT') || state.world.miningSession || state.world.extractionSession)
    return;
  const cells = nodePlacementCells(state.world.zone),
    valid = new Set(cells.map((p) => `${p.x},${p.y}`));
  const fragments = nodes.flatMap((n) => n.fragments.filter((p) => !p.collected));
  const occupied: Point[] = nodes.filter((n) => n.status !== 'INTACT').map((n) => ({ x: n.x, y: n.y }));
  const relocate: MineralNode[] = [];
  // Preserve all valid centers before finding replacements for invalid centers.
  for (const node of nodes.filter((n) => n.status === 'INTACT')) {
    if (valid.has(`${node.x},${node.y}`) && placementAvailable(node, occupied, fragments))
      occupied.push(node);
    else relocate.push(node);
  }
  for (const node of relocate) {
    const next = cells
      .filter((p) => placementAvailable(p, occupied, fragments))
      .sort(
        (a, b) =>
          Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y) ||
          a.y - b.y ||
          a.x - b.x,
      )[0];
    if (!next) throw Error('NO_SAFE_NODE_REGION');
    node.x = next.x;
    node.y = next.y;
    occupied.push(next);
  }
}
