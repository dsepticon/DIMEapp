/** Isolated aliases for the version-2 save. Never import this module into a game UI. */
import { createHash } from 'node:crypto';
import finalMapping from '../docs/dime-m4-final-mapping.json';
import { MINERAL_CATALOG, ORES } from '../shared/catalog';
import { stateSchema, type PlayerState } from '../shared/schema';
import { originalStateSchema } from '../shared/originalSchema';
import { originalWalkable, originalReachableCells, originalZoneMap } from '../shared/originalWorld';

type Row = { legacyIdentifier: string; originalStableIdentifier: string };
type OriginalInventory = Record<string, number>;
export type OriginalState = Omit<
  PlayerState,
  | 'schemaVersion'
  | 'location'
  | 'currentShip'
  | 'ships'
  | 'equipment'
  | 'positions'
  | 'mining'
  | 'cargo'
  | 'orders'
  | 'refineryRates'
  | 'pending'
  | 'firstShift'
  | 'world'
> & {
  schemaVersion: 3;
  saveFormatVersion: 3;
  contentVersion: 4;
  conversionReceipt: {
    version: 1;
    requestId: string;
    sourceRevision: number;
    sourceGeneration: string;
    sourceDigest: string;
  };
  location: string;
  currentShip: string;
  ships: Record<string, number>;
  equipment: Record<string, number>;
  positions: Record<string, string>;
  mining: Record<string, OriginalInventory>;
  cargo: Record<string, { raw: OriginalInventory; refined: OriginalInventory }>;
  orders: Array<Record<string, unknown>>;
  refineryRates: Record<string, { yield: number; cost: number; time: number }>;
  pending: Record<string, unknown> | null;
  quest?: Record<string, unknown>;
  world?: Record<string, unknown>;
};

const rowMap = (rows: readonly Row[]) =>
  new Map(rows.map((row) => [row.legacyIdentifier, row.originalStableIdentifier]));
const minerals = rowMap(finalMapping.minerals);
const processedMinerals = new Map(
  finalMapping.minerals.flatMap((row) =>
    row.processedStableIdentifier ? [[row.legacyIdentifier, row.processedStableIdentifier] as const] : [],
  ),
);
const ships = rowMap(finalMapping.shipsAndVehicles);
const equipment = rowMap(finalMapping.equipment);
const methods = rowMap(finalMapping.refineryMethods);
const locations = rowMap(finalMapping.locations);
const zones = rowMap(finalMapping.zones);
const reverse = (map: Map<string, string>) =>
  new Map([...map].map(([source, destination]) => [destination, source]));
const oldMinerals = reverse(minerals);
const oldProcessedMinerals = reverse(processedMinerals);
const oldShips = reverse(ships);
const oldEquipment = reverse(equipment);
const oldMethods = reverse(methods);
const oldLocations = reverse(locations);
const oldZones = reverse(zones);
const extraction = new Map([
  ['Hand', 'extract.x001'],
  ['Roc', 'extract.x002'],
  ['Prospector', 'extract.x003'],
  ['Mole', 'extract.x004'],
]);
const oldExtraction = reverse(extraction);

function mapped(map: Map<string, string>, value: string): string {
  const result = map.get(value);
  if (!result) throw new Error('CONTENT_REVIEW_REQUIRED');
  return result;
}
function objectKeys<T, R = T>(
  value: Record<string, T | undefined>,
  map: Map<string, string>,
  convert: (item: T) => R = (item) => item as unknown as R,
): Record<string, R> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      item === undefined ? [] : [[mapped(map, key), convert(item)]],
    ),
  );
}
function inventory(value: Record<string, number | undefined>): OriginalInventory {
  return objectKeys(value, minerals);
}
function processedInventory(value: Record<string, number | undefined>): OriginalInventory {
  return objectKeys(value, processedMinerals);
}
function nodeId(value: string): string {
  const prefix = [...zones.keys()].find((zone) => value === zone || value.startsWith(`${zone}-`));
  if (!prefix) throw new Error('CONTENT_REVIEW_REQUIRED');
  return mapped(zones, prefix) + value.slice(prefix.length);
}
function oldNodeId(value: string): string {
  const prefix = [...oldZones.keys()].find((zone) => value === zone || value.startsWith(`${zone}-`));
  if (!prefix) throw new Error('CONTENT_REVIEW_REQUIRED');
  return mapped(oldZones, prefix) + value.slice(prefix.length);
}
function entryId(value: string) {
  if (!value.startsWith('from:')) return value;
  return `from:${mapped(zones, value.slice(5))}`;
}
const sourceDigest = (state: PlayerState) => createHash('sha256').update(JSON.stringify(state)).digest('hex');

