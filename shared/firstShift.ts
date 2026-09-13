import { CAPACITIES, rawMineral } from './catalog';
import { GameError, PlayerState } from './schema';

export const FIRST_SHIFT_REWARD = 500;
export const TUTORIAL_RAW_UNITS = 4;
export const TUTORIAL_SALE_AUEC = Math.round((TUTORIAL_RAW_UNITS * rawMineral('Dolivine').pricePerScu) / 100);
export const LEGACY_TUTORIAL_SALE_AUEC = 300;
export const HAND_TOOL = 'Hand mining tool';
export type FirstShiftStep =
  | 'accept'
  | 'checkTool'
  | 'recoverTool'
  | 'enterMine'
  | 'mineDolivine'
  | 'returnOutpost'
  | 'startRefinery'
  | 'collect'
  | 'sell'
  | 'complete'
  | 'reconcile';

export function firstShiftOf(state: PlayerState): NonNullable<PlayerState['firstShift']> {
  return (
    state.firstShift ?? {
      id: 'first-shift',
      version: 2,
      reconciliation: 'NONE',
      status: 'NOT_STARTED',
      objective: 'SPEAK_TO_FOREMAN',
      counters: { mined: 0, refined: 0, sold: 0 },
      acceptedAt: null,
      completedAt: null,
      rewardClaimed: false,
      toolRecovered: false,
      dialogueFlags: [],
      unlockedQuests: [],
      tutorialOrderId: null,
    }
  );
}

function reconcileFirstShift(state: PlayerState) {
  const quest = state.firstShift;
  if (!quest || (quest.version !== undefined && quest.version !== 1) || quest.reconciliation)
    throw new GameError('QUEST_ORDER', 'This assignment does not need reconciliation.');
  const support = () => {
    quest.version = 2;
    quest.reconciliation = 'SUPPORT_REQUIRED';
  };
  const counters = quest.counters;
  const beforeMining = counters.mined === 0 && counters.refined === 0 && counters.sold === 0;
  const mined = counters.mined === TUTORIAL_RAW_UNITS && counters.refined === 0 && counters.sold === 0;
  const collected = counters.mined === TUTORIAL_RAW_UNITS && counters.refined === 3 && counters.sold === 0;
  const sold = counters.mined === TUTORIAL_RAW_UNITS && counters.refined === 3 && counters.sold === 3;
  if (quest.status === 'COMPLETE') {
    quest.version = 2;
    quest.reconciliation = 'LEGACY_COMPLETE';
    return;
  }
  if (
    quest.status !== 'ACTIVE' ||
    quest.rewardClaimed ||
    quest.completedAt !== null ||
    quest.acceptedAt === null
  ) {
    support();
    return;
  }
  if (['CHECK_EQUIPMENT', 'ENTER_MINE', 'MINE_ASSIGNED_ORE'].includes(quest.objective)) {
    if (!beforeMining || quest.tutorialOrderId !== null) return support();
    quest.version = 2;
    quest.reconciliation = 'CORRECTED';
    return;
  }
  if (quest.objective === 'RETURN_TO_OUTPOST' || quest.objective === 'START_REFINERY_ORDER') {
    if (!mined || quest.tutorialOrderId !== null || (state.mining.Hand.Dolivine ?? 0) < TUTORIAL_RAW_UNITS)
      return support();
    quest.version = 2;
    quest.reconciliation = 'CORRECTED';
    if (quest.objective === 'START_REFINERY_ORDER') quest.objective = 'SELL_MINED_GEM';
    return;
  }
  const orderId = quest.tutorialOrderId;
  if (!orderId) return support();
  const matching = state.orders.filter((item) => item.id === orderId);
  if (quest.objective === 'COLLECT_REFINED_MATERIAL') {
    const order = matching[0];
    if (
      !mined ||
      matching.length !== 1 ||
      !order ||
      order.source !== 'Hand' ||
      order.ore !== 'Dolivine' ||
      order.method !== 'Cormack Method' ||
      order.rawUnits !== 4 ||
      order.refinedUnits !== 3 ||
      order.cost !== 0 ||
      order.readyAt !== order.createdAt + 3000 ||
      Object.values(state.mining.Hand).reduce((sum, count) => sum + (count ?? 0), 0) + TUTORIAL_RAW_UNITS >
        CAPACITIES.Hand
    )
      return support();
    state.orders = state.orders.filter((item) => item.id !== orderId);
    state.mining.Hand.Dolivine = (state.mining.Hand.Dolivine ?? 0) + TUTORIAL_RAW_UNITS;
    quest.tutorialOrderId = null;
    quest.objective = 'SELL_MINED_GEM';
    quest.version = 2;
    quest.reconciliation = 'CORRECTED';
    return;
  }
  if (quest.objective === 'SELL_REFINED_MATERIAL') {
    const hold = state.cargo.Nomad;
    const refinedTotal = Object.values(state.cargo).reduce(
      (sum, cargo) => sum + (cargo?.refined.Dolivine ?? 0),
      0,
    );
    if (
      !collected ||
      matching.length !== 0 ||
      !hold ||
      (hold.refined.Dolivine ?? 0) !== 3 ||
      refinedTotal !== 3 ||
      Object.values(state.mining.Hand).reduce((sum, count) => sum + (count ?? 0), 0) + TUTORIAL_RAW_UNITS >
        CAPACITIES.Hand
    )
      return support();
    hold.refined.Dolivine = 0;
    state.mining.Hand.Dolivine = (state.mining.Hand.Dolivine ?? 0) + TUTORIAL_RAW_UNITS;
    quest.counters.refined = 0;
    quest.tutorialOrderId = null;
    quest.objective = 'SELL_MINED_GEM';
    quest.version = 2;
    quest.reconciliation = 'CORRECTED';
    return;
  }
  if (quest.objective === 'RETURN_TO_FOREMAN') {
    if (!sold || matching.length !== 0) return support();
    quest.version = 2;
    quest.reconciliation = 'LEGACY_SOLD';
    return;
  }
  support();
}

