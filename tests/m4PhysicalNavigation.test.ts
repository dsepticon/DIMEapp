import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import { originalZoneMap } from '../shared/originalWorld';
import { OriginalActionService } from '../server/originalActionService';
import { MemoryStore } from '../server/store';
import {
  nearInteraction,
  requirePhysicalInteraction,
  servicePoint,
  navigationObjective,
  zoneRoute,
  exitKind,
} from '../shared/originalNavigation';
import { arrivalPosition } from '../app/original/walking';
const center = (p: { x: number; y: number }) => ({ x: p.x + 0.5, y: p.y + 0.5 });
describe('physical original navigation boundary', () => {
  it('rejects remote local exits and accepts the paired physical doorway', async () => {
    const state = originalInitialState(randomUUID(), () => 0.5),
      map = originalZoneMap(state.world.zone),
      exit = map.exits[0]!;
    const store = new MemoryStore<typeof state>();
    store.states.set('synthetic', state);
    const service = new OriginalActionService(store);
    const request = {
      requestId: randomUUID(),
      expectedRevision: 0,
      expectedGeneration: state.saveGeneration,
      action: { type: 'moveZone', destination: exit.to, player: center(map.spawn) },
    };
    await expect(service.mutate('synthetic', request)).rejects.toMatchObject({ code: 'ACTION_REJECTED' });
    expect(store.receipts.size).toBe(0);
    const result = await service.mutate('synthetic', {
      ...request,
      action: { ...request.action, player: center(exit) },
    });
    expect(result.state.world.zone).toBe(exit.to);
    const destination = originalZoneMap(exit.to);
    expect(
      nearInteraction(
        destination.id,
        arrivalPosition(destination, result.state.world.entry),
        destination.exits.find((e) => e.to === map.id)!,
      ),
    ).toBe(true);
    expect(
      (await service.mutate('synthetic', { ...request, action: { ...request.action, player: center(exit) } }))
        .replayed,
    ).toBe(true);
  });
  it('requires the correct ship terminal and departure gate in addition to ownership and assignment', async () => {
    const state = originalInitialState(randomUUID(), () => 0.5);
    state.world.zone = 'zone.z008';
    const store = new MemoryStore<typeof state>();
    store.states.set('synthetic', state);
    const service = new OriginalActionService(store);
    const request = {
      requestId: randomUUID(),
      expectedRevision: 0,
      expectedGeneration: state.saveGeneration,
      action: {
        type: 'assignDeparture',
        ship: 'fleet.v001',
        destination: 'loc.l002',
        loadGroundVehicle: false,
        player: center(originalZoneMap(state.world.zone).spawn),
      },
    };
    await expect(service.mutate('synthetic', request)).rejects.toMatchObject({ code: 'ACTION_REJECTED' });
    const assigned = await service.mutate('synthetic', {
      ...request,
      action: { ...request.action, player: center(servicePoint(state.world.zone, 'travel')!) },
    });
    await expect(
      service.mutate('synthetic', {
        requestId: randomUUID(),
        expectedRevision: assigned.state.revision,
        expectedGeneration: state.saveGeneration,
        action: { type: 'completeDeparture', player: center(servicePoint(state.world.zone, 'travel')!) },
      }),
    ).rejects.toMatchObject({ code: 'ACTION_REJECTED' });
  });
  it('uses informative objectives and distinguishes elevator and shuttle exits without mutating state', () => {
    const state = originalInitialState(randomUUID(), () => 0.5),
      before = structuredClone(state);
    expect(navigationObjective(state, 'loc.l002').text).toContain('Walk to');
    expect(zoneRoute('zone.z001', 'zone.z008')).toEqual(['zone.z001', 'zone.z002', 'zone.z003', 'zone.z008']);
    expect(exitKind('zone.z002', originalZoneMap('zone.z002').exits.find((e) => e.to === 'zone.z003')!)).toBe(
      'elevator',
    );
    expect(state).toEqual(before);
  });
  it('rejects a ground rig interaction away from its service', () => {
    const state = originalInitialState(randomUUID(), () => 0.5);
    expect(() =>
      requirePhysicalInteraction(state, center(originalZoneMap(state.world.zone).spawn), {
        service: 'vehicle_terminal',
      }),
    ).toThrow('PHYSICAL_INTERACTION_REQUIRED');
  });
});