function assertReviewedCatalog() {
  const rows = [
    ...finalMapping.locations,
    ...finalMapping.zones,
    ...finalMapping.minerals,
    ...finalMapping.shipsAndVehicles,
    ...finalMapping.equipment,
    ...finalMapping.refineryMethods,
  ];
  if (new Set(rows.map((row) => row.originalStableIdentifier)).size !== rows.length)
    throw new Error('CONTENT_REVIEW_REQUIRED');
  for (const row of rows) {
    const digest = createHash('sha256').update(JSON.stringify(row.sourceStats)).digest('hex');
    if (digest !== row.sourceStatSignature || row.conversionClassification !== 'EXACT_FUNCTIONAL_EQUIVALENT')
      throw new Error('CONTENT_REVIEW_REQUIRED');
  }
  for (const row of finalMapping.minerals) {
    const source = MINERAL_CATALOG.find(
      (item) => item.displayName === row.legacyIdentifier && item.category !== 'REFINED_MATERIAL',
    );
    const current = ORES[row.legacyIdentifier];
    if (
      !source ||
      !current ||
      source.category !== row.category ||
      current.raw !== row.sourceStats.rawPricePerScu ||
      current.refined !== row.sourceStats.processedPricePerScu ||
      JSON.stringify(source.spawnWeights) !== JSON.stringify(row.sourceStats.spawnWeights) ||
      JSON.stringify(source.extractionClasses) !== JSON.stringify(row.sourceStats.extractionClasses) ||
      source.refineryEligible !== row.sourceStats.refinable ||
      source.rawSaleEligible !== row.sourceStats.rawSale
    )
      throw new Error('CONTENT_REVIEW_REQUIRED');
  }
}

function safeConvertedNodes(
  nodes: Record<
    string,
    {
      x: number;
      y: number;
      fragments: Array<{ x: number; y: number; collected: boolean }>;
    }
  >,
) {
  const placedByZone = new Map<string, Array<{ x: number; y: number }>>();
  const zoneCache = new Map<string, Array<{ x: number; y: number }>>();
  for (const [id, node] of Object.entries(nodes).sort(([a], [b]) => a.localeCompare(b))) {
    const zoneId = id.split('-')[0]!;
    let cached = zoneCache.get(zoneId);
    if (!cached) {
      const map = originalZoneMap(zoneId);
      const accessible = originalReachableCells(map).visited;
      const candidates = Array.from({ length: map.width * map.height }, (_, index) => ({
        x: index % map.width,
        y: Math.floor(index / map.width),
      })).filter(
        ({ x, y }) =>
          originalWalkable(map, x, y) &&
          accessible.has(`${x},${y}`) &&
          [...map.exits, ...map.services].every((object) => Math.hypot(object.x - x, object.y - y) >= 2),
      );
      cached = candidates;
      zoneCache.set(zoneId, candidates);
    }
    const prior = placedByZone.get(zoneId) ?? [];
    const candidates = [...cached].sort(
      (a, b) =>
        Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y) ||
        a.y - b.y ||
        a.x - b.x,
    );
    const position = candidates.find((tile) =>
      prior.every((other) => Math.hypot(tile.x - other.x, tile.y - other.y) >= 3),
    );
    if (!position) throw new Error('CONTENT_REVIEW_REQUIRED');
    node.x = position.x;
    node.y = position.y;
    prior.push(position);
    placedByZone.set(zoneId, prior);
    const taken: Array<{ x: number; y: number }> = [];
    for (const piece of node.fragments) {
      const destination = candidates
        .filter(
          (tile) =>
            Math.hypot(tile.x - node.x, tile.y - node.y) <= 4 &&
            Math.hypot(tile.x - node.x, tile.y - node.y) >= 1,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - piece.x, a.y - piece.y) - Math.hypot(b.x - piece.x, b.y - piece.y) ||
            a.y - b.y ||
            a.x - b.x,
        )
        .find((tile) => taken.every((other) => Math.hypot(tile.x - other.x, tile.y - other.y) >= 1.5));
      if (!destination) throw new Error('CONTENT_REVIEW_REQUIRED');
      piece.x = destination.x;
      piece.y = destination.y;
      taken.push(destination);
    }
  }
  return nodes;
}