function requireObjective(state: PlayerState, objective: ReturnType<typeof firstShiftOf>['objective']) {
  if (state.firstShift?.objective !== objective || state.firstShift.status !== 'ACTIVE')
    throw new GameError('QUEST_ORDER', 'Complete the current assignment objective first.');
  if (state.location !== 'Lyria')
    throw new GameError('QUEST_LOCATION', 'Return to Lyria for this assignment.');
}

export function applyFirstShift(state: PlayerState, step: FirstShiftStep, now: number) {
  if (step === 'reconcile') return reconcileFirstShift(state);
  if (step === 'accept') {
    if (state.firstShift) throw new GameError('QUEST_ORDER', 'Assignment already accepted.');
    if (state.location !== 'Lyria') throw new GameError('QUEST_LOCATION', 'Meet the foreman on Lyria.');
    state.firstShift = {
      ...firstShiftOf(state),
      status: 'ACTIVE',
      version: 2,
      reconciliation: 'NONE',
      objective: 'CHECK_EQUIPMENT',
      acceptedAt: now,
      dialogueFlags: ['foremanIntro'],
    };
    return;
  }
  const quest = state.firstShift;
  if (!quest) throw new GameError('QUEST_ORDER', 'Speak to the foreman first.');
  if (quest.reconciliation === 'SUPPORT_REQUIRED')
    throw new GameError('QUEST_SUPPORT_REQUIRED', 'Contact support about this assignment.');
  if (quest.version !== 2)
    throw new GameError(
      'QUEST_VERSION',
      'This earlier assignment needs owner review before it can continue.',
    );
  switch (step) {
    case 'checkTool':
      requireObjective(state, 'CHECK_EQUIPMENT');
      if ((state.equipment[HAND_TOOL] ?? 0) < 1)
        throw new GameError('TOOL_MISSING', 'See the supply officer for a replacement.');
      quest.objective = 'ENTER_MINE';
      break;
    case 'recoverTool':
      requireObjective(state, 'CHECK_EQUIPMENT');
      if (quest.toolRecovered || (state.equipment[HAND_TOOL] ?? 0) > 0)
        throw new GameError('TOOL_ALREADY_OWNED', 'A Hand tool is already available.');
      state.equipment[HAND_TOOL] = 1;
      quest.toolRecovered = true;
      quest.objective = 'ENTER_MINE';
      break;
    case 'enterMine':
      requireObjective(state, 'ENTER_MINE');
      quest.objective = 'MINE_ASSIGNED_ORE';
      break;
    case 'mineDolivine': {
      requireObjective(state, 'MINE_ASSIGNED_ORE');
      if ((state.equipment[HAND_TOOL] ?? 0) < 1)
        throw new GameError('TOOL_MISSING', 'A Hand tool is required.');
      const held = Object.values(state.mining.Hand).reduce((sum, count) => sum + (count ?? 0), 0);
      if (held + TUTORIAL_RAW_UNITS > CAPACITIES.Hand)
        throw new GameError('CARGO_FULL', 'Hand cargo is full.');
      state.mining.Hand.Dolivine = (state.mining.Hand.Dolivine ?? 0) + TUTORIAL_RAW_UNITS;
      quest.counters.mined = TUTORIAL_RAW_UNITS;
      quest.objective = 'RETURN_TO_OUTPOST';
      break;
    }
    case 'returnOutpost':
      requireObjective(state, 'RETURN_TO_OUTPOST');
      quest.objective = 'SELL_MINED_GEM';
      break;
    case 'startRefinery':
    case 'collect':
      throw new GameError('GEM_NOT_REFINABLE', 'Dolivine is a raw-sale gem and cannot be refined.');
    case 'sell': {
      requireObjective(state, 'SELL_MINED_GEM');
      if (quest.reconciliation === 'LEGACY_SOLD' || quest.reconciliation === 'LEGACY_COMPLETE')
        throw new GameError('QUEST_ORDER', 'This earlier sale was already credited.');
      if ((state.mining.Hand.Dolivine ?? 0) < TUTORIAL_RAW_UNITS)
        throw new GameError('INSUFFICIENT_CARGO', 'The assigned raw Dolivine is unavailable.');
      state.mining.Hand.Dolivine = (state.mining.Hand.Dolivine ?? 0) - TUTORIAL_RAW_UNITS;
      state.wallet += TUTORIAL_SALE_AUEC;
      quest.counters.sold = TUTORIAL_RAW_UNITS;
      quest.objective = 'RETURN_TO_FOREMAN';
      break;
    }
    case 'complete':
      requireObjective(state, 'RETURN_TO_FOREMAN');
      if (quest.rewardClaimed) throw new GameError('QUEST_ORDER', 'Reward already claimed.');
      state.wallet += FIRST_SHIFT_REWARD;
      quest.rewardClaimed = true;
      quest.status = 'COMPLETE';
      quest.objective = 'COMPLETE';
      quest.completedAt = now;
      quest.unlockedQuests = ['lyria-next-shift'];
      break;
  }
}
