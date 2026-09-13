import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { initialState } from '../shared/game';
import {
  firstShiftOf,
  FIRST_SHIFT_REWARD,
  LEGACY_TUTORIAL_SALE_AUEC,
  TUTORIAL_SALE_AUEC,
} from '../shared/firstShift';
import { actionSchema } from '../shared/schema';
import type { PlayerState } from '../shared/schema';

const now = 1_800_000_000_000;
const orderId = 'synthetic-tutorial-order';
function legacy(objective: NonNullable<PlayerState['firstShift']>['objective']): PlayerState {
  const state = initialState(() => 0.5);
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  state.firstShift = {
    ...firstShiftOf(state),
    version: undefined,
    reconciliation: undefined,
    status: 'ACTIVE',
    objective,
    acceptedAt: now - 10_000,
  };
  return state;
}
function mined(objective: NonNullable<PlayerState['firstShift']>['objective']) {
  const state = legacy(objective);
  state.firstShift!.counters.mined = 4;
  return state;
}
function tutorialOrder(readyAt: number) {
  return {
    id: orderId,
    source: 'Hand' as const,
    ore: 'Dolivine' as const,
    method: 'Cormack Method' as const,
    rawUnits: 4,
    refinedUnits: 3,
    cost: 0,
    createdAt: readyAt - 3000,
    readyAt,
  };
}
function pendingOrder(readyAt: number) {
  const state = mined('COLLECT_REFINED_MATERIAL');
  state.firstShift!.tutorialOrderId = orderId;
  state.orders.push(tutorialOrder(readyAt));
  return state;
}
function collected() {
  const state = mined('SELL_REFINED_MATERIAL');
  state.firstShift!.tutorialOrderId = orderId;
  state.firstShift!.counters.refined = 3;
  state.cargo.Nomad!.refined.Dolivine = 3;
  return state;
}
async function reconcile(input: PlayerState) {
  const store = new MemoryStore();
  store.states.set('synthetic-player-one', structuredClone(input));
  const service = new GameService(
    store,
    () => now,
    () => 0.5,
  );
  const request = {
    requestId: randomUUID(),
    expectedRevision: input.revision,
    action: { type: 'firstShift' as const, step: 'reconcile' as const },
  };
  const result = await service.mutate('synthetic-player-one', request);
  expect(result.state.revision).toBe(input.revision + 1);
  expect((await service.snapshot('synthetic-player-one')).state).toEqual(result.state);
  const replay = await service.mutate('synthetic-player-one', request);
  expect(replay.replayed).toBe(true);
  expect(replay.state).toEqual(result.state);
  expect(store.receipts.size).toBe(1);
  return { state: result.state, service, store };
}

