import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import { OriginalActionService } from '../server/originalActionService';
import { MemoryStore } from '../server/store';

describe('original action transactions', () => {
  it('guards generation and replays an accepted action without applying twice', async () => {
    const store = new MemoryStore<ReturnType<typeof originalInitialState>>();
    const player = 'synthetic-a';
    const initial = originalInitialState(randomUUID(), () => 0.5);
    initial.location = 'loc.l002';
    initial.world.zone = 'zone.z012';
    store.states.set(player, initial);
    const service = new OriginalActionService(store, () => 1000);
    const requestId = randomUUID();
    const input = {
      requestId,
      expectedRevision: 0,
      expectedGeneration: initial.saveGeneration,
      action: { type: 'acceptFirstContract' },
    };
    const first = await service.mutate(player, input);
    const replay = await service.mutate(player, input);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.state.revision).toBe(1);
    await expect(
      service.mutate(player, { ...input, action: { type: 'completeFirstContract' } }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      service.mutate(player, {
        ...input,
        requestId: randomUUID(),
        expectedRevision: 1,
        expectedGeneration: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'GENERATION_CONFLICT' });
  });
  it('isolates two synthetic players', async () => {
    const store = new MemoryStore<ReturnType<typeof originalInitialState>>();
    const a = originalInitialState(randomUUID(), () => 0.5);
    const b = originalInitialState(randomUUID(), () => 0.5);
    a.world.zone = 'zone.z008';
    store.states.set('a', a);
    store.states.set('b', b);
    const service = new OriginalActionService(store);
    await service.mutate('a', {
      requestId: randomUUID(),
      expectedRevision: 0,
      expectedGeneration: a.saveGeneration,
      action: {
        type: 'assignDeparture',
        ship: 'fleet.v001',
        destination: 'loc.l002',
        loadGroundVehicle: false,
      },
    });
    expect(await store.read('b')).toEqual(b);
  });
});
