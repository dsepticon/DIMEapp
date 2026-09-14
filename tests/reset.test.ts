import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { authenticate } from '../server/auth';
import { createApi } from '../server/http';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { initialState } from '../shared/game';
import { firstShiftOf } from '../shared/firstShift';
import {
  firstShiftSchema,
  PlayerState,
  RESET_CONFIRMATION,
  resetRequestSchema,
  stateSchema,
} from '../shared/schema';

const resetFields = [
  'wallet',
  'location',
  'currentShip',
  'ships',
  'equipment',
  'positions',
  'mining',
  'cargo',
  'orders',
  'refineryRates',
  'pending',
  'firstShift',
];
const technicalFields = ['schemaVersion', 'revision', 'saveGeneration'];

function request(state: PlayerState) {
  return {
    requestId: randomUUID(),
    expectedRevision: state.revision,
    expectedGeneration: state.saveGeneration!,
    confirmation: RESET_CONFIRMATION,
  };
}

function richState(): PlayerState {
  const state = initialState(() => 0.5);
  state.saveGeneration = randomUUID();
  state.revision = 8;
  state.wallet = 92_000;
  state.location = 'Lyria';
  state.currentShip = 'Prospector';
  state.ships.Prospector = 1;
  state.positions.Prospector = 'Lyria';
  state.equipment['Arbor MH1'] = 1;
  state.mining.Hand.Dolivine = 4;
  state.mining.Prospector.Gold = 100;
  state.cargo.Nomad!.raw.Gold = 100;
  state.cargo.Nomad!.refined.Gold = 60;
  state.orders.push({
    id: 'synthetic-order',
    source: 'Prospector',
    ore: 'Gold',
    method: 'Cormack Method',
    rawUnits: 100,
    refinedUnits: 60,
    cost: 10,
    createdAt: 1,
    readyAt: 2,
  });
  state.pending = { kind: 'mine', source: 'Hand', rewards: { Dolivine: 4 }, readyAt: 2 };
  state.firstShift = {
    ...firstShiftOf(state),
    status: 'COMPLETE',
    objective: 'COMPLETE',
    version: 1,
    reconciliation: 'LEGACY_COMPLETE',
    counters: { mined: 4, refined: 3, sold: 3 },
    acceptedAt: 1,
    completedAt: 2,
    rewardClaimed: true,
    toolRecovered: true,
    dialogueFlags: ['foremanIntro', 'technicianIntro'],
    unlockedQuests: ['lyria-next-shift'],
    tutorialOrderId: 'synthetic-order',
  };
  return state;
}

