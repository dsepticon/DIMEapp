import { CAPACITIES } from './catalog';
import { GameError, PlayerState } from './schema';

export const FIRST_SHIFT_REWARD = 500;
export const TUTORIAL_RAW_UNITS = 4;
export const TUTORIAL_REFINED_UNITS = 3;
export const TUTORIAL_DURATION_MS = 3000;
export const TUTORIAL_SALE_AUEC = 300;
export const TUTORIAL_REFINERY_COST = 0;
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
  | 'complete';

export function firstShiftOf(state: PlayerState): NonNullable<PlayerState['firstShift']> {
  return (
    state.firstShift ?? {
      id: 'first-shift',
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

function requireObjective(state: PlayerState, objective: ReturnType<typeof firstShiftOf>['objective']) {
  if (state.firstShift?.objective !== objective || state.firstShift.status !== 'ACTIVE')
    throw new GameError('QUEST_ORDER', 'Complete the current assignment objective first.');
  if (state.location !== 'Lyria')
    throw new GameError('QUEST_LOCATION', 'Return to Lyria for this assignment.');
}

export function applyFirstShift(state: PlayerState, step: FirstShiftStep, now: number, id: string) {
  if (step === 'accept') {
    if (state.firstShift) throw new GameError('QUEST_ORDER', 'Assignment already accepted.');
    if (state.location !== 'Lyria') throw new GameError('QUEST_LOCATION', 'Meet the foreman on Lyria.');
    state.firstShift = {
      ...firstShiftOf(state),
      status: 'ACTIVE',
      objective: 'CHECK_EQUIPMENT',
      acceptedAt: now,
      dialogueFlags: ['foremanIntro'],
    };
    return;
  }
  const quest = state.firstShift;
  if (!quest) throw new GameError('QUEST_ORDER', 'Speak to the foreman first.');
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
      quest.objective = 'START_REFINERY_ORDER';
      break;
    case 'startRefinery':
      requireObjective(state, 'START_REFINERY_ORDER');
      if (state.orders.length >= 100)
        throw new GameError('ORDER_LIMIT', 'Collect existing work orders first.');
      if ((state.mining.Hand.Dolivine ?? 0) < TUTORIAL_RAW_UNITS)
        throw new GameError('INSUFFICIENT_CARGO', 'The assigned Dolivine is not in Hand cargo.');
      state.mining.Hand.Dolivine = (state.mining.Hand.Dolivine ?? 0) - TUTORIAL_RAW_UNITS;
      state.orders.push({
        id,
        source: 'Hand',
        ore: 'Dolivine',
        method: 'Cormack Method',
        rawUnits: TUTORIAL_RAW_UNITS,
        refinedUnits: TUTORIAL_REFINED_UNITS,
        cost: TUTORIAL_REFINERY_COST,
        createdAt: now,
        readyAt: now + TUTORIAL_DURATION_MS,
      });
      quest.tutorialOrderId = id;
      quest.objective = 'COLLECT_REFINED_MATERIAL';
      break;
    case 'collect': {
      requireObjective(state, 'COLLECT_REFINED_MATERIAL');
      const order = state.orders.find((item) => item.id === quest.tutorialOrderId);
      if (!order || order.ore !== 'Dolivine' || order.source !== 'Hand')
        throw new GameError('ORDER_MISSING', 'Tutorial order is unavailable.');
      if (now < order.readyAt) throw new GameError('NOT_READY', 'The refinery order is still processing.');
      if ((state.ships.Nomad ?? 0) < 1 || state.positions.Nomad !== 'Lyria')
        throw new GameError('SHIP_MISSING', 'The Nomad must be at Lyria.');
      const hold = state.cargo.Nomad ?? (state.cargo.Nomad = { raw: {}, refined: {} });
      const held = [...Object.values(hold.raw), ...Object.values(hold.refined)].reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      );
      if (held + order.refinedUnits > CAPACITIES.Nomad)
        throw new GameError('CARGO_FULL', 'Ship cargo is full.');
      hold.refined.Dolivine = (hold.refined.Dolivine ?? 0) + order.refinedUnits;
      quest.counters.refined = order.refinedUnits;
      state.orders = state.orders.filter((item) => item.id !== order.id);
      quest.objective = 'SELL_REFINED_MATERIAL';
      break;
    }
    case 'sell': {
      requireObjective(state, 'SELL_REFINED_MATERIAL');
      if ((state.ships.Nomad ?? 0) < 1 || state.positions.Nomad !== 'Lyria')
        throw new GameError('SHIP_MISSING', 'The Nomad must be at Lyria.');
      const hold = state.cargo.Nomad;
      if (!hold || (hold.refined.Dolivine ?? 0) < TUTORIAL_REFINED_UNITS)
        throw new GameError('INSUFFICIENT_CARGO', 'Refined Dolivine is unavailable.');
      hold.refined.Dolivine = (hold.refined.Dolivine ?? 0) - TUTORIAL_REFINED_UNITS;
      state.wallet += TUTORIAL_SALE_AUEC;
      quest.counters.sold = TUTORIAL_REFINED_UNITS;
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
