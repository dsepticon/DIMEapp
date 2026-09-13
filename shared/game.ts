import {
  ASTEROIDS,
  CAPACITIES,
  EQUIPMENT,
  METHODS,
  METHOD_NAMES,
  ORES,
  SHIP_PRICES,
  TRAVEL,
} from './catalog';
import { Action, GameError, Inventory, MiningType, Ore, PlayerState, Ship, stateSchema } from './schema';
import { applyFirstShift, HAND_TOOL } from './firstShift';
export const total = (inventory: Inventory) =>
  Object.values(inventory).reduce((sum, value) => sum + (value ?? 0), 0);
export const scu = (value: number) => (value / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
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
        { yield: (low + random() * 20) / 100, cost: 0.75 + random() * 0.5, time: 0.75 + random() * 0.5 },
      ];
    }),
  ) as PlayerState['refineryRates'];
  return {
    schemaVersion: 2,
    revision: 0,
    wallet: 0,
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
  assert(Number.isSafeInteger(count) && count > 0, 'Quantity must be a positive whole number of cSCU.');
  assert((inventory[ore] ?? 0) >= count, 'Insufficient cargo.', 'INSUFFICIENT_CARGO');
  inventory[ore] = (inventory[ore] ?? 0) - count;
}
function add(inventory: Inventory, ore: Ore, count: number) {
  inventory[ore] = (inventory[ore] ?? 0) + count;
}
export function refineryQuote(state: PlayerState, method: keyof typeof METHODS, count: number) {
  const m = METHODS[method],
    rates = state.refineryRates[method],
    quantity = count / 100;
  const baseCost = { High: 120 + quantity * 200, Medium: 60 + quantity * 120, Low: 20 + quantity * 60 }[
    m.cost
  ];
  const baseTime = { Short: 2 + quantity * 5, Medium: 4 + quantity * 8, Long: 8 + quantity * 16 }[m.time];
  return {
    cost: Math.round(baseCost * rates.cost),
    duration: Math.max(1000, Math.round(baseTime * rates.time) * 1000),
    refinedUnits: Math.floor(count * rates.yield),
  };
}
function miningReward(source: MiningType, random: () => number): Inventory {
  if (source === 'Hand' || source === 'Roc') {
    const roll = random();
    const ore: Ore =
      roll < 0.5
        ? 'Dolivine'
        : roll < 0.8
          ? 'Aphorite'
          : roll < 0.99 || source === 'Roc'
            ? 'Hadanite'
            : 'Janalite';
    return { [ore]: source === 'Hand' ? 1 + Math.floor(random() * 5) : 8 + Math.floor(random() * 56) };
  }
  const pools = Object.values(ASTEROIDS);
  const available = [...pools[Math.floor(random() * pools.length)]];
  const rewards: Inventory = {};
  let remaining = (8 + Math.floor(random() * (source === 'Mole' ? 89 : 25))) * 100;
  const count = 2 + Math.floor(random() * 2);
  for (let i = 0; i < count; i++) {
    let roll = random() * available.reduce((n, ore) => n + ore.weight, 0);
    const index = available.findIndex((ore) => (roll -= ore.weight) < 0);
    const selected = available.splice(Math.max(0, index), 1)[0];
    const quantity =
      i === count - 1
        ? remaining
        : Math.min(remaining, (1 + Math.floor(random() * Math.max(1, remaining / 100 - 1))) * 100);
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
  if (action.type === 'finish') {
    assert(state.pending, 'No active operation.');
    assert(state.pending.readyAt <= now, 'This operation is not complete.', 'NOT_READY');
    if (state.pending.kind === 'travel') {
      state.location = state.pending.destination;
      state.currentShip = state.pending.ship;
      state.positions[state.pending.ship] = state.location;
      if (state.pending.roc) state.positions.Roc = state.location;
    } else {
      const { source, rewards } = state.pending;
      let room = CAPACITIES[source] - total(state.mining[source]);
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
      case 'firstShift':
        assert(
          action.step === 'mineDolivine' ? action.depositId === 'dolivine' : action.depositId === undefined,
          'Invalid assigned deposit.',
        );
        applyFirstShift(state, action.step, now, id);
        break;
      case 'travel': {
        const { ship, destination, loadRoc } = action;
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
        break;
      }
      case 'mine': {
        const { source, head, crew } = action;
        assert(
          source === 'Hand' || source === 'Roc'
            ? ['Lyria', 'Wala'].includes(state.location)
            : state.location === 'Halo',
          'Select an eligible mining claim.',
        );
        sourceHere(state, source);
        assert(total(state.mining[source]) < CAPACITIES[source], 'Mining hold is full.');
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
      case 'transfer': {
        sourceHere(state, action.source);
        const hold = cargo(state, action.ship);
        assert(
          total(hold.raw) + total(hold.refined) + action.units <= CAPACITIES[action.ship],
          'Cargo ship has insufficient capacity.',
        );
        consume(state.mining[action.source], action.ore, action.units);
        add(hold.raw, action.ore, action.units);
        break;
      }
      case 'refine': {
        assert(state.location === 'ARC-L1', 'Refining is available at ARC-L1.');
        assert(
          ['Prospector', 'Mole'].includes(action.source) && !ORES[action.ore].gem,
          'Only raw ship-mined ore can be refined.',
        );
        sourceHere(state, action.source);
        assert(state.orders.length < 100, 'Collect existing work orders first.');
        const quote = refineryQuote(state, action.method, action.units);
        assert(quote.refinedUnits > 0, 'The quantity is too small to refine.');
        assert(state.wallet >= quote.cost, 'Insufficient wallet balance.', 'INSUFFICIENT_FUNDS');
        consume(state.mining[action.source], action.ore, action.units);
        state.wallet -= quote.cost;
        state.orders.push({
          id,
          source: action.source,
          ore: action.ore,
          method: action.method,
          rawUnits: action.units,
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
        assert(now >= order.readyAt, 'Order is still processing.', 'NOT_READY');
        const hold = cargo(state, action.ship);
        const quantity = Math.min(
          order.refinedUnits,
          CAPACITIES[action.ship] - total(hold.raw) - total(hold.refined),
        );
        assert(quantity > 0, 'Cargo ship is full.');
        add(hold.refined, order.ore, quantity);
        order.refinedUnits -= quantity;
        if (order.refinedUnits === 0) state.orders = state.orders.filter((o) => o.id !== order.id);
        break;
      }
      case 'sell': {
        const hold = cargo(state, action.ship);
        const ore = ORES[action.ore];
        assert(
          state.location === (action.category === 'refined' || ore.gem ? 'Area-18' : 'ARC-L1'),
          'This material cannot be sold here.',
        );
        const price = action.category === 'raw' ? ore.raw : ore.refined;
        assert(price > 0, 'This material has no sale price.');
        const proceeds = Math.round((action.units * price) / 100);
        assert(proceeds > 0, 'Quantity is too small to sell.');
        consume(hold[action.category], action.ore, action.units);
        state.wallet += proceeds;
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
