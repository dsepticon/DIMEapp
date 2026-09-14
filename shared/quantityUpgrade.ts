import type { Inventory, PlayerState } from './schema';
import { wholeCscuToMinor } from './mineralUnits';

export const RATE_SCALE = 1_000_000;

function upgradeInventory(inventory: Inventory, remainders: Inventory = {}): Inventory {
  const result: Inventory = {};
  for (const [ore, whole] of Object.entries(inventory)) {
    const minor = wholeCscuToMinor(whole ?? 0) + (remainders[ore as keyof Inventory] ?? 0);
    if (!Number.isSafeInteger(minor)) throw new RangeError('Mineral quantity exceeds safe integer range.');
    result[ore as keyof Inventory] = minor;
  }
  for (const [ore, minor] of Object.entries(remainders))
    if (!(ore in result)) result[ore as keyof Inventory] = minor ?? 0;
  return result;
}

function upgradeRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) throw new RangeError('Invalid legacy refinery rate.');
  return Math.round(rate * RATE_SCALE);
}

/** The only old-save scale boundary. Quest counters stay historical whole cSCU. */
export function upgradeWholeCscuSave(previous: PlayerState): PlayerState {
  if (previous.quantityVersion === 2) return previous;
  const state = structuredClone(previous);
  for (const source of Object.keys(state.mining) as (keyof PlayerState['mining'])[])
    state.mining[source] = upgradeInventory(
      state.mining[source],
      source === 'Hand' || source === 'Roc' ? state.world?.minorRemainders?.[source] : undefined,
    );
  for (const hold of Object.values(state.cargo)) {
    if (!hold) continue;
    hold.raw = upgradeInventory(hold.raw);
    hold.refined = upgradeInventory(hold.refined);
  }
  for (const order of state.orders) {
    order.rawUnits = wholeCscuToMinor(order.rawUnits);
    order.refinedUnits = wholeCscuToMinor(order.refinedUnits);
  }
  if (state.pending?.kind === 'mine') state.pending.rewards = upgradeInventory(state.pending.rewards);
  for (const rate of Object.values(state.refineryRates)) {
    rate.yield = upgradeRate(rate.yield);
    rate.cost = upgradeRate(rate.cost);
    rate.time = upgradeRate(rate.time);
  }
  if (state.world) delete state.world.minorRemainders;
  state.walletRemainder = 0;
  state.quantityVersion = 2;
  return state;
}
