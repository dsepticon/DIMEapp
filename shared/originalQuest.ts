import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalStateSchema, type OriginalPlayerState } from './originalSchema';
import { settleSale } from './mineralUnits';
import { originalZoneMap } from './originalWorld';
import { nodePlacementCells, placementAvailable } from './originalNodePlacement';

export const FIRST_CONTRACT_UNITS = 400;
export const FIRST_CONTRACT_REWARD = 500;
export const FIRST_CONTRACT_MATERIAL = 'mat.m001' as const;
export const FIRST_CONTRACT_NODE = 'assignment.q001.node';

export function ensureFirstContractNode(source: OriginalPlayerState): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  if (
    state.world.zone !== 'zone.z014' ||
    state.quest?.status !== 'ACTIVE' ||
    state.world.nodes[FIRST_CONTRACT_NODE]
  )
    return state;
  const map = originalZoneMap(state.world.zone);
  const existing = Object.values(state.world.nodes).filter(
    (n) => n.id.startsWith(state.world.zone + '.') || n.id.startsWith(state.world.zone + '-'),
  );
  const fragments = existing.flatMap((n) => n.fragments.filter((p) => !p.collected));
  const tile = nodePlacementCells(state.world.zone)
    .filter((p) => placementAvailable(p, existing, fragments))
    .sort(
      (a, b) =>
        Math.hypot(a.x - map.spawn.x, a.y - map.spawn.y) - Math.hypot(b.x - map.spawn.x, b.y - map.spawn.y) ||
        a.y - b.y ||
        a.x - b.x,
    )[0];
  if (!tile) throw Error('NO_SAFE_NODE_REGION');
  state.world.nodes[FIRST_CONTRACT_NODE] = {
    id: FIRST_CONTRACT_NODE,
    ore: FIRST_CONTRACT_MATERIAL,
    source: 'extract.x001',
    x: tile.x,
    y: tile.y,
    size: 1,
    resistance: 0.6,
    instability: 0.2,
    yieldUnits: 400,
    status: 'INTACT',
    fragments: [],
    respawnAt: null,
  };
  return originalStateSchema.parse(state);
}

const clone = (source: OriginalPlayerState) => originalStateSchema.parse(structuredClone(source));
const quest = (state: OriginalPlayerState) => {
  if (!state.quest) throw new Error('ASSIGNMENT_NOT_ACTIVE');
  return state.quest;
};

export function acceptFirstContract(source: OriginalPlayerState, now: number): OriginalPlayerState {
  const state = clone(source);
  if (state.location !== 'loc.l002' || state.world.zone !== 'zone.z012')
    throw new Error('ASSIGNMENT_LOCATION');
  if (state.quest?.status === 'COMPLETE') return state;
  if (state.quest?.status === 'ACTIVE') throw new Error('ASSIGNMENT_ALREADY_ACTIVE');
  state.quest = {
    id: 'quest.q001',
    version: 4,
    reconciliation: 'NONE',
    status: 'ACTIVE',
    objective: 'CHECK_EQUIPMENT',
    counters: { mined: 0, refined: 0, sold: 0 },
    acceptedAt: now,
    completedAt: null,
    rewardClaimed: false,
    toolRecovered: false,
    dialogueFlags: ['foremanIntro'],
    unlockedQuests: [],
    tutorialOrderId: null,
  };
  state.revision++;
  return originalStateSchema.parse(state);
}

export function confirmFirstContractTool(source: OriginalPlayerState): OriginalPlayerState {
  const state = clone(source);
  const assignment = quest(state);
  if (assignment.objective !== 'CHECK_EQUIPMENT' || (state.equipment['gear.e001'] ?? 0) < 1)
    throw new Error('STARTER_TOOL_REQUIRED');
  assignment.toolRecovered = true;
  assignment.objective = 'ENTER_MINE';
  state.revision++;
  return originalStateSchema.parse(state);
}

/** Called after an authoritative piece collection; partial collection never advances the objective. */
export function updateFirstContractCollection(
  source: OriginalPlayerState,
  nodeId = FIRST_CONTRACT_NODE,
): OriginalPlayerState {
  const state = clone(source);
  const assignment = state.quest;
  if (!assignment || assignment.status !== 'ACTIVE') return state;
  if (nodeId !== FIRST_CONTRACT_NODE) return state;
  const node = state.world.nodes[nodeId];
  if (!node || node.ore !== FIRST_CONTRACT_MATERIAL || node.yieldUnits !== FIRST_CONTRACT_UNITS) return state;
  const collected = node.fragments
    .filter((piece) => piece.collected)
    .reduce((sum, piece) => sum + piece.units, 0);
  assignment.counters.mined = Math.min(FIRST_CONTRACT_UNITS, collected);
  if (collected === FIRST_CONTRACT_UNITS) assignment.objective = 'RETURN_TO_OUTPOST';
  state.revision++;
  return originalStateSchema.parse(state);
}

export function sellFirstContractMaterial(source: OriginalPlayerState): OriginalPlayerState {
  const state = clone(source);
  const assignment = quest(state);
  if (
    state.location !== 'loc.l002' ||
    state.world.zone !== 'zone.z012' ||
    !['RETURN_TO_OUTPOST', 'SELL_MINED_GEM'].includes(assignment.objective)
  )
    throw new Error('ASSIGNMENT_LOCATION');
  if ((state.mining['extract.x001'][FIRST_CONTRACT_MATERIAL] ?? 0) < FIRST_CONTRACT_UNITS)
    throw new Error('ASSIGNED_MATERIAL_REQUIRED');
  const material = ORIGINAL_CONTENT.minerals.find((item) => item.id === FIRST_CONTRACT_MATERIAL)!;
  const settlement = settleSale(FIRST_CONTRACT_UNITS, material.rawPricePerScu, state.walletRemainder ?? 0);
  state.mining['extract.x001'][FIRST_CONTRACT_MATERIAL] =
    (state.mining['extract.x001'][FIRST_CONTRACT_MATERIAL] ?? 0) - FIRST_CONTRACT_UNITS;
  state.wallet += settlement.credit;
  state.walletRemainder = settlement.remainder;
  assignment.counters.sold = FIRST_CONTRACT_UNITS;
  assignment.objective = 'RETURN_TO_FOREMAN';
  state.revision++;
  return originalStateSchema.parse(state);
}

export function completeFirstContract(source: OriginalPlayerState, now: number): OriginalPlayerState {
  const state = clone(source);
  const assignment = quest(state);
  if (assignment.status === 'COMPLETE' || assignment.rewardClaimed) return state;
  if (
    state.location !== 'loc.l002' ||
    state.world.zone !== 'zone.z012' ||
    assignment.objective !== 'RETURN_TO_FOREMAN'
  )
    throw new Error('ASSIGNMENT_NOT_READY');
  state.wallet += FIRST_CONTRACT_REWARD;
  assignment.rewardClaimed = true;
  assignment.status = 'COMPLETE';
  assignment.objective = 'COMPLETE';
  assignment.completedAt = now;
  state.revision++;
  return originalStateSchema.parse(state);
}
