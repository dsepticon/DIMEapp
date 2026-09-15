import { describe, expect, it } from 'vitest';
import {
  acceptCollection,
  conservedUnits,
  initialState,
  parameters,
  PIECE_RADIUS,
  placeGroundPieces,
  replayPulseTrace,
  SOURCE_RADIUS,
  splitPieces,
  tickMining,
  type NodeSpec,
} from '../app/prototype/mining';

const spec: NodeSpec = {
  seed: 63,
  rarity: 1,
  size: 1,
  mass: 2,
  instability: 28,
  yieldUnits: 400,
  fragility: 0,
};

describe('local-only continuous-beam mining study', () => {
  it('raises charge at full held output, decays on release, and applies deterministic disturbance', () => {
    const first = tickMining(initialState(), spec, true);
    expect(first.charge).toBeGreaterThan(0);
    expect(tickMining(first, spec, false).charge).toBeLessThan(first.charge);
    let cooled = first;
    for (let n = 0; n < 10; n++) cooled = tickMining(cooled, spec, false);
    expect(cooled.charge).toBe(0);
    expect(cooled.phase).toBe('intact');
    expect(tickMining(initialState(), spec, true)).toEqual(first);
    const noDrift = { ...spec, instability: 0 };
    expect(tickMining(initialState(), noDrift, true).charge).toBe(parameters(noDrift).gain);
    const p = parameters(spec);
    const values = Array.from(
      { length: 30 },
      (_, tick) => tickMining({ ...initialState(), tick }, spec, true).charge,
    );
    expect(new Set(values).size).toBeGreaterThan(1);
    expect(values.every((value) => Math.abs(value - p.gain) <= p.disturbanceAmplitude)).toBe(true);
  });

  it('narrows the band and lengthens the hold for difficult nodes', () => {
    const easy = parameters({ ...spec, rarity: 0, size: 1, mass: 1, instability: 0 });
    const hard = parameters({ ...spec, rarity: 4, size: 5, mass: 5, instability: 100 });
    expect(hard.upper - hard.lower).toBeLessThan(easy.upper - easy.lower);
    expect(hard.stableTicks).toBeGreaterThan(easy.stableTicks);
    expect(hard.gain).toBeGreaterThan(easy.gain);
    expect(hard.discharge).toBeGreaterThan(easy.discharge);
  });

  it('completes by pulsing, pausing progress outside the optimal band', () => {
    let state = initialState();
    const p = parameters(spec);
    let released = 0;
    let outside = 0;
    for (let n = 0; n < 600 && state.phase !== 'fractured'; n++) {
      const hold = state.charge < p.upper - p.gain;
      if (!hold) released++;
      const prior = state.progress;
      state = tickMining(state, spec, hold);
      if (state.charge < p.lower || state.charge > p.upper) {
        outside++;
        expect(state.progress).toBeLessThanOrEqual(prior);
      }
    }
    expect(released).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(0);
    expect(state.phase).toBe('fractured');
    expect(conservedUnits(state, spec)).toBe(spec.yieldUnits);
  });

  it('destroys an overcharged node with zero pieces and no recoverable yield', () => {
    const destroyed = tickMining({ ...initialState(), charge: 990, phase: 'charging' }, spec, true);
    expect(destroyed.phase).toBe('destroyed');
    expect(destroyed.pieces).toEqual([]);
    expect(tickMining(destroyed, spec, true)).toBe(destroyed);
    expect(conservedUnits(destroyed, spec)).toBe(spec.yieldUnits);
  });

  it.each([3, 4, 5, 6, 7, 8])('splits into %i smaller exact positive pieces', (count) => {
    const candidate = { ...spec, size: 1, fragility: 0, yieldUnits: count === 3 ? 199 : 200 * (count - 2) };
    const pieces = splitPieces(candidate);
    expect(pieces).toHaveLength(count);
    expect(pieces.every((piece) => piece.units > 0)).toBe(true);
    expect(PIECE_RADIUS).toBeLessThan(SOURCE_RADIUS);
    expect(pieces.reduce((sum, piece) => sum + piece.units, 0)).toBe(candidate.yieldUnits);
    expect(new Set(pieces.map((piece) => `${piece.x}:${piece.y}`)).size).toBe(count);
    expect(pieces.every((piece) => Math.hypot(piece.x - 0.44, piece.y - 0.7) > 0.12)).toBe(true);
    expect(splitPieces(candidate)).toEqual(pieces);
  });

  it('rejects full hold without changing a piece, then accepts once with a receipt', () => {
    const fractured = {
      ...initialState(),
      phase: 'fractured' as const,
      pieces: splitPieces(spec),
      heldUnits: 390,
    };
    const full = acceptCollection(fractured, 0, 'one', 400);
    expect(full.code).toBe('FULL');
    expect(full.state).toBe(fractured);
    const accepted = acceptCollection(fractured, 0, 'one', 600);
    expect(accepted.code).toBe('ACCEPTED');
    expect(accepted.state.pieces[0]?.collected).toBe(true);
    expect(acceptCollection(accepted.state, 0, 'one', 600).code).toBe('REPLAY');
    expect(acceptCollection(accepted.state, 1, 'one', 600).code).toBe('CONFLICT');
    expect(acceptCollection(accepted.state, 0, 'two', 600).code).toBe('UNAVAILABLE');
    expect(accepted.state.heldUnits).toBe(390 + fractured.pieces[0]!.units);
  });

  it('replays a bounded pulse trace to a server-derived fracture without trusting a client result', () => {
    const p = parameters(spec);
    const runs: Array<{ held: boolean; ticks: number }> = [];
    let state = initialState();
    for (let n = 0; n < 600 && state.phase !== 'fractured'; n++) {
      const held = state.charge < p.upper - p.gain;
      const last = runs.at(-1);
      if (last?.held === held) last.ticks++;
      else runs.push({ held, ticks: 1 });
      state = tickMining(state, spec, held);
    }
    expect(state.phase).toBe('fractured');
    expect(replayPulseTrace(spec, runs, state.tick * 50)).toEqual(state);
    expect(() => replayPulseTrace(spec, runs, state.tick * 50 - 300)).toThrow();
    expect(() => replayPulseTrace(spec, [...runs, { held: true, ticks: 1 }], state.tick * 50 + 50)).toThrow();
  });

  it('places every piece deterministically on supplied reachable separated tiles', () => {
    const tiles = Array.from({ length: 9 }, (_, x) => Array.from({ length: 9 }, (_, y) => ({ x, y }))).flat();
    const candidate = { ...spec, yieldUnits: 1300 };
    const placed = placeGroundPieces(candidate, { x: 4, y: 4 }, tiles);
    expect(placed).toHaveLength(8);
    expect(placed.reduce((sum, piece) => sum + piece.units, 0)).toBe(1300);
    expect(
      placed.every((piece, index) =>
        placed.every(
          (other, otherIndex) =>
            index === otherIndex || Math.hypot(piece.x - other.x, piece.y - other.y) >= 1.5,
        ),
      ),
    ).toBe(true);
    expect(placeGroundPieces(candidate, { x: 4, y: 4 }, tiles)).toEqual(placed);
    expect(() => placeGroundPieces(candidate, { x: 4, y: 4 }, [{ x: 5, y: 4 }])).toThrow();
  });
});