describe('one-time legacy First Shift reconciliation', () => {
  it('does not accept a client-selected reconciliation branch or quantity', () => {
    expect(
      actionSchema.safeParse({ type: 'firstShift', step: 'reconcile', branch: 'collected' }).success,
    ).toBe(false);
    expect(actionSchema.safeParse({ type: 'firstShift', step: 'reconcile', rawUnits: 999 }).success).toBe(
      false,
    );
  });
  it('retains a completed legacy record and all historical accounting', async () => {
    const old = collected();
    old.firstShift!.status = 'COMPLETE';
    old.firstShift!.objective = 'COMPLETE';
    old.firstShift!.counters.sold = 3;
    old.firstShift!.rewardClaimed = true;
    old.firstShift!.completedAt = now - 1000;
    old.wallet = 800;
    const { state, service } = await reconcile(old);
    expect(state.firstShift).toMatchObject({
      version: 2,
      reconciliation: 'LEGACY_COMPLETE',
      status: 'COMPLETE',
      counters: old.firstShift!.counters,
    });
    expect(state.wallet).toBe(800);
    expect(state.mining).toEqual(old.mining);
    expect(state.cargo).toEqual(old.cargo);
    await expect(
      service.mutate('synthetic-player-one', {
        requestId: randomUUID(),
        expectedRevision: state.revision,
        action: { type: 'firstShift', step: 'complete' },
      }),
    ).rejects.toMatchObject({ code: 'QUEST_ORDER' });
  });

  it.each(['CHECK_EQUIPMENT', 'ENTER_MINE', 'MINE_ASSIGNED_ORE'] as const)(
    'preserves an accepted, not-yet-mined %s quest and unrelated inventory',
    async (objective) => {
      const old = legacy(objective);
      old.mining.Hand.Hadanite = 2;
      const { state } = await reconcile(old);
      expect(state.firstShift).toMatchObject({
        version: 2,
        reconciliation: 'CORRECTED',
        objective,
        counters: { mined: 0, refined: 0, sold: 0 },
      });
      expect(state.mining).toEqual(old.mining);
      expect(state.wallet).toBe(old.wallet);
    },
  );

  it.each(['RETURN_TO_OUTPOST', 'START_REFINERY_ORDER'] as const)(
    'preserves mined raw Dolivine at %s',
    async (objective) => {
      const old = mined(objective);
      old.mining.Hand.Dolivine = 4;
      old.mining.Hand.Aphorite = 1;
      const { state } = await reconcile(old);
      expect(state.firstShift?.objective).toBe(
        objective === 'START_REFINERY_ORDER' ? 'SELL_MINED_GEM' : 'RETURN_TO_OUTPOST',
      );
      expect(state.mining).toEqual(old.mining);
      expect(state.wallet).toBe(0);
    },
  );

  it.each([now + 2000, now - 1000])(
    'cancels only the exact tutorial order at readyAt %i and restores four raw units',
    async (readyAt) => {
      const old = pendingOrder(readyAt);
      const unrelated = { ...tutorialOrder(readyAt), id: 'unrelated-order', ore: 'Iron' as const };
      old.orders.push(unrelated);
      old.mining.Hand.Dolivine = 2;
      old.mining.Hand.Aphorite = 1;
      const { state } = await reconcile(old);
      expect(state.firstShift).toMatchObject({
        version: 2,
        reconciliation: 'CORRECTED',
        objective: 'SELL_MINED_GEM',
        tutorialOrderId: null,
        counters: { mined: 4, refined: 0, sold: 0 },
      });
      expect(state.orders).toEqual([unrelated]);
      expect(state.mining.Hand).toEqual({ Dolivine: 6, Aphorite: 1 });
      expect(state.wallet).toBe(0);
    },
  );

  it('removes only attributable collected output and preserves unrelated refined material', async () => {
    const old = collected();
    old.mining.Hand.Dolivine = 1;
    old.cargo.Nomad!.refined.Iron = 7;
    const { state } = await reconcile(old);
    expect(state.firstShift).toMatchObject({
      version: 2,
      reconciliation: 'CORRECTED',
      objective: 'SELL_MINED_GEM',
      counters: { mined: 4, refined: 0, sold: 0 },
    });
    expect(state.mining.Hand.Dolivine).toBe(5);
    expect(state.cargo.Nomad!.refined).toEqual({ Dolivine: 0, Iron: 7 });
    expect(state.wallet).toBe(0);
  });

  it('preserves the old sale and grants only the unclaimed normal reward', async () => {
    const old = collected();
    old.firstShift!.objective = 'RETURN_TO_FOREMAN';
    old.firstShift!.counters.sold = 3;
    old.cargo.Nomad!.refined.Dolivine = 0;
    old.wallet = LEGACY_TUTORIAL_SALE_AUEC;
    const { state, service } = await reconcile(old);
    expect(state.firstShift).toMatchObject({
      reconciliation: 'LEGACY_SOLD',
      objective: 'RETURN_TO_FOREMAN',
      counters: { mined: 4, refined: 3, sold: 3 },
    });
    expect(state.wallet).toBe(300);
    expect(state.wallet).not.toBe(TUTORIAL_SALE_AUEC);
    const request = {
      requestId: randomUUID(),
      expectedRevision: state.revision,
      action: { type: 'firstShift' as const, step: 'complete' as const },
    };
    const completed = await service.mutate('synthetic-player-one', request);
    expect(completed.state.wallet).toBe(LEGACY_TUTORIAL_SALE_AUEC + FIRST_SHIFT_REWARD);
    expect(completed.state.firstShift?.reconciliation).toBe('LEGACY_SOLD');
    expect((await service.mutate('synthetic-player-one', request)).replayed).toBe(true);
    expect((await service.snapshot('synthetic-player-one')).state.wallet).toBe(800);
  });

  it.each([
    [
      'missing exact order',
      () => {
        const s = pendingOrder(now);
        s.orders = [];
        return s;
      },
    ],
    [
      'wrong order properties',
      () => {
        const s = pendingOrder(now);
        s.orders[0].ore = 'Hadanite';
        return s;
      },
    ],
    [
      'mixed refined Dolivine',
      () => {
        const s = collected();
        s.cargo.Nomad!.refined.Dolivine = 5;
        return s;
      },
    ],
    [
      'missing collected output',
      () => {
        const s = collected();
        s.cargo.Nomad!.refined.Dolivine = 0;
        return s;
      },
    ],
    [
      'malformed quest counters',
      () => {
        const s = legacy('CHECK_EQUIPMENT');
        s.firstShift!.counters.mined = 4;
        return s;
      },
    ],
    [
      'reward already claimed while active',
      () => {
        const s = mined('START_REFINERY_ORDER');
        s.mining.Hand.Dolivine = 4;
        s.firstShift!.rewardClaimed = true;
        return s;
      },
    ],
  ] as const)('marks %s support-required without touching unrelated state', async (_label, make) => {
    const old = make();
    const { state, service } = await reconcile(old);
    expect(state.firstShift).toMatchObject({ version: 2, reconciliation: 'SUPPORT_REQUIRED' });
    expect(state.wallet).toBe(old.wallet);
    expect(state.mining).toEqual(old.mining);
    expect(state.cargo).toEqual(old.cargo);
    expect(state.orders).toEqual(old.orders);
    const travel = await service.mutate('synthetic-player-one', {
      requestId: randomUUID(),
      expectedRevision: state.revision,
      action: { type: 'travel', ship: 'Nomad', destination: 'ARC-L1', loadRoc: false },
    });
    expect(travel.state.pending?.kind).toBe('travel');
    expect(travel.state.firstShift?.reconciliation).toBe('SUPPORT_REQUIRED');
  });

  it('isolates players and leaves an old save with no quest untouched', async () => {
    const store = new MemoryStore();
    const old = pendingOrder(now);
    store.states.set('player-one', old);
    store.states.set('player-two', structuredClone(old));
    const service = new GameService(store, () => now);
    const request = {
      requestId: randomUUID(),
      expectedRevision: old.revision,
      action: { type: 'firstShift' as const, step: 'reconcile' as const },
    };
    await service.mutate('player-one', request);
    expect((await service.snapshot('player-two')).state).toEqual(old);
    const noQuest = initialState(() => 0.5);
    store.states.set('player-three', noQuest);
    await expect(service.mutate('player-three', request)).rejects.toMatchObject({ code: 'QUEST_ORDER' });
    expect((await service.snapshot('player-three')).state.firstShift).toBeUndefined();
  });

  it('starts a new corrected quest without reconciliation', async () => {
    const state = initialState(() => 0.5);
    state.location = 'Lyria';
    state.positions.Nomad = 'Lyria';
    const store = new MemoryStore();
    store.states.set('synthetic-new-player', state);
    const service = new GameService(store, () => now);
    const accepted = await service.mutate('synthetic-new-player', {
      requestId: randomUUID(),
      expectedRevision: 0,
      action: { type: 'firstShift', step: 'accept' },
    });
    expect(accepted.state.firstShift).toMatchObject({
      version: 2,
      reconciliation: 'NONE',
      objective: 'CHECK_EQUIPMENT',
    });
    expect(TUTORIAL_SALE_AUEC + FIRST_SHIFT_REWARD).toBe(5700);
  });
});
