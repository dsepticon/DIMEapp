import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalStateSchema, type OriginalPlayerState } from './originalSchema';
import {
  nodePlacementCells,
  placementAvailable,
  relocateInvalidOriginalNodes,
} from './originalNodePlacement';
import { nodeInZone } from './originalVacuum';

const hash = (text: string) => {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return value >>> 0;
};
const random = (seed: number, index: number) => hash(`${seed}/${index}`) / 0x1_0000_0000;
export function populateOriginalZone(source: OriginalPlayerState): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  const zone = ORIGINAL_CONTENT.zones.find((item) => item.id === state.world.zone);
  if (!zone?.regionCount) return state;
  relocateInvalidOriginalNodes(state);
  if (Object.values(state.world.nodes).some((node) => node.id.startsWith(`${zone.id}.node.`))) return state;
  const cells = nodePlacementCells(zone.id);
  if (cells.length === 0) throw Error('NO_SAFE_NODE_REGION');
  const weight = (item: (typeof ORIGINAL_CONTENT.minerals)[number], source: string) =>
    (item.spawnWeights as Partial<Record<string, number>>)[source] ?? 0;
  const seed = hash(`${state.saveGeneration}/${zone.id}`);
  const count = Math.min(8, Math.max(3, zone.regionCount * 2));
  const existing = Object.values(state.world.nodes).filter((n) => nodeInZone(state, n));
  const chosen = existing.map((n) => ({ x: n.x, y: n.y }));
  const fragments = existing.flatMap((n) => n.fragments.filter((p) => !p.collected));
  for (let index = 0; index < count; index++) {
    const source = zone.name.includes('Tunnel') || index % 2 === 0 ? 'extract.x001' : 'extract.x002';
    const materials = ORIGINAL_CONTENT.minerals.filter((item) => weight(item, source) > 0);
    const roll = random(seed, index * 7);
    let cursor = 0;
    const total = materials.reduce((sum, item) => sum + weight(item, source), 0);
    const material =
      materials.find((item) => (cursor += weight(item, source)) >= roll * total) ?? materials[0]!;
    const start = Math.floor(random(seed, index * 7 + 1) * cells.length);
    const tile = [...cells.slice(start), ...cells.slice(0, start)].find((candidate) =>
      placementAvailable(candidate, chosen, fragments),
    );
    if (!tile) throw Error('NO_SAFE_NODE_REGION');
    chosen.push(tile);
    const id = `${zone.id}.node.${index}`;
    state.world.nodes[id] = {
      id,
      ore: material.id,
      source,
      x: tile.x,
      y: tile.y,
      size: 1 + Math.floor(random(seed, index * 7 + 2) * (source === 'extract.x001' ? 3 : 5)),
      resistance: 0.15 + random(seed, index * 7 + 3) * 0.7,
      instability: 0.1 + random(seed, index * 7 + 4) * 0.8,
      yieldUnits: 50 + Math.floor(random(seed, index * 7 + 5) * 751),
      status: 'INTACT',
      fragments: [],
      respawnAt: null,
    };
  }
  return originalStateSchema.parse(state);
}
export function refreshOriginalRespawns(source: OriginalPlayerState, now: number): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  for (const node of Object.values(state.world.nodes))
    if (nodeInZone(state, node) && node.respawnAt !== null && node.respawnAt <= now) {
      node.status = 'INTACT';
      node.fragments = [];
      node.respawnAt = null;
    }
  relocateInvalidOriginalNodes(state);
  return originalStateSchema.parse(state);
}
export function scanOriginalZone(source: OriginalPlayerState, now = Date.now()): OriginalPlayerState {
  const state = populateOriginalZone(refreshOriginalRespawns(source, now));
  if (!ORIGINAL_CONTENT.zones.find((x) => x.id === state.world.zone)?.regionCount)
    throw Error('SCANNER_UNAVAILABLE');
  relocateInvalidOriginalNodes(state);
  state.world.scanner.pings++;
  if (!state.world.scanner.scannedZones?.includes(state.world.zone))
    state.world.scanner.scannedZones?.push(state.world.zone);
  state.revision++;
  return originalStateSchema.parse(state);
}
export function analyzeOriginalNode(source: OriginalPlayerState, nodeId: string): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  const node = state.world.nodes[nodeId];
  if (
    !node ||
    node.status !== 'INTACT' ||
    !nodeInZone(state, node) ||
    !state.world.scanner.scannedZones?.includes(state.world.zone)
  )
    throw Error('ANALYSIS_UNAVAILABLE');
  if (!state.world.scanner.analyzed.includes(nodeId)) state.world.scanner.analyzed.push(nodeId);
  state.world.scanner.analyses++;
  state.revision++;
  return originalStateSchema.parse(state);
}
