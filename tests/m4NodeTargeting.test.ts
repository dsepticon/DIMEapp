import { describe, it, expect } from 'vitest';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
import { originalInitialState } from '../shared/originalGame';
import { populateOriginalZone, scanOriginalZone, refreshOriginalRespawns } from '../shared/originalDiscovery';
import {
  nodePlacementCells,
  nodeInteractionTiles,
  placementAvailable,
  relocateInvalidOriginalNodes,
} from '../shared/originalNodePlacement';
import {
  nodeTargetStatus,
  nodeToolRange,
  forwardNodeCandidates,
  pointedNode,
  nodePixelWidth,
} from '../shared/originalNodeTargeting';
import { originalSpatial } from '../shared/originalSpatial';
import { beginOriginalMining } from '../shared/originalMining';
import { originalZoneMap } from '../shared/originalWorld';
import { drawNodeFormation } from '../app/original/nodeArt';
const fresh = (zone = 'zone.z024', seed = 0) => {
  const s = originalInitialState('00000000-0000-4000-8000-' + String(seed).padStart(12, '0'), () => 0.5);
  s.world.zone = zone;
  s.location = ORIGINAL_CONTENT.zones.find((z) => z.id === zone)!.location;
  return s;
};
describe('node placement and targeting', () => {
  it('200 deterministic seeds in every mining zone have safe separated centers and basic-range approaches', () => {
    for (const zone of ORIGINAL_CONTENT.zones.filter((z) => z.regionCount > 0)) {
      const cells = new Set(nodePlacementCells(zone.id).map((p) => `${p.x},${p.y}`));
      for (let seed = 0; seed < 200; seed++) {
        const state = populateOriginalZone(fresh(zone.id, seed)),
          nodes = Object.values(state.world.nodes);
        expect(nodes.length).toBeGreaterThanOrEqual(3);
        for (const n of nodes) {
          expect(cells.has(`${n.x},${n.y}`)).toBe(true);
          expect(nodeInteractionTiles(zone.id, n).length).toBeGreaterThan(0);
          expect(
            placementAvailable(
              n,
              nodes.filter((x) => x.id !== n.id),
              [],
            ),
          ).toBe(true);
          if (n.source === 'extract.x001') expect(nodeToolRange(state, n)).toBe(2.2);
          for (const tile of nodeInteractionTiles(zone.id, n))
            expect(nodeTargetStatus(state, n, { x: tile.x + 0.5, y: tile.y + 0.5 })).toBe('In range');
        }
        expect(populateOriginalZone(state).world.nodes).toEqual(
          nodes.reduce((a, n) => ({ ...a, [n.id]: n }), {}),
        );
      }
    }
  }, 30000);
  it('invalid persisted positions relocate deterministically without changing identity, parameters, epoch or pieces', () => {
    const s = populateOriginalZone(fresh());
    const ns = Object.values(s.world.nodes);
    ns[0]!.x = 0;
    ns[0]!.y = 0;
    ns[0]!.respawnAt = 999999;
    ns[0]!.size = 5;
    ns[1]!.status = 'FRACTURED';
    ns[1]!.fragments = [{ id: 'synthetic-existing', x: ns[1]!.x, y: ns[1]!.y, units: 17, collected: false }];
    const before = structuredClone(s),
      a = structuredClone(s),
      b = structuredClone(s);
    relocateInvalidOriginalNodes(a);
    relocateInvalidOriginalNodes(b);
    expect(a).toEqual(b);
    const moved = a.world.nodes[ns[0]!.id]!;
    expect({ x: moved.x, y: moved.y }).not.toEqual({ x: 0, y: 0 });
    expect({ ...moved, x: 0, y: 0 }).toEqual({ ...before.world.nodes[moved.id]!, x: 0, y: 0 });
    expect(a.world.nodes[ns[1]!.id]).toEqual(before.world.nodes[ns[1]!.id]);
    expect(a.revision).toBe(before.revision);
    expect(scanOriginalZone(s, 1).revision).toBe(s.revision + 1);
    expect(s).toEqual(before);
  });
  it('respawn validates current-zone placement and does not restore collected fragments during relocation', () => {
    const s = populateOriginalZone(fresh());
    const n = Object.values(s.world.nodes)[0]!;
    n.status = 'DESTROYED';
    n.respawnAt = 10;
    n.x = 0;
    n.y = 0;
    const next = refreshOriginalRespawns(s, 11);
    expect(next.world.nodes[n.id]!.status).toBe('INTACT');
    expect(nodeInteractionTiles(s.world.zone, next.world.nodes[n.id]!).length).toBeGreaterThan(0);
    n.status = 'FRACTURED';
    n.fragments = [{ id: 'synthetic-collected', x: 1, y: 1, units: 20, collected: true }];
    n.respawnAt = null;
    const a = scanOriginalZone(s);
    expect(a.world.nodes[n.id]!.fragments).toEqual(n.fragments);
  });
  it('all three newly generated tunnel nodes can start within basic range; oversized persisted nodes require the occupied rig', () => {
    const s = populateOriginalZone(fresh());
    s.world.scanner.analyzed = Object.keys(s.world.nodes);
    for (const n of Object.values(s.world.nodes)) {
      const p = nodeInteractionTiles(s.world.zone, n)[0]!;
      expect(
        beginOriginalMining(s, n.id, { x: p.x + 0.5, y: p.y + 0.5 }, 0, originalSpatial).world.miningSession
          ?.nodeId,
      ).toBe(n.id);
    }
    const n = Object.values(s.world.nodes)[0]!;
    n.size = 4;
    expect(nodeToolRange(s, n)).toBe(0);
    s.ships['fleet.v002'] = 1;
    s.world.groundVehicle = { active: true, occupied: true, zone: s.world.zone };
    expect(nodeToolRange(s, n)).toBe(4.5);
  });
  it('forward field sorts by angle then distance then stable ID and rejects walls/range/unrelated zones', () => {
    const s = populateOriginalZone(fresh()),
      map = originalZoneMap(s.world.zone),
      base = Object.values(s.world.nodes)[0]!;
    const p = { x: map.spawn.x + 0.5, y: map.spawn.y + 0.5 };
    s.world.nodes = {};
    for (const [id, x, y] of [
      ['b', 1, 0],
      ['a', 1, 0],
      ['near', 1, 1],
      ['far', 2, 0],
    ] as const) {
      const n = {
        ...base,
        id: s.world.zone + '.node.' + id,
        x: map.spawn.x + x,
        y: map.spawn.y + y,
        size: 1,
      };
      s.world.nodes[n.id] = n;
    }
    expect(forwardNodeCandidates(s, p, 'E').map((t) => t.node.id.split('.').at(-1))).toEqual([
      'a',
      'b',
      'far',
      'near',
    ]);
    expect(forwardNodeCandidates(s, p, 'W')).toHaveLength(0);
    const n = Object.values(s.world.nodes)[0]!;
    n.x = 0;
    n.y = 0;
    expect(nodeTargetStatus(s, n, p)).toBe('Obstructed');
    n.x = map.spawn.x + 3;
    n.y = map.spawn.y;
    expect(nodeTargetStatus(s, n, p)).not.toBe('In range');
    n.id = 'zone.z014.node.other';
    expect(nodeTargetStatus(s, n, p)).toBe('Unavailable');
  });
  it('padded pointer selection ignores fragments and non-intact nodes and is independent of camera', () => {
    const s = populateOriginalZone(fresh()),
      n = Object.values(s.world.nodes)[0]!;
    s.world.nodes = { [n.id]: n };
    const p = { x: n.x + 0.5 + (nodePixelWidth(n.size) / 2 + 5) / 24, y: n.y + 0.5 };
    expect(pointedNode(s, p)?.id).toBe(n.id);
    for (const camera of [
      { x: 0, y: 0 },
      { x: 13, y: 8 },
    ])
      for (const scale of [24, 48]) {
        const screen = { x: (p.x - camera.x) * scale, y: (p.y - camera.y) * scale };
        expect(pointedNode(s, { x: screen.x / scale + camera.x, y: screen.y / scale + camera.y })?.id).toBe(
          n.id,
        );
      }
    n.status = 'FRACTURED';
    n.fragments = [{ id: 'synthetic-fragment', x: n.x, y: n.y, units: 1, collected: false }];
    expect(pointedNode(s, p)).toBeUndefined();
  });
  it('formation tiers exceed fragments and undiscovered material does not affect pixels; analysis adds shape cues', () => {
    expect(new Set([1, 2, 3, 4, 5].map(nodePixelWidth)).size).toBe(5);
    for (const size of [1, 2, 3, 4, 5]) expect(nodePixelWidth(size)).toBeGreaterThan(12);
    const render = (mineral?: string) => {
      const commands: unknown[] = [];
      const ctx = new Proxy(
        {},
        {
          set(_t, k, v) {
            commands.push([k, v]);
            return true;
          },
          get(_t, k) {
            return (...args: unknown[]) => commands.push([k, ...args]);
          },
        },
      ) as CanvasRenderingContext2D;
      drawNodeFormation(ctx, 20, 20, 3, mineral, true, false, 0, true);
      return commands;
    };
    expect(render()).toEqual(render());
    expect(render('mat.m001')).not.toEqual(render());
    expect(render('mat.m001').some((c) => Array.isArray(c) && c[0] === 'strokeRect')).toBe(true);
  });
});
it('relocation commits only with matching revision/generation and replay does not move or duplicate nodes', async () => {
  const { OriginalActionService } = await import('../server/originalActionService');
  const { MemoryStore } = await import('../server/store');
  const { randomUUID } = await import('node:crypto');
  const s = populateOriginalZone(fresh()),
    n = Object.values(s.world.nodes)[0]!;
  n.x = 0;
  n.y = 0;
  const store = new MemoryStore<typeof s>();
  store.states.set('synthetic-placement', s);
  const service = new OriginalActionService(store, () => 1);
  const request = {
    requestId: randomUUID(),
    expectedGeneration: s.saveGeneration,
    expectedRevision: s.revision,
    action: { type: 'scan' },
  };
  await expect(
    service.mutate('synthetic-placement', { ...request, expectedGeneration: randomUUID() }),
  ).rejects.toMatchObject({ code: 'GENERATION_CONFLICT' });
  expect(store.states.get('synthetic-placement')).toEqual(s);
  const first = await service.mutate('synthetic-placement', request);
  expect(first.state.world.nodes[n.id]!.x).not.toBe(0);
  const replay = await service.mutate('synthetic-placement', request);
  expect(replay.replayed).toBe(true);
  expect(replay.state).toEqual(first.state);
  expect(Object.keys(replay.state.world.nodes)).toHaveLength(3);
});
