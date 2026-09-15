import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import {
  assignOriginalDeparture,
  completeOriginalDeparture,
  originalTravelService,
} from '../shared/originalTravel';
import { transitionOriginalZone } from '../shared/originalWorld';

describe('original physical departure flow', () => {
  it('requires Tessick ship desk and assigned bay before Loam Crescent travel', () => {
    let state = originalInitialState(randomUUID(), () => 0.5);
    expect(() => assignOriginalDeparture(state, 'fleet.v001', 'loc.l002', false)).toThrow(
      'DEPARTURE_SERVICE_REQUIRED',
    );
    state.world.zone = originalTravelService('loc.l001').assign;
    state = assignOriginalDeparture(state, 'fleet.v001', 'loc.l002', false);
    expect(state.world.departure).toEqual({
      ship: 'fleet.v001',
      destination: 'loc.l002',
      loadGroundVehicle: false,
    });
    expect(() => completeOriginalDeparture(state)).toThrow('ASSIGNED_DEPARTURE_POINT_REQUIRED');
    state = transitionOriginalZone(state, originalTravelService('loc.l001').depart);
    state = completeOriginalDeparture(state);
    expect(state).toMatchObject({
      location: 'loc.l002',
      currentShip: 'fleet.v001',
      positions: { 'fleet.v001': 'loc.l002' },
      world: { zone: 'zone.z019', entry: 'arrival', departure: null },
    });
  });

  it('rejects unowned ships, arbitrary destinations and an active ground rig', () => {
    const state = originalInitialState(randomUUID(), () => 0.5);
    state.world.zone = 'zone.z008';
    expect(() => assignOriginalDeparture(state, 'fleet.v003', 'loc.l002', false)).toThrow('SHIP_UNAVAILABLE');
    state.world.groundVehicle = { zone: 'zone.z008', active: true, occupied: false };
    expect(() => assignOriginalDeparture(state, 'fleet.v001', 'loc.l002', false)).toThrow(
      'STORE_GROUND_VEHICLE',
    );
    expect(state.location).toBe('loc.l001');
  });

  it('supports arrival and physical return for every original location', () => {
    for (const destination of ['loc.l002', 'loc.l003', 'loc.l004', 'loc.l005'] as const) {
      let state = originalInitialState(randomUUID(), () => 0.5);
      state.world.zone = 'zone.z008';
      state = assignOriginalDeparture(state, 'fleet.v001', destination, false);
      state.world.zone = 'zone.z009';
      state = completeOriginalDeparture(state);
      expect(state.location).toBe(destination);
      state.world.zone = originalTravelService(destination).assign;
      state = assignOriginalDeparture(state, 'fleet.v001', 'loc.l001', false);
      state.world.zone = originalTravelService(destination).depart;
      state = completeOriginalDeparture(state);
      expect(state).toMatchObject({ location: 'loc.l001', world: { zone: 'zone.z009' } });
    }
  });
});
