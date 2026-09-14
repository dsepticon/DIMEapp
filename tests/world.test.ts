import { describe, expect, it } from 'vitest';
import { initialState, applyAction } from '../shared/game';
import {
  LEGACY_ZONE,
  START_ZONE,
  ZONES,
  ZONE_IDS,
  zoneArrival,
  zoneForSave,
  zoneWalkable,
  validZoneEntry,
} from '../shared/world';

describe('typed world graph', () => {
  it('starts and resets at the authoritative ARC-L1 zone', () => {
    const fresh = initialState(() => 0.5);
    expect(fresh.location).toBe('ARC-L1');
    expect(fresh.world?.zone).toBe(START_ZONE);
    expect(zoneForSave(fresh.location, fresh.world?.zone)?.location).toBe('ARC-L1');
  });

  it('covers every stable zone with reciprocal, same-location, walkable exits', () => {
    expect(Object.keys(ZONES).sort()).toEqual([...ZONE_IDS].sort());
    for (const zone of Object.values(ZONES)) {
      expect(zone.version).toBe(1);
      expect(zone.width).toBeGreaterThan(20);
      expect(zone.height).toBeGreaterThan(20);
      expect(new Set(zone.exits.map((exit) => `${exit.x},${exit.y}`)).size, zone.id).toBe(zone.exits.length);
      for (const exit of zone.exits) {
        const destination = ZONES[exit.to];
        expect(destination.location).toBe(zone.location);
        const back = destination.exits.find((candidate) => candidate.to === zone.id);
        expect(back).toBeDefined();
        expect(exit.x).toBeGreaterThan(0);
        expect(exit.x).toBeLessThan(zone.width - 1);
        expect(zoneWalkable(zone, exit.x, exit.y), `${zone.id} → ${exit.to} at ${exit.x},${exit.y}`).toBe(
          true,
        );
        const arrival = zoneArrival(destination, `from:${zone.id}`);
        expect(zoneWalkable(destination, Math.floor(arrival.x), Math.floor(arrival.y))).toBe(true);
        expect([arrival.x, arrival.y]).not.toEqual([...destination.spawn]);
        expect(Math.hypot(arrival.x - back!.x, arrival.y - back!.y)).toBeLessThan(2);
      }
    }
  });

  it('never maps an unknown or cross-location zone to Lyria', () => {
    expect(zoneForSave('ARC-L1', 'LYRIA_OUTPOST_01')).toBeNull();
    expect(zoneForSave('Wala', 'unrecognized')).toBeNull();
    expect(LEGACY_ZONE['ARC-L1']).toBe(START_ZONE);
    expect(LEGACY_ZONE.Lyria).toBe('LYRIA_OUTPOST_01');
    expect(validZoneEntry(ZONES.LYRIA_CAVE_01, 'from:LYRIA_SURFACE_01')).toBe(true);
    expect(validZoneEntry(ZONES.LYRIA_CAVE_01, 'from:LYRIA_SURFACE_02')).toBe(false);
    expect(() => zoneArrival(ZONES.LYRIA_CAVE_01, 'from:LYRIA_SURFACE_02')).toThrow();
  });

  it('keeps Wala outposts connected without changing mineral spawn rules', () => {
    const ridge = ZONES.WALA_OUTPOST_01;
    const yard = ZONES.WALA_OUTPOST_02;
    expect(ridge.exits.some((exit) => exit.to === yard.id)).toBe(true);
    expect(yard.exits.some((exit) => exit.to === ridge.id)).toBe(true);
    expect(yard.exits.some((exit) => exit.to === 'WALA_SURFACE_02')).toBe(true);
    expect(yard.regions).toEqual([]);
    expect(ZONES.WALA_SURFACE_02.regions[0]?.source).toBe('Roc');
  });

  it('requires a reversible physical sequence between the Area18 spaceport and city', () => {
    const sequence = [
      'AREA18_SPACEPORT',
      'AREA18_SECURITY',
      'AREA18_SPACEPORT_PLATFORM',
      'AREA18_SHUTTLE',
      'AREA18_CITY_PLATFORM',
      'AREA18_TRANSIT',
      'AREA18_PLAZA',
    ] as const;
    for (let index = 0; index < sequence.length - 1; index++) {
      expect(ZONES[sequence[index]].exits.some((exit) => exit.to === sequence[index + 1])).toBe(true);
      expect(ZONES[sequence[index + 1]].exits.some((exit) => exit.to === sequence[index])).toBe(true);
    }
    expect(ZONES.AREA18_SPACEPORT.exits.some((exit) => exit.to === 'AREA18_PLAZA')).toBe(false);
    const withoutShuttle = new Set<string>(['AREA18_SPACEPORT']);
    const queue = ['AREA18_SPACEPORT'] as string[];
    for (let head = 0; head < queue.length; head++) {
      for (const exit of ZONES[queue[head] as keyof typeof ZONES].exits) {
        if (exit.to === 'AREA18_SHUTTLE' || withoutShuttle.has(exit.to)) continue;
        withoutShuttle.add(exit.to);
        queue.push(exit.to);
      }
    }
    expect(withoutShuttle.has('AREA18_PLAZA')).toBe(false);
    const player = initialState(() => 0.5);
    player.location = 'Area-18';
    player.world!.zone = 'AREA18_SPACEPORT';
    expect(() => applyAction(player, { type: 'enterZone', zone: 'AREA18_PLAZA' }, 0, 'remote')).toThrow();
  });

  it('checks the graph server-side and rejects cross-location zone changes', () => {
    const state = initialState(() => 0.5);
    const next = applyAction(state, { type: 'enterZone', zone: 'ARC_L1_CONCOURSE' }, 0, 'synthetic');
    expect(next.world?.zone).toBe('ARC_L1_CONCOURSE');
    expect(next.world?.entry).toBe('from:ARC_L1_START');
    expect(next.location).toBe('ARC-L1');
    expect(() =>
      applyAction(state, { type: 'enterZone', zone: 'LYRIA_OUTPOST_01' }, 0, 'synthetic'),
    ).toThrow();
    expect(() =>
      applyAction(state, { type: 'enterZone', zone: 'ARC_L1_REFINERY' }, 0, 'synthetic'),
    ).toThrow();
  });

  it('retrieves only an owned ROC once and moves its checkpoint only while occupied', () => {
    let state = initialState(() => 0.5);
    state.location = 'Lyria';
    state.positions.Nomad = 'Lyria';
    state.world!.zone = 'LYRIA_ASOP';
    expect(() => applyAction(state, { type: 'retrieveRoc' }, 0, 'one')).toThrow();
    state.ships.Roc = 1;
    state.positions.Roc = 'Lyria';
    state = applyAction(state, { type: 'retrieveRoc' }, 0, 'two');
    expect(state.world?.roc?.active).toBe(true);
    expect(() => applyAction(state, { type: 'retrieveRoc' }, 0, 'three')).toThrow();
    state = applyAction(state, { type: 'enterRoc', occupied: true }, 0, 'four');
    state = applyAction(state, { type: 'enterZone', zone: 'LYRIA_OUTPOST_01' }, 0, 'five');
    expect(state.world?.roc?.zone).toBe('LYRIA_OUTPOST_01');
    expect(() => applyAction(state, { type: 'stowRoc' }, 0, 'six')).toThrow();
    state = applyAction(state, { type: 'enterRoc', occupied: false }, 0, 'seven');
    state = applyAction(state, { type: 'stowRoc' }, 0, 'eight');
    expect(state.world?.roc).toBeNull();
  });
});
