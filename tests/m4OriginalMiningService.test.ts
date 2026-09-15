import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import type { OriginalPlayerState } from '../shared/originalSchema';
import { OriginalMiningService } from '../server/originalMiningService';
import { MemoryStore } from '../server/store';

function setup() {
  const state = originalInitialState(randomUUID(), () => 0.5);
  state.location = 'loc.l002';
  state.world.zone = 'zone.z014';
  state.world.nodes['zone.z014-test'] = {
    id: 'zone.z014-test',
    ore: 'mat.m001',
    source: 'extract.x001',
    x: 4,
    y: 4,
    size: 3,
    resistance: 0.32,
    instability: 0.28,
    yieldUnits: 400,
    status: 'INTACT',
    fragments: [],
    respawnAt: null,
  };
  state.world.scanner.analyzed = ['zone.z014-test'];
  const store = new MemoryStore<OriginalPlayerState>();
  store.states.set('synthetic-a', state);
  const service = new OriginalMiningService(
    store,
    {
      miningAllowed: (zone) => zone === 'zone.z014',
      validPosition: () => true,
      clearLine: () => true,
      reachableGroundTiles: () => [],
    },
    () => 1000,
  );
  const request = {
    requestId: randomUUID(),
    expectedRevision: 0,
    expectedGeneration: state.saveGeneration,
    action: { type: 'startLaser' as const, nodeId: 'zone.z014-test', player: { x: 4.5, y: 5.5 } },
  };
  return { state, store, service, request };
}

describe('original mining transaction receipts', () => {
  it('applies a laser start once despite a retry and concurrent copies', async () => {
    const { store, service, request } = setup();
    const results = await Promise.all([
      service.mutate('synthetic-a', request),
      service.mutate('synthetic-a', request),
    ]);
    expect(results.filter((item) => !item.replayed)).toHaveLength(1);
    expect(results.filter((item) => item.replayed)).toHaveLength(1);
    expect(store.states.get('synthetic-a')?.revision).toBe(1);
    expect(store.receipts.size).toBe(1);
    expect((await service.mutate('synthetic-a', request)).replayed).toBe(true);
  });

  it('rejects conflicting request reuse, stale generation and cross-player leakage', async () => {
    const { state, store, service, request } = setup();
    const other = structuredClone(state);
    other.wallet = 89;
    store.states.set('synthetic-b', other);
    await expect(
      service.mutate('synthetic-a', { ...request, expectedGeneration: randomUUID() }),
    ).rejects.toMatchObject({ code: 'GENERATION_CONFLICT' });
    await expect(service.mutate('synthetic-a', { ...request, expectedRevision: 4 })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    await service.mutate('synthetic-a', request);
    await expect(
      service.mutate('synthetic-a', {
        ...request,
        action: { ...request.action, nodeId: 'zone.z014-other' },
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(store.states.get('synthetic-b')).toEqual(other);
    expect(store.receipts.size).toBe(1);
  });
});
