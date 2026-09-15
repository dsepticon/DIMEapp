/** Deterministic, fixed-step mining model shared by browser and server.
 * Browser input is a presentation hint; persistent outcomes require server validation. */
export type NodeSpec = {
  seed: number;
  rarity: number;
  size: number;
  mass: number;
  instability: number;
  yieldUnits: number;
  fragility: number;
  pieceUnits?: readonly number[];
};
export const MINING_TICK_MS = 50;
export const MAX_MINING_TICKS = 1200;
export type PulseRun = { held: boolean; ticks: number };

/** The browser submits one bounded run-length trace at resolution, never per-frame writes.
 * This proves consistency with the model, not that physical input actually occurred. */
export function replayPulseTrace(spec: NodeSpec, runs: readonly PulseRun[], elapsedMs: number): MiningState {
  if (
    !Number.isSafeInteger(spec.seed) ||
    !Number.isSafeInteger(spec.yieldUnits) ||
    spec.yieldUnits < 3 ||
    !Number.isInteger(spec.rarity) ||
    spec.rarity < 0 ||
    spec.rarity > 4 ||
    !Number.isInteger(spec.size) ||
    spec.size < 1 ||
    spec.size > 5 ||
    !Number.isInteger(spec.mass) ||
    spec.mass < 1 ||
    spec.mass > 5 ||
    !Number.isInteger(spec.instability) ||
    spec.instability < 0 ||
    spec.instability > 100 ||
    !Number.isInteger(spec.fragility) ||
    spec.fragility < 0 ||
    spec.fragility > 2 ||
    (spec.pieceUnits !== undefined &&
      (spec.pieceUnits.length < 3 ||
        spec.pieceUnits.length > 8 ||
        spec.pieceUnits.some((units) => !Number.isSafeInteger(units) || units <= 0) ||
        spec.pieceUnits.reduce((sum, units) => sum + units, 0) !== spec.yieldUnits))
  )
    throw new RangeError('Invalid server-owned node parameters.');
  if (
    !Number.isSafeInteger(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > 90_000 ||
    runs.length === 0 ||
    runs.length > 256
  )
    throw new RangeError('Invalid mining attempt duration.');
  let ticks = 0;
  let previous: boolean | undefined;
  for (const run of runs) {
    if (
      typeof run.held !== 'boolean' ||
      !Number.isInteger(run.ticks) ||
      run.ticks < 1 ||
      run.ticks > MAX_MINING_TICKS ||
      previous === run.held
    )
      throw new RangeError('Invalid mining pulse trace.');
    ticks += run.ticks;
    previous = run.held;
  }
  if (ticks > MAX_MINING_TICKS || ticks * MINING_TICK_MS > elapsedMs + 250)
    throw new RangeError('Mining trace exceeds server elapsed time.');
  let state = initialState();
  for (const run of runs) {
    for (let i = 0; i < run.ticks; i++) {
      if (state.phase === 'fractured' || state.phase === 'destroyed')
        throw new RangeError('Trace continues after node resolution.');
      state = tickMining(state, spec, run.held);
    }
  }
  return state;
}
export type Phase = 'intact' | 'charging' | 'fractured' | 'destroyed' | 'depleted';
export type Piece = { id: number; units: number; x: number; y: number; collected: boolean };
export const SOURCE_RADIUS = 18;
export const PIECE_RADIUS = 6;
export type MiningState = {
  phase: Phase;
  charge: number;
  progress: number;
  tick: number;
  pieces: Piece[];
  heldUnits: number;
  collectedUnits: number;
  receipts: { id: string; pieceId: number }[];
};

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const hash = (seed: number, value: number) => {
  let x = (seed ^ Math.imul(value + 1, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return x >>> 0;
};

export function parameters(spec: NodeSpec) {
  const r = clamp(Math.trunc(spec.rarity), 0, 4);
  const s = clamp(Math.trunc(spec.size), 1, 5);
  const m = clamp(Math.trunc(spec.mass), 1, 5);
  const i = clamp(Math.trunc(spec.instability), 0, 100);
  const gain = clamp(16 + 2 * r + 2 * s + m + Math.floor(i / 25), 16, 40);
  const discharge = clamp(8 + Math.floor(s / 2) + Math.floor(m / 2) + Math.floor(i / 25), 8, 20);
  const width = clamp(300 - 25 * r - 15 * s - Math.floor(i / 10), 120, 300);
  const lower = 650 - Math.floor(width / 2);
  const upper = lower + width;
  const stableTicks = clamp(25 + 8 * r + 4 * s + 3 * m + Math.ceil(i / 10), 25, 100);
  const disturbanceAmplitude = Math.min(4, Math.ceil(i / 25));
  return { gain, discharge, lower, upper, stableTicks, disturbanceAmplitude };
}

export const initialState = (): MiningState => ({
  phase: 'intact',
  charge: 0,
  progress: 0,
  tick: 0,
  pieces: [],
  heldUnits: 0,
  collectedUnits: 0,
  receipts: [],
});

export function splitPieces(spec: NodeSpec): Piece[] {
  if (!Number.isSafeInteger(spec.yieldUnits) || spec.yieldUnits < 3)
    throw new Error('Node yield must be at least three minor units.');
  const size = clamp(Math.trunc(spec.size), 1, 5);
  const fragility = clamp(Math.trunc(spec.fragility), 0, 2);
  const count =
    spec.pieceUnits?.length ??
    Math.min(
      8,
      spec.yieldUnits,
      3 + Math.floor((spec.yieldUnits - 1) / 200) + Math.floor((size - 1) / 2) + fragility,
    );
  const base = Math.floor(spec.yieldUnits / count);
  const extra = spec.yieldUnits % count;
  const order = Array.from({ length: count }, (_, id) => id).sort(
    (a, b) => hash(spec.seed, a) - hash(spec.seed, b),
  );
  const positions = [
    [0.26, 0.3],
    [0.45, 0.22],
    [0.66, 0.31],
    [0.76, 0.48],
    [0.66, 0.67],
    [0.57, 0.8],
    [0.25, 0.66],
    [0.16, 0.48],
  ];
  return Array.from({ length: count }, (_, id) => ({
    id,
    units: spec.pieceUnits?.[id] ?? base + (order.indexOf(id) < extra ? 1 : 0),
    x: positions[id]![0],
    y: positions[id]![1],
    collected: false,
  }));
}

/** Caller supplies only reachable, unblocked walkable tile centers from the authoritative zone. */
export function placeGroundPieces(
  spec: NodeSpec,
  node: { x: number; y: number },
  eligibleTiles: readonly { x: number; y: number }[],
): Piece[] {
  const pieces = splitPieces(spec);
  const candidates = eligibleTiles
    .filter(
      (tile) =>
        Number.isInteger(tile.x) &&
        Number.isInteger(tile.y) &&
        Math.hypot(tile.x - node.x, tile.y - node.y) <= 4 &&
        Math.hypot(tile.x - node.x, tile.y - node.y) >= 1,
    )
    .sort((a, b) => {
      const distance = Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y);
      return distance || hash(spec.seed, a.x * 4096 + a.y) - hash(spec.seed, b.x * 4096 + b.y);
    });
  const placed: Piece[] = [];
  for (const piece of pieces) {
    const position = candidates.find((tile) =>
      placed.every((existing) => Math.hypot(existing.x - tile.x, existing.y - tile.y) >= 1.5),
    );
    if (!position) throw new RangeError('No reachable, separated ground placement for every piece.');
    placed.push({ ...piece, x: position.x, y: position.y });
    candidates.splice(candidates.indexOf(position), 1);
  }
  return placed;
}

export function tickMining(state: MiningState, spec: NodeSpec, held: boolean, targeted = true): MiningState {
  if (state.phase === 'destroyed' || state.phase === 'fractured' || state.phase === 'depleted') return state;
  const p = parameters(spec);
  const amp = p.disturbanceAmplitude;
  const disturbance = held && amp > 0 ? (hash(spec.seed, state.tick) % (2 * amp + 1)) - amp : 0;
  const charge = clamp(state.charge + (held ? p.gain + disturbance : -p.discharge), 0, 1000);
  const nextTick = state.tick + 1;
  if (charge >= 1000)
    return { ...state, phase: 'destroyed', charge, progress: 0, tick: nextTick, pieces: [] };
  const inBand = targeted && charge >= p.lower && charge <= p.upper;
  const progress = inBand ? state.progress + 1 : Math.max(0, state.progress - (nextTick % 2));
  if (progress >= p.stableTicks) {
    return { ...state, phase: 'fractured', charge, progress, tick: nextTick, pieces: splitPieces(spec) };
  }
  return { ...state, phase: charge > 0 ? 'charging' : 'intact', charge, progress, tick: nextTick };
}

/** Synthetic authority: mirrors receipt/capacity decisions without using network, API, or persistence. */
export function acceptCollection(
  state: MiningState,
  pieceId: number,
  requestId: string,
  capacityUnits: number,
): { state: MiningState; code: 'ACCEPTED' | 'REPLAY' | 'CONFLICT' | 'FULL' | 'UNAVAILABLE' } {
  const receipt = state.receipts.find((item) => item.id === requestId);
  if (receipt) return { state, code: receipt.pieceId === pieceId ? 'REPLAY' : 'CONFLICT' };
  const piece = state.pieces.find((part) => part.id === pieceId);
  if (state.phase !== 'fractured' || !piece || piece.collected) return { state, code: 'UNAVAILABLE' };
  if (state.heldUnits + piece.units > capacityUnits) return { state, code: 'FULL' };
  const pieces = state.pieces.map((part) => (part.id === pieceId ? { ...part, collected: true } : part));
  return {
    code: 'ACCEPTED',
    state: {
      ...state,
      phase: pieces.every((part) => part.collected) ? 'depleted' : state.phase,
      pieces,
      heldUnits: state.heldUnits + piece.units,
      collectedUnits: state.collectedUnits + piece.units,
      receipts: [...state.receipts, { id: requestId, pieceId }],
    },
  };
}

export const conservedUnits = (state: MiningState, spec: NodeSpec) =>
  state.phase === 'destroyed'
    ? state.collectedUnits + spec.yieldUnits
    : state.collectedUnits +
      state.pieces.filter((piece) => !piece.collected).reduce((sum, piece) => sum + piece.units, 0);
