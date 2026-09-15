import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import {
  acceptFirstContract,
  completeFirstContract,
  confirmFirstContractTool,
  FIRST_CONTRACT_MATERIAL,
  FIRST_CONTRACT_REWARD,
  FIRST_CONTRACT_UNITS,
  sellFirstContractMaterial,
  updateFirstContractCollection,
  ensureFirstContractNode,
} from '../shared/originalQuest';
import { splitPieces } from '../shared/continuousMining';
import { originalNodeSpec } from '../shared/originalMining';

describe('original first contract', () => {
  it('creates the exact 125 + 125 + 150 assignment pieces from server-owned state', () => {
    let state = originalInitialState(randomUUID(), () => 0.5);
    state.location = 'loc.l002';
    state.world.zone = 'zone.z012';
    state = acceptFirstContract(state, 1);
    state = confirmFirstContractTool(state);
    state.world.zone = 'zone.z014';
    state = ensureFirstContractNode(state);
    const node = state.world.nodes['assignment.q001.node']!;
    expect(splitPieces(originalNodeSpec(node)).map((piece) => piece.units)).toEqual([125, 125, 150]);
  });
  it('preserves the 400-unit, 5,200 + 500 accounting contract exactly once', () => {
    let state = originalInitialState(randomUUID(), () => 0.5);
    state.location = 'loc.l002';
    state.world.zone = 'zone.z012';
    state = acceptFirstContract(state, 10);
    state = confirmFirstContractTool(state);
    state.world.nodes['assignment.q001.node'] = {
      id: 'assignment.q001.node',
      ore: 'mat.m001',
      source: 'extract.x001',
      x: 4,
      y: 4,
      size: 2,
      resistance: 0.3,
      instability: 0.2,
      yieldUnits: 400,
      status: 'FRACTURED',
      respawnAt: null,
      fragments: [
        { id: 'a', units: 125, x: 4, y: 5, collected: true },
        { id: 'b', units: 125, x: 5, y: 5, collected: true },
        { id: 'c', units: 150, x: 6, y: 5, collected: false },
      ],
    };
    state.mining['extract.x001'][FIRST_CONTRACT_MATERIAL] = 250;
    state = updateFirstContractCollection(state);
    expect(state.quest?.objective).toBe('ENTER_MINE');
    state.world.nodes['assignment.q001.node']!.fragments[2]!.collected = true;
    state.mining['extract.x001'][FIRST_CONTRACT_MATERIAL] = FIRST_CONTRACT_UNITS;
    state = updateFirstContractCollection(state);
    expect(state.quest?.counters.mined).toBe(400);
    expect(state.quest?.objective).toBe('RETURN_TO_OUTPOST');
    state = sellFirstContractMaterial(state);
    expect(state.wallet).toBe(5200);
    expect(state.quest?.counters.sold).toBe(400);
    state = completeFirstContract(state, 20);
    expect(state.wallet).toBe(5200 + FIRST_CONTRACT_REWARD);
    expect(completeFirstContract(state, 30)).toEqual(state);
  });
});
