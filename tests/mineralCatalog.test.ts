import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ASTEROIDS, GEM_SPAWN_WEIGHTS, MINERAL_CATALOG, ORE_NAMES, ORES } from '../shared/catalog';
import { applyAction, initialState } from '../shared/game';
import { firstShiftOf, TUTORIAL_RAW_UNITS, TUTORIAL_SALE_AUEC } from '../shared/firstShift';
import { stateSchema } from '../shared/schema';

const now = 1_800_000_000_000;
const gems = ['Dolivine', 'Aphorite', 'Hadanite', 'Janalite'] as const;

describe('source-derived mineral rules', () => {
  it('prices First Shift from the recovered raw Dolivine value', () => {
    expect(TUTORIAL_SALE_AUEC).toBe(Math.round((TUTORIAL_RAW_UNITS * ORES.Dolivine.raw) / 100));
    expect(TUTORIAL_SALE_AUEC).toBe(5200);
  });
  it('covers every recovered material and preserves all prices and spawn weights', () => {
    expect(new Set(ORE_NAMES).size).toBe(ORE_NAMES.length);
    expect(Object.keys(ORES).sort()).toEqual([...ORE_NAMES].sort());
    for (const entries of Object.values(ASTEROIDS)) {
      expect(new Set(entries.map((entry) => entry.ore)).size).toBe(entries.length);
      expect(entries.every((entry) => Object.hasOwn(ORES, entry.ore))).toBe(true);
    }
    const shipReachable = new Set(
      Object.values(ASTEROIDS).flatMap((entries) => entries.map((entry) => entry.ore)),
    );
    expect(ORE_NAMES.filter((name) => !ORES[name].gem && !shipReachable.has(name))).toEqual([]);
    expect(new Set(MINERAL_CATALOG.map((item) => item.id)).size).toBe(MINERAL_CATALOG.length);
    expect(MINERAL_CATALOG.length).toBe(ORE_NAMES.length * 2 - gems.length);
    for (const name of ORE_NAMES) {
      const record = MINERAL_CATALOG.find(
        (item) => item.id === (ORES[name].gem ? name.toLowerCase() : `${name.toLowerCase()}-raw`),
      );
      expect(record?.pricePerScu).toBe(ORES[name].raw);
      if (ORES[name].gem) {
        expect(record?.spawnWeights).toEqual({
          Hand: GEM_SPAWN_WEIGHTS.Hand[name as keyof typeof GEM_SPAWN_WEIGHTS.Hand],
          Roc: GEM_SPAWN_WEIGHTS.Roc[name as keyof typeof GEM_SPAWN_WEIGHTS.Roc],
        });
      } else {
        expect(MINERAL_CATALOG.find((item) => item.id === `${name.toLowerCase()}-refined`)?.pricePerScu).toBe(
          ORES[name].refined,
        );
        for (const [pool, entries] of Object.entries(ASTEROIDS)) {
          expect(record?.spawnWeights[pool]).toBe(entries.find((entry) => entry.ore === name)?.weight);
        }
      }
    }
  });

  it.each(gems)('%s is raw-sale only and rejected by both refinery backend paths', (name) => {
    const entry = MINERAL_CATALOG.find((item) => item.id === name.toLowerCase());
    expect(entry).toMatchObject({
      category: 'GEM',
      refineryEligible: false,
      rawSaleEligible: true,
      refinedOutput: null,
    });
    const state = initialState(() => 0.5);
    state.ships.Prospector = 1;
    state.positions.Prospector = 'ARC-L1';
    state.mining.Prospector[name] = 100;
    state.wallet = 1000;
    expect(() =>
      applyAction(
        state,
        { type: 'refine', source: 'Prospector', ore: name, units: 100, method: 'Cormack Method' },
        now,
        randomUUID(),
      ),
    ).toThrow('Only raw ship-mined ore');
    state.orders.push({
      id: 'legacy-gem-order',
      source: 'Hand',
      ore: name,
      method: 'Cormack Method',
      rawUnits: 100,
      refinedUnits: 75,
      cost: 0,
      createdAt: now - 1000,
      readyAt: now - 1,
    });
    expect(() =>
      applyAction(state, { type: 'collect', orderId: 'legacy-gem-order', ship: 'Nomad' }, now, randomUUID()),
    ).toThrow('Gems cannot be collected');
    expect(state.orders).toHaveLength(1);
    state.location = 'Area-18';
    state.positions.Nomad = 'Area-18';
    state.cargo.Nomad!.raw[name] = 1;
    const sold = applyAction(
      state,
      { type: 'sell', ship: 'Nomad', ore: name, category: 'raw', units: 1 },
      now,
      randomUUID(),
    );
    expect(sold.cargo.Nomad?.raw[name]).toBe(0);
    expect(sold.wallet).toBe(1000 + Math.round(ORES[name].raw / 100));
    expect(() =>
      applyAction(
        state,
        { type: 'sell', ship: 'Nomad', ore: name, category: 'refined', units: 1 },
        now,
        randomUUID(),
      ),
    ).toThrow('no sale price');
  });

  it('retains completed legacy quest state and rejects mutations of active legacy quests', () => {
    const old = initialState(() => 0.5);
    old.location = 'Lyria';
    old.positions.Nomad = 'Lyria';
    old.firstShift = {
      ...firstShiftOf(old),
      version: undefined,
      status: 'ACTIVE',
      objective: 'START_REFINERY_ORDER',
      counters: { mined: 4, refined: 0, sold: 0 },
    };
    const parsed = stateSchema.parse(old);
    expect(parsed.firstShift?.version).toBeUndefined();
    expect(() =>
      applyAction(parsed, { type: 'firstShift', step: 'startRefinery' }, now, randomUUID()),
    ).toThrow('owner review');
    expect(parsed).toEqual(old);
    old.firstShift.status = 'COMPLETE';
    old.firstShift.objective = 'COMPLETE';
    old.firstShift.rewardClaimed = true;
    old.wallet = 800;
    expect(stateSchema.parse(old)).toEqual(old);
    expect(() => applyAction(old, { type: 'firstShift', step: 'complete' }, now, randomUUID())).toThrow(
      'owner review',
    );
    expect(old.wallet).toBe(800);
  });
});
