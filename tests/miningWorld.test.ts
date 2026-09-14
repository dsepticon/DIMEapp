import { describe, expect, it } from 'vitest';
import {
  EMPTY_LASER,
  fracturePieces,
  generatedNodes,
  laserRules,
  laserStep,
  NODE_RESPAWN_MS,
  scannerRadius,
  scannerSignal,
} from '../shared/miningWorld';
import { ZONES, zoneWalkable } from '../shared/world';
import { applyAction, initialState } from '../shared/game';
import { randomUUID } from 'node:crypto';

const zone = ZONES.LYRIA_SURFACE_01;
describe('deterministic mining world', () => {
  it('keeps nodes stable across reloads and channels, with safe spaced placement', () => {
    const first = generatedNodes('synthetic-generation', zone);
    expect(first.length).toBeGreaterThan(2);
    expect(generatedNodes('synthetic-generation', zone)).toEqual(first);
    for (const node of first) {
      expect(node.yieldUnits).toBeGreaterThanOrEqual(25);
      expect(zoneWalkable(zone, node.x, node.y)).toBe(true);
      expect(zone.exits.every((exit) => Math.hypot(exit.x - node.x, exit.y - node.y) >= 3)).toBe(true);
      expect(first.filter((other) => Math.hypot(other.x - node.x, other.y - node.y) < 3.5)).toHaveLength(1);
    }
    expect(generatedNodes('another-generation', zone)).not.toEqual(first);
  });

  it('respects source weights without inventing moon-specific rarity', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 500; i++)
      for (const node of generatedNodes(`synthetic-${i}`, zone))
        counts[node.ore] = (counts[node.ore] ?? 0) + 1;
    expect(counts.Dolivine).toBeGreaterThan(counts.Hadanite);
    expect(counts.Hadanite).toBeGreaterThan(counts.Janalite ?? 0);
    expect(
      generatedNodes('synthetic-generation', ZONES.WALA_SURFACE_01).every((node) => node.source === 'Hand'),
    ).toBe(true);
  });

  it('keeps rare signatures discoverable but closer and less clear', () => {
    const base = generatedNodes('synthetic-generation', zone)[0];
    const common = { ...base, ore: 'Dolivine' as const };
    const rare = { ...base, ore: 'Janalite' as const };
    expect(scannerRadius(common)).toBeGreaterThan(scannerRadius(rare));
    const distance = scannerRadius(rare) + 1;
    expect(scannerSignal(rare, rare.x - distance + 0.5, rare.y + 0.5)).toBe('faint');
    expect(scannerSignal(common, common.x - distance + 0.5, common.y + 0.5)).not.toBe('none');
    expect(scannerSignal(rare, rare.x + 0.5, rare.y + 0.5)).toBe('strong');
  });

  it('does not reroll fractured nodes or respawn before the server time', () => {
    const original = generatedNodes('synthetic-generation', zone)[0];
    const saved = { ...original, status: 'DEPLETED' as const, respawnAt: NODE_RESPAWN_MS };
    expect(generatedNodes('synthetic-generation', zone, { [original.id]: saved }, 0)[0]).toEqual(saved);
    expect(
      generatedNodes('synthetic-generation', zone, { [original.id]: saved }, NODE_RESPAWN_MS)[0],
    ).toEqual(original);
  });

  it('conserves exact yield among several ground fragments', () => {
    const node = generatedNodes('synthetic-generation', zone)[0];
    const pieces = fracturePieces(node, zone);
    expect(pieces.length).toBe(3);
    expect(pieces.map((piece) => piece.units)).toEqual([125, 125, 150]);
    expect(pieces.every((piece) => piece.units > 0 && zoneWalkable(zone, piece.x, piece.y))).toBe(true);
    expect(pieces.reduce((sum, piece) => sum + piece.units, 0)).toBe(node.yieldUnits);
    expect(fracturePieces(node, zone)).toEqual(pieces);
    for (let seed = 0; seed < 50; seed++) {
      const otherNodes = generatedNodes(`piece-clearance-${seed}`, zone).slice(1);
      for (const piece of pieces)
        expect(otherNodes.every((other) => Math.hypot(other.x - piece.x, other.y - piece.y) >= 2)).toBe(true);
    }
  });

  it('bounds duration and supports charge gain, release, optimum hold and overcharge', () => {
    const node = generatedNodes('synthetic-generation', zone)[0];
    const rules = laserRules(node);
    expect(rules.requiredSeconds).toBeGreaterThanOrEqual(1.5);
    expect(rules.requiredSeconds).toBeLessThanOrEqual(8);
    let laser = EMPTY_LASER;
    for (let i = 0; i < 100; i++) laser = laserStep(laser, node, true, 0.05);
    expect(laser.charge).toBeGreaterThan(0);
    const cooling = laserStep(laser, node, false, 0.05);
    expect(cooling.charge).toBeLessThan(laser.charge);
    const optimal = laserStep(
      { ...laser, charge: (rules.optimalLow + rules.optimalHigh) / 2 },
      node,
      true,
      0.05,
    );
    expect(optimal.progress).toBeGreaterThan(laser.progress);
    const overheated = laserStep({ ...laser, charge: 0.99 }, node, true, 0.05);
    expect(overheated.overcharge).toBeGreaterThan(laser.overcharge);
    const completed = laserStep({ ...laser, progress: rules.requiredSeconds }, node, false, 0.05);
    expect(completed.progress).toBe(rules.requiredSeconds);
  });

  it('fractures and collects exact server-derived pieces without duplicate credit', () => {
    let state = initialState(() => 0.5);
    state.saveGeneration = randomUUID();
    state.location = 'Lyria';
    state.positions.Nomad = 'Lyria';
    state.world!.zone = 'LYRIA_OUTPOST_01';
    state = applyAction(state, { type: 'enterZone', zone: 'LYRIA_SURFACE_01' }, 0, randomUUID());
    const node = generatedNodes(state.saveGeneration!, zone).find((candidate) => candidate.yieldUnits >= 2)!;
    state = applyAction(state, { type: 'scanZone' }, 1, randomUUID());
    state = applyAction(state, { type: 'analyzeNode', nodeId: node.id }, 2, randomUUID());
    state = applyAction(state, { type: 'beginFracture', nodeId: node.id, source: 'Hand' }, 3, randomUUID());
    expect(() =>
      applyAction(state, { type: 'completeFracture', nodeId: node.id }, 4, randomUUID()),
    ).toThrow();
    state = applyAction(state, { type: 'completeFracture', nodeId: node.id }, 20_000, randomUUID());
    const pieces = state.world!.nodes[node.id].fragments;
    expect(pieces.length).toBeGreaterThan(1);
    const first = pieces[0];
    state = applyAction(
      state,
      { type: 'collectPiece', nodeId: node.id, pieceId: first.id },
      20_001,
      randomUUID(),
    );
    expect(state.mining.Hand[node.ore] ?? 0).toBe(first.units);
    expect(() =>
      applyAction(state, { type: 'collectPiece', nodeId: node.id, pieceId: first.id }, 20_002, randomUUID()),
    ).toThrow();
    expect(state.world!.nodes[node.id].status).toBe('FRACTURED');
    for (const piece of pieces.slice(1))
      state = applyAction(
        state,
        { type: 'collectPiece', nodeId: node.id, pieceId: piece.id },
        20_003,
        randomUUID(),
      );
    expect(state.mining.Hand[node.ore] ?? 0).toBe(node.yieldUnits);
    expect(state.world!.nodes[node.id].status).toBe('DEPLETED');
  });

  it('leaves a piece available when fractional cargo would exceed hand capacity', () => {
    const state = initialState(() => 0.5);
    state.saveGeneration = randomUUID();
    state.location = 'Lyria';
    state.world!.zone = 'LYRIA_SURFACE_01';
    state.mining.Hand.Dolivine = 1180;
    const node = generatedNodes(state.saveGeneration, zone)[0];
    const pieces = fracturePieces(node, zone);
    state.world!.nodes[node.id] = { ...node, status: 'FRACTURED', fragments: pieces };
    expect(() =>
      applyAction(state, { type: 'collectPiece', nodeId: node.id, pieceId: pieces[0].id }, 1, randomUUID()),
    ).toThrow();
    expect(state.world!.nodes[node.id].fragments[0].collected).toBe(false);
  });
});
