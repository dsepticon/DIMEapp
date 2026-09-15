import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { initialState, parameters, tickMining } from '../shared/continuousMining';
import { originalInitialState } from '../shared/originalGame';
import {
  beginOriginalMining,
  beginOriginalVacuum,
  collectOriginalPiece,
  originalNodeSpec,
  resolveOriginalMining,
  type MiningSpatialCheck,
} from '../shared/originalMining';

const nodeId = 'zone.z014-synthetic';
const tiles = Array.from({ length: 9 }, (_, x) => Array.from({ length: 9 }, (_, y) => ({ x, y }))).flat();
const spatial: MiningSpatialCheck = {
  miningAllowed: (zoneId) => zoneId === 'zone.z014',
  validPosition: (_, tile) => tile.x >= 0 && tile.y >= 0 && tile.x <= 8 && tile.y <= 8,
  clearLine: () => true,
  reachableGroundTiles: () => tiles,
};
function fixture(yieldUnits = 400) {
  const state = originalInitialState(randomUUID(), () => 0.5);
  state.location = 'loc.l002';
  state.world.zone = 'zone.z014';
  state.world.nodes[nodeId] = {
    id: nodeId,
    ore: 'mat.m001',
    source: 'extract.x001',
    x: 4,
    y: 4,
    size: 3,
    resistance: 0.32,
    instability: 0.28,
    yieldUnits,
    status: 'INTACT',
    fragments: [],
    respawnAt: null,
  };
  state.world.scanner.analyzed = [nodeId];
  return state;
}
function fractureTrace(spec: ReturnType<typeof originalNodeSpec>) {
  let model = initialState();
  const runs: Array<{ held: boolean; ticks: number }> = [];
  const p = parameters(spec);
  for (let i = 0; i < 900 && model.phase !== 'fractured'; i++) {
    const held = model.charge < p.upper - p.gain;
    const last = runs.at(-1);
    if (last?.held === held) last.ticks++;
    else runs.push({ held, ticks: 1 });
    model = tickMining(model, spec, held);
  }
  expect(model.phase).toBe('fractured');
  return { runs, elapsed: model.tick * 50 };
}

describe('synthetic authoritative original mining mutations', () => {
  it('fractures from server-owned parameters into 3–8 exact reachable pieces', () => {
    const source = fixture();
    const before = structuredClone(source);
    const started = beginOriginalMining(source, nodeId, { x: 4.5, y: 5.5 }, 1000, spatial);
    expect(source).toEqual(before);
    const trace = fractureTrace(originalNodeSpec(started.world.nodes[nodeId]!));
    const resolved = resolveOriginalMining(started, trace.runs, 1000 + trace.elapsed, spatial);
    const node = resolved.world.nodes[nodeId]!;
    expect(node.status).toBe('FRACTURED');
    expect(node.fragments.length).toBeGreaterThanOrEqual(3);
    expect(node.fragments.length).toBeLessThanOrEqual(8);
    expect(node.fragments.reduce((sum, piece) => sum + piece.units, 0)).toBe(400);
    expect(new Set(node.fragments.map((piece) => `${piece.x}:${piece.y}`)).size).toBe(node.fragments.length);
    expect(resolved.revision).toBe(source.revision + 2);
  });

  it('destroys an overcharged node with no pieces and a server respawn time', () => {
    const started = beginOriginalMining(fixture(), nodeId, { x: 4.5, y: 5.5 }, 1000, spatial);
    let model = initialState();
    while (model.phase !== 'destroyed')
      model = tickMining(model, originalNodeSpec(started.world.nodes[nodeId]!), true);
    const now = 1000 + model.tick * 50;
    const result = resolveOriginalMining(started, [{ held: true, ticks: model.tick }], now, spatial);
    expect(result.world.nodes[nodeId]).toMatchObject({
      status: 'DESTROYED',
      fragments: [],
      respawnAt: now + 30 * 60 * 1000,
    });
  });

  it('keeps a full-hold piece, then collects it exactly once after space is freed', () => {
    const started = beginOriginalMining(fixture(), nodeId, { x: 4.5, y: 5.5 }, 1000, spatial);
    const trace = fractureTrace(originalNodeSpec(started.world.nodes[nodeId]!));
    const fractured = resolveOriginalMining(started, trace.runs, 1000 + trace.elapsed, spatial);
    const piece = fractured.world.nodes[nodeId]!.fragments[0]!;
    const player = { x: piece.x + 0.5, y: piece.y + 0.5 };
    const full = beginOriginalVacuum(
      fractured,
      nodeId,
      piece.id,
      player,
      1000 + trace.elapsed + 100,
      spatial,
    );
    full.mining['extract.x001']['mat.m001'] = 1200;
    const before = structuredClone(full);
    expect(() =>
      collectOriginalPiece(full, nodeId, piece.id, player, 1000 + trace.elapsed + 400, spatial),
    ).toThrow('MINING_HOLD_FULL');
    expect(full).toEqual(before);
    full.mining['extract.x001']['mat.m001'] = 0;
    const collected = collectOriginalPiece(
      full,
      nodeId,
      piece.id,
      player,
      1000 + trace.elapsed + 400,
      spatial,
    );
    expect(collected.world.nodes[nodeId]!.fragments[0]!.collected).toBe(true);
    expect(collected.mining['extract.x001']['mat.m001']).toBe(piece.units);
    expect(() =>
      collectOriginalPiece(collected, nodeId, piece.id, player, 1000 + trace.elapsed + 800, spatial),
    ).toThrow('MINING_PIECE_UNAVAILABLE');
  });

  it('rejects an unanalysed node or non-mining zone without mutation', () => {
    const state = fixture();
    state.world.scanner.analyzed = [];
    const before = structuredClone(state);
    expect(() => beginOriginalMining(state, nodeId, { x: 4.5, y: 5.5 }, 1000, spatial)).toThrow(
      'MINING_NOT_AVAILABLE',
    );
    expect(state).toEqual(before);
    state.world.scanner.analyzed = [nodeId];
    state.world.zone = 'zone.z001';
    expect(() => beginOriginalMining(state, nodeId, { x: 4.5, y: 5.5 }, 1000, spatial)).toThrow(
      'MINING_NOT_AVAILABLE',
    );
  });

  it('requires owned and occupied ground rig for vehicle extraction', () => {
    const state = fixture();
    state.world.nodes[nodeId]!.source = 'extract.x002';
    expect(() => beginOriginalMining(state, nodeId, { x: 4.5, y: 5.5 }, 1000, spatial)).toThrow(
      'MINING_TARGET_UNREACHABLE',
    );
    state.ships['fleet.v002'] = 1;
    state.world.groundVehicle = { zone: 'zone.z014', active: true, occupied: true };
    expect(
      beginOriginalMining(state, nodeId, { x: 4.5, y: 5.5 }, 1000, spatial).world.miningSession,
    ).toMatchObject({ nodeId, source: 'extract.x002', zone: 'zone.z014' });
  });
});
