import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { applyAction, initialState, refineryQuote } from '../shared/game';
import { rawMineral } from '../shared/catalog';
import { settleSale } from '../shared/mineralUnits';
import { RATE_SCALE } from '../shared/quantityUpgrade';

const now = 1_800_000_000_000;
const synthetic = 'synthetic-mineral-player';

describe('one-time whole-cSCU save conversion', () => {
  it('converts every old mineral field once without changing wallet, quest history or revision', async () => {
    const store = new MemoryStore();
    const old = initialState(() => 0.5);
    old.quantityVersion = undefined;
    old.walletRemainder = undefined;
    old.wallet = 745;
    old.mining.Hand.Dolivine = 4;
    old.mining.Prospector.Gold = 1000;
    old.world!.minorRemainders = { Hand: { Dolivine: 25 } };
    old.cargo.Nomad!.raw.Agricium = 1;
    old.cargo.Nomad!.refined.Iron = 2;
    old.orders = [
      {
        id: 'synthetic-old-order',
        source: 'Prospector',
        ore: 'Gold',
        method: 'Dinyx Solventation',
        rawUnits: 4,
        refinedUnits: 3,
        cost: 7,
        createdAt: now,
        readyAt: now + 1000,
      },
    ];
    old.pending = { kind: 'mine', source: 'Hand', rewards: { Aphorite: 2 }, readyAt: now + 1000 };
    for (const rate of Object.values(old.refineryRates)) {
      rate.yield /= RATE_SCALE;
      rate.cost /= RATE_SCALE;
      rate.time /= RATE_SCALE;
    }
    store.states.set(synthetic, old);
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    const first = (await service.snapshot(synthetic)).state;
    expect(first.quantityVersion).toBe(2);
    expect(first.revision).toBe(0);
    expect(first.wallet).toBe(745);
    expect(first.walletRemainder).toBe(0);
    expect(first.mining.Hand.Dolivine).toBe(425);
    expect(first.mining.Prospector.Gold).toBe(100_000);
    expect(first.cargo.Nomad!.raw.Agricium).toBe(100);
    expect(first.cargo.Nomad!.refined.Iron).toBe(200);
    expect(first.orders[0]).toMatchObject({ rawUnits: 400, refinedUnits: 300, cost: 7 });
    expect(first.pending).toMatchObject({ kind: 'mine', rewards: { Aphorite: 200 } });
    expect(first.refineryRates['Dinyx Solventation']).toEqual({
      yield: 800_000,
      cost: 1_000_000,
      time: 1_000_000,
    });
    expect(first.world?.minorRemainders).toBeUndefined();
    expect((await service.snapshot(synthetic)).state).toEqual(first);
  });
});

