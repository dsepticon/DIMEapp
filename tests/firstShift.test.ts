import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { applyAction, initialState } from '../shared/game';
import { firstShiftOf, FIRST_SHIFT_REWARD, HAND_TOOL, TUTORIAL_SALE_AUEC } from '../shared/firstShift';
import { PlayerState, actionSchema, stateSchema } from '../shared/schema';
import { miningTick, objectiveText } from '../app/rpg/ui/FirstShiftUI';

const now = 1_800_000_000_000;
const steps = [
  'accept',
  'checkTool',
  'enterMine',
  'mineDolivine',
  'returnOutpost',
  'startRefinery',
  'collect',
  'sell',
  'complete',
] as const;
function onLyria(): PlayerState {
  const state = initialState(() => 0.5);
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  return state;
}
function run(state: PlayerState, step: (typeof steps)[number] | 'recoverTool', time = now): PlayerState {
  return applyAction(
    state,
    { type: 'firstShift', step, ...(step === 'mineDolivine' ? { depositId: 'dolivine' as const } : {}) },
    time,
    randomUUID(),
  );
}
describe('The First Shift authoritative progression', () => {
  it('charges a predictable tutorial cutter and permits cancel or failure without backend action', () => {
    let charge = { energy: 0, stability: 100 };
    for (let i = 0; i < 20; i++) charge = miningTick(charge.energy, charge.stability, true);
    expect(charge).toEqual({ energy: 100, stability: 20 });
    charge = { energy: 25, stability: 10 };
    for (let i = 0; i < 10; i++) charge = miningTick(charge.energy, charge.stability, false);
    expect(charge.stability).toBe(0);
    expect(charge.energy).toBeLessThan(100);
  });
  it('loads old saves without quest fields and starts at the foreman', () => {
    const old = onLyria();
    delete old.firstShift;
    expect(stateSchema.parse(old).firstShift).toBeUndefined();
    expect(firstShiftOf(old)).toMatchObject({ status: 'NOT_STARTED', objective: 'SPEAK_TO_FOREMAN' });
    expect(old.firstShift).toBeUndefined();
  });
  it('guides existing ARC-L1 saves to Lyria without changing their location', () => {
    const state = initialState(() => 0.5);
    expect(objectiveText(state)).toBe('Travel to Lyria via the ship console');
    expect(state.location).toBe('ARC-L1');
  });
  it('completes every transition, consuming and crediting each material once', () => {
    let state = onLyria();
    for (const step of steps) {
      const previous = state;
      state = run(state, step, step === 'collect' ? now + 3000 : now);
      expect(state.revision).toBe(previous.revision + 1);
      expect(() => run(state, step, now + 3000)).toThrow();
    }
    expect(state.firstShift).toMatchObject({
      status: 'COMPLETE',
      objective: 'COMPLETE',
      rewardClaimed: true,
      unlockedQuests: ['lyria-next-shift'],
      counters: { mined: 4, refined: 3, sold: 3 },
    });
    expect(state.mining.Hand.Dolivine).toBe(0);
    expect(state.cargo.Nomad?.refined.Dolivine).toBe(0);
    expect(state.orders).toHaveLength(0);
    expect(state.wallet).toBe(FIRST_SHIFT_REWARD + TUTORIAL_SALE_AUEC);
  });
  it('rejects skipped states, wrong location, missing tools, early collection and full cargo', () => {
    const start = onLyria();
    expect(() => run(start, 'mineDolivine')).toThrow('foreman');
    const accepted = run(start, 'accept');
    expect(() => run(accepted, 'enterMine')).toThrow('current assignment');
    accepted.equipment[HAND_TOOL] = 0;
    expect(() => run(accepted, 'checkTool')).toThrow('replacement');
    const recovered = run(accepted, 'recoverTool');
    expect(recovered.equipment[HAND_TOOL]).toBe(1);
    expect(() => run(recovered, 'recoverTool')).toThrow();
    const entered = run(recovered, 'enterMine');
    entered.mining.Hand.Hadanite = 12;
    expect(() => run(entered, 'mineDolivine')).toThrow('full');
    entered.mining.Hand.Hadanite = 0;
    const mined = run(entered, 'mineDolivine');
    const returned = run(mined, 'returnOutpost');
    const refining = run(returned, 'startRefinery');
    expect(() => run(refining, 'collect', now + 2999)).toThrow('processing');
    refining.cargo.Nomad = { raw: { Iron: 2400 }, refined: {} };
    expect(() => run(refining, 'collect', now + 3000)).toThrow('full');
    refining.cargo.Nomad = { raw: {}, refined: {} };
    refining.location = 'ARC-L1';
    expect(() => run(refining, 'collect', now + 3000)).toThrow('Lyria');
  });
  it('prevents direct quest state, reward or price submission', () => {
    expect(actionSchema.safeParse({ type: 'firstShift', step: 'complete', reward: 999 }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'firstShift', step: 'sell', price: 999 }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'firstShift', step: 'setObjective' }).success).toBe(false);
    expect(() =>
      applyAction(onLyria(), { type: 'firstShift', step: 'mineDolivine' }, now, randomUUID()),
    ).toThrow('deposit');
  });
  it('rejects an unrelated seam without changing the quest or inventory', () => {
    const entered = run(run(run(onLyria(), 'accept'), 'checkTool'), 'enterMine');
    const before = structuredClone(entered);
    expect(() =>
      applyAction(
        entered,
        { type: 'firstShift', step: 'mineDolivine', depositId: 'hadanite' } as never,
        now,
        randomUUID(),
      ),
    ).toThrow();
    expect(entered).toEqual(before);
    entered.mining.Hand.Hadanite = 1;
    const mined = run(entered, 'mineDolivine');
    expect(mined.firstShift?.counters).toEqual({ mined: 4, refined: 0, sold: 0 });
  });
  it('replays a concurrent accept once and isolates players across channels', async () => {
    const store = new MemoryStore();
    store.states.set('player-one', onLyria());
    store.states.set('player-two', onLyria());
    const service = new GameService(store, () => now);
    const input = {
      requestId: randomUUID(),
      expectedRevision: 0,
      action: { type: 'firstShift' as const, step: 'accept' as const },
    };
    const results = await Promise.all(Array.from({ length: 5 }, () => service.mutate('player-one', input)));
    expect(results.every((result) => result.state.revision === 1)).toBe(true);
    expect(store.receipts.size).toBe(1);
    expect((await service.snapshot('player-two')).state.firstShift).toBeUndefined();
    expect((await service.snapshot('player-one')).state.firstShift?.objective).toBe('CHECK_EQUIPMENT');
  });
});
