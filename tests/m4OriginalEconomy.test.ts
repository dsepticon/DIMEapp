import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import {
  collectOriginalOrder,
  originalRefineryQuote,
  sellOriginalMineral,
  startOriginalRefinery,
  transferOriginalMineral,
} from '../shared/originalEconomy';

describe('original integer-unit cargo, processing and market actions', () => {
  it('preserves fractional transfer and processing quantities exactly', () => {
    const state = originalInitialState(randomUUID(), () => 0.5);
    state.ships['fleet.v003'] = 1;
    state.positions['fleet.v003'] = 'loc.l001';
    state.mining['extract.x003']['mat.m010'] = 325;
    const transferred = transferOriginalMineral(state, 'extract.x003', 'mat.m010', 'fleet.v001', 125);
    expect(transferred.mining['extract.x003']['mat.m010']).toBe(200);
    expect(transferred.cargo['fleet.v001']?.raw['mat.m010']).toBe(125);
    expect(state.mining['extract.x003']['mat.m010']).toBe(325);
    const refinery = structuredClone(transferred);
    refinery.world.zone = 'zone.z004';
    refinery.wallet = 10_000;
    refinery.refineryRates['process.p001'] = { yield: 1_000_000, cost: 1_000_000, time: 1_000_000 };
    const quote = originalRefineryQuote(refinery, 'process.p001', 200);
    expect(quote.refinedUnits).toBe(200);
    const ordered = startOriginalRefinery(
      refinery,
      'extract.x003',
      'mat.m010',
      'process.p001',
      200,
      'synthetic-order',
      1000,
    );
    expect(ordered.mining['extract.x003']['mat.m010']).toBe(0);
    expect(ordered.wallet).toBe(10_000 - quote.cost);
    const collected = collectOriginalOrder(ordered, 'synthetic-order', 'fleet.v001', 1000 + quote.duration);
    expect(collected.cargo['fleet.v001']?.refined['mat.m010.processed']).toBe(200);
    expect(collected.orders).toEqual([]);
  });

  it('rejects real-name gems through every processing entry', () => {
    for (const gem of ['mat.m001', 'mat.m002', 'mat.m003', 'mat.m004'] as const) {
      const state = originalInitialState(randomUUID(), () => 0.5);
      state.world.zone = 'zone.z004';
      state.ships['fleet.v003'] = 1;
      state.positions['fleet.v003'] = 'loc.l001';
      state.mining['extract.x003'][gem] = 400;
      state.wallet = 10_000;
      const before = structuredClone(state);
      expect(() =>
        startOriginalRefinery(state, 'extract.x003', gem, 'process.p001', 400, randomUUID(), 1000),
      ).toThrow('PROCESSING_NOT_COMPATIBLE');
      expect(state).toEqual(before);
    }
  });

  it('conserves value when a processed stack is sold in parts', () => {
    const build = () => {
      const state = originalInitialState(randomUUID(), () => 0.5);
      state.location = 'loc.l004';
      state.world.zone = 'zone.z038';
      state.positions['fleet.v001'] = 'loc.l004';
      state.cargo['fleet.v001']!.refined['mat.m010.processed'] = 333;
      return state;
    };
    const once = sellOriginalMineral(build(), 'fleet.v001', 'mat.m010', 'refined', 333);
    let split = sellOriginalMineral(build(), 'fleet.v001', 'mat.m010', 'refined', 111);
    split = sellOriginalMineral(split, 'fleet.v001', 'mat.m010', 'refined', 222);
    expect(split.wallet).toBe(once.wallet);
    expect(split.walletRemainder).toBe(once.walletRemainder);
    expect(split.cargo['fleet.v001']?.refined['mat.m010.processed']).toBe(0);
  });

  it('rejects capacity overflow and leaves both holds unchanged', () => {
    const state = originalInitialState(randomUUID(), () => 0.5);
    state.ships['fleet.v003'] = 1;
    state.positions['fleet.v003'] = 'loc.l001';
    state.mining['extract.x003']['mat.m010'] = 100;
    state.cargo['fleet.v001']!.raw['mat.m011'] = 240_000;
    const before = structuredClone(state);
    expect(() => transferOriginalMineral(state, 'extract.x003', 'mat.m010', 'fleet.v001', 1)).toThrow(
      'CARGO_CAPACITY',
    );
    expect(state).toEqual(before);
  });
});
