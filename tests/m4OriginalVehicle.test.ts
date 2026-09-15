import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import {
  retrieveOriginalGroundRig,
  setOriginalGroundRigOccupied,
  stowOriginalGroundRig,
} from '../shared/originalVehicle';
import { transitionOriginalZone } from '../shared/originalWorld';
describe('original ground rig', () => {
  it('requires ownership, prevents duplicates and preserves cargo while stowing', () => {
    let state = originalInitialState(randomUUID(), () => 0.5);
    state.location = 'loc.l002';
    state.world.zone = 'zone.z018';
    expect(() => retrieveOriginalGroundRig(state)).toThrow('VEHICLE_NOT_OWNED');
    state.ships['fleet.v002'] = 1;
    state = retrieveOriginalGroundRig(state);
    expect(() => retrieveOriginalGroundRig(state)).toThrow('VEHICLE_ALREADY_ACTIVE');
    state.mining['extract.x002']['mat.m001'] = 125;
    state = setOriginalGroundRigOccupied(state, true);
    state = transitionOriginalZone(state, 'zone.z012');
    expect(state.world.groundVehicle?.zone).toBe('zone.z012');
    state = transitionOriginalZone(state, 'zone.z018');
    state = setOriginalGroundRigOccupied(state, false);
    state = stowOriginalGroundRig(state);
    expect(state.world.groundVehicle).toBeNull();
    expect(state.mining['extract.x002']['mat.m001']).toBe(125);
  });
});