describe('minor-unit mineral actions', () => {
  it('transfers fractional portions and enforces exact cargo capacity', () => {
    const state = initialState(() => 0.5);
    state.mining.Hand.Dolivine = 425;
    const moved = applyAction(
      state,
      { type: 'transferMinor', source: 'Hand', ship: 'Nomad', ore: 'Dolivine', unitsMinor: 125 },
      now,
      randomUUID(),
    );
    expect(moved.mining.Hand.Dolivine).toBe(300);
    expect(moved.cargo.Nomad!.raw.Dolivine).toBe(125);
    expect(() =>
      applyAction(
        moved,
        { type: 'transferMinor', source: 'Hand', ship: 'Nomad', ore: 'Dolivine', unitsMinor: 301 },
        now,
        randomUUID(),
      ),
    ).toThrow('Insufficient cargo');
    moved.cargo.Nomad!.raw.Iron = 239_875;
    expect(() =>
      applyAction(
        moved,
        { type: 'transferMinor', source: 'Hand', ship: 'Nomad', ore: 'Dolivine', unitsMinor: 1 },
        now,
        randomUUID(),
      ),
    ).toThrow('capacity');
  });

  it('conserves fractional refinery input, refined output and loss with one order', () => {
    const state = initialState(() => 0.5);
    state.wallet = 1000;
    state.ships.Prospector = 1;
    state.positions.Prospector = 'ARC-L1';
    state.mining.Prospector.Gold = 125;
    const quote = refineryQuote(state, 'Dinyx Solventation', 125);
    const started = applyAction(
      state,
      {
        type: 'refineMinor',
        source: 'Prospector',
        ore: 'Gold',
        unitsMinor: 125,
        method: 'Dinyx Solventation',
      },
      now,
      'synthetic-order',
    );
    expect(started.mining.Prospector.Gold).toBe(0);
    expect(started.orders[0]).toMatchObject({ rawUnits: 125, refinedUnits: quote.refinedUnits });
    expect(quote.refinedUnits + (125 - quote.refinedUnits)).toBe(125);
    expect(started.wallet).toBe(1000 - quote.cost);
    const collected = applyAction(
      started,
      { type: 'collect', orderId: 'synthetic-order', ship: 'Nomad' },
      now + quote.duration,
      randomUUID(),
    );
    expect(collected.cargo.Nomad!.refined.Gold).toBe(quote.refinedUnits);
    expect(collected.orders).toHaveLength(0);
  });

  it('prices split and combined fractional sales identically, retaining exact fractional credit', () => {
    const state = initialState(() => 0.5);
    state.cargo.Nomad!.raw.Agricium = 101;
    const combined = applyAction(
      state,
      { type: 'sellMinor', ship: 'Nomad', ore: 'Agricium', category: 'raw', unitsMinor: 101 },
      now,
      randomUUID(),
    );
    let split = state;
    for (const unitsMinor of [1, 25, 25, 50])
      split = applyAction(
        split,
        { type: 'sellMinor', ship: 'Nomad', ore: 'Agricium', category: 'raw', unitsMinor },
        now,
        randomUUID(),
      );
    expect([split.wallet, split.walletRemainder, split.cargo.Nomad!.raw.Agricium]).toEqual([
      combined.wallet,
      combined.walletRemainder,
      0,
    ]);
    expect(split.wallet).toBe(settleSale(101, rawMineral('Agricium').pricePerScu, 0).credit);
    expect(() =>
      applyAction(
        split,
        { type: 'sellMinor', ship: 'Nomad', ore: 'Agricium', category: 'raw', unitsMinor: 1 },
        now,
        randomUUID(),
      ),
    ).toThrow('Insufficient cargo');
  });

  it('keeps legacy action quantities whole cSCU at the API boundary', () => {
    const state = initialState(() => 0.5);
    state.mining.Hand.Dolivine = 200;
    const moved = applyAction(
      state,
      { type: 'transfer', source: 'Hand', ship: 'Nomad', ore: 'Dolivine', units: 1 },
      now,
      randomUUID(),
    );
    expect(moved.mining.Hand.Dolivine).toBe(100);
    expect(moved.cargo.Nomad!.raw.Dolivine).toBe(100);
  });

  it('replays an accepted fractional transfer and rejects conflicting same-ID payloads', async () => {
    const store = new MemoryStore();
    const state = initialState(() => 0.5);
    state.saveGeneration = randomUUID();
    state.mining.Hand.Dolivine = 200;
    store.states.set(synthetic, state);
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    const request = {
      requestId: randomUUID(),
      expectedRevision: 0,
      action: {
        type: 'transferMinor' as const,
        source: 'Hand' as const,
        ship: 'Nomad' as const,
        ore: 'Dolivine' as const,
        unitsMinor: 125,
      },
    };
    const first = await service.mutate(synthetic, request);
    expect(first.state.mining.Hand.Dolivine).toBe(75);
    expect((await service.mutate(synthetic, request)).replayed).toBe(true);
    expect((await service.snapshot(synthetic)).state.cargo.Nomad!.raw.Dolivine).toBe(125);
    await expect(
      service.mutate(synthetic, { ...request, action: { ...request.action, unitsMinor: 126 } }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('allows only one concurrent request at a revision and conserves the source stack', async () => {
    const store = new MemoryStore();
    const state = initialState(() => 0.5);
    state.saveGeneration = randomUUID();
    state.mining.Hand.Dolivine = 200;
    store.states.set(synthetic, state);
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    const requests = [125, 75].map((unitsMinor) => ({
      requestId: randomUUID(),
      expectedRevision: 0,
      action: {
        type: 'transferMinor' as const,
        source: 'Hand' as const,
        ship: 'Nomad' as const,
        ore: 'Dolivine' as const,
        unitsMinor,
      },
    }));
    const results = await Promise.allSettled(requests.map((request) => service.mutate(synthetic, request)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const final = (await service.snapshot(synthetic)).state;
    expect(final.mining.Hand.Dolivine! + final.cargo.Nomad!.raw.Dolivine!).toBe(200);
    expect(final.revision).toBe(1);
  });
});
