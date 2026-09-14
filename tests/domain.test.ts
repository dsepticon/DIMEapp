import { describe, expect, it } from 'vitest';
import { applyAction, initialState, refineryQuote, total } from '../shared/game';
import { Action, GameError, PlayerState, actionSchema } from '../shared/schema';
import { readyForTravel } from './travelFixture';
const now = 1_800_000_000_000;
function setup(): PlayerState {
  const state = initialState(() => 0.5);
  state.wallet = 100_000;
  state.ships.Prospector = 1;
  state.positions.Prospector = 'ARC-L1';
  state.mining.Prospector = { Gold: 100_000, Aluminium: 100_000 };
  return state;
}
const run = (state: PlayerState, action: Action, time = now, id = 'order-1') =>
  applyAction(state, action, time, id, () => 0.5);
describe('production-derived game rules', () => {
  it('starts at ARC-L1 with a Nomad and zero balance', () => {
    expect(initialState().ships).toEqual({ Nomad: 1 });
    expect(initialState().wallet).toBe(0);
  });
  it('uses hundredths of SCU consistently for gem holds', () => {
    const state = setup();
    state.location = 'Lyria';
    state.positions.Nomad = 'Lyria';
    const started = run(state, { type: 'mine', source: 'Hand', head: '', crew: '' });
    expect(started.pending?.readyAt).toBe(now + 15000);
    expect(total(started.mining.Hand)).toBe(0);
    expect(() => run(started, { type: 'finish' })).toThrow('not complete');
    const result = run(started, { type: 'finish' }, now + 15000);
    expect(total(result.mining.Hand)).toBe(300);
    expect(() => run(result, { type: 'finish' }, now + 16000)).toThrow('No active');
  });
  it('rejects mining outside a claim, unowned ships, and full holds', () => {
    expect(() => run(setup(), { type: 'mine', source: 'Hand', head: '', crew: '' })).toThrow('claim');
    const state = setup();
    state.location = 'Halo';
    state.positions.Prospector = 'Halo';
    state.ships.Prospector = 0;
    expect(() => run(state, { type: 'mine', source: 'Prospector', head: 'Arbor MH1', crew: '' })).toThrow(
      'own',
    );
    state.ships.Prospector = 1;
    state.mining.Prospector = { Gold: 320_000 };
    expect(() => run(state, { type: 'mine', source: 'Prospector', head: 'Arbor MH1', crew: '' })).toThrow(
      'full',
    );
  });
  it('persists travel and forbids teleporting a remotely parked ship', () => {
    const state = setup();
    const start = run(readyForTravel(state, 'Halo', 'Prospector'), {
      type: 'travel',
      ship: 'Prospector',
      destination: 'Halo',
      loadRoc: false,
    });
    expect(start.location).toBe('ARC-L1');
    const arrived = run(start, { type: 'finish' }, now + 55000);
    expect(arrived.location).toBe('Halo');
    expect(arrived.positions.Prospector).toBe('Halo');
    expect(() => readyForTravel(arrived, 'Area-18', 'Nomad')).toThrow('location');
  });
  it('rejects overlapping operations and invalid travel paths', () => {
    const state = setup();
    expect(() => readyForTravel(state, 'Halo', 'Nomad')).toThrow('flight path');
    const start = run(readyForTravel(state, 'Lyria'), {
      type: 'travel',
      ship: 'Nomad',
      destination: 'Lyria',
      loadRoc: false,
    });
    expect(() => run(start, { type: 'purchase', item: 'Roc', quantity: 1 })).toThrow('Finish');
  });
  it('refines atomically with an absolute deadline and no phantom refined inventory', () => {
    const state = setup();
    const quote = refineryQuote(state, 'Dinyx Solventation', 100_000);
    const next = run(state, {
      type: 'refine',
      source: 'Prospector',
      ore: 'Gold',
      units: 1000,
      method: 'Dinyx Solventation',
    });
    expect(next.wallet).toBe(state.wallet - quote.cost);
    expect(next.mining.Prospector.Gold).toBe(0);
    expect(next.orders[0]).toMatchObject({
      rawUnits: 100_000,
      refinedUnits: 80_000,
      createdAt: now,
      readyAt: now + quote.duration,
    });
    expect(next.cargo.Nomad?.refined).toEqual({});
    expect(state.mining.Prospector.Gold).toBe(100_000);
  });
  it('rejects insufficient cargo, funds, gems, and wrong-location refining', () => {
    const action: Action = {
      type: 'refine',
      source: 'Prospector',
      ore: 'Gold',
      units: 1100,
      method: 'Dinyx Solventation',
    };
    expect(() => run(setup(), action)).toThrow('Insufficient cargo');
    const poor = setup();
    poor.wallet = 0;
    expect(() => run(poor, { ...action, units: 100 })).toThrow('wallet');
    const away = setup();
    away.location = 'Area-18';
    expect(() => run(away, action)).toThrow('ARC-L1');
    expect(() => run(setup(), { ...action, ore: 'Hadanite' })).toThrow('Only raw');
  });
  it('collects only ready orders and accounts for both raw and refined capacity', () => {
    const state = run(setup(), {
      type: 'refine',
      source: 'Prospector',
      ore: 'Gold',
      units: 1000,
      method: 'Dinyx Solventation',
    });
    expect(() => run(state, { type: 'collect', orderId: 'order-1', ship: 'Nomad' })).toThrow('processing');
    state.cargo.Nomad = { raw: { Iron: 200_000 }, refined: { Gold: 20_000 } };
    const next = run(state, { type: 'collect', orderId: 'order-1', ship: 'Nomad' }, now + 1000000);
    expect(next.cargo.Nomad?.refined.Gold).toBe(40_000);
    expect(next.orders[0].refinedUnits).toBe(60_000);
    expect(() => run(next, { type: 'collect', orderId: 'order-1', ship: 'Nomad' }, now + 1000000)).toThrow(
      'full',
    );
  });
  it('completes refine → collect → travel → sell without duplicate credits', () => {
    let state = run(setup(), {
      type: 'refine',
      source: 'Prospector',
      ore: 'Gold',
      units: 1000,
      method: 'Dinyx Solventation',
    });
    state = run(state, { type: 'collect', orderId: 'order-1', ship: 'Nomad' }, now + 200000);
    expect(state.orders).toHaveLength(0);
    const balance = state.wallet;
    state = run(
      readyForTravel(state, 'Area-18'),
      { type: 'travel', ship: 'Nomad', destination: 'Area-18', loadRoc: false },
      now + 200000,
    );
    state = run(state, { type: 'finish' }, now + 300000);
    const action: Action = { type: 'sell', ship: 'Nomad', ore: 'Gold', category: 'refined', units: 800 };
    const sold = run(state, action, now + 300000);
    expect(sold.wallet).toBe(balance + 8 * 8099);
    expect(sold.cargo.Nomad?.refined.Gold).toBe(0);
    expect(() => run(sold, action)).toThrow('Insufficient cargo');
  });
  it('fixes raw transfer classification and aluminium sale spelling', () => {
    let state = run(setup(), {
      type: 'transfer',
      source: 'Prospector',
      ship: 'Nomad',
      ore: 'Aluminium',
      units: 100,
    });
    expect(state.cargo.Nomad?.raw.Aluminium).toBe(10_000);
    expect(state.cargo.Nomad?.refined.Aluminium).toBeUndefined();
    state.location = 'Area-18';
    state.positions.Nomad = 'Area-18';
    state.cargo.Nomad!.refined.Aluminium = 10_000;
    const balance = state.wallet;
    state = run(state, { type: 'sell', ship: 'Nomad', ore: 'Aluminium', category: 'refined', units: 100 });
    expect(state.wallet).toBe(balance + 349);
  });
  it.each([-1, 0, 0.1, NaN, Infinity, 10_000_001])('rejects invalid units %s at the boundary', (units) => {
    expect(
      actionSchema.safeParse({ type: 'sell', ship: 'Nomad', ore: 'Gold', category: 'raw', units }).success,
    ).toBe(false);
  });
  it('rejects forged prices and unknown ores', () => {
    expect(
      actionSchema.safeParse({
        type: 'sell',
        ship: 'Nomad',
        ore: 'Gold',
        category: 'raw',
        units: 100,
        price: 999,
      }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({ type: 'sell', ship: 'Nomad', ore: 'Money', category: 'raw', units: 100 })
        .success,
    ).toBe(false);
  });
  it('purchases equipment using server prices and enforces the shop location', () => {
    const state = setup();
    expect(() => run(state, { type: 'purchase', item: 'Hofstede S1', quantity: 1 })).toThrow('Area-18');
    state.location = 'Area-18';
    const next = run(state, { type: 'purchase', item: 'Hofstede S1', quantity: 1 });
    expect(next.wallet).toBe(100000 - 12750);
    expect(next.equipment['Hofstede S1']).toBe(1);
    expect(() => run(state, { type: 'purchase', item: '__proto__', quantity: 1 })).toThrow(GameError);
  });
});
it('supports three Mole stations and rejects reusing unowned crew', () => {
  const state = initialState(() => 0.5);
  state.ships.Mole = 1;
  state.positions.Mole = 'Halo';
  state.currentShip = 'Mole';
  state.location = 'Halo';
  state.equipment = { Dora: 3, 'Helix II': 3 };
  const action: Action = {
    type: 'mine',
    source: 'Mole',
    head: 'Helix II',
    crew: 'Dora',
    extraStations: [
      { head: 'Helix II', crew: 'Dora' },
      { head: 'Helix II', crew: 'Dora' },
    ],
  };
  expect(run(state, action).pending?.readyAt).toBe(now + 70000);
  state.equipment.Dora = 1;
  expect(() => run(state, action)).toThrow('Not enough hired crew');
});
it('sells only owned equipment at catalog prices', () => {
  const state = setup();
  state.location = 'Area-18';
  state.equipment['Hofstede S1'] = 1;
  const sold = run(state, { type: 'sellItem', item: 'Hofstede S1', quantity: 1 });
  expect(sold.wallet).toBe(state.wallet + 12750);
  expect(() => run(sold, { type: 'sellItem', item: 'Hofstede S1', quantity: 1 })).toThrow('Not enough');
});
it('does not allow cashing out a ship with cargo or the active ship', () => {
  const state = setup();
  state.location = 'Area-18';
  state.positions.Nomad = 'Area-18';
  expect(() => run(state, { type: 'sellItem', item: 'Nomad', quantity: 1 })).toThrow('Unknown');
  expect(() => run(state, { type: 'sellItem', item: 'Prospector', quantity: 1 })).toThrow('Empty');
});