/** No mutation or persistence: a complete proposed state is returned for review. */
export function previewOriginalConversion(source: PlayerState, requestId: string): OriginalState {
  assertReviewedCatalog();
  if (source.quantityVersion !== 2 || !source.saveGeneration || !source.world)
    throw new Error('CONTENT_REVIEW_REQUIRED');
  const state = structuredClone(source);
  const world = state.world!;
  const { firstShift: legacyQuest, ...baseState } = state;
  const { roc: legacyGroundVehicle, ...baseWorld } = world;
  const nodes = safeConvertedNodes(
    Object.fromEntries(
      Object.entries(world.nodes).map(([key, value]) => [
        nodeId(key),
        {
          ...value,
          id: nodeId(value.id),
          ore: mapped(minerals, value.ore),
          source: mapped(
            new Map([
              ['Hand', 'extract.x001'],
              ['Roc', 'extract.x002'],
            ]),
            value.source,
          ),
          fragments: value.fragments.map((piece) => ({ ...piece, id: nodeId(piece.id) })),
        },
      ]),
    ),
  );
  const original: OriginalState = {
    ...baseState,
    schemaVersion: 3,
    saveFormatVersion: 3,
    contentVersion: 4,
    revision: state.revision + 1,
    conversionReceipt: {
      version: 1,
      requestId,
      sourceRevision: state.revision,
      sourceGeneration: source.saveGeneration,
      sourceDigest: sourceDigest(source),
    },
    location: mapped(locations, state.location),
    currentShip: mapped(ships, state.currentShip),
    ships: objectKeys(state.ships as Record<string, number>, ships),
    equipment: objectKeys(state.equipment, equipment),
    positions: objectKeys(state.positions as Record<string, string>, ships, (location) =>
      mapped(locations, location),
    ),
    mining: objectKeys(
      state.mining as Record<string, OriginalInventory>,
      new Map([
        ['Hand', 'extract.x001'],
        ['Roc', 'extract.x002'],
        ['Prospector', 'extract.x003'],
        ['Mole', 'extract.x004'],
      ]),
      inventory,
    ),
    cargo: objectKeys(
      state.cargo as Record<string, { raw: OriginalInventory; refined: OriginalInventory }>,
      ships,
      (hold) => ({ raw: inventory(hold.raw), refined: processedInventory(hold.refined) }),
    ),
    orders: state.orders.map((order) => ({
      ...order,
      source: mapped(
        new Map([
          ['Hand', 'extract.x001'],
          ['Roc', 'extract.x002'],
          ['Prospector', 'extract.x003'],
          ['Mole', 'extract.x004'],
        ]),
        order.source,
      ),
      ore: mapped(minerals, order.ore),
      method: mapped(methods, order.method),
    })),
    refineryRates: objectKeys(state.refineryRates, methods),
    pending:
      state.pending?.kind === 'travel'
        ? {
            kind: 'travel',
            destination: mapped(locations, state.pending.destination),
            ship: mapped(ships, state.pending.ship),
            loadGroundVehicle: state.pending.roc,
            readyAt: state.pending.readyAt,
          }
        : state.pending?.kind === 'mine'
          ? {
              ...state.pending,
              source: mapped(
                new Map([
                  ['Hand', 'extract.x001'],
                  ['Roc', 'extract.x002'],
                  ['Prospector', 'extract.x003'],
                  ['Mole', 'extract.x004'],
                ]),
                state.pending.source,
              ),
              rewards: inventory(state.pending.rewards),
            }
          : null,
    quest: legacyQuest
      ? {
          ...legacyQuest,
          id: finalMapping.quest.originalStableIdentifier,
          unlockedQuests: legacyQuest.unlockedQuests.map(() => 'quest.q002'),
        }
      : undefined,
    world: {
      ...baseWorld,
      zone: mapped(zones, world.zone),
      entry: entryId(world.entry),
      nodes,
      scanner: {
        ...world.scanner,
        analyzed: world.scanner.analyzed.map(nodeId),
        scannedZones: world.scanner.scannedZones?.map((zone) => mapped(zones, zone)),
      },
      miningSession: world.miningSession
        ? {
            ...world.miningSession,
            nodeId: nodeId(world.miningSession.nodeId),
            source: mapped(
              new Map([
                ['Hand', 'extract.x001'],
                ['Roc', 'extract.x002'],
              ]),
              world.miningSession.source,
            ),
          }
        : null,
      groundVehicle: legacyGroundVehicle
        ? { ...legacyGroundVehicle, zone: mapped(zones, legacyGroundVehicle.zone) }
        : null,
      departure: world.departure
        ? {
            ship: mapped(ships, world.departure.ship),
            destination: mapped(locations, world.departure.destination),
            loadGroundVehicle: world.departure.loadRoc,
          }
        : null,
      minorRemainders: world.minorRemainders
        ? objectKeys(
            world.minorRemainders as Record<string, OriginalInventory>,
            new Map([
              ['Hand', 'extract.x001'],
              ['Roc', 'extract.x002'],
            ]),
            inventory,
          )
        : undefined,
    },
  };
  const checked = originalStateSchema.safeParse(original);
  if (!checked.success) throw new Error('CONTENT_REVIEW_REQUIRED');
  return checked.data as OriginalState;
}

