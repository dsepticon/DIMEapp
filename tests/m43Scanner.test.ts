import { scannerCardLayout } from '../app/original/scannerLayout';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { originalInitialState } from '../shared/originalGame';
import { populateOriginalZone } from '../shared/originalDiscovery';
import { nodeInteractionTiles } from '../shared/originalNodePlacement';
import { originalSpatial } from '../shared/originalSpatial';
import { analysisStatus, scannerCandidates, scannerSignals, SCANNER_RANGE } from '../shared/originalScanner';
import { originalZoneMap } from '../shared/originalWorld';
import { OriginalActionService } from '../server/originalActionService';
import { MemoryStore } from '../server/store';
function fixture() {
  const s = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5);
  s.location = 'loc.l002';
  s.world.zone = 'zone.z014';
  const state = populateOriginalZone(s),
    node = Object.values(state.world.nodes).find((n) => n.source === 'extract.x001')!,
    tile = nodeInteractionTiles(state.world.zone, node)[0]!;
  const player = { x: tile.x + 0.5, y: tile.y + 0.5 };
  const store = new MemoryStore<typeof state>();
  store.states.set('synthetic-scanner', state);
  return {
    state,
    node,
    player,
    store,
    service: new OriginalActionService(store),
    request: {
      requestId: randomUUID(),
      expectedRevision: state.revision,
      expectedGeneration: state.saveGeneration,
      action: { type: 'analyzeNearby', nodeId: node.id, player },
    },
  };
}
describe('menu-free scanner', () => {
  it('ping is bounded, positional only, stable and non-mutating', () => {
    const { state, player } = fixture(),
      before = structuredClone(state);
    const a = scannerSignals(state, player, 'S');
    expect(scannerSignals(state, player, 'S')).toEqual(a);
    expect(a.length).toBeLessThanOrEqual(8);
    for (const x of a) {
      expect(x).not.toHaveProperty('ore');
      expect(x).not.toHaveProperty('yieldUnits');
      expect(x.distance).toBeLessThanOrEqual(8);
    }
    expect(state).toEqual(before);
  });
  it('sorts facing candidates by distance then stable ID and excludes rear signals', () => {
    const { state, node } = fixture();
    const p = { x: node.x + 0.5, y: node.y - 0.5 };
    state.world.nodes = {};
    for (const id of ['b', 'a'])
      state.world.nodes['zone.z014.node.' + id] = { ...node, id: 'zone.z014.node.' + id };
    expect(scannerCandidates(state, p, 'S').map((n) => n.id)).toEqual([
      'zone.z014.node.a',
      'zone.z014.node.b',
    ]);
    expect(scannerCandidates(state, p, 'N')).toEqual([]);
  });
  it('uses the legitimate scanner range boundary and authoritative collision', () => {
    const { state, node } = fixture();
    const options = [
      { x: node.x + 0.5 - SCANNER_RANGE, y: node.y + 0.5 },
      { x: node.x + 0.5 + SCANNER_RANGE, y: node.y + 0.5 },
      { x: node.x + 0.5, y: node.y + 0.5 - SCANNER_RANGE },
      { x: node.x + 0.5, y: node.y + 0.5 + SCANNER_RANGE },
    ];
    const player = options.find(
      (p) =>
        originalSpatial.validPosition(state.world.zone, p) &&
        originalSpatial.clearLine(state.world.zone, p, { x: node.x + 0.5, y: node.y + 0.5 }),
    )!;
    expect(player).toBeDefined();
    expect(analysisStatus(state, node.id, player)).toBe('Ready');
    const dx = player.x - node.x - 0.5,
      dy = player.y - node.y - 0.5;
    expect(analysisStatus(state, node.id, { x: player.x + dx * 0.0001, y: player.y + dy * 0.0001 })).toBe(
      'Out of range',
    );
    expect(analysisStatus(state, node.id, { x: 0, y: 0 })).toBe('Obstructed');
  });
  it('rejects unsupported tools, unrelated zones, missing and fractured nodes', () => {
    const { state, node, player } = fixture();
    state.equipment['gear.e001'] = 0;
    expect(analysisStatus(state, node.id, player)).toBe('Unsupported node');
    state.equipment['gear.e001'] = 1;
    node.status = 'FRACTURED';
    expect(analysisStatus(state, node.id, player)).toBe('No signal');
    node.status = 'INTACT';
    state.world.zone = 'zone.z024';
    expect(analysisStatus(state, node.id, player)).toBe('No signal');
    expect(analysisStatus(state, 'missing', player)).toBe('No signal');
  });
  it('confirms without menu scan, persists and replays once', async () => {
    const { service, store, request, node } = fixture();
    const first = await service.mutate('synthetic-scanner', request),
      replay = await service.mutate('synthetic-scanner', request);
    expect(first.state.world.scanner.analyzed).toContain(node.id);
    expect(first.state.world.scanner.analyses).toBe(1);
    expect(replay.replayed).toBe(true);
    expect(replay.state).toEqual(first.state);
    expect((await store.read('synthetic-scanner'))?.world.scanner.analyzed).toContain(node.id);
  });
  for (const fault of [
    'range',
    'wall',
    'generation',
    'revision',
    'missing-position',
    'other-player',
  ] as const)
    it(`rejects ${fault} without mutation`, async () => {
      const { service, store, request, state, node } = fixture();
      const body = structuredClone(request);
      if (fault === 'range') {
        const map = originalZoneMap(state.world.zone);
        const cell = map.tiles.findIndex(
          (v, i) => !!v && Math.hypot((i % map.width) - node.x, Math.floor(i / map.width) - node.y) > 5,
        );
        body.action.player = { x: (cell % map.width) + 0.5, y: Math.floor(cell / map.width) + 0.5 };
      }
      if (fault === 'wall') body.action.player = { x: 0, y: 0 };
      if (fault === 'generation') body.expectedGeneration = randomUUID();
      if (fault === 'revision') body.expectedRevision++;
      if (fault === 'missing-position') Reflect.deleteProperty(body.action, 'player');
      await expect(
        service.mutate(fault === 'other-player' ? 'other' : 'synthetic-scanner', body),
      ).rejects.toBeDefined();
      expect(await store.read('synthetic-scanner')).toEqual(state);
      expect(store.receipts.size).toBe(0);
    });
});

it('places analysis details clear of north/south targets and clamped-camera players', () => {
  for (const height of [500, 640, 900])
    for (const py of [70, 170, height / 2, height - 70])
      for (const offset of [-48, 0, 48]) {
        const ny = py + offset,
          layout = scannerCardLayout(height, 80, 52, py, ny);
        const y = 'top' in layout ? layout.top! : height - layout.bottom! - layout.maxHeight;
        expect(
          y + layout.maxHeight <= Math.min(py - 14, ny - 24) - 8 || y >= Math.max(py + 14, ny + 24) + 8,
        ).toBe(true);
        expect(layout.maxHeight).toBeGreaterThanOrEqual(44);
      }
});
