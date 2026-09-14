import { applyAction } from '../shared/game';
import type { Action, Location, PlayerState, Ship } from '../shared/schema';
import { DEPARTURE_POINTS, LEGACY_ZONE, ZONES, type ZoneId } from '../shared/world';
import { randomUUID } from 'node:crypto';
import type { GameService } from '../server/service';

export function zoneRoute(from: ZoneId, to: ZoneId): ZoneId[] {
  if (from === to) return [];
  const queue: ZoneId[] = [from];
  const previous = new Map<ZoneId, ZoneId>();
  const seen = new Set<ZoneId>([from]);
  for (let head = 0; head < queue.length && !seen.has(to); head++) {
    const current = queue[head];
    for (const exit of ZONES[current].exits) {
      if (seen.has(exit.to)) continue;
      seen.add(exit.to);
      previous.set(exit.to, current);
      queue.push(exit.to);
    }
  }
  if (!seen.has(to)) throw new Error(`No local route from ${from} to ${to}.`);
  const path: ZoneId[] = [];
  for (let current = to; current !== from; current = previous.get(current)!) path.push(current);
  return path.reverse();
}

/** Test-only synthetic route that uses real server actions and graph checks. */
export function readyForTravel(
  original: PlayerState,
  destination: Location,
  ship: Ship = 'Nomad',
  loadRoc = false,
  now = 1_800_000_000_000,
): PlayerState {
  let state = original;
  if (!state.world || ZONES[state.world.zone].location !== state.location) {
    state = structuredClone(state);
    const mapping = LEGACY_ZONE[state.location];
    if (!state.world || !mapping) throw new Error('Synthetic route needs a world zone.');
    state.world.zone = mapping;
    state.world.entry = 'arrival';
  }
  const departure = DEPARTURE_POINTS[state.location];
  for (const zone of zoneRoute(state.world.zone, departure.service))
    state = applyAction(state, { type: 'enterZone', zone }, now, `route-${zone}`);
  state = applyAction(state, { type: 'assignDeparture', destination, ship, loadRoc }, now, 'assignment');
  for (const zone of zoneRoute(state.world!.zone, departure.point))
    state = applyAction(state, { type: 'enterZone', zone }, now, `route-${zone}`);
  return state;
}

/** Synthetic service journey through every authoritative zone and assignment mutation. */
export async function beginAssignedTravel(
  service: GameService,
  player: string,
  destination: Location,
  ship: Ship = 'Nomad',
  loadRoc = false,
) {
  let state = (await service.snapshot(player)).state;
  const send = async (action: Action) => {
    state = (
      await service.mutate(player, {
        requestId: randomUUID(),
        expectedRevision: state.revision,
        action,
      })
    ).state;
  };
  const departure = DEPARTURE_POINTS[state.location];
  if (!state.world) throw new Error('Synthetic journey needs a canonical world.');
  for (const zone of zoneRoute(state.world.zone, departure.service)) await send({ type: 'enterZone', zone });
  await send({ type: 'assignDeparture', destination, ship, loadRoc });
  for (const zone of zoneRoute(state.world!.zone, departure.point)) await send({ type: 'enterZone', zone });
  await send({ type: 'travel', destination, ship, loadRoc });
  return state;
}
