import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyAction, initialState } from '../shared/game';
import type { Action, PlayerState } from '../shared/schema';

function act(state: PlayerState, action: Action, now = 0) {
  return applyAction(state, action, now, randomUUID(), () => 0.5);
}

describe('physical Milestone 3 First Shift', () => {
  it('starts in ARC-L1, travels, scans, fractures, collects and sells raw gems once', () => {
    let state = initialState(() => 0.5);
    state.saveGeneration = randomUUID();
    expect(state.world?.zone).toBe('ARC_L1_START');
    state = act(state, { type: 'enterZone', zone: 'ARC_L1_CONCOURSE' });
    state = act(state, { type: 'enterZone', zone: 'ARC_L1_TRANSIT' });
    state = act(state, { type: 'enterZone', zone: 'ARC_L1_DEPARTURE' });
    state = act(state, { type: 'assignDeparture', ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    expect(state.world?.departure).toEqual({ ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    state = act(state, { type: 'enterZone', zone: 'ARC_L1_HANGAR' });
    state = act(state, { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    state = act(state, { type: 'finish' }, 100_000);
    expect(state.location).toBe('Lyria');
    expect(state.world?.zone).toBe('LYRIA_OUTPOST_01');
    state = act(state, { type: 'firstShift', step: 'accept' });
    expect(state.firstShift?.version).toBe(3);
    state = act(state, { type: 'firstShift', step: 'checkTool' });
    state = act(state, { type: 'enterZone', zone: 'LYRIA_SURFACE_01' });
    expect(state.firstShift?.objective).toBe('SCAN_ASSIGNED_NODE');
    state = act(state, { type: 'scanZone' });
    state = act(state, { type: 'analyzeNode', nodeId: 'LYRIA_SURFACE_01-tutorial' });
    state = act(
      state,
      { type: 'beginFracture', nodeId: 'LYRIA_SURFACE_01-tutorial', source: 'Hand' },
      100_000,
    );
    state = act(state, { type: 'completeFracture', nodeId: 'LYRIA_SURFACE_01-tutorial' }, 120_000);
    expect(state.firstShift?.objective).toBe('COLLECT_ASSIGNED_GEMS');
    const pieces = state.world!.nodes['LYRIA_SURFACE_01-tutorial'].fragments;
    expect(pieces.map((piece) => piece.units)).toEqual([125, 125, 150]);
    expect(pieces.reduce((sum, piece) => sum + piece.units, 0)).toBe(400);
    for (const [index, piece] of pieces.entries()) {
      state = act(
        state,
        { type: 'collectPiece', nodeId: 'LYRIA_SURFACE_01-tutorial', pieceId: piece.id },
        120_001,
      );
      if (index < 2) {
        expect(state.firstShift?.objective).toBe('COLLECT_ASSIGNED_GEMS');
        expect(state.firstShift?.counters.mined).toBe(0);
        expect(
          state.world?.nodes['LYRIA_SURFACE_01-tutorial'].fragments.filter((item) => !item.collected),
        ).toHaveLength(2 - index);
        state = structuredClone(state); // Equivalent serialized snapshot after a refresh.
        expect(() =>
          act(state, { type: 'collectPiece', nodeId: 'LYRIA_SURFACE_01-tutorial', pieceId: piece.id }),
        ).toThrow();
      }
    }
    expect(state.firstShift?.counters.mined).toBe(4);
    expect(state.firstShift?.objective).toBe('RETURN_TO_OUTPOST');
    expect(state.mining.Hand.Dolivine).toBe(400);
    state = act(state, { type: 'enterZone', zone: 'LYRIA_OUTPOST_01' });
    state = act(state, { type: 'firstShift', step: 'sell' });
    expect(state.wallet).toBe(5_200);
    expect(state.firstShift?.counters.sold).toBe(4);
    state = act(state, { type: 'firstShift', step: 'complete' });
    expect(state.wallet).toBe(5_700);
    expect(state.firstShift?.counters).toEqual({ mined: 4, refined: 0, sold: 4 });
    expect(() => act(state, { type: 'firstShift', step: 'complete' })).toThrow();
    expect(() => act(state, { type: 'firstShift', step: 'sell' })).toThrow();
  });
});
