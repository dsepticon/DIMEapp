/** Original deterministic zone geometry. Only the active zone needs a tile array. */
import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalStateSchema, type OriginalPlayerState } from './originalSchema';

type ZoneRecord = (typeof ORIGINAL_CONTENT.zones)[number];
type Direction = 'N' | 'E' | 'S' | 'W';
export type OriginalExit = { to: string; x: number; y: number; facing: Direction };
export type OriginalZoneMap = {
  id: string;
  location: string;
  name: string;
  width: number;
  height: number;
  palette: 'STATION' | 'LOAM' | 'MICA' | 'CITY' | 'CLAIM';
  tiles: Uint8Array;
  spawn: { x: number; y: number };
  exits: OriginalExit[];
  services: Array<{ kind: string; x: number; y: number }>;
};
const zoneById = new Map<string, ZoneRecord>(ORIGINAL_CONTENT.zones.map((zone) => [zone.id, zone]));
const directions: Direction[] = ['N', 'E', 'S', 'W'];
const opposite: Record<Direction, Direction> = { N: 'S', E: 'W', S: 'N', W: 'E' };
function hash(text: string) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
function side(source: string, target: string): Direction {
  const first = source < target ? source : target;
  const second = source < target ? target : source;
  const base = directions[hash(`${first}/${second}`) % 4]!;
  return source === first ? base : opposite[base];
}
function positionFor(zone: ZoneRecord, target: string, direction: Direction) {
  const sameSide: string[] = zone.exits
    .map((exit) => exit.to)
    .filter((to) => side(zone.id, to) === direction)
    .sort();
  const lane = sameSide.indexOf(target) + 1;
  const span = direction === 'N' || direction === 'S' ? zone.width - 4 : zone.height - 4;
  const coordinate = 2 + Math.floor((lane * span) / (sameSide.length + 1));
  switch (direction) {
    case 'N':
      return { x: coordinate, y: 1 };
    case 'S':
      return { x: coordinate, y: zone.height - 2 };
    case 'E':
      return { x: zone.width - 2, y: coordinate };
    case 'W':
      return { x: 1, y: coordinate };
  }
}
function palette(location: string): OriginalZoneMap['palette'] {
  switch (location) {
    case 'loc.l001':
      return 'STATION';
    case 'loc.l002':
      return 'LOAM';
    case 'loc.l003':
      return 'MICA';
    case 'loc.l004':
      return 'CITY';
    default:
      return 'CLAIM';
  }
}

/** 0 wall, 1 floor, 2 decorative floor. Carved routes keep every exit reachable. */
export function originalZoneMap(zoneId: string): OriginalZoneMap {
  const zone = zoneById.get(zoneId);
  if (!zone) throw new Error('UNKNOWN_ORIGINAL_ZONE');
  const width = zone.width,
    height = zone.height;
  const tiles = new Uint8Array(width * height);
  const spawn = { x: Math.floor(zone.spawn[0]), y: Math.floor(zone.spawn[1]) };
  const p = palette(zone.location);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const value = hash(`${zone.id}/${x}/${y}`) % 100;
      const obstacle = p === 'CITY' ? value < 9 : p === 'STATION' ? value < 6 : value < 12;
      tiles[y * width + x] = obstacle ? 0 : value < 25 ? 2 : 1;
    }
  const carve = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1) tiles[ny * width + nx] = 1;
      }
  };
  carve(spawn.x, spawn.y);
  const exits = zone.exits.map((exit) => {
    const direction = side(zone.id, exit.to);
    const point = positionFor(zone, exit.to, direction);
    // Each route has a distinct axis-aligned corridor and a two-tile shoulder.
    let x = spawn.x,
      y = spawn.y;
    while (x !== point.x) {
      x += Math.sign(point.x - x);
      carve(x, y);
    }
    while (y !== point.y) {
      y += Math.sign(point.y - y);
      carve(x, y);
    }
    return { to: exit.to, ...point, facing: direction };
  });
  const services: OriginalZoneMap['services'] = [];
  for (const [index, kind] of zone.objectKinds.entries()) {
    const angle = (index + 1) * 2.399963;
    const x = Math.max(2, Math.min(width - 3, spawn.x + Math.round(Math.cos(angle) * 5)));
    const y = Math.max(2, Math.min(height - 3, spawn.y + Math.round(Math.sin(angle) * 5)));
    carve(x, y);
    services.push({ kind, x, y });
  }
  return {
    id: zone.id,
    location: zone.location,
    name: zone.name,
    width,
    height,
    palette: p,
    tiles,
    spawn,
    exits,
    services,
  };
}

export function originalWalkable(map: OriginalZoneMap, x: number, y: number) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height &&
    map.tiles[y * map.width + x] !== 0
  );
}

export function originalReachableCells(map: OriginalZoneMap) {
  const visited = new Set<string>([`${map.spawn.x},${map.spawn.y}`]);
  const queue = [map.spawn];
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = tile.x + dx,
        y = tile.y + dy,
        key = `${x},${y}`;
      if (!visited.has(key) && originalWalkable(map, x, y)) {
        visited.add(key);
        queue.push({ x, y });
      }
    }
  }
  return { visited, queue };
}

/** Destination and coordinates come exclusively from the server's paired zone registry. */
export function transitionOriginalZone(
  source: OriginalPlayerState,
  destinationId: string,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  if (state.world.miningSession || state.world.extractionSession) throw new Error('ZONE_TRANSITION_BLOCKED');
  const origin = originalZoneMap(state.world.zone);
  const exit = origin.exits.find((item) => item.to === destinationId);
  if (!exit) throw new Error('ZONE_EXIT_UNAVAILABLE');
  const destination = originalZoneMap(destinationId);
  if (destination.location !== origin.location) throw new Error('INTERLOCATION_TRAVEL_REQUIRED');
  const returnExit = destination.exits.find((item) => item.to === origin.id);
  if (!returnExit) throw new Error('UNPAIRED_ZONE_EXIT');
  const arrival = {
    x: returnExit.x + (returnExit.facing === 'E' ? -1 : returnExit.facing === 'W' ? 1 : 0),
    y: returnExit.y + (returnExit.facing === 'S' ? -1 : returnExit.facing === 'N' ? 1 : 0),
  };
  if (!originalWalkable(destination, arrival.x, arrival.y)) throw new Error('UNSAFE_ZONE_ARRIVAL');
  state.world.zone = destinationId as OriginalPlayerState['world']['zone'];
  if (state.world.groundVehicle?.active && state.world.groundVehicle.occupied)
    state.world.groundVehicle.zone = state.world.zone;
  state.world.entry = `from:${origin.id}`;
  state.revision++;
  return originalStateSchema.parse(state);
}