describe('authenticated gameplay reset', () => {
  it('classifies every canonical field and every First Shift field', () => {
    expect(Object.keys(stateSchema.shape).sort()).toEqual([...resetFields, ...technicalFields].sort());
    expect(Object.keys(firstShiftSchema.shape).sort()).toEqual(
      [
        'id',
        'version',
        'reconciliation',
        'status',
        'objective',
        'counters',
        'acceptedAt',
        'completedAt',
        'rewardClaimed',
        'toolRecovered',
        'dialogueFlags',
        'unlockedQuests',
        'tutorialOrderId',
      ].sort(),
    );
  });

  it('replaces every gameplay field from the server factory and retains monotonic revision', async () => {
    const store = new MemoryStore();
    const before = richState();
    store.states.set('synthetic-player', before);
    const service = new GameService(
      store,
      () => 1_800_000_000_000,
      () => 0.5,
    );
    const command = request(before);
    const result = await service.reset('synthetic-player', command);
    const expected = initialState(() => 0.5);
    expected.revision = before.revision + 1;
    expected.saveGeneration = result.state.saveGeneration;
    expect(result.state).toEqual(expected);
    expect(result.state.saveGeneration).not.toBe(before.saveGeneration);
    expect(result.state.location).toBe('ARC-L1');
    expect(result.state.firstShift).toBeUndefined();
    expect(firstShiftOf(result.state).status).toBe('NOT_STARTED');
    expect((await new GameService(store).snapshot('synthetic-player')).state).toEqual(result.state);
    expect(store.receipts.size).toBe(1);
    expect(store.receipts.get('synthetic-player:' + command.requestId)?.expiresAt).toBe(
      1_800_000_000 + 30 * 86400,
    );
  });

  it('rejects wrong phrase, extra client state, missing/stale revision and wrong generation', async () => {
    const store = new MemoryStore();
    const service = new GameService(store);
    const state = (await service.snapshot('synthetic-player')).state;
    const good = request(state);
    for (const bad of [
      { ...good, confirmation: 'reset my dime profile' },
      { ...good, wallet: 0 },
      { ...good, playerId: 'synthetic-other' },
      { ...good, pk: 'synthetic-other' },
      { ...good, state: initialState() },
      { ...good, expectedRevision: undefined },
    ])
      await expect(service.reset('synthetic-player', bad)).rejects.toMatchObject({ code: 'INVALID_RESET' });
    await expect(service.reset('synthetic-player', { ...good, expectedRevision: 1 })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    await expect(
      service.reset('synthetic-player', { ...good, expectedGeneration: randomUUID() }),
    ).rejects.toMatchObject({ code: 'GENERATION_CONFLICT' });
    expect((await service.snapshot('synthetic-player')).state.revision).toBe(0);
  });

  it('replays one concurrent reset, rejects conflicting reuse, and keeps later state on old receipt replay', async () => {
    const store = new MemoryStore();
    const service = new GameService(
      store,
      () => 1_800_000_000_000,
      () => 0.5,
    );
    const before = (await service.snapshot('synthetic-player')).state;
    const command = request(before);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.reset('synthetic-player', command)),
    );
    expect(
      results.every(
        (x) => x.state.revision === 1 && x.state.saveGeneration === results[0].state.saveGeneration,
      ),
    ).toBe(true);
    expect(store.receipts.size).toBe(1);
    expect((await service.reset('synthetic-player', command)).replayed).toBe(true);
    await expect(
      service.reset('synthetic-player', { ...command, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const travel = {
      requestId: randomUUID(),
      expectedRevision: 1,
      action: { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false } as const,
    };
    const later = await service.mutate('synthetic-player', travel);
    expect(later.state.revision).toBe(2);
    expect((await service.reset('synthetic-player', command)).state).toEqual(later.state);
    expect((await service.snapshot('synthetic-player')).state).toEqual(later.state);
  });

  it('blocks old pending actions and allows normal new actions after reset', async () => {
    const store = new MemoryStore();
    const service = new GameService(store);
    const before = (await service.snapshot('synthetic-player')).state;
    const old = {
      requestId: randomUUID(),
      expectedRevision: 0,
      action: { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false } as const,
    };
    const after = (await service.reset('synthetic-player', request(before))).state;
    await expect(service.mutate('synthetic-player', old)).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    const newAction = await service.mutate('synthetic-player', {
      ...old,
      requestId: randomUUID(),
      expectedRevision: after.revision,
    });
    expect(newAction.state.revision).toBe(after.revision + 1);
    expect(newAction.state.saveGeneration).toBe(after.saveGeneration);
  });

  it('replays a pre-reset receipt with the fresh snapshot, never its old snapshot', async () => {
    const service = new GameService(new MemoryStore());
    const before = (await service.snapshot('synthetic-player')).state;
    const old = {
      requestId: randomUUID(),
      expectedRevision: before.revision,
      action: { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false } as const,
    };
    const oldResult = await service.mutate('synthetic-player', old);
    const fresh = (await service.reset('synthetic-player', request(oldResult.state))).state;
    const replay = await service.mutate('synthetic-player', old);
    expect(replay.replayed).toBe(true);
    expect(replay.state).toEqual(fresh);
    expect(replay.state.pending).toBeNull();
    expect(replay.state.location).toBe('ARC-L1');
  });

  it('upgrades an older save generation without changing gameplay or revision', async () => {
    const store = new MemoryStore();
    const legacy = richState();
    delete legacy.saveGeneration;
    store.states.set('synthetic-player', legacy);
    const service = new GameService(store);
    const upgraded = (await service.snapshot('synthetic-player')).state;
    expect(upgraded.saveGeneration).toMatch(/^[a-f0-9-]{36}$/);
    expect(upgraded.revision).toBe(legacy.revision);
    expect({ ...upgraded, saveGeneration: undefined }).toEqual({ ...legacy, saveGeneration: undefined });
    const after = (await service.reset('synthetic-player', request(upgraded))).state;
    expect(after.revision).toBe(legacy.revision + 1);
  });

  it('uses signed persistent identity across channels and isolates another player', async () => {
    const signing = randomBytes(32),
      identityKey = randomBytes(32);
    const jwt = (id: string, channel: string) =>
      new SignJWT({ opaque_user_id: id, channel_id: channel, role: 'viewer' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(signing);
    const first = 'Bearer ' + (await jwt('Usynthetic', '100'));
    const otherChannel = 'Bearer ' + (await jwt('Usynthetic', '200'));
    const anotherPlayer = 'Bearer ' + (await jwt('Uanother', '100'));
    const store = new MemoryStore();
    const api = createApi(
      new GameService(store),
      (header) => authenticate(header, [signing], identityKey),
      [],
    );
    const send = (method: string, path: string, authorization?: string, body?: object) =>
      api({
        method,
        path,
        headers: authorization ? { authorization } : {},
        body: body && JSON.stringify(body),
      });
    const initial = JSON.parse((await send('GET', '/state', first)).body).state as PlayerState;
    const separate = JSON.parse((await send('GET', '/state', anotherPlayer)).body).state as PlayerState;
    const reset = request(initial);
    expect((await send('POST', '/profile/reset', undefined, reset)).statusCode).toBe(401);
    expect((await send('POST', '/profile/reset', 'Bearer invalid', reset)).statusCode).toBe(401);
    expect(
      (await send('POST', '/profile/reset', 'Bearer ' + (await jwt('Asynthetic', '100')), reset)).statusCode,
    ).toBe(401);
    expect((await send('POST', '/profile/reset', first, reset)).statusCode).toBe(200);
    const crossChannel = JSON.parse((await send('GET', '/state', otherChannel)).body).state as PlayerState;
    expect(crossChannel.revision).toBe(initial.revision + 1);
    expect(crossChannel.saveGeneration).not.toBe(initial.saveGeneration);
    expect(JSON.parse((await send('GET', '/state', anotherPlayer)).body).state).toEqual(separate);
    expect(store.states.size).toBe(2);
  });

  it('requires a strict UUID request ID', () => {
    expect(resetRequestSchema.safeParse({ ...request(richState()), requestId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});
