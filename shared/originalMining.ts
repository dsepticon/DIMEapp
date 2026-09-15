import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalStateSchema, type OriginalPlayerState } from './originalSchema';
import { placeGroundPieces, replayPulseTrace, type NodeSpec, type PulseRun } from './continuousMining';
import { FIRST_CONTRACT_NODE } from './originalQuest';

const NODE_RESPAWN_MS = 30 * 60 * 1000;
type World = OriginalPlayerState['world'];
type Node = World['nodes'][string];
type Tile = { x: number; y: number };
export type MiningSpatialCheck = {
  miningAllowed: (zoneId: string, source: Node['source']) => boolean;
  validPosition: (zoneId: string, player: Tile) => boolean;
  clearLine: (zoneId: string, from: Tile, to: Tile) => boolean;
  reachableGroundTiles: (zoneId: string, node: Tile) => readonly Tile[];
};

const hash = (value: string) => {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
};
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** All difficulty and yield inputs come from the server-owned node and original catalog. */
export function originalNodeSpec(node: Node): NodeSpec {
  const mineral = ORIGINAL_CONTENT.minerals.find((item) => item.id === node.ore);
  if (!mineral || mineral.category !== 'GEM' || mineral.refinable) throw new Error('MINING_NODE_INVALID');
  const weight = mineral.spawnWeights[node.source as keyof typeof mineral.spawnWeights];
  if (typeof weight !== 'number' || weight <= 0) throw new Error('MINING_NODE_INVALID');
  const rarity = weight >= 0.4 ? 0 : weight >= 0.25 ? 1 : weight >= 0.1 ? 2 : weight >= 0.03 ? 3 : 4;
  return {
    seed: hash(`${node.id}/${node.ore}/${node.yieldUnits}`),
    rarity,
    size: node.size,
    mass: clamp(Math.round(1 + node.size / 2 + node.resistance * 2), 1, 5),
    instability: clamp(Math.round(node.instability * 100), 0, 100),
    yieldUnits: node.yieldUnits,
    fragility: node.resistance < 0.3 ? 2 : node.resistance < 0.6 ? 1 : 0,
    ...(node.id === FIRST_CONTRACT_NODE ? { pieceUnits: [125, 125, 150] } : {}),
  };
}

function reachableTarget(state: OriginalPlayerState, node: Node, player: Tile, spatial: MiningSpatialCheck) {
  const handTool = ORIGINAL_CONTENT.equipment.find((item) => item.id === 'gear.e001');
  if (
    node.source === 'extract.x001' &&
    !(handTool?.toolStats?.supportedNodeSizes as readonly number[] | undefined)?.includes(node.size)
  )
    throw new Error('MINING_TOOL_INELIGIBLE');
  const range =
    node.source === 'extract.x001'
      ? (state.equipment['gear.e001'] ?? 0) > 0
        ? handTool?.toolStats?.rangeTiles
        : undefined
      : (state.ships['fleet.v002'] ?? 0) > 0 &&
          state.world.groundVehicle?.active &&
          state.world.groundVehicle.occupied &&
          state.world.groundVehicle.zone === state.world.zone
        ? 4.5
        : undefined;
  if (
    !range ||
    !spatial.validPosition(state.world.zone, player) ||
    Math.hypot(node.x + 0.5 - player.x, node.y + 0.5 - player.y) > range ||
    !spatial.clearLine(state.world.zone, player, { x: node.x + 0.5, y: node.y + 0.5 })
  )
    throw new Error('MINING_TARGET_UNREACHABLE');
}

/** Meaningful server checkpoint: one write when an analyzed node is targeted. */
export function beginOriginalMining(
  source: OriginalPlayerState,
  nodeId: string,
  player: Tile,
  now: number,
  spatial: MiningSpatialCheck,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  if (state.world.miningSession) throw new Error('MINING_SESSION_ACTIVE');
  const node = state.world.nodes[nodeId];
  if (
    !node ||
    node.status !== 'INTACT' ||
    !state.world.scanner.analyzed.includes(nodeId) ||
    !spatial.miningAllowed(state.world.zone, node.source)
  )
    throw new Error('MINING_NOT_AVAILABLE');
  originalNodeSpec(node);
  reachableTarget(state, node, player, spatial);
  state.world.miningSession = { nodeId, source: node.source, startedAt: now, zone: state.world.zone };
  state.revision++;
  return originalStateSchema.parse(state);
}

