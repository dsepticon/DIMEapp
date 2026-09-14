import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyAction, initialState } from '../shared/game';
import type { Action, PlayerState } from '../shared/schema';
import { DEPARTURE_POINTS, ZONES } from '../shared/world';
import { readyForTravel } from './travelFixture';

const now = 1_800_000_000_000;
const act = (state: PlayerState, action: Action, at = now) =>
  applyAction(state, action, at, randomUUID(), () => 0.5);

describe('physical owned-ship departure', () => {
  it('rejects remote travel and leaves location and zone unchanged', () => {
    const fresh = initialState(() => 0.5);
    expect(() => act(fresh, { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false })).toThrow(
      'departure point',
    );
    expect(fresh.location).toBe('ARC-L1');
    expect(fresh.world?.zone).toBe('ARC_L1_START');
    const concourse = act(fresh, { type: 'enterZone', zone: 'ARC_L1_CONCOURSE' });
    expect(() =>
      act(concourse, { type: 'assignDeparture', ship: 'Nomad', destination: 'Lyria', loadRoc: false }),
    ).toThrow('ship service');
    expect(concourse.world?.departure).toBeNull();
  });

  it('requires service assignment and matching hangar before travel', () => {
    let state = initialState(() => 0.5);
    for (const zone of ['ARC_L1_CONCOURSE', 'ARC_L1_TRANSIT', 'ARC_L1_DEPARTURE'] as const)
      state = act(state, { type: 'enterZone', zone });
    state = act(state, { type: 'assignDeparture', ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    expect(state.world?.departure).toEqual({ ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    expect(() =>
      act(state, { type: 'assignDeparture', ship: 'Nomad', destination: 'Wala', loadRoc: false }),
    ).toThrow('cancel');
    expect(() => act(state, { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false })).toThrow(
      'departure point',
    );
    state = act(state, { type: 'enterZone', zone: 'ARC_L1_HANGAR' });
    expect(() => act(state, { type: 'travel', ship: 'Nomad', destination: 'Wala', loadRoc: false })).toThrow(
      'Confirm this trip',
    );
    state = act(state, { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    expect(state.pending?.kind).toBe('travel');
    expect(state.world?.departure).toBeNull();
    state = act(state, { type: 'finish' }, now + 100_000);
    expect(state.location).toBe('Lyria');
    expect(state.world?.zone).toBe('LYRIA_OUTPOST_01');
  });

  it('requires a local owned ship and stored ROC', () => {
    const fresh = initialState(() => 0.5);
    const terminal = act(
      act(act(fresh, { type: 'enterZone', zone: 'ARC_L1_CONCOURSE' }), {
        type: 'enterZone',
        zone: 'ARC_L1_TRANSIT',
      }),
      { type: 'enterZone', zone: 'ARC_L1_DEPARTURE' },
    );
    expect(() =>
      act(terminal, { type: 'assignDeparture', ship: 'Prospector', destination: 'Halo', loadRoc: false }),
    ).toThrow('own');
    const withRoc = structuredClone(terminal);
    withRoc.world!.roc = { zone: 'ARC_L1_DEPARTURE', active: true, occupied: false };
    expect(() =>
      act(withRoc, { type: 'assignDeparture', ship: 'Nomad', destination: 'Lyria', loadRoc: false }),
    ).toThrow('Store your active ROC');
    expect(() =>
      act(terminal, { type: 'assignDeparture', ship: 'Nomad', destination: 'Lyria', loadRoc: true }),
    ).toThrow('owned ROC');
  });

  it('uses local moon pads, Area18 hangars and the ship cockpit at Halo', () => {
    for (const [source, destination] of [
      ['Lyria', 'Wala'],
      ['Wala', 'Area-18'],
      ['Area-18', 'ARC-L1'],
      ['Halo', 'ARC-L1'],
    ] as const) {
      const state = initialState(() => 0.5);
      state.location = source;
      state.positions.Nomad = source;
      state.currentShip = 'Nomad';
      state.world!.zone = DEPARTURE_POINTS[source].service;
      if (source === 'Halo') {
        state.ships.Prospector = 1;
        state.currentShip = 'Prospector';
        state.positions.Prospector = 'Halo';
      }
      const ship = source === 'Halo' ? 'Prospector' : 'Nomad';
      const route = readyForTravel(state, destination, ship);
      expect(route.world?.zone).toBe(DEPARTURE_POINTS[source].point);
      expect(ZONES[route.world!.zone].location).toBe(source);
      expect(act(route, { type: 'travel', ship, destination, loadRoc: false }).pending?.kind).toBe('travel');
    }
  });
});
