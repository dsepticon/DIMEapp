import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import { originalZoneMap } from '../shared/originalWorld';
import { OriginalActionService } from '../server/originalActionService';
import { OriginalMiningService } from '../server/originalMiningService';
import { originalSpatial } from '../shared/originalSpatial';
import { MemoryStore } from '../server/store';
import { acceptFirstContract, confirmFirstContractTool } from '../shared/originalQuest';
import { originalRefineryQuote, startOriginalRefinery } from '../shared/originalEconomy';
const initial = () => originalInitialState(randomUUID(), () => 0.5);
const input = (state: ReturnType<typeof initial>, action: unknown) => ({
  requestId: randomUUID(),
  expectedRevision: state.revision,
  expectedGeneration: state.saveGeneration,
  action,
});
describe('recovered mutations keep one transaction outcome', () => {
  it('vacuum completion rejects stale revision, then applies one collection with one receipt', async () => {
    const state = initial(),
      map = originalZoneMap('zone.z014'),
      p = { x: map.spawn.x + 0.5, y: map.spawn.y + 0.5 },
      id = 'zone.z014.node.synthetic',
      pieceId = 'piece-synthetic';
    state.location = 'loc.l002';
    state.world.zone = map.id as typeof state.world.zone;
    state.world.nodes[id] = {
      id,
      ore: 'mat.m001',
      source: 'extract.x001',
      x: map.spawn.x + 1,
      y: map.spawn.y,
      size: 1,
      resistance: 0.6,
      instability: 0.2,
      yieldUnits: 100,
      status: 'FRACTURED',
      respawnAt: null,
      fragments: [{ id: pieceId, x: map.spawn.x + 1, y: map.spawn.y, units: 100, collected: false }],
    };
    state.world.extractionSession = { nodeId: id, pieceId, origin: p, startedAt: 0, zone: state.world.zone };
    state.revision = 1;
    const store = new MemoryStore<typeof state>();
    store.states.set('synthetic', state);
    const service = new OriginalMiningService(store, originalSpatial, () => 1000);
    const request = input(state, { type: 'finishVacuum', nodeId: id, pieceId, player: p });
    await expect(service.mutate('synthetic', { ...request, expectedRevision: 0 })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    expect(store.states.get('synthetic')).toEqual(state);
    expect(store.receipts.size).toBe(0);
    const first = await service.mutate('synthetic', request),
      again = await service.mutate('synthetic', request);
    expect(again.replayed).toBe(true);
    expect(again.state).toEqual(first.state);
    expect(again.state.mining['extract.x001']['mat.m001']).toBe(100);
    expect(store.receipts.size).toBe(1);
  });
  it('canceling an interrupted laser is replayable and produces no yield', async () => {
    const state = initial();
    state.world.miningSession = {
      nodeId: 'synthetic',
      source: 'extract.x001',
      zone: state.world.zone,
      startedAt: 0,
    };
    const store = new MemoryStore<typeof state>();
    store.states.set('synthetic', state);
    const service = new OriginalMiningService(store, originalSpatial, () => 1000),
      request = input(state, { type: 'cancelLaser' });
    const first = await service.mutate('synthetic', request);
    expect((await service.mutate('synthetic', request)).state).toEqual(first.state);
    expect(first.state.world.miningSession).toBeNull();
    expect(first.state.mining).toEqual(state.mining);
    expect(store.receipts.size).toBe(1);
  });
  it.each(['sale', 'reward', 'processing collection'] as const)(
    'retries %s without duplication',
    async (kind) => {
      let state = initial(),
        action: unknown;
      if (kind === 'sale') {
        state.location = 'loc.l004';
        state.world.zone = 'zone.z038';
        state.positions['fleet.v001'] = 'loc.l004';
        state.cargo['fleet.v001']!.raw['mat.m001'] = 100;
        action = { type: 'sell', ship: 'fleet.v001', material: 'mat.m001', category: 'raw', units: 100 };
      } else if (kind === 'reward') {
        state.location = 'loc.l002';
        state.world.zone = 'zone.z012';
        state = confirmFirstContractTool(acceptFirstContract(state, 0));
        state.quest!.objective = 'RETURN_TO_FOREMAN';
        state.quest!.counters = { mined: 400, refined: 0, sold: 400 };
        action = { type: 'completeFirstContract' };
      } else {
        state.world.zone = 'zone.z004';
        state.wallet = 10000;
        state.ships['fleet.v003'] = 1;
        state.positions['fleet.v003'] = 'loc.l001';
        state.mining['extract.x003']['mat.m010'] = 100;
        state = startOriginalRefinery(
          state,
          'extract.x003',
          'mat.m010',
          'process.p001',
          100,
          'synthetic-order',
          0,
        );
        action = { type: 'collectOrder', orderId: 'synthetic-order', ship: 'fleet.v001' };
      }
      const store = new MemoryStore<typeof state>();
      store.states.set('synthetic', state);
      const service = new OriginalActionService(store, () =>
          kind === 'processing collection'
            ? originalRefineryQuote(state, 'process.p001', 100).duration + 1000
            : 1000,
        ),
        request = input(state, action);
      const first = await service.mutate('synthetic', request);
      expect((await service.mutate('synthetic', request)).state).toEqual(first.state);
      expect(store.receipts.size).toBe(1);
    },
  );
});