/** Synthetic/staging test only. The caller supplies the source fixture; no live snapshot store is added. */
export function restoreSyntheticSource(original: OriginalState, sourceFixture: PlayerState): PlayerState {
  if (
    original.conversionReceipt.sourceDigest !== sourceDigest(sourceFixture) ||
    original.saveGeneration !== sourceFixture.saveGeneration
  )
    throw new Error('CONTENT_REVIEW_REQUIRED');
  return structuredClone(sourceFixture);
}

/** Internal, transient compatibility view for the legacy action engine; never persist its result. */
export function decodeOriginalForAction(input: unknown): PlayerState {
  const state = originalStateSchema.parse(input);
  if (
    state.world.extractionSession ||
    state.world.miningSession?.zone ||
    Object.values(state.world.nodes).some((node) => node.status === 'DESTROYED')
  )
    throw new Error('CONTENT_REVIEW_REQUIRED');
  const {
    quest,
    conversionReceipt: _receipt,
    contentVersion: _content,
    saveFormatVersion: _format,
    schemaVersion: _schema,
    world,
    ...base
  } = state;
  void _receipt;
  void _content;
  void _format;
  void _schema;
  const { groundVehicle, ...baseWorld } = world;
  const oldInventory = (hold: Record<string, number | undefined>) => objectKeys(hold, oldMinerals);
  const oldRefined = (hold: Record<string, number | undefined>) => objectKeys(hold, oldProcessedMinerals);
  const nodes = Object.fromEntries(
    Object.entries(world.nodes).map(([key, node]) => [
      oldNodeId(key),
      {
        ...node,
        id: oldNodeId(node.id),
        ore: mapped(oldMinerals, node.ore),
        source: mapped(oldExtraction, node.source),
        fragments: node.fragments.map((piece) => ({ ...piece, id: oldNodeId(piece.id) })),
      },
    ]),
  );
  const legacy = {
    ...base,
    schemaVersion: 2,
    location: mapped(oldLocations, state.location),
    currentShip: mapped(oldShips, state.currentShip),
    ships: objectKeys(state.ships, oldShips),
    equipment: objectKeys(state.equipment, oldEquipment),
    positions: objectKeys(state.positions, oldShips, (location) => mapped(oldLocations, location)),
    mining: objectKeys(state.mining, oldExtraction, oldInventory),
    cargo: objectKeys(state.cargo, oldShips, (hold) => ({
      raw: oldInventory(hold.raw),
      refined: oldRefined(hold.refined),
    })),
    orders: state.orders.map((order) => ({
      ...order,
      source: mapped(oldExtraction, order.source),
      ore: mapped(oldMinerals, order.ore),
      method: mapped(oldMethods, order.method),
    })),
    refineryRates: objectKeys(state.refineryRates, oldMethods),
    pending:
      state.pending?.kind === 'travel'
        ? {
            kind: 'travel',
            destination: mapped(oldLocations, state.pending.destination),
            ship: mapped(oldShips, state.pending.ship),
            roc: state.pending.loadGroundVehicle,
            readyAt: state.pending.readyAt,
          }
        : state.pending?.kind === 'mine'
          ? {
              ...state.pending,
              source: mapped(oldExtraction, state.pending.source),
              rewards: oldInventory(state.pending.rewards),
            }
          : null,
    firstShift: quest
      ? { ...quest, id: 'first-shift', unlockedQuests: quest.unlockedQuests.map(() => 'lyria-next-shift') }
      : undefined,
    world: {
      ...baseWorld,
      zone: mapped(oldZones, world.zone),
      entry: world.entry.startsWith('from:') ? `from:${mapped(oldZones, world.entry.slice(5))}` : world.entry,
      nodes,
      scanner: {
        ...world.scanner,
        analyzed: world.scanner.analyzed.map(oldNodeId),
        scannedZones: world.scanner.scannedZones?.map((zone) => mapped(oldZones, zone)),
      },
      miningSession: world.miningSession
        ? {
            ...world.miningSession,
            nodeId: oldNodeId(world.miningSession.nodeId),
            source: mapped(oldExtraction, world.miningSession.source),
          }
        : null,
      roc: groundVehicle ? { ...groundVehicle, zone: mapped(oldZones, groundVehicle.zone) } : null,
      departure: world.departure
        ? {
            ship: mapped(oldShips, world.departure.ship),
            destination: mapped(oldLocations, world.departure.destination),
            loadRoc: world.departure.loadGroundVehicle,
          }
        : null,
      minorRemainders: world.minorRemainders
        ? objectKeys(world.minorRemainders, oldExtraction, oldInventory)
        : undefined,
    },
  };
  return stateSchema.parse(legacy);
}
