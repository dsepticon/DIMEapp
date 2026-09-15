import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalSpatial } from './originalSpatial';
import { nodeInZone, type MineralNode, type Point } from './originalVacuum';
import type { OriginalPlayerState } from './originalSchema';
export type Facing = 'N' | 'E' | 'S' | 'W';
export const NODE_CONE_HALF_ANGLE = Math.PI / 3;
export const NODE_HIT_PADDING = 6;
export const nodePixelWidth = (size: number) => 16 + Math.max(1, Math.min(5, size)) * 4;
export function ownedRig(state: OriginalPlayerState) {
  return (
    (state.ships['fleet.v002'] ?? 0) > 0 &&
    state.world.groundVehicle?.active &&
    state.world.groundVehicle.occupied &&
    state.world.groundVehicle.zone === state.world.zone
  );
}
export function nodeToolRange(state: OriginalPlayerState, node: MineralNode) {
  const tool = ORIGINAL_CONTENT.equipment.find((e) => e.id === 'gear.e001')!.toolStats!;
  if (
    node.source === 'extract.x001' &&
    (state.equipment['gear.e001'] ?? 0) > 0 &&
    (tool.supportedNodeSizes as readonly number[]).includes(node.size)
  )
    return tool.rangeTiles;
  return ownedRig(state) ? 4.5 : 0;
}
export function nodeTargetStatus(state: OriginalPlayerState, node: MineralNode, player: Point) {
  if (!nodeInZone(state, node) || node.status !== 'INTACT') return 'Unavailable';
  if (
    !originalSpatial.validPosition(state.world.zone, player) ||
    !originalSpatial.clearLine(state.world.zone, player, { x: node.x + 0.5, y: node.y + 0.5 })
  )
    return 'Obstructed';
  // Inspection uses the legitimate basic scanner/tool radius even when a larger mining tool is required.
  if (
    Math.hypot(node.x + 0.5 - player.x, node.y + 0.5 - player.y) >
    (nodeToolRange(state, node) || 2.2) + 1e-9
  )
    return 'Move closer';
  return 'In range';
}
export function forwardNodeCandidates(state: OriginalPlayerState, player: Point, facing: Facing) {
  const direction = { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI }[facing];
  return Object.values(state.world.nodes)
    .filter((n) => nodeInZone(state, n) && n.status === 'INTACT')
    .map((node) => {
      const dx = node.x + 0.5 - player.x,
        dy = node.y + 0.5 - player.y;
      const angle = Math.abs(
        Math.atan2(Math.sin(Math.atan2(dy, dx) - direction), Math.cos(Math.atan2(dy, dx) - direction)),
      );
      return { node, angle, distance: Math.hypot(dx, dy), status: nodeTargetStatus(state, node, player) };
    })
    .filter((t) => t.angle <= NODE_CONE_HALF_ANGLE && t.status === 'In range')
    .sort(
      (a, b) =>
        a.angle - b.angle ||
        a.distance - b.distance ||
        (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0),
    );
}
export function pointedNode(state: OriginalPlayerState, point: Point, scale = 24) {
  return Object.values(state.world.nodes)
    .filter(
      (n) =>
        nodeInZone(state, n) &&
        n.status === 'INTACT' &&
        Math.abs(n.x + 0.5 - point.x) <= (nodePixelWidth(n.size) / 2 + NODE_HIT_PADDING) / scale &&
        Math.abs(n.y + 0.5 - point.y) <= (nodePixelWidth(n.size) / 2 + NODE_HIT_PADDING) / scale,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x + 0.5 - point.x, a.y + 0.5 - point.y) -
          Math.hypot(b.x + 0.5 - point.x, b.y + 0.5 - point.y) || a.id.localeCompare(b.id),
    )[0];
}
