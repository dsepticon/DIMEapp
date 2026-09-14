import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyAction, initialState } from '../shared/game';
import { generatedNodes } from '../shared/miningWorld';
import { ZONES } from '../shared/world';
import type { Action, PlayerState } from '../shared/schema';

const act = (state: PlayerState, action: Action, now = 0) =>
  applyAction(state, action, now, randomUUID(), () => 0.5);

describe('owned ROC retrieval and mining', () => {
  it('rejects unowned retrieval and does not mint a vehicle', () => {
    const state = initialState(() => 0.5);
    state.location = 'Lyria';
    state.world!.zone = 'LYRIA_ASOP';
    expect(() => act(state, { type: 'retrieveRoc' })).toThrow();
    expect(state.ships.Roc).toBeUndefined();
  });

  it('retrieves one owned ROC, carries it to a surface, and stores fractional yield only in ROC cargo', () => {
    let state = initialState(() => 0.5);
    state.saveGeneration = randomUUID();
    state.location = 'Lyria';
    state.positions.Roc = 'Lyria';
    state.ships.Roc = 1;
    state.world!.zone = 'LYRIA_ASOP';
    state = act(state, { type: 'retrieveRoc' });
    expect(state.world?.roc).toMatchObject({ active: true, occupied: false, zone: 'LYRIA_ASOP' });
    expect(() => act(state, { type: 'retrieveRoc' })).toThrow();
    state = act(state, { type: 'enterRoc', occupied: true });
    state = act(state, { type: 'enterZone', zone: 'LYRIA_OUTPOST_01' });
    state = act(state, { type: 'enterZone', zone: 'LYRIA_SURFACE_01' });
    state = act(state, { type: 'enterZone', zone: 'LYRIA_SURFACE_02' });
    expect(state.world?.roc?.zone).toBe('LYRIA_SURFACE_02');
    const node = generatedNodes(state.saveGeneration!, ZONES.LYRIA_SURFACE_02)[0];
    state = act(state, { type: 'scanZone' });
    state = act(state, { type: 'analyzeNode', nodeId: node.id });
    state = act(state, { type: 'beginFracture', nodeId: node.id, source: 'Roc' }, 1);
    state = act(state, { type: 'completeFracture', nodeId: node.id }, 20_000);
    for (const piece of state.world!.nodes[node.id].fragments)
      state = act(state, { type: 'collectPiece', nodeId: node.id, pieceId: piece.id }, 20_001);
    const held = state.mining.Roc[node.ore] ?? 0;
    expect(held).toBe(node.yieldUnits);
    expect(state.mining.Hand[node.ore] ?? 0).toBe(0);
    expect(state.world?.nodes[node.id].status).toBe('DEPLETED');
  });
});
