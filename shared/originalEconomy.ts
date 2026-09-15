import { ORIGINAL_CONTENT } from './originalCatalog';
import { MINOR_PER_CSCU, MINOR_PER_SCU, settleSale } from './mineralUnits';
import { originalStateSchema, type OriginalPlayerState } from './originalSchema';
import { RATE_SCALE } from './quantityUpgrade';

type RawId = keyof OriginalPlayerState['mining']['extract.x001'];
type ExtractionId = keyof OriginalPlayerState['mining'];
type FleetId = keyof OriginalPlayerState['ships'];
type ProcessId = keyof OriginalPlayerState['refineryRates'];
const total = (hold: Record<string, number | undefined>) =>
  Object.values(hold).reduce<number>((sum, units) => sum + (units ?? 0), 0);
const positive = (units: number) => {
  if (!Number.isSafeInteger(units) || units <= 0) throw new Error('INVALID_QUANTITY');
};
const mineral = (id: string) => {
  const value = ORIGINAL_CONTENT.minerals.find((item) => item.id === id);
  if (!value) throw new Error('UNKNOWN_MATERIAL');
  return value;
};
const process = (id: string) => {
  const value = ORIGINAL_CONTENT.refineryMethods.find((item) => item.id === id);
  if (!value) throw new Error('UNKNOWN_PROCESS');
  return value;
};
const fleet = (id: string) => {
  const value = ORIGINAL_CONTENT.shipsAndVehicles.find((item) => item.id === id);
  if (!value) throw new Error('UNKNOWN_FLEET_ASSET');
  return value;
};
const zoneHas = (state: OriginalPlayerState, kind: string) =>
  (
    ORIGINAL_CONTENT.zones.find((zone) => zone.id === state.world.zone)?.objectKinds as
      | readonly string[]
      | undefined
  )?.includes(kind) ?? false;
const shipHold = (state: OriginalPlayerState, id: FleetId) => {
  const asset = fleet(id);
  if (!asset.cargoRole || (state.ships[id] ?? 0) < 1 || state.positions[id] !== state.location)
    throw new Error('CARGO_SHIP_UNAVAILABLE');
  return state.cargo[id] ?? (state.cargo[id] = { raw: {}, refined: {} });
};
const extractionCapacity = (source: ExtractionId) => {
  if (source === 'extract.x001') return 12 * MINOR_PER_CSCU;
  if (source === 'extract.x002') return 80 * MINOR_PER_CSCU;
  const ship = source === 'extract.x003' ? 'fleet.v003' : 'fleet.v004';
  return (fleet(ship).capacityCscu ?? 0) * MINOR_PER_CSCU;
};
const sourceAvailable = (state: OriginalPlayerState, source: ExtractionId) => {
  if (source === 'extract.x001') return;
  const ship =
    source === 'extract.x002' ? 'fleet.v002' : source === 'extract.x003' ? 'fleet.v003' : 'fleet.v004';
  if ((state.ships[ship] ?? 0) < 1 || state.positions[ship] !== state.location)
    throw new Error('EXTRACTION_HOLD_UNAVAILABLE');
};
const consume = (hold: Record<string, number | undefined>, id: string, units: number) => {
  positive(units);
  if ((hold[id] ?? 0) < units) throw new Error('INSUFFICIENT_CARGO');
  hold[id] = (hold[id] ?? 0) - units;
};

export function originalRefineryQuote(state: OriginalPlayerState, processId: ProcessId, units: number) {
  positive(units);
  const method = process(processId);
  const rates = state.refineryRates[processId];
  if (!rates) throw new Error('UNKNOWN_PROCESS');
  const [fixedCost, variableCost] = { High: [120, 200], Medium: [60, 120], Low: [20, 60] }[
    method.profile.cost
  ];
  const [fixedTime, variableTime] = { Short: [2, 5], Medium: [4, 8], Long: [8, 16] }[method.profile.time];
  const scale = BigInt(MINOR_PER_SCU) * BigInt(RATE_SCALE);
  const round = (numerator: bigint) => Number((numerator + scale / 2n) / scale);
  return {
    cost: round(
      (BigInt(fixedCost * MINOR_PER_SCU) + BigInt(variableCost) * BigInt(units)) * BigInt(rates.cost),
    ),
    duration: Math.max(
      1000,
      round((BigInt(fixedTime * MINOR_PER_SCU) + BigInt(variableTime) * BigInt(units)) * BigInt(rates.time)) *
        1000,
    ),
    refinedUnits: Number((BigInt(units) * BigInt(rates.yield)) / BigInt(RATE_SCALE)),
  };
}

