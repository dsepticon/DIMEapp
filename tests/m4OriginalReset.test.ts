import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RESET_CONFIRMATION } from '../shared/schema';
import { originalInitialState } from '../shared/originalGame';
import type { OriginalPlayerState } from '../shared/originalSchema';
import { OriginalResetService } from '../server/originalReset';
import { MemoryStore } from '../server/store';

describe('original-universe canonical reset', () => {
  it('resets gameplay, rotates generation, preserves monotonic revision and replays once', async () => {
    const state = originalInitialState(randomUUID(), () => 0.5);
    state.revision = 31;
    state.wallet = 5700;
    state.location = 'loc.l002';
    state.world.zone = 'zone.z014';
    state.mining['extract.x001']['mat.m001'] = 125;
    state.ships['fleet.v002'] = 1;
    state.world.groundVehicle = { zone: 'zone.z014', active: true, occupied: true };
    const store = new MemoryStore<OriginalPlayerState>();
    store.states.set('synthetic-a', state);
    const service = new OriginalResetService(
      store,
      () => 1_000_000,
      () => 0.5,
    );
    const request = {
      requestId: randomUUID(),
      expectedRevision: 31,
      expectedGeneration: state.saveGeneration,
      confirmation: RESET_CONFIRMATION,
    };
    const first = await service.reset('synthetic-a', request);
    expect(first.replayed).toBe(false);
    expect(first.state).toMatchObject({
      revision: 32,
      wallet: 0,
      location: 'loc.l001',
      currentShip: 'fleet.v001',
      ships: { 'fleet.v001': 1 },
      equipment: { 'gear.e001': 1 },
      world: { zone: 'zone.z001', groundVehicle: null, nodes: {} },
    });
    expect(first.state.saveGeneration).not.toBe(state.saveGeneration);
    expect(first.state.mining['extract.x001']).toEqual({});
    expect(first.state.quest).toBeUndefined();
    expect((await service.reset('synthetic-a', request)).replayed).toBe(true);
    await expect(service.reset('synthetic-a', { ...request, expectedRevision: 32 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(store.receipts.size).toBe(1);
  });
});
