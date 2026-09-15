import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeOriginalForAction,
  previewOriginalConversion,
  restoreSyntheticSource,
} from '../server/legacyContentConversion';
import { initialState } from '../shared/game';
import { firstShiftOf } from '../shared/firstShift';
import { originalStateSchema } from '../shared/originalSchema';
import { originalInitialState } from '../shared/originalGame';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
import { ZONES } from '../shared/world';
import mapping from '../docs/dime-m4-final-mapping.json';
import { originalSpatial } from '../shared/originalSpatial';

function syntheticSave() {
  const state = initialState(() => 0.5);
  state.saveGeneration = randomUUID();
  state.revision = 17;
  state.wallet = 5700;
  state.walletRemainder = 17;
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  state.world!.zone = 'LYRIA_SURFACE_01';
  state.world!.entry = 'from:LYRIA_OUTPOST_01';
  state.mining.Hand.Dolivine = 125;
  state.mining.Hand.Hadanite = 275;
  state.cargo.Nomad!.raw.Copper = 325;
  state.cargo.Nomad!.refined.Gold = 175;
  state.ships.Prospector = 2;
  state.positions.Prospector = 'ARC-L1';
  state.equipment['Impact I'] = 1;
  state.equipment.Terraphon = 1;
  state.orders.push({
    id: 'synthetic-order',
    source: 'Prospector',
    ore: 'Gold',
    method: 'Dinyx Solventation',
    rawUnits: 325,
    refinedUnits: 225,
    cost: 19,
    createdAt: 1000,
    readyAt: 2000,
  });
  state.firstShift = {
    ...firstShiftOf(state),
    status: 'COMPLETE',
    objective: 'COMPLETE',
    counters: { mined: 4, refined: 0, sold: 4 },
    rewardClaimed: true,
    acceptedAt: 1000,
    completedAt: 2000,
    unlockedQuests: ['lyria-next-shift'],
  };
  state.world!.nodes['LYRIA_SURFACE_01-tutorial'] = {
    id: 'LYRIA_SURFACE_01-tutorial',
    ore: 'Dolivine',
    source: 'Hand',
    x: 28,
    y: 18,
    size: 3,
    resistance: 0.32,
    instability: 0.28,
    yieldUnits: 400,
    status: 'FRACTURED',
    respawnAt: null,
    fragments: [
      { id: 'LYRIA_SURFACE_01-tutorial-piece-0', units: 125, x: 28, y: 17, collected: true },
      { id: 'LYRIA_SURFACE_01-tutorial-piece-1', units: 125, x: 28, y: 16, collected: false },
      { id: 'LYRIA_SURFACE_01-tutorial-piece-2', units: 150, x: 29, y: 18, collected: false },
    ],
  };
  state.world!.scanner.analyzed = ['LYRIA_SURFACE_01-tutorial'];
  state.world!.scanner.scannedZones = ['LYRIA_SURFACE_01'];
  return state;
}

