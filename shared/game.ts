import {
  ASTEROIDS,
  CAPACITIES,
  EQUIPMENT,
  GEM_SPAWN_WEIGHTS,
  METHODS,
  METHOD_NAMES,
  rawMineral,
  refinedMineral,
  SHIP_PRICES,
  TRAVEL,
} from './catalog';
import { Action, GameError, Inventory, MiningType, Ore, PlayerState, Ship, stateSchema } from './schema';
import { applyFirstShift, HAND_TOOL } from './firstShift';
import { formatScuMinor, MINOR_PER_SCU, settleSale, wholeCscuToMinor } from './mineralUnits';
import { DEPARTURE_POINTS, LEGACY_ZONE, START_ZONE, ZONES, zoneForSave } from './world';
import { fracturePieces, generatedNodes, laserRules, NODE_RESPAWN_MS } from './miningWorld';
import { RATE_SCALE } from './quantityUpgrade';
export const total = (inventory: Inventory) =>
  Object.values(inventory).reduce((sum, value) => sum + (value ?? 0), 0);
export const miningOccupiedMinor = (state: PlayerState, source: MiningType) => total(state.mining[source]);
export const scu = formatScuMinor;
const assert: (condition: unknown, message: string, code?: string) => asserts condition = (
  condition,
  message,
  code = 'INVALID_ACTION',
) => {
  if (!condition) throw new GameError(code, message);
};
export function initialState(random: () => number = Math.random): PlayerState {
  const refineryRates = Object.fromEntries(
    METHOD_NAMES.map((name) => {
      const m = METHODS[name];
      const low = { Low: 30, Medium: 50, High: 70 }[m.yield];
      return [
        name,
        {
          yield: low * 10_000 + Math.floor(random() * 200_001),
          cost: 750_000 + Math.floor(random() * 500_001),
          time: 750_000 + Math.floor(random() * 500_001),
        },
      ];
    }),
  ) as PlayerState['refineryRates'];
  return {
    schemaVersion: 2,
    quantityVersion: 2,
    revision: 0,
    wallet: 0,
    walletRemainder: 0,
    location: 'ARC-L1',
    currentShip: 'Nomad',
    ships: { Nomad: 1 },
    positions: { Nomad: 'ARC-L1' },
    equipment: { [HAND_TOOL]: 1 },
    mining: { Hand: {}, Roc: {}, Prospector: {}, Mole: {} },
    cargo: { Nomad: { raw: {}, refined: {} } },
    orders: [],
    pending: null,
    refineryRates,
    world: {
      zone: START_ZONE,
      entry: 'arrival',
      nodes: {},
      scanner: { pings: 0, analyses: 0, analyzed: [], scannedZones: [] },
      miningSession: null,
      roc: null,
      departure: null,
    },
  };
}
function owned(state: PlayerState, ship: Ship) {
  assert((state.ships[ship] ?? 0) > 0, 'You do not own this ship.');
}
function localShip(state: PlayerState, ship: Ship) {
  owned(state, ship);
  assert(state.positions[ship] === state.location, 'The ship must be at your location.');
}
function sourceHere(state: PlayerState, source: MiningType) {
  if (source !== 'Hand') localShip(state, source);
}
function cargo(state: PlayerState, ship: Ship) {
  assert(!['Roc', 'Prospector', 'Mole'].includes(ship), 'Select a cargo ship.');
  localShip(state, ship);
  return state.cargo[ship] ?? (state.cargo[ship] = { raw: {}, refined: {} });
}
function consume(inventory: Inventory, ore: Ore, count: number) {
  assert(Number.isSafeInteger(count) && count > 0, 'Quantity must be positive.');
  assert((inventory[ore] ?? 0) >= count, 'Insufficient cargo.', 'INSUFFICIENT_CARGO');
  inventory[ore] = (inventory[ore] ?? 0) - count;
}
function add(inventory: Inventory, ore: Ore, count: number) {
  inventory[ore] = (inventory[ore] ?? 0) + count;
}
export function refineryQuote(state: PlayerState, method: keyof typeof METHODS, count: number) {
  assert(state.quantityVersion === 2, 'Save quantity version needs conversion.', 'QUANTITY_VERSION_REQUIRED');
  const m = METHODS[method],
    rates = state.refineryRates[method];
  const [fixedCost, variableCost] = { High: [120, 200], Medium: [60, 120], Low: [20, 60] }[m.cost];
  const [fixedTime, variableTime] = { Short: [2, 5], Medium: [4, 8], Long: [8, 16] }[m.time];
  const scale = BigInt(MINOR_PER_SCU) * BigInt(RATE_SCALE);
  const round = (numerator: bigint) => Number((numerator + scale / 2n) / scale);
  return {
    cost: round(
      (BigInt(fixedCost * MINOR_PER_SCU) + BigInt(variableCost) * BigInt(count)) * BigInt(rates.cost),
    ),
    duration: Math.max(
      1000,
      round((BigInt(fixedTime * MINOR_PER_SCU) + BigInt(variableTime) * BigInt(count)) * BigInt(rates.time)) *
        1000,
    ),
    refinedUnits: Number((BigInt(count) * BigInt(rates.yield)) / BigInt(RATE_SCALE)),
  };
}
function miningReward(source: MiningType, random: () => number): Inventory {
  if (source === 'Hand' || source === 'Roc') {
    const roll = random();
    let cumulative = 0;
    const ore = (Object.entries(GEM_SPAWN_WEIGHTS[source]).find(
      ([, weight]) => roll < (cumulative += weight),
    )?.[0] ?? 'Hadanite') as Ore;
    return {
      [ore]: wholeCscuToMinor(
        source === 'Hand' ? 1 + Math.floor(random() * 5) : 8 + Math.floor(random() * 56),
      ),
    };
  }
  const pools = Object.values(ASTEROIDS);
  const available = [...pools[Math.floor(random() * pools.length)]];
  const rewards: Inventory = {};
  let remaining = (8 + Math.floor(random() * (source === 'Mole' ? 89 : 25))) * MINOR_PER_SCU;
  const count = 2 + Math.floor(random() * 2);
  for (let i = 0; i < count; i++) {
    let roll = random() * available.reduce((n, ore) => n + ore.weight, 0);
    const index = available.findIndex((ore) => (roll -= ore.weight) < 0);
    const selected = available.splice(Math.max(0, index), 1)[0];
    const quantity =
      i === count - 1
        ? remaining
        : Math.min(
            remaining,
            (1 + Math.floor(random() * Math.max(1, remaining / MINOR_PER_SCU - 1))) * MINOR_PER_SCU,
          );
    add(rewards, selected.ore as Ore, quantity);
    remaining -= quantity;
  }
  return rewards;
}
export function applyAction(
  previous: PlayerState,
  action: Action,
  now: number,
  id: string,
  random: () => number = Math.random,
): PlayerState {
  const state = structuredClone(previous);
  assert(state.quantityVersion === 2, 'Save quantity version needs conversion.', 'QUANTITY_VERSION_REQUIRED');
  if (action.type === 'finish') {
    assert(state.pending, 'No active operation.');
    assert(state.pending.readyAt <= now, 'This operation is not complete.', 'NOT_READY');
    if (state.pending.kind === 'travel') {
      state.location = state.pending.destination;
      state.currentShip = state.pending.ship;
      state.positions[state.pending.ship] = state.location;
      if (state.pending.roc) state.positions.Roc = state.location;
      const arrivalZone = LEGACY_ZONE[state.location];
      if (arrivalZone) {
        state.world = {
          ...(state.world ?? {
            nodes: {},
            scanner: { pings: 0, analyses: 0, analyzed: [] },
            miningSession: null,
            roc: null,
          }),
          zone: arrivalZone,
          entry: 'arrival',
          departure: null,
        };
      }
    } else {
      const { source, rewards } = state.pending;
      let room = wholeCscuToMinor(CAPACITIES[source]) - miningOccupiedMinor(state, source);
      for (const [ore, quantity] of Object.entries(rewards)) {
        const take = Math.min(room, quantity);
        if (take > 0) add(state.mining[source], ore as Ore, take);
        room -= take;
      }
    }
    state.pending = null;
  } else {
    assert(!state.pending, 'Finish the active operation first.', 'BUSY');
    switch (action.type) {
      case 'enterZone': {
        const active = zoneForSave(state.location, state.world?.zone);
        assert(active, 'Current world state needs recovery.', 'WORLD_RECOVERY_REQUIRED');
        const destination = ZONES[action.zone];
        assert(destination.location === state.location, 'Destination is in another location.');
        assert(
          active.exits.some((exit) => exit.to === action.zone),
          'No route to that zone.',
        );
        if (state.world?.roc?.occupied) {
          assert(!['lyriaCave', 'walaCave'].includes(destination.palette), 'The ROC cannot enter this cave.');
          state.world.roc.zone = destination.id;
        }
        state.world = {
          ...(state.world ?? {
            nodes: {},
            scanner: { pings: 0, analyses: 0, analyzed: [] },
            miningSession: null,
            roc: null,
          }),
          zone: destination.id,
          entry: `from:${active.id}`,
        };
        if (state.firstShift?.version === 3 && state.firstShift.status === 'ACTIVE') {
          if (
            state.firstShift.objective === 'ENTER_MINE' &&
            destination.regions.some((region) => region.source === 'Hand')
          )
            state.firstShift.objective = 'SCAN_ASSIGNED_NODE';
          else if (
            state.firstShift.objective === 'RETURN_TO_OUTPOST' &&
            destination.id === 'LYRIA_OUTPOST_01'
          )
            state.firstShift.objective = 'SELL_MINED_GEM';
        }
        break;
      }
      case 'scanZone': {
        const zone = zoneForSave(state.location, state.world?.zone);
        assert(zone && zone.regions.length > 0, 'Scanning requires a mining zone.');
        assert(state.world, 'World state needs recovery.', 'WORLD_RECOVERY_REQUIRED');
        state.world.scanner.pings += 1;
        if (!state.world.scanner.scannedZones?.includes(zone.id))
          state.world.scanner.scannedZones = [...(state.world.scanner.scannedZones ?? []), zone.id];
        if (
          state.firstShift?.version === 3 &&
          state.firstShift.status === 'ACTIVE' &&
          state.firstShift.objective === 'SCAN_ASSIGNED_NODE' &&
          zone.id === 'LYRIA_SURFACE_01'
        )
          state.firstShift.objective = 'ANALYZE_ASSIGNED_NODE';
        break;
      }
      case 'analyzeNode': {
        const zone = zoneForSave(state.location, state.world?.zone);
        assert(
          zone && state.world && state.world.scanner.scannedZones?.includes(zone.id),
          'Scan this zone first.',
        );
        const node = generatedNodes(state.saveGeneration ?? 'legacy', zone, state.world.nodes, now).find(
          (candidate) => candidate.id === action.nodeId,
        );
        assert(node && node.status === 'INTACT', 'Node is unavailable.', 'NODE_UNAVAILABLE');
        if (!state.world.scanner.analyzed.includes(node.id)) {
          state.world.scanner.analyzed.push(node.id);
          state.world.scanner.analyses += 1;
        }
        if (
          node.id === 'LYRIA_SURFACE_01-tutorial' &&
          state.firstShift?.version === 3 &&
          state.firstShift.objective === 'ANALYZE_ASSIGNED_NODE'
        )
          state.firstShift.objective = 'FRACTURE_ASSIGNED_NODE';
        break;
      }
      case 'beginFracture': {
        const zone = zoneForSave(state.location, state.world?.zone);
        assert(zone && state.world, 'World state needs recovery.', 'WORLD_RECOVERY_REQUIRED');
        const node = generatedNodes(state.saveGeneration ?? 'legacy', zone, state.world.nodes, now).find(
          (candidate) => candidate.id === action.nodeId,
        );
        assert(
          node && node.status === 'INTACT' && node.source === action.source,
          'Node is unavailable.',
          'NODE_UNAVAILABLE',
        );
        assert(state.world.scanner.analyzed.includes(node.id), 'Analyze the node first.');
        assert(!state.world.miningSession, 'Finish the active fracture first.', 'BUSY');
        if (action.source === 'Hand')
          assert((state.equipment[HAND_TOOL] ?? 0) > 0, 'Basic Mining Tool is required.');
        else
          assert(
            state.world.roc?.active && state.world.roc.occupied && state.world.roc.zone === zone.id,
            'Retrieve and enter your owned ROC first.',
          );
        state.world.miningSession = { nodeId: node.id, startedAt: now, source: node.source };
        break;
      }
      case 'completeFracture': {
        const zone = zoneForSave(state.location, state.world?.zone);
        assert(zone && state.world, 'World state needs recovery.', 'WORLD_RECOVERY_REQUIRED');
        const session = state.world.miningSession;
        assert(session?.nodeId === action.nodeId, 'No matching fracture session.');
        const node = generatedNodes(state.saveGeneration ?? 'legacy', zone, state.world.nodes, now).find(
          (candidate) => candidate.id === action.nodeId,
        );
        assert(node && node.status === 'INTACT', 'Node is unavailable.', 'NODE_UNAVAILABLE');
        assert(
          now - session.startedAt >= laserRules(node).requiredSeconds * 1000,
          'Keep the laser stable for the required duration.',
          'NOT_READY',
        );
        state.world.nodes[node.id] = { ...node, status: 'FRACTURED', fragments: fracturePieces(node, zone) };
        state.world.miningSession = null;
        if (
          node.id === 'LYRIA_SURFACE_01-tutorial' &&
          state.firstShift?.version === 3 &&
          state.firstShift.objective === 'FRACTURE_ASSIGNED_NODE'
        )
          state.firstShift.objective = 'COLLECT_ASSIGNED_GEMS';
        break;
      }
      case 'cancelFracture': {
        assert(state.world?.miningSession?.nodeId === action.nodeId, 'No matching fracture session.');
        state.world.miningSession = null;
        break;
      }
      case 'collectPiece': {
        const zone = zoneForSave(state.location, state.world?.zone);
        assert(zone && state.world, 'World state needs recovery.', 'WORLD_RECOVERY_REQUIRED');
        const node = state.world.nodes[action.nodeId];
        assert(
          node && node.status === 'FRACTURED' && node.id.startsWith(`${zone.id}-`),
          'No fractured node here.',
          'NODE_UNAVAILABLE',
        );
        const piece = node.fragments.find((part) => part.id === action.pieceId);
        assert(piece && !piece.collected, 'This fragment was already collected.', 'PIECE_COLLECTED');
        const occupiedMinor = miningOccupiedMinor(state, node.source);
        assert(
          occupiedMinor + piece.units <= wholeCscuToMinor(CAPACITIES[node.source]),
          'Mining hold is full.',
          'INSUFFICIENT_CAPACITY',
        );
        add(state.mining[node.source], node.ore, piece.units);
        piece.collected = true;
        if (
          node.id === 'LYRIA_SURFACE_01-tutorial' &&
          state.firstShift?.version === 3 &&
          state.firstShift.objective === 'COLLECT_ASSIGNED_GEMS'
        ) {
          if (node.fragments.every((part) => part.collected)) {
            state.firstShift.counters.mined = 4;
            state.firstShift.objective = 'RETURN_TO_OUTPOST';
          }
        }
        if (node.fragments.every((part) => part.collected)) {
          node.status = 'DEPLETED';
          node.respawnAt = now + NODE_RESPAWN_MS;
        }
        break;
      }
      case 'retrieveRoc': {
        assert(
          state.world && ['LYRIA_ASOP', 'WALA_ASOP'].includes(state.world.zone),
          'Use a moon vehicle terminal.',
        );
        assert(
          (state.ships.Roc ?? 0) > 0 && state.positions.Roc === state.location,
          'You do not have an owned ROC here.',
        );
        assert(!state.world.roc?.active, 'Your ROC is already retrieved.');
        state.world.roc = { zone: state.world.zone, active: true, occupied: false };
        break;
      }
      case 'enterRoc': {
        assert(
          state.world?.roc?.active && state.world.roc.zone === state.world.zone,
          'Retrieve your ROC in this zone first.',
        );
        state.world.roc.occupied = action.occupied;
        break;
      }
      case 'stowRoc': {
        assert(state.world?.roc?.active && !state.world.roc.occupied, 'Exit your ROC before storing it.');
        state.world.roc = null;
        break;
      }
      case 'firstShift':
        assert(
          action.step === 'mineDolivine' ? action.depositId === 'dolivine' : action.depositId === undefined,
          'Invalid assigned deposit.',
        );
        applyFirstShift(state, action.step, now);
        break;
      case 'travel': {
        const { ship, destination, loadRoc } = action;
        assert(
          state.world?.zone === DEPARTURE_POINTS[state.location].point,
          'Reach the assigned departure point first.',
        );
        assert(
          state.world.departure?.ship === ship &&
            state.world.departure.destination === destination &&
            state.world.departure.loadRoc === loadRoc,
          'Confirm this trip at the local ship service first.',
        );
        assert(!state.world.roc?.active, 'Store your active ROC before departure.');
        assert(ship !== 'Roc', 'The ROC needs a carrier.');
        localShip(state, ship);
        assert(state.location === 'ARC-L1' || ship === state.currentShip, 'Change ships at ARC-L1.');
        assert(destination !== state.location, 'Already at that location.');
        const miningShip = ship === 'Prospector' || ship === 'Mole';
        assert(
          miningShip ? ['ARC-L1', 'Halo'].includes(destination) : destination !== 'Halo',
          'This ship cannot use that flight path.',
        );
        assert(
          !loadRoc ||
            (ship === 'Nomad' && (state.ships.Roc ?? 0) > 0 && state.positions.Roc === state.location),
          'The owned ROC must be here to load into the Nomad.',
        );
        const destinationForTiming = destination === 'ARC-L1' ? state.location : destination;
        const duration = (TRAVEL[ship] - (['Lyria', 'Wala'].includes(destinationForTiming) ? 5 : 0)) * 1000;
        state.pending = { kind: 'travel', destination, ship, roc: loadRoc, readyAt: now + duration };
        state.world.departure = null;
        break;
      }
      case 'assignDeparture': {
        const { ship, destination, loadRoc } = action;
        assert(
          state.world?.zone === DEPARTURE_POINTS[state.location].service,
          'Reach the local ship service first.',
        );
        assert(!state.world.departure, 'Finish or cancel your assigned departure first.');
        assert(!state.world.roc?.active, 'Store your active ROC before assigning a ship.');
        assert(ship !== 'Roc', 'The ROC needs a carrier.');
        localShip(state, ship);
        assert(state.location === 'ARC-L1' || ship === state.currentShip, 'Change ships at ARC-L1.');
        assert(destination !== state.location, 'Already at that location.');
        const miningShip = ship === 'Prospector' || ship === 'Mole';
        assert(
          miningShip ? ['ARC-L1', 'Halo'].includes(destination) : destination !== 'Halo',
          'This ship cannot use that flight path.',
        );
        assert(
          !loadRoc ||
            (ship === 'Nomad' && (state.ships.Roc ?? 0) > 0 && state.positions.Roc === state.location),
          'The owned ROC must be here to load into the Nomad.',
        );
        state.world.departure = { ship, destination, loadRoc };
        break;
      }
      case 'cancelDeparture':
        assert(state.world?.departure, 'No departure assignment to cancel.');
        state.world.departure = null;
        break;
      case 'mine': {
        const { source, head, crew } = action;
        assert(
          source === 'Hand' || source === 'Roc'
            ? ['Lyria', 'Wala'].includes(state.location)
            : state.location === 'Halo',
          'Select an eligible mining claim.',
        );
        sourceHere(state, source);
        assert(
          miningOccupiedMinor(state, source) <= wholeCscuToMinor(CAPACITIES[source] - 1),
          'Mining hold is full.',
        );
        let seconds = source === 'Hand' ? 15 : 40;
        if (source === 'Prospector') {
          const heads: Record<string, number> = {
            'Arbor MH1': 120,
            'Hofstede S1': 90,
            'Impact I': 60,
            'Helix I': 45,
          };
          assert(Object.hasOwn(heads, head), 'Select a valid mining head.');
          assert(head === 'Arbor MH1' || (state.equipment[head] ?? 0) > 0, 'Mining head is not owned.');
          seconds = 10 + heads[head];
        }
        if (source === 'Mole') {
          const heads: Record<string, number> = {
            'Arbor MH2': 0,
            'Hofstede S2': 15,
            'Impact II': 20,
            'Helix II': 25,
          };
          const crews: Record<string, number> = { Terraphon: 5, Andirr: 5, Dora: 15 };
          assert(
            Object.hasOwn(heads, head) && (head === 'Arbor MH2' || (state.equipment[head] ?? 0) > 0),
            'Mining head is not owned.',
          );
          assert(Object.hasOwn(crews, crew) && (state.equipment[crew] ?? 0) > 0, 'Hire a crew member first.');
          const stations = [{ head, crew }, ...(action.extraStations ?? [])];
          const usedHeads: Record<string, number> = {},
            usedCrew: Record<string, number> = {};
          let reduction = 0;
          for (const station of stations) {
            assert(
              Object.hasOwn(heads, station.head) && Object.hasOwn(crews, station.crew),
              'Invalid mining station.',
            );
            usedHeads[station.head] = (usedHeads[station.head] ?? 0) + 1;
            usedCrew[station.crew] = (usedCrew[station.crew] ?? 0) + 1;
            assert(
              station.head === 'Arbor MH2' || usedHeads[station.head] <= (state.equipment[station.head] ?? 0),
              'Not enough owned mining heads.',
            );
            assert(usedCrew[station.crew] <= (state.equipment[station.crew] ?? 0), 'Not enough hired crew.');
            reduction += heads[station.head] + crews[station.crew];
          }
          seconds = 190 - reduction;
        }
        state.pending = {
          kind: 'mine',
          source,
          rewards: miningReward(source, random),
          readyAt: now + seconds * 1000,
        };
        break;
      }
      case 'transfer':
      case 'transferMinor': {
        const units = action.type === 'transfer' ? wholeCscuToMinor(action.units) : action.unitsMinor;
        sourceHere(state, action.source);
        const hold = cargo(state, action.ship);
        assert(
          total(hold.raw) + total(hold.refined) + units <= wholeCscuToMinor(CAPACITIES[action.ship]),
          'Cargo ship has insufficient capacity.',
        );
        consume(state.mining[action.source], action.ore, units);
        add(hold.raw, action.ore, units);
        break;
      }
      case 'refine':
      case 'refineMinor': {
        const units = action.type === 'refine' ? wholeCscuToMinor(action.units) : action.unitsMinor;
        assert(state.location === 'ARC-L1', 'Refining is available at ARC-L1.');
        assert(
          ['Prospector', 'Mole'].includes(action.source) && rawMineral(action.ore).refineryEligible,
          'Only raw ship-mined ore can be refined.',
        );
        sourceHere(state, action.source);
        assert(state.orders.length < 100, 'Collect existing work orders first.');
        const quote = refineryQuote(state, action.method, units);
        assert(quote.refinedUnits > 0, 'The quantity is too small to refine.');
        assert(state.wallet >= quote.cost, 'Insufficient wallet balance.', 'INSUFFICIENT_FUNDS');
        consume(state.mining[action.source], action.ore, units);
        state.wallet -= quote.cost;
        state.orders.push({
          id,
          source: action.source,
          ore: action.ore,
          method: action.method,
          rawUnits: units,
          refinedUnits: quote.refinedUnits,
          cost: quote.cost,
          createdAt: now,
          readyAt: now + quote.duration,
        });
        break;
      }
      case 'collect': {
        assert(state.location === 'ARC-L1', 'Collect orders at ARC-L1.');
        const order = state.orders.find((o) => o.id === action.orderId);
        assert(order, 'Order not found.', 'NOT_FOUND');
        assert(
          rawMineral(order.ore).refineryEligible,
          'Gems cannot be collected from a refinery order.',
          'GEM_NOT_REFINABLE',
        );
        assert(now >= order.readyAt, 'Order is still processing.', 'NOT_READY');
        const hold = cargo(state, action.ship);
        const quantity = Math.min(
          order.refinedUnits,
          wholeCscuToMinor(CAPACITIES[action.ship]) - total(hold.raw) - total(hold.refined),
        );
        assert(quantity > 0, 'Cargo ship is full.');
        add(hold.refined, order.ore, quantity);
        order.refinedUnits -= quantity;
        if (order.refinedUnits === 0) state.orders = state.orders.filter((o) => o.id !== order.id);
        break;
      }
      case 'sell':
      case 'sellMinor': {
        const units = action.type === 'sell' ? wholeCscuToMinor(action.units) : action.unitsMinor;
        const hold = cargo(state, action.ship);
        const raw = rawMineral(action.ore);
        const material = action.category === 'raw' ? raw : refinedMineral(action.ore);
        assert(
          material && (action.category !== 'raw' || material.rawSaleEligible),
          'This material has no sale price.',
        );
        assert(
          state.location === (action.category === 'refined' || raw.category === 'GEM' ? 'Area-18' : 'ARC-L1'),
          'This material cannot be sold here.',
        );
        const price = material.pricePerScu;
        assert(price > 0, 'This material has no sale price.');
        const settlement = settleSale(units, price, state.walletRemainder ?? 0);
        consume(hold[action.category], action.ore, units);
        state.wallet += settlement.credit;
        state.walletRemainder = settlement.remainder;
        break;
      }
      case 'sellItem': {
        assert(state.location === 'Area-18', 'The shop is at Area-18.');
        const equipment: Record<string, number> = EQUIPMENT;
        if (Object.hasOwn(SHIP_PRICES, action.item)) {
          const ship = action.item as Ship;
          owned(state, ship);
          assert(ship !== state.currentShip, 'Cannot sell the ship you are using.');
          assert(state.positions[ship] === 'ARC-L1', 'Store the ship at ARC-L1 before selling.');
          assert((state.ships[ship] ?? 0) >= action.quantity, 'Not enough ships owned.');
          const hold = state.cargo[ship];
          assert(!hold || total(hold.raw) + total(hold.refined) === 0, 'Empty the cargo before selling.');
          assert(
            !['Roc', 'Prospector', 'Mole'].includes(ship) || total(state.mining[ship as MiningType]) === 0,
            'Empty the mining hold before selling.',
          );
          state.ships[ship] = (state.ships[ship] ?? 0) - action.quantity;
          state.wallet += SHIP_PRICES[ship] * action.quantity;
        } else {
          assert(Object.hasOwn(equipment, action.item), 'Unknown shop item.');
          assert((state.equipment[action.item] ?? 0) >= action.quantity, 'Not enough equipment owned.');
          state.equipment[action.item] -= action.quantity;
          state.wallet += equipment[action.item] * action.quantity;
        }
        break;
      }
      case 'purchase': {
        assert(state.location === 'Area-18', 'The shop is at Area-18.');
        const equipment: Record<string, number> = EQUIPMENT;
        const price = Object.hasOwn(SHIP_PRICES, action.item)
          ? SHIP_PRICES[action.item]
          : Object.hasOwn(equipment, action.item)
            ? equipment[action.item]
            : 0;
        assert(price > 0, 'Unknown shop item.');
        const cost = price * action.quantity;
        assert(state.wallet >= cost, 'Insufficient wallet balance.', 'INSUFFICIENT_FUNDS');
        const ownedCount = Object.hasOwn(SHIP_PRICES, action.item)
          ? (state.ships[action.item as Ship] ?? 0)
          : (state.equipment[action.item] ?? 0);
        assert(ownedCount + action.quantity <= 100, 'Ownership limit reached.');
        state.wallet -= cost;
        if (Object.hasOwn(SHIP_PRICES, action.item)) {
          const ship = action.item as Ship;
          state.ships[ship] = (state.ships[ship] ?? 0) + action.quantity;
          state.positions[ship] ??= 'ARC-L1';
          if (!['Roc', 'Prospector', 'Mole'].includes(ship)) state.cargo[ship] ??= { raw: {}, refined: {} };
        } else state.equipment[action.item] = (state.equipment[action.item] ?? 0) + action.quantity;
        break;
      }
    }
  }
  assert(state.wallet <= 1_000_000_000_000, 'Wallet limit reached.');
  state.revision++;
  return stateSchema.parse(state);
}