export function transferOriginalMineral(
  sourceState: OriginalPlayerState,
  source: ExtractionId,
  materialId: RawId,
  shipId: FleetId,
  units: number,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(sourceState));
  sourceAvailable(state, source);
  const hold = shipHold(state, shipId);
  if (total(hold.raw) + total(hold.refined) + units > (fleet(shipId).capacityCscu ?? 0) * MINOR_PER_CSCU)
    throw new Error('CARGO_CAPACITY');
  consume(state.mining[source], materialId, units);
  hold.raw[materialId] = (hold.raw[materialId] ?? 0) + units;
  state.revision++;
  return originalStateSchema.parse(state);
}

export function startOriginalRefinery(
  sourceState: OriginalPlayerState,
  source: ExtractionId,
  materialId: RawId,
  processId: ProcessId,
  units: number,
  requestId: string,
  now: number,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(sourceState));
  const item = mineral(materialId);
  if (
    !zoneHas(state, 'refinery') ||
    !item.refinable ||
    (source !== 'extract.x003' && source !== 'extract.x004')
  )
    throw new Error('PROCESSING_NOT_COMPATIBLE');
  sourceAvailable(state, source);
  const quote = originalRefineryQuote(state, processId, units);
  if (quote.refinedUnits <= 0 || state.wallet < quote.cost) throw new Error('PROCESSING_UNAVAILABLE');
  consume(state.mining[source], materialId, units);
  state.wallet -= quote.cost;
  state.orders.push({
    id: requestId,
    source,
    ore: materialId,
    method: processId,
    rawUnits: units,
    refinedUnits: quote.refinedUnits,
    cost: quote.cost,
    createdAt: now,
    readyAt: now + quote.duration,
  });
  state.revision++;
  return originalStateSchema.parse(state);
}

export function collectOriginalOrder(
  sourceState: OriginalPlayerState,
  orderId: string,
  shipId: FleetId,
  now: number,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(sourceState));
  if (!zoneHas(state, 'refinery')) throw new Error('PROCESSING_UNAVAILABLE');
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || now < order.readyAt || !mineral(order.ore).refinable) throw new Error('ORDER_UNAVAILABLE');
  const hold = shipHold(state, shipId);
  const available =
    (fleet(shipId).capacityCscu ?? 0) * MINOR_PER_CSCU - total(hold.raw) - total(hold.refined);
  const quantity = Math.min(available, order.refinedUnits);
  if (quantity <= 0) throw new Error('CARGO_CAPACITY');
  const processedId = `${order.ore}.processed` as keyof typeof hold.refined;
  hold.refined[processedId] = (hold.refined[processedId] ?? 0) + quantity;
  order.refinedUnits -= quantity;
  if (order.refinedUnits === 0) state.orders = state.orders.filter((item) => item.id !== orderId);
  state.revision++;
  return originalStateSchema.parse(state);
}

export function sellOriginalMineral(
  sourceState: OriginalPlayerState,
  shipId: FleetId,
  materialId: RawId,
  category: 'raw' | 'refined',
  units: number,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(sourceState));
  if (!zoneHas(state, 'market')) throw new Error('MARKET_UNAVAILABLE');
  const item = mineral(materialId);
  const price = category === 'raw' ? item.rawPricePerScu : item.processedPricePerScu;
  if (price <= 0 || (category === 'raw' && !item.rawSale)) throw new Error('MATERIAL_NOT_SALEABLE');
  const hold = shipHold(state, shipId);
  const inventory = category === 'raw' ? hold.raw : hold.refined;
  const inventoryId = category === 'raw' ? materialId : `${materialId}.processed`;
  consume(inventory, inventoryId, units);
  const settlement = settleSale(units, price, state.walletRemainder ?? 0);
  state.wallet += settlement.credit;
  state.walletRemainder = settlement.remainder;
  state.revision++;
  return originalStateSchema.parse(state);
}

export function assertOriginalCapacity(state: OriginalPlayerState, source: ExtractionId) {
  if (total(state.mining[source]) > extractionCapacity(source)) throw new Error('EXTRACTION_CAPACITY');
}
