import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalZoneMap, originalWalkable, type OriginalExit } from './originalWorld';
import { originalSpatial } from './originalSpatial';
import { originalTravelService } from './originalTravel';
import type { OriginalPlayerState } from './originalSchema';
export type WorldPoint = { x: number; y: number };
export const INTERACTION_RANGE = 1.6;
export function nearInteraction(zone: string, player: WorldPoint, point: WorldPoint) {
  const map = originalZoneMap(zone);
  return (
    Number.isFinite(player.x) &&
    Number.isFinite(player.y) &&
    originalWalkable(map, Math.floor(player.x), Math.floor(player.y)) &&
    Math.hypot(player.x - point.x - 0.5, player.y - point.y - 0.5) <= INTERACTION_RANGE &&
    originalSpatial.clearLine(zone, player, { x: point.x + 0.5, y: point.y + 0.5 })
  );
}
export function servicePoint(zone: string, kind: string) {
  return originalZoneMap(zone).services.find((service) => service.kind === kind);
}
export function requirePhysicalInteraction(
  state: OriginalPlayerState,
  player: WorldPoint,
  target: { exit: string } | { service: string },
) {
  const map = originalZoneMap(state.world.zone);
  const point =
    'exit' in target
      ? map.exits.find((exit) => exit.to === target.exit)
      : servicePoint(map.id, target.service);
  if (!point || !nearInteraction(map.id, player, point) || !originalSpatial.validPosition(map.id, player))
    throw new Error('PHYSICAL_INTERACTION_REQUIRED');
}
export function exitKind(origin: string, exit: OriginalExit) {
  const names = [origin, exit.to]
    .map((id) => ORIGINAL_CONTENT.zones.find((zone) => zone.id === id)?.name ?? '')
    .join(' ');
  if (/Lift|Elevator/.test(names)) return 'elevator';
  if (/Shuttle|Transit|Platform|Tram/.test(names)) return 'shuttle';
  return 'doorway';
}
export function zoneRoute(from: string, to: string): string[] {
  const queue: string[][] = [[from]],
    seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i]!;
    if (path.at(-1) === to) return path;
    for (const exit of originalZoneMap(path.at(-1)!).exits)
      if (!seen.has(exit.to)) {
        seen.add(exit.to);
        queue.push([...path, exit.to]);
      }
  }
  return [];
}
export function navigationObjective(state: OriginalPlayerState, destination: string) {
  const location = ORIGINAL_CONTENT.locations.find((item) => item.id === destination);
  const services = originalTravelService(state.location);
  const targetZone = location
    ? location.id === state.location
      ? state.world.zone
      : state.world.departure
        ? services.depart
        : services.assign
    : destination;
  const route = zoneRoute(state.world.zone, targetZone);
  const next = route[1];
  if (next) {
    const exit = originalZoneMap(state.world.zone).exits.find((item) => item.to === next)!;
    const kind = exitKind(state.world.zone, exit);
    const name = ORIGINAL_CONTENT.zones.find((item) => item.id === next)!.name;
    return { point: exit, text: `Walk to ${kind} · ${name}`, exit: next };
  }
  if (location && location.id !== state.location) {
    return {
      point: servicePoint(state.world.zone, 'travel'),
      text: state.world.departure
        ? 'Walk to departure gate · board assigned ship'
        : 'Report to ship terminal · assign Lark Skiff',
      exit: undefined,
    };
  }
  return { point: undefined, text: 'Destination reached. Inspect local services.', exit: undefined };
}
