import { GEM_SPAWN_WEIGHTS } from './catalog';
import type { Ore, PlayerState } from './schema';
import type { Zone } from './world';
import { zoneWalkable } from './world';
import { BASIC_MINING_TOOL } from './miningTool';
import { exactMinorSum } from './mineralUnits';

export type MiningNode = NonNullable<PlayerState['world']>['nodes'][string];
export const NODE_RESPAWN_MS = 30 * 60 * 1000;
const TUTORIAL_GROUND_POSITIONS: readonly (readonly [number, number])[] = [
  [28, 17],
  [28, 16],
  [29, 18],
];

/** Common signatures resolve farther away; rare ones need a closer search. */
export function scannerRadius(node: MiningNode): number {
  const weight = GEM_SPAWN_WEIGHTS[node.source][node.ore as keyof typeof GEM_SPAWN_WEIGHTS.Hand] ?? 0;
  return 4 + 8 * Math.sqrt(Math.max(0, Math.min(1, weight / 0.5)));
}

export function scannerSignal(node: MiningNode, x: number, y: number): 'none' | 'faint' | 'weak' | 'strong' {
  const distance = Math.hypot(node.x + 0.5 - x, node.y + 0.5 - y);
  const radius = scannerRadius(node);
  if (distance > radius * 1.5) return 'none';
  if (distance > radius) return 'faint';
  if (distance > radius * 0.45) return 'weak';
  return 'strong';
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}
function rng(seed: number): () => number {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weightedGem(source: 'Hand' | 'Roc', random: () => number): Ore {
  const weights = GEM_SPAWN_WEIGHTS[source];
  const total = Object.values(weights).reduce((sum: number, weight) => sum + weight, 0);
  let roll = random() * total;
  for (const [ore, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll < 0) return ore as Ore;
  }
  return 'Dolivine';
}
function reachable(zone: Zone): Set<string> {
  const start: [number, number] = [Math.floor(zone.spawn[0]), Math.floor(zone.spawn[1])];
  const visited = new Set<string>([start.join(',')]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        key = `${nx},${ny}`;
      if (!visited.has(key) && zoneWalkable(zone, nx, ny)) {
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return visited;
}
function clearOfServices(zone: Zone, x: number, y: number): boolean {
  return (
    [...zone.exits, ...zone.objects].every((item) => Math.hypot(x - item.x, y - item.y) >= 3) &&
    Math.hypot(x - zone.spawn[0], y - zone.spawn[1]) >= 3
  );
}
export function generatedNodes(
  generation: string,
  zone: Zone,
  saved: Record<string, MiningNode> = {},
  now = 0,
): MiningNode[] {
  if (!zone.regions.length) return [];
  const walkable = reachable(zone);
  const result: MiningNode[] = [];
  if (zone.id === 'LYRIA_SURFACE_01') {
    const tutorial: MiningNode = {
      id: 'LYRIA_SURFACE_01-tutorial',
      ore: 'Dolivine',
      source: 'Hand',
      x: 28,
      y: 18,
      size: 3,
      resistance: 0.32,
      instability: 0.28,
      yieldUnits: 400,
      status: 'INTACT',
      fragments: [],
      respawnAt: null,
    };
    const existing = saved[tutorial.id];
    result.push(
      existing && (existing.status !== 'DEPLETED' || (existing.respawnAt ?? Infinity) > now)
        ? existing
        : tutorial,
    );
  }
  const count = Math.min(8, zone.regions.length * 6);
  for (let slot = 0; slot < count; slot++) {
    const random = rng(hash(`${generation}/${zone.id}/${slot}`));
    const region = zone.regions[slot % zone.regions.length];
    let position: [number, number] | null = null;
    for (let attempt = 0; attempt < 180; attempt++) {
      const x = region.x + Math.floor(random() * region.width);
      const y = region.y + Math.floor(random() * region.height);
      if (
        walkable.has(`${x},${y}`) &&
        clearOfServices(zone, x, y) &&
        result.every((node) => Math.hypot(node.x - x, node.y - y) >= 3.5) &&
        (zone.id !== 'LYRIA_SURFACE_01' ||
          TUTORIAL_GROUND_POSITIONS.every(([px, py]) => Math.hypot(px - x, py - y) >= 2))
      ) {
        position = [x, y];
        break;
      }
    }
    if (!position) continue;
    const ore = weightedGem(region.source, random);
    const size = region.source === 'Hand' ? 1 + Math.floor(random() * 3) : 2 + Math.floor(random() * 4);
    // 0.25–5.00 cSCU hand nodes allow fractional discoveries; ROC retains its source range.
    const yieldUnits =
      region.source === 'Hand' ? 25 + Math.floor(random() * 476) : 800 + Math.floor(random() * 5501);
    const node: MiningNode = {
      id: `${zone.id}-${slot}`,
      ore,
      source: region.source,
      x: position[0],
      y: position[1],
      size,
      resistance: Math.round((0.15 + random() * 0.7) * 100) / 100,
      instability: Math.round((0.1 + random() * 0.8) * 100) / 100,
      yieldUnits,
      status: 'INTACT',
      fragments: [],
      respawnAt: null,
    };
    const existing = saved[node.id];
    result.push(
      existing && (existing.status !== 'DEPLETED' || (existing.respawnAt ?? Infinity) > now)
        ? existing
        : node,
    );
  }
  return result;
}

export type LaserState = { charge: number; progress: number; heat: number; overcharge: number };
export const EMPTY_LASER: LaserState = { charge: 0, progress: 0, heat: 0, overcharge: 0 };
export function laserRules(node: MiningNode) {
  const rarity = GEM_SPAWN_WEIGHTS[node.source][node.ore as keyof typeof GEM_SPAWN_WEIGHTS.Hand] ?? 0.01;
  const difficulty = Math.min(1, Math.max(0, 1 - rarity));
  const requiredSeconds = Math.min(
    8,
    Math.max(1.5, 1.2 + node.size * 0.55 + node.resistance * 1.4 + node.instability * 1.3 + difficulty * 0.8),
  );
  const center = Math.min(0.72, Math.max(0.38, 0.48 + node.resistance * 0.2));
  const halfWidth = Math.max(0.07, 0.13 - node.instability * 0.04 + BASIC_MINING_TOOL.optimalZoneAssistance);
  return {
    requiredSeconds,
    optimalLow: center - halfWidth,
    optimalHigh: center + halfWidth,
    overchargeStart: Math.min(0.95, center + halfWidth + 0.12),
  };
}
export function laserStep(
  current: LaserState,
  node: MiningNode,
  holding: boolean,
  seconds: number,
  throttle = 1,
): LaserState {
  const dt = Math.max(0, Math.min(0.05, seconds));
  const rules = laserRules(node);
  const drift = Math.sin(current.progress * 3.3 + current.charge * 7.1) * node.instability * 0.05;
  const center = (rules.optimalLow + rules.optimalHigh) / 2;
  const stabilized =
    current.charge >= rules.optimalLow && current.charge <= rules.optimalHigh && throttle <= 1;
  const gain = stabilized
    ? (center - current.charge) * BASIC_MINING_TOOL.stabilityAssistance * 5 + drift * 0.3
    : BASIC_MINING_TOOL.laserPower *
        BASIC_MINING_TOOL.chargeResponse *
        (1 - node.resistance * 0.5) *
        Math.max(0.25, Math.min(2, throttle)) +
      drift;
  const charge = Math.min(1, Math.max(0, current.charge + (holding ? gain : -0.3) * dt));
  const inside = charge >= rules.optimalLow && charge <= rules.optimalHigh;
  // A completed stable hold is latched so touch users can release the laser
  // before pressing the separate fracture control.
  const progress =
    current.progress >= rules.requiredSeconds
      ? rules.requiredSeconds
      : Math.min(
          rules.requiredSeconds,
          Math.max(0, current.progress + (inside && holding ? dt : -dt * 0.22)),
        );
  const overcharge = Math.min(
    1,
    Math.max(0, current.overcharge + (holding && charge >= rules.overchargeStart ? dt * 0.38 : -dt * 0.45)),
  );
  const heat = Math.min(
    1,
    Math.max(
      0,
      current.heat + (holding ? BASIC_MINING_TOOL.heatPerSecond : -BASIC_MINING_TOOL.cooldownPerSecond) * dt,
    ),
  );
  return { charge, progress, heat, overcharge };
}

export function fracturePieces(node: MiningNode, zone: Zone): MiningNode['fragments'] {
  const random = rng(hash(`${node.id}/${node.ore}/${node.yieldUnits}`));
  const walkable = reachable(zone);
  const count =
    node.id === 'LYRIA_SURFACE_01-tutorial' ? 3 : Math.min(6, Math.max(3, Math.ceil(node.yieldUnits / 600)));
  if (node.yieldUnits < count) throw new RangeError('Node yield cannot fund its ground pieces.');
  const pieces: MiningNode['fragments'] = [];
  let left = node.yieldUnits;
  for (let i = 0; i < count; i++) {
    const units =
      node.id === 'LYRIA_SURFACE_01-tutorial'
        ? [125, 125, 150][i]
        : i === count - 1
          ? left
          : Math.max(1, Math.floor(left / (count - i)));
    left -= units;
    let position: [number, number] | null =
      node.id === 'LYRIA_SURFACE_01-tutorial' ? [...TUTORIAL_GROUND_POSITIONS[i]] : null;
    if (position && (!walkable.has(position.join(',')) || !clearOfServices(zone, ...position)))
      throw new RangeError('Tutorial piece is not on a safe tile.');
    if (!position) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const x = node.x + Math.floor(random() * 9) - 4;
        const y = node.y + Math.floor(random() * 9) - 4;
        if (
          walkable.has(`${x},${y}`) &&
          clearOfServices(zone, x, y) &&
          pieces.every((piece) => piece.x !== x || piece.y !== y)
        ) {
          position = [x, y];
          break;
        }
      }
    }
    if (!position) throw new RangeError('No safe ground position for mineral piece.');
    pieces.push({ id: `${node.id}-piece-${i}`, units, x: position[0], y: position[1], collected: false });
  }
  if (exactMinorSum(pieces.map((piece) => piece.units)) !== node.yieldUnits)
    throw new RangeError('Mineral yield was not conserved.');
  return pieces;
}