describe('synthetic original-content conversion preview', () => {
  it('creates a canonical original starter without legacy save identifiers', () => {
    const state = originalInitialState(randomUUID(), () => 0.5);
    expect(state).toMatchObject({
      location: 'loc.l001',
      currentShip: 'fleet.v001',
      ships: { 'fleet.v001': 1 },
      equipment: { 'gear.e001': 1 },
      world: { zone: 'zone.z001', groundVehicle: null },
      wallet: 0,
      revision: 0,
    });
    expect(state.conversionReceipt).toBeUndefined();
    expect(ORIGINAL_CONTENT.shipsAndVehicles.find((ship) => ship.id === 'fleet.v001')?.capacityCscu).toBe(
      2400,
    );
    expect(ORIGINAL_CONTENT.equipment.find((gear) => gear.id === 'gear.e001')?.toolStats?.rangeTiles).toBe(
      2.2,
    );
    const serialized = JSON.stringify(state);
    for (const legacy of ['ARC-L1', 'Lyria', 'Nomad', 'Dolivine', 'aUEC', 'firstShift'])
      expect(serialized).not.toContain(legacy);
  });
  it('preserves value, units, orders, quest history, node pieces and generation without mutating source', () => {
    const source = syntheticSave();
    const before = structuredClone(source);
    const requestId = randomUUID();
    const preview = previewOriginalConversion(source, requestId);
    expect(originalStateSchema.parse(preview)).toEqual(preview);
    expect(source).toEqual(before);
    expect(preview).toMatchObject({
      schemaVersion: 3,
      saveFormatVersion: 3,
      contentVersion: 4,
      revision: source.revision + 1,
      saveGeneration: source.saveGeneration,
      wallet: 5700,
      walletRemainder: 17,
      location: 'loc.l002',
      currentShip: 'fleet.v001',
      ships: { 'fleet.v001': 1, 'fleet.v003': 2 },
      equipment: { 'gear.e001': 1, 'gear.e006': 1, 'gear.e010': 1 },
      mining: { 'extract.x001': { 'mat.m001': 125, 'mat.m003': 275 } },
      cargo: { 'fleet.v001': { raw: { 'mat.m010': 325 }, refined: { 'mat.m012.processed': 175 } } },
      quest: {
        id: 'quest.q001',
        status: 'COMPLETE',
        objective: 'COMPLETE',
        rewardClaimed: true,
        counters: { mined: 4, refined: 0, sold: 4 },
      },
    });
    expect(preview.orders[0]).toMatchObject({
      id: 'synthetic-order',
      source: 'extract.x003',
      ore: 'mat.m012',
      method: 'process.p002',
      rawUnits: 325,
      refinedUnits: 225,
      cost: 19,
      createdAt: 1000,
      readyAt: 2000,
    });
    const world = preview.world!;
    expect(world.zone).toBe('zone.z014');
    expect(world.entry).toBe('from:zone.z012');
    expect(originalSpatial.validPosition('zone.z014', { x: 28, y: 18 })).toBe(true);
    for (const tile of [
      { x: 28, y: 17 },
      { x: 28, y: 16 },
      { x: 29, y: 18 },
    ])
      expect(originalSpatial.validPosition('zone.z014', tile)).toBe(true);
    expect(
      (world.nodes as Record<string, { fragments: Array<{ units: number; collected: boolean }> }>)[
        'zone.z014-tutorial'
      ].fragments,
    ).toEqual([
      expect.objectContaining({ units: 125, collected: true }),
      expect.objectContaining({ units: 125, collected: false }),
      expect.objectContaining({ units: 150, collected: false }),
    ]);
    expect(preview.conversionReceipt).toMatchObject({
      version: 1,
      requestId,
      sourceRevision: 17,
      sourceGeneration: source.saveGeneration,
    });
    expect('firstShift' in preview).toBe(false);
    expect('roc' in world).toBe(false);
    expect(restoreSyntheticSource(preview, before)).toEqual(before);
  });

  it('round-trips the original save through the transient legacy action view', () => {
    const source = syntheticSave();
    const preview = previewOriginalConversion(source, randomUUID());
    const decoded = decodeOriginalForAction(preview);
    expect(decoded).toMatchObject({
      ...source,
      revision: source.revision + 1,
      world: {
        ...source.world,
        nodes: expect.any(Object),
        minorRemainders: undefined,
      },
    });
    const originalNode = source.world!.nodes['LYRIA_SURFACE_01-tutorial']!;
    const decodedNode = decoded.world!.nodes['LYRIA_SURFACE_01-tutorial']!;
    expect(decodedNode).toMatchObject({
      ...originalNode,
      x: expect.any(Number),
      y: expect.any(Number),
      fragments: originalNode.fragments.map((piece) => ({
        ...piece,
        x: expect.any(Number),
        y: expect.any(Number),
      })),
    });
    expect(decodedNode.fragments.map((piece) => piece.units)).toEqual([125, 125, 150]);
  });

  it('rejects unknown assets and a mismatched reversal fixture without partial mutation', () => {
    const source = syntheticSave();
    const before = structuredClone(source);
    (source.equipment as Record<string, number>)['unknown-head'] = 1;
    expect(() => previewOriginalConversion(source, randomUUID())).toThrow('CONTENT_REVIEW_REQUIRED');
    expect(source.equipment['unknown-head']).toBe(1);
    const preview = previewOriginalConversion(before, randomUUID());
    const changed = structuredClone(before);
    changed.wallet++;
    expect(() => restoreSyntheticSource(preview, changed)).toThrow('CONTENT_REVIEW_REQUIRED');
  });

  it('refuses an unclassified future save field rather than dropping it', () => {
    const source = syntheticSave() as ReturnType<typeof syntheticSave> & { futureGameplay?: unknown };
    source.futureGameplay = { value: 7 };
    const before = structuredClone(source);
    expect(() => previewOriginalConversion(source, randomUUID())).toThrow('CONTENT_REVIEW_REQUIRED');
    expect(source).toEqual(before);
  });

  it('converts every mapped material, asset, process and zone by explicit identifier', () => {
    const state = initialState(() => 0.5);
    state.saveGeneration = randomUUID();
    const starterHold = state.cargo.Nomad!;
    for (const row of mapping.minerals) {
      const ore = row.legacyIdentifier as keyof typeof starterHold.raw;
      starterHold.raw[ore] = 37;
      if (row.processedStableIdentifier) starterHold.refined[ore] = 29;
    }
    for (const row of mapping.shipsAndVehicles) {
      const ship = row.legacyIdentifier as keyof typeof state.ships;
      state.ships[ship] = 1;
      state.positions[ship] = 'ARC-L1';
    }
    for (const row of mapping.equipment) state.equipment[row.legacyIdentifier] = 1;
    state.orders = mapping.refineryMethods.map((row, index) => ({
      id: `synthetic-order-${index}`,
      source: 'Prospector',
      ore: 'Copper',
      method: row.legacyIdentifier as (typeof state.orders)[number]['method'],
      rawUnits: 137,
      refinedUnits: 91,
      cost: 10 + index,
      createdAt: 1,
      readyAt: 2,
    }));
    const preview = previewOriginalConversion(state, randomUUID());
    for (const row of mapping.minerals) {
      expect(preview.cargo['fleet.v001']?.raw[row.originalStableIdentifier]).toBe(37);
      if (row.processedStableIdentifier)
        expect(preview.cargo['fleet.v001']?.refined[row.processedStableIdentifier]).toBe(29);
    }
    for (const row of mapping.shipsAndVehicles) expect(preview.ships[row.originalStableIdentifier]).toBe(1);
    for (const row of mapping.equipment) expect(preview.equipment[row.originalStableIdentifier]).toBe(1);
    expect(preview.orders.map((order) => order.method)).toEqual(
      mapping.refineryMethods.map((row) => row.originalStableIdentifier),
    );
    expect(decodeOriginalForAction(preview)).toMatchObject({ ...state, revision: state.revision + 1 });
    for (const row of mapping.zones) {
      state.world!.zone = row.legacyIdentifier as keyof typeof ZONES;
      state.location = ZONES[state.world!.zone].location;
      const zonePreview = previewOriginalConversion(state, randomUUID());
      expect(zonePreview.world!.zone).toBe(row.originalStableIdentifier);
      expect(decodeOriginalForAction(zonePreview)).toEqual({ ...state, revision: state.revision + 1 });
    }
  });
});