/** One bounded resolution write; the client cannot choose fracture, explosion, yield or pieces. */
export function resolveOriginalMining(
  source: OriginalPlayerState,
  runs: readonly PulseRun[],
  now: number,
  spatial: MiningSpatialCheck,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  const session = state.world.miningSession;
  if (!session) throw new Error('MINING_SESSION_MISSING');
  const node = state.world.nodes[session.nodeId];
  if (
    !node ||
    node.status !== 'INTACT' ||
    node.source !== session.source ||
    session.zone !== state.world.zone
  )
    throw new Error('MINING_NODE_INVALID');
  const result = replayPulseTrace(originalNodeSpec(node), runs, now - session.startedAt);
  if (result.phase !== 'fractured' && result.phase !== 'destroyed') throw new Error('MINING_NOT_RESOLVED');
  if (result.phase === 'destroyed') {
    node.status = 'DESTROYED';
    node.fragments = [];
    node.respawnAt = now + NODE_RESPAWN_MS;
  } else {
    const ground = placeGroundPieces(
      originalNodeSpec(node),
      node,
      spatial.reachableGroundTiles(state.world.zone, node),
    );
    node.status = 'FRACTURED';
    node.fragments = ground.map((piece) => ({
      id: `${node.id}-piece-${piece.id}`,
      units: piece.units,
      x: piece.x,
      y: piece.y,
      collected: false,
    }));
    node.respawnAt = null;
  }
  state.world.miningSession = null;
  state.revision++;
  return originalStateSchema.parse(state);
}

/** Start a single piece's vacuum path; movement and beam frames remain local. */
export function beginOriginalVacuum(
  source: OriginalPlayerState,
  nodeId: string,
  pieceId: string,
  player: Tile,
  now: number,
  spatial: MiningSpatialCheck,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  const node = state.world.nodes[nodeId];
  const piece = node?.fragments.find((item) => item.id === pieceId);
  if (!node || node.status !== 'FRACTURED' || !piece || piece.collected || state.world.extractionSession)
    throw new Error('MINING_PIECE_UNAVAILABLE');
  reachableTarget(state, { ...node, x: piece.x, y: piece.y }, player, spatial);
  state.world.extractionSession = { nodeId, pieceId, startedAt: now, origin: player, zone: state.world.zone };
  state.revision++;
  return originalStateSchema.parse(state);
}

/** Called only after the vacuum animation reaches the player; failure keeps the piece. */
export function collectOriginalPiece(
  source: OriginalPlayerState,
  nodeId: string,
  pieceId: string,
  player: Tile,
  now: number,
  spatial: MiningSpatialCheck,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  const node = state.world.nodes[nodeId];
  const piece = node?.fragments.find((item) => item.id === pieceId);
  if (!node || node.status !== 'FRACTURED' || !piece || piece.collected)
    throw new Error('MINING_PIECE_UNAVAILABLE');
  const session = state.world.extractionSession;
  if (
    !session ||
    session.nodeId !== nodeId ||
    session.pieceId !== pieceId ||
    session.zone !== state.world.zone
  )
    throw new Error('MINING_EXTRACTION_NOT_STARTED');
  const minimumMs =
    200 + Math.ceil(Math.hypot(piece.x + 0.5 - session.origin.x, piece.y + 0.5 - session.origin.y) * 200);
  if (now - session.startedAt < minimumMs || now - session.startedAt > 30_000)
    throw new Error('MINING_EXTRACTION_TIMING');
  reachableTarget(state, { ...node, x: piece.x, y: piece.y }, player, spatial);
  const holdId = node.source;
  const hold = state.mining[holdId];
  if (!hold) throw new Error('MINING_HOLD_UNAVAILABLE');
  const capacityCscu = ORIGINAL_CONTENT.shipsAndVehicles.find(
    (item) => item.id === 'fleet.v002',
  )?.capacityCscu;
  const capacity = holdId === 'extract.x001' ? 12 * 100 : (capacityCscu ?? 80) * 100;
  const held = Object.values(hold).reduce<number>((sum, units) => sum + (units ?? 0), 0);
  if (held + piece.units > capacity) throw new Error('MINING_HOLD_FULL');
  hold[node.ore] = (hold[node.ore] ?? 0) + piece.units;
  piece.collected = true;
  state.world.extractionSession = null;
  if (node.fragments.every((item) => item.collected)) {
    node.status = 'DEPLETED';
    node.respawnAt = now + NODE_RESPAWN_MS;
  }
  state.revision++;
  return originalStateSchema.parse(state);
}

export function cancelOriginalVacuum(source: OriginalPlayerState): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  if (!state.world.extractionSession) throw new Error('MINING_EXTRACTION_NOT_STARTED');
  state.world.extractionSession = null;
  state.revision++;
  return originalStateSchema.parse(state);
}
