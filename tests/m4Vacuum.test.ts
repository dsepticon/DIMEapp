import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { originalInitialState } from '../shared/originalGame';
import { originalZoneMap } from '../shared/originalWorld';
import { originalSpatial } from '../shared/originalSpatial';
import { nearestFragment, vacuumEligibility, vacuumDuration, fragmentCenter } from '../shared/originalVacuum';
import { attractedPosition } from '../app/original/VacuumConsole';
import { beginOriginalVacuum, collectOriginalPiece } from '../shared/originalMining';
import { OriginalMiningService } from '../server/originalMiningService';
import { MemoryStore } from '../server/store';
export function vacuumFixture() {
  const state = originalInitialState(randomUUID(), () => 0.5),
    map = originalZoneMap('zone.z014');
  state.location = 'loc.l002';
  state.world.zone = map.id;
  const node = {
    id: map.id + '.node.vacuum',
    ore: 'mat.m001' as const,
    source: 'extract.x001' as const,
    x: map.spawn.x,
    y: map.spawn.y,
    size: 1,
    resistance: 0.6,
    instability: 0.2,
    yieldUnits: 300,
    status: 'FRACTURED' as const,
    respawnAt: null,
    fragments: [
      { id: 'piece-b', x: map.spawn.x + 1, y: map.spawn.y, units: 100, collected: false },
      { id: 'piece-a', x: map.spawn.x - 1, y: map.spawn.y, units: 100, collected: false },
      { id: 'piece-c', x: map.spawn.x, y: map.spawn.y + 1, units: 100, collected: false },
    ],
  };
  state.world.nodes[node.id] = node;
  state.world.scanner.analyzed = [node.id];
  return { state, node, map, player: fragmentCenter(map.spawn) };
}
describe('shared authoritative vacuum field', () => {
  it('selects nearest with stable piece-ID tie break, independent of object order', () => {
    const f = vacuumFixture();
    expect(nearestFragment(f.state, f.player)?.piece.id).toBe('piece-a');
    f.node.fragments.reverse();
    expect(nearestFragment(f.state, f.player)?.piece.id).toBe('piece-a');
    expect(nearestFragment(f.state, { x: f.player.x + 0.4, y: f.player.y })?.piece.id).toBe('piece-b');
  });
  it('accepts proximity at radius boundary and rejects beyond it', () => {
    const f = vacuumFixture(),
      p = f.node.fragments[0]!,
      point = fragmentCenter(p),
      spatial = { ...originalSpatial, validPosition: () => true, clearLine: () => true };
    expect(vacuumEligibility(f.state, f.node, p, { x: point.x - 2.2, y: point.y }, spatial)).toBe(
      'AVAILABLE',
    );
    expect(vacuumEligibility(f.state, f.node, p, { x: point.x - 2.201, y: point.y }, spatial)).toBe(
      'OUT_OF_RANGE',
    );
  });
  it('walls exclude pieces and cannot be bypassed by automatic selection', () => {
    const f = vacuumFixture(),
      spatial = { ...originalSpatial, clearLine: () => false };
    expect(nearestFragment(f.state, f.player, spatial)).toBeUndefined();
    expect(() => beginOriginalVacuum(f.state, f.node.id, 'piece-a', f.player, 0, spatial)).toThrow(
      'MINING_TARGET_UNREACHABLE',
    );
  });
  it('uses the same half-tile center for sprite and range, independent of camera offset', () => {
    const f = vacuumFixture(),
      piece = f.node.fragments[0]!;
    expect(attractedPosition(piece, f.player, 0)).toEqual(fragmentCenter(piece));
    for (const camera of [
      { x: 0, y: 0 },
      { x: 19, y: 23 },
    ]) {
      const screen = { x: (piece.x + 0.5 - camera.x) * 24, y: (piece.y + 0.5 - camera.y) * 24 };
      expect({ x: screen.x / 24 + camera.x, y: screen.y / 24 + camera.y }).toEqual(fragmentCenter(piece));
    }
    expect(attractedPosition(piece, f.player, 1)).toEqual(f.player);
  });
  it('requires the collection threshold and conserves exact quantities across all existing pieces', () => {
    const f = vacuumFixture();
    let state = f.state,
      time = 0;
    for (const piece of f.node.fragments) {
      const player = fragmentCenter(piece);
      state = beginOriginalVacuum(state, f.node.id, piece.id, player, time, originalSpatial);
      expect(() =>
        collectOriginalPiece(
          state,
          f.node.id,
          piece.id,
          player,
          time + vacuumDuration(0) - 1,
          originalSpatial,
        ),
      ).toThrow('MINING_EXTRACTION_TIMING');
      time += vacuumDuration(0);
      state = collectOriginalPiece(state, f.node.id, piece.id, player, time, originalSpatial);
    }
    expect(state.mining['extract.x001']['mat.m001']).toBe(300);
    expect(state.world.nodes[f.node.id]!.status).toBe('DEPLETED');
    expect(
      state.world.nodes[f.node.id]!.fragments.map((p) => ({ id: p.id, x: p.x, y: p.y, units: p.units })),
    ).toEqual(f.node.fragments.map((p) => ({ id: p.id, x: p.x, y: p.y, units: p.units })));
  });
  it('rejects a full hold at start without changing piece, state or session', () => {
    const f = vacuumFixture();
    f.state.mining['extract.x001']['mat.m001'] = 1200;
    const before = structuredClone(f.state);
    expect(() => beginOriginalVacuum(f.state, f.node.id, 'piece-a', f.player, 0, originalSpatial)).toThrow(
      'MINING_HOLD_FULL',
    );
    expect(f.state).toEqual(before);
  });
  it('rejects intact nodes, wrong zones, absent tools and concurrent laser mode', () => {
    const f = vacuumFixture();
    const before = structuredClone(f.state);
    f.node.status = 'INTACT' as typeof f.node.status;
    expect(nearestFragment(f.state, f.player)).toBeUndefined();
    f.node.status = 'FRACTURED';
    f.state.world.zone = 'zone.z012';
    expect(nearestFragment(f.state, f.player)).toBeUndefined();
    f.state.world.zone = before.world.zone;
    f.state.equipment = {};
    expect(nearestFragment(f.state, f.player)).toBeUndefined();
    f.state.equipment = before.equipment;
    f.state.world.miningSession = {
      nodeId: f.node.id,
      source: 'extract.x001',
      zone: f.state.world.zone,
      startedAt: 0,
    };
    expect(nearestFragment(f.state, f.player)).toBeUndefined();
  });
  it('keeps source node size checks separate from an already-fractured hand-tool piece', () => {
    const f = vacuumFixture();
    f.node.size = 5;
    expect(nearestFragment(f.state, f.player)?.piece.id).toBe('piece-a');
  });
  it('protects generation, revision and player isolation, then replays without duplicate quantity', async () => {
    const f = vacuumFixture(),
      store = new MemoryStore<typeof f.state>();
    store.states.set('synthetic-a', f.state);
    const other = originalInitialState(randomUUID(), () => 0.5);
    store.states.set('synthetic-b', other);
    let now = 0;
    const service = new OriginalMiningService(store, originalSpatial, () => now);
    const request = {
      requestId: randomUUID(),
      expectedGeneration: f.state.saveGeneration,
      expectedRevision: 0,
      action: { type: 'startVacuum', nodeId: f.node.id, pieceId: 'piece-a', player: f.player },
    };
    await expect(service.mutate('synthetic-b', request)).rejects.toMatchObject({
      code: 'GENERATION_CONFLICT',
    });
    await expect(service.mutate('synthetic-a', { ...request, expectedRevision: 1 })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    const started = await service.mutate('synthetic-a', request);
    now = 1000;
    const finish = {
      ...request,
      requestId: randomUUID(),
      expectedRevision: started.state.revision,
      action: { ...request.action, type: 'finishVacuum' },
    };
    const first = await service.mutate('synthetic-a', finish),
      replayed = await service.mutate('synthetic-a', finish);
    expect(replayed.replayed).toBe(true);
    expect(replayed.state).toEqual(first.state);
    expect(first.state.mining['extract.x001']['mat.m001']).toBe(100);
    expect(store.states.get('synthetic-b')).toEqual(other);
  });
});
