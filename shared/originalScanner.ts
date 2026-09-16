import type { OriginalPlayerState } from './originalSchema';
import { originalSpatial } from './originalSpatial';
import { nodeInZone, type Point } from './originalVacuum';
import { NODE_CONE_HALF_ANGLE, type Facing } from './originalNodeTargeting';
export const SCANNER_RANGE = 2.2;
export const PING_RADIUS = 8;
export const ANALYZE_HOLD_MS = 900;
export function analysisStatus(state: OriginalPlayerState, id: string, player: Point) {
  const node = state.world.nodes[id];
  if (!node || !nodeInZone(state, node) || node.status !== 'INTACT') return 'No signal';
  if (
    !((state.equipment['gear.e001'] ?? 0) > 0) ||
    !originalSpatial.miningAllowed(state.world.zone, node.source)
  )
    return 'Unsupported node';
  if (
    !originalSpatial.validPosition(state.world.zone, player) ||
    !originalSpatial.clearLine(state.world.zone, player, { x: node.x + 0.5, y: node.y + 0.5 })
  )
    return 'Obstructed';
  if (Math.hypot(node.x + 0.5 - player.x, node.y + 0.5 - player.y) > SCANNER_RANGE + 1e-9)
    return 'Out of range';
  return state.world.scanner.analyzed.includes(id) ? 'Already analyzed' : 'Ready';
}
/** Only positional signal data; no mineral properties are needed by a ping. */
export function scannerSignals(state: OriginalPlayerState, player: Point, facing: Facing) {
  const direction = { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI }[facing];
  return Object.values(state.world.nodes)
    .filter((n) => nodeInZone(state, n) && n.status === 'INTACT')
    .map((n) => {
      const dx = n.x + 0.5 - player.x,
        dy = n.y + 0.5 - player.y;
      const angle = Math.abs(
        Math.atan2(Math.sin(Math.atan2(dy, dx) - direction), Math.cos(Math.atan2(dy, dx) - direction)),
      );
      return {
        id: n.id,
        x: n.x + 0.5,
        y: n.y + 0.5,
        distance: Math.hypot(dx, dy),
        angle,
        status: analysisStatus(state, n.id, player),
      };
    })
    .filter((n) => n.distance <= PING_RADIUS)
    .sort((a, b) => a.distance - b.distance || a.angle - b.angle || a.id.localeCompare(b.id))
    .slice(0, 8);
}
export function scannerCandidates(state: OriginalPlayerState, player: Point, facing: Facing) {
  return scannerSignals(state, player, facing).filter(
    (n) => n.angle <= NODE_CONE_HALF_ANGLE && ['Ready', 'Already analyzed'].includes(n.status),
  );
}
