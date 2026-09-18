import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import {
  collectOriginalOrder,
  originalRefineryQuote,
  sellOriginalMineral,
  startOriginalRefinery,
  transferOriginalMineral,
} from '../shared/originalEconomy';
import { serviceInventory, salePreview } from '../app/original/serviceModel';
function fixture() {
  const state = originalInitialState('00000000-0000-4000-8000-000000000044', () => 0.5);
  state.world.zone = 'zone.z004';
  state.wallet = 5000;
  state.ships['fleet.v003'] = 1;
  state.positions['fleet.v003'] = state.location;
  state.mining['extract.x003'] = { 'mat.m010': 400, 'mat.m011': 200 };
  state.mining['extract.x001'] = { 'mat.m001': 50 };
  return state;
}
describe('industrial service selections and authoritative previews', () => {
  it('lists every material and excludes remote, unowned and non-cargo receivers without mutation', () => {
    const state = fixture();
    state.mining['extract.x002']['mat.m001'] = 100;
    const before = structuredClone(state);
    const result = serviceInventory(state);
    expect(result.raw).toHaveLength(3);
    expect(result.raw.filter((r) => r.processable)).toHaveLength(2);
    expect(result.ships.map((s) => s.id)).toEqual(['fleet.v001']);
    expect(state).toEqual(before);
    state.positions['fleet.v003'] = 'loc.l002';
    expect(serviceInventory(state).raw).toHaveLength(1);
    state.ships['fleet.v001'] = 0;
    expect(serviceInventory(state).ships).toEqual([]);
  });
  it('accounts for both cargo forms and previews exact settlement including wallet remainder', () => {
    let state = fixture();
    state.world.zone = 'zone.z006';
    state.cargo['fleet.v001'] = { raw: { 'mat.m001': 125 }, refined: { 'mat.m010.processed': 42 } };
    state.walletRemainder = 4900;
    const inventory = serviceInventory(state);
    expect(inventory.ships[0]!.used).toBe(167);
    expect(inventory.cargo).toHaveLength(2);
    const sale = inventory.cargo[0]!;
    const credit = salePreview(state, 125, sale.price);
    const before = state.wallet;
    state = sellOriginalMineral(state, 'fleet.v001', 'mat.m001', 'raw', 125);
    expect(state.wallet - before).toBe(credit);
  });
  it('processing previews match actual fee/output; partial collection preserves remainder and reset metadata', () => {
    let state = fixture();
    const quote = originalRefineryQuote(state, 'process.p001', 100);
    state = startOriginalRefinery(
      state,
      'extract.x003',
      'mat.m010',
      'process.p001',
      100,
      'synthetic-order',
      1000,
    );
    expect(state.orders[0]!.refinedUnits).toBe(quote.refinedUnits);
    expect(state.wallet).toBe(5000 - quote.cost);
    expect(() => collectOriginalOrder(state, 'synthetic-order', 'fleet.v001', 1000)).toThrow(
      'ORDER_UNAVAILABLE',
    );
    const capacity = serviceInventory(state).ships[0]!.capacity;
    state.cargo['fleet.v001']!.raw['mat.m001'] = capacity - 10;
    const collected = collectOriginalOrder(state, 'synthetic-order', 'fleet.v001', 1000 + quote.duration);
    expect(collected.orders[0]!.refinedUnits).toBe(quote.refinedUnits - 10);
    expect(collected.cargo['fleet.v001']!.refined['mat.m010.processed']).toBe(10);
    expect(collected.saveGeneration).toBe(state.saveGeneration);
    expect(() =>
      collectOriginalOrder(collected, 'synthetic-order', 'fleet.v001', 1000 + quote.duration),
    ).toThrow('CARGO_CAPACITY');
  });
  it('transfers exactly the chosen material and leaves other holds intact', () => {
    const state = fixture();
    const next = transferOriginalMineral(state, 'extract.x003', 'mat.m011', 'fleet.v001', 125);
    expect(next.mining['extract.x003']).toEqual({ 'mat.m010': 400, 'mat.m011': 75 });
    expect(next.cargo['fleet.v001']!.raw['mat.m011']).toBe(125);
    expect(next.mining['extract.x001']).toEqual(state.mining['extract.x001']);
  });
});
