import { ORIGINAL_CONTENT } from './originalCatalog';
import type { OriginalPlayerState } from './originalSchema';
import { originalSpatial } from './originalSpatial';
import type { MiningSpatialCheck } from './originalMining';
import { FIRST_CONTRACT_NODE } from './originalQuest';
export type Point = { x: number; y: number };
export type MineralNode = OriginalPlayerState['world']['nodes'][string];
export type GroundFragment = MineralNode['fragments'][number];
// The existing top-down extraction field is radial (360 degrees), with authoritative line of sight.
export const VACUUM_FIELD_OF_VIEW = 360;
export const VACUUM_RETARGET_MS = 180;
export const fragmentCenter = (piece: Point): Point => ({ x: piece.x + 0.5, y: piece.y + 0.5 });
export const vacuumDuration = (distance: number) => 250 + Math.ceil(distance * 200);
export function nodeInZone(state: OriginalPlayerState, node: MineralNode) {
  return (
    ORIGINAL_CONTENT.zones.find((z) => z.id === state.world.zone)?.location === state.location &&
    (node.id.startsWith(state.world.zone + '.') ||
      node.id.startsWith(state.world.zone + '-') ||
      (state.world.zone === 'zone.z014' && node.id === FIRST_CONTRACT_NODE))
  );
}
export function vacuumRange(state: OriginalPlayerState, node: MineralNode) {
  if (node.source === 'extract.x001')
    return (state.equipment['gear.e001'] ?? 0) > 0
      ? ORIGINAL_CONTENT.equipment.find((e) => e.id === 'gear.e001')!.toolStats!.rangeTiles
      : 0;
  return (state.ships['fleet.v002'] ?? 0) > 0 &&
    state.world.groundVehicle?.active &&
    state.world.groundVehicle.occupied &&
    state.world.groundVehicle.zone === state.world.zone
    ? 4.5
    : 0;
}
export function vacuumCapacity(state: OriginalPlayerState, node: MineralNode) {
  const capacity =
    node.source === 'extract.x001'
      ? 1200
      : (ORIGINAL_CONTENT.shipsAndVehicles.find((v) => v.id === 'fleet.v002')?.capacityCscu ?? 80) * 100;
  const used = Object.values(state.mining[node.source]).reduce<number>((sum, n) => sum + (n ?? 0), 0);
  return { capacity, used, free: Math.max(0, capacity - used) };
}
export function vacuumEligibility(
  state: OriginalPlayerState,
  node: MineralNode,
  piece: GroundFragment,
  player: Point,
  spatial: MiningSpatialCheck = originalSpatial,
) {
  if (!nodeInZone(state, node) || !spatial.miningAllowed(state.world.zone, node.source)) return 'WRONG_ZONE';
  if (node.status !== 'FRACTURED' || piece.collected || state.world.miningSession) return 'UNAVAILABLE';
  const range = vacuumRange(state, node);
  if (!range) return 'TOOL_UNAVAILABLE';
  const center = fragmentCenter(piece);
  if (!spatial.validPosition(state.world.zone, player) || !spatial.validPosition(state.world.zone, center))
    return 'BLOCKED';
  if (Math.hypot(center.x - player.x, center.y - player.y) > range + 1e-9) return 'OUT_OF_RANGE';
  if (!spatial.clearLine(state.world.zone, player, center)) return 'BLOCKED';
  return vacuumCapacity(state, node).free < piece.units ? 'FULL' : 'AVAILABLE';
}
export type FragmentTarget = { node: MineralNode; piece: GroundFragment; distance: number; full: boolean };
export function nearestFragment(
  state: OriginalPlayerState,
  player: Point,
  spatial: MiningSpatialCheck = originalSpatial,
): FragmentTarget | undefined {
  const candidates: FragmentTarget[] = [];
  for (const node of Object.values(state.world.nodes)) {
    if (!nodeInZone(state, node) || node.status !== 'FRACTURED') continue;
    for (const piece of node.fragments) {
      const reason = vacuumEligibility(state, node, piece, player, spatial);
      if (reason === 'AVAILABLE' || reason === 'FULL')
        candidates.push({
          node,
          piece,
          distance: Math.hypot(piece.x + 0.5 - player.x, piece.y + 0.5 - player.y),
          full: reason === 'FULL',
        });
    }
  }
  const order = (a: FragmentTarget, b: FragmentTarget) =>
    a.distance - b.distance || (a.piece.id < b.piece.id ? -1 : a.piece.id > b.piece.id ? 1 : 0);
  return candidates.filter((c) => !c.full).sort(order)[0] ?? candidates.sort(order)[0];
}
