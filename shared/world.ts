import type { Location } from './schema';

// DIME identifiers are stable save/API values. Labels and artwork may change independently.
export const ZONE_IDS = [
  'ARC_L1_START',
  'ARC_L1_CONCOURSE',
  'ARC_L1_TRANSIT',
  'ARC_L1_REFINERY',
  'ARC_L1_CARGO',
  'ARC_L1_TRADE',
  'ARC_L1_EQUIPMENT',
  'ARC_L1_DEPARTURE',
  'ARC_L1_HANGAR',
  'ARC_L1_OBSERVATION',
  'ARC_L1_MAINTENANCE',
  'LYRIA_OUTPOST_01',
  'LYRIA_OUTPOST_02',
  'LYRIA_SURFACE_01',
  'LYRIA_SURFACE_02',
  'LYRIA_CAVE_01',
  'LYRIA_CAVE_02',
  'LYRIA_ASOP',
  'LYRIA_LANDING_PAD',
  'WALA_OUTPOST_01',
  'WALA_OUTPOST_02',
  'WALA_SURFACE_01',
  'WALA_SURFACE_02',
  'WALA_CAVE_01',
  'WALA_CAVE_02',
  'WALA_ASOP',
  'WALA_LANDING_PAD',
  'AREA18_SPACEPORT',
  'AREA18_HANGAR',
  'AREA18_SECURITY',
  'AREA18_SPACEPORT_PLATFORM',
  'AREA18_SHUTTLE',
  'AREA18_CITY_PLATFORM',
  'AREA18_TRANSIT',
  'AREA18_PLAZA',
  'AREA18_HABITATION',
  'AREA18_SKYBRIDGE',
  'AREA18_MARKET',
  'AREA18_RETAIL',
  'AREA18_ALLEY',
  'AREA18_INDUSTRIAL',
  'AREA18_CARGO',
  'HALO_ASTEROIDS',
] as const;
export type ZoneId = (typeof ZONE_IDS)[number];
export type WorldLocation = Location;
export type ZonePalette = 'station' | 'lyria' | 'lyriaCave' | 'wala' | 'walaCave' | 'city' | 'space';
export type ZoneService = 'cargo' | 'refinery' | 'market' | 'equipment' | 'travel' | 'asop' | 'foreman';
export type ZoneExit = {
  readonly id: string;
  readonly to: ZoneId;
  readonly x: number;
  readonly y: number;
  readonly entry: string;
  readonly facing: 'north' | 'east' | 'south' | 'west';
};
export type ZoneObject = {
  readonly id: string;
  readonly label: string;
  readonly kind: ZoneService | 'npc';
  readonly x: number;
  readonly y: number;
};
export type SpawnRegion = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly source: 'Hand' | 'Roc';
};
export type Zone = {
  readonly id: ZoneId;
  readonly version: 1;
  readonly location: WorldLocation;
  readonly label: string;
  readonly palette: ZonePalette;
  readonly width: number;
  readonly height: number;
  readonly spawn: readonly [number, number];
  readonly exits: readonly ZoneExit[];
  readonly objects: readonly ZoneObject[];
  readonly regions: readonly SpawnRegion[];
  readonly landmarks: readonly string[];
};

type Draft = Omit<Zone, 'id' | 'version' | 'exits'> & { readonly links: readonly ZoneId[] };
const station = (label: string, links: readonly ZoneId[], objects: ZoneObject[] = []): Draft => ({
  location: 'ARC-L1',
  label,
  palette: 'station',
  width: 30,
  height: 24,
  spawn: [15.5, 12.5],
  links,
  objects: [...objects, { id: 'stationTraveler', label: 'Station traveller', kind: 'npc', x: 19, y: 15 }],
  regions: [],
  landmarks: [label],
});
const moon = (
  location: 'Lyria' | 'Wala',
  label: string,
  palette: ZonePalette,
  links: readonly ZoneId[],
  objects: ZoneObject[] = [],
  mine: 'Hand' | 'Roc' | null = null,
): Draft => ({
  location,
  label,
  palette,
  width: mine ? 48 : 34,
  height: mine ? 34 : 26,
  spawn: [mine ? 24.5 : 17.5, mine ? 17.5 : 13.5],
  links,
  objects,
  regions: mine ? [{ x: 5, y: 5, width: 38, height: 24, source: mine }] : [],
  landmarks: [label],
});
const city = (label: string, links: readonly ZoneId[], objects: ZoneObject[] = []): Draft => ({
  location: 'Area-18',
  label,
  palette: 'city',
  width: 64,
  height: 42,
  spawn: [32.5, 21.5],
  links,
  objects: [
    ...objects,
    { id: 'pedestrianA', label: 'City pedestrian', kind: 'npc', x: 30, y: 19 },
    { id: 'pedestrianB', label: 'Commuter', kind: 'npc', x: 36, y: 24 },
    ...(label.includes('Plaza') || label.includes('Commodity') || label.includes('Retail')
      ? [
          { id: 'pedestrianC', label: 'District shopper', kind: 'npc' as const, x: 27, y: 24 },
          { id: 'pedestrianD', label: 'District courier', kind: 'npc' as const, x: 39, y: 19 },
        ]
      : []),
  ],
  regions: [],
  landmarks: [label],
});
const drafts: Record<ZoneId, Draft> = {
  ARC_L1_START: station(
    'ARC-L1 Habitation',
    ['ARC_L1_CONCOURSE'],
    [{ id: 'orientation', label: 'Station guide', kind: 'npc', x: 16, y: 11 }],
  ),
  ARC_L1_CONCOURSE: station(
    'ARC-L1 Main Concourse',
    ['ARC_L1_START', 'ARC_L1_TRANSIT', 'ARC_L1_TRADE', 'ARC_L1_OBSERVATION'],
    [{ id: 'contractor', label: 'Mining contractor', kind: 'npc', x: 12, y: 11 }],
  ),
  ARC_L1_TRANSIT: station('ARC-L1 Service Lift', [
    'ARC_L1_CONCOURSE',
    'ARC_L1_REFINERY',
    'ARC_L1_CARGO',
    'ARC_L1_EQUIPMENT',
    'ARC_L1_DEPARTURE',
    'ARC_L1_MAINTENANCE',
  ]),
  ARC_L1_REFINERY: station(
    'ARC-L1 Refinery Deck',
    ['ARC_L1_TRANSIT'],
    [
      { id: 'refinery', label: 'Ore refinery', kind: 'refinery', x: 14, y: 10 },
      { id: 'technician', label: 'Refinery worker', kind: 'npc', x: 17, y: 11 },
    ],
  ),
  ARC_L1_CARGO: station(
    'ARC-L1 Cargo Services',
    ['ARC_L1_TRANSIT'],
    [
      { id: 'cargo', label: 'Cargo service', kind: 'cargo', x: 14, y: 10 },
      { id: 'cargoWorker', label: 'Cargo worker', kind: 'npc', x: 17, y: 11 },
    ],
  ),
  ARC_L1_TRADE: station(
    'ARC-L1 Trade Hall',
    ['ARC_L1_CONCOURSE'],
    [{ id: 'market', label: 'Trade terminal', kind: 'market', x: 14, y: 10 }],
  ),
  ARC_L1_EQUIPMENT: station(
    'ARC-L1 Mining Supplies',
    ['ARC_L1_TRANSIT'],
    [{ id: 'equipment', label: 'Equipment vendor', kind: 'equipment', x: 14, y: 10 }],
  ),
  ARC_L1_DEPARTURE: station(
    'ARC-L1 Departure Service',
    ['ARC_L1_TRANSIT', 'ARC_L1_HANGAR'],
    [{ id: 'travel', label: 'Owned ship terminal', kind: 'travel', x: 14, y: 10 }],
  ),
  ARC_L1_HANGAR: station(
    'ARC-L1 Hangar',
    ['ARC_L1_DEPARTURE'],
    [{ id: 'departure', label: 'Assigned ship departure point', kind: 'travel', x: 14, y: 10 }],
  ),
  ARC_L1_OBSERVATION: station('ARC-L1 Observation Walk', ['ARC_L1_CONCOURSE']),
  ARC_L1_MAINTENANCE: station('ARC-L1 Maintenance', ['ARC_L1_TRANSIT']),
  LYRIA_OUTPOST_01: moon(
    'Lyria',
    'Lyria Mining Outpost',
    'lyria',
    ['LYRIA_SURFACE_01', 'LYRIA_ASOP', 'LYRIA_OUTPOST_02', 'LYRIA_LANDING_PAD'],
    [
      { id: 'foreman', label: 'Mara Voss · Shift Foreman', kind: 'foreman', x: 16, y: 11 },
      { id: 'officer', label: 'Neri Vale · Supply Officer', kind: 'npc', x: 13, y: 11 },
      { id: 'market', label: 'Raw gem counter', kind: 'market', x: 19, y: 11 },
      { id: 'landing', label: 'Outpost departure console', kind: 'travel', x: 22, y: 12 },
    ],
  ),
  LYRIA_OUTPOST_02: moon(
    'Lyria',
    'Lyria East Yard',
    'lyria',
    ['LYRIA_OUTPOST_01', 'LYRIA_SURFACE_02'],
    [
      { id: 'eastSupplies', label: 'East Yard mining supplies', kind: 'equipment', x: 16, y: 11 },
      { id: 'eastMiner', label: 'East Yard miner', kind: 'npc', x: 20, y: 14 },
    ],
  ),
  LYRIA_SURFACE_01: moon(
    'Lyria',
    'Lyria Frost Flats',
    'lyria',
    ['LYRIA_OUTPOST_01', 'LYRIA_SURFACE_02', 'LYRIA_CAVE_01'],
    [],
    'Hand',
  ),
  LYRIA_SURFACE_02: moon(
    'Lyria',
    'Lyria Haul Trail',
    'lyria',
    ['LYRIA_SURFACE_01', 'LYRIA_OUTPOST_02', 'LYRIA_CAVE_02'],
    [],
    'Roc',
  ),
  LYRIA_CAVE_01: moon(
    'Lyria',
    'Lyria Shallow Cave',
    'lyriaCave',
    ['LYRIA_SURFACE_01', 'LYRIA_CAVE_02'],
    [],
    'Hand',
  ),
  LYRIA_CAVE_02: moon(
    'Lyria',
    'Lyria Deep Gallery',
    'lyriaCave',
    ['LYRIA_CAVE_01', 'LYRIA_SURFACE_02'],
    [],
    'Hand',
  ),
  LYRIA_ASOP: moon(
    'Lyria',
    'Lyria Vehicle Bay',
    'lyria',
    ['LYRIA_OUTPOST_01'],
    [{ id: 'asop', label: 'Owned vehicle terminal', kind: 'asop', x: 16, y: 11 }],
  ),
  LYRIA_LANDING_PAD: moon(
    'Lyria',
    'Lyria Outpost Landing Pad',
    'lyria',
    ['LYRIA_OUTPOST_01'],
    [{ id: 'departure', label: 'Assigned ship departure point', kind: 'travel', x: 16, y: 11 }],
  ),
  WALA_OUTPOST_01: moon(
    'Wala',
    'Wala Ridge Outpost',
    'wala',
    ['WALA_SURFACE_01', 'WALA_OUTPOST_02', 'WALA_ASOP', 'WALA_LANDING_PAD'],
    [
      { id: 'market', label: 'Raw gem counter', kind: 'market', x: 16, y: 11 },
      { id: 'ridgeMiner', label: 'Ridge miner', kind: 'npc', x: 20, y: 14 },
      { id: 'landing', label: 'Outpost departure console', kind: 'travel', x: 22, y: 12 },
    ],
  ),
  WALA_OUTPOST_02: moon(
    'Wala',
    'Wala South Processing Yard',
    'wala',
    ['WALA_OUTPOST_01', 'WALA_SURFACE_02'],
    [
      { id: 'yardWorker', label: 'Processing yard worker', kind: 'npc', x: 16, y: 11 },
      { id: 'cargo', label: 'Outpost cargo service', kind: 'cargo', x: 20, y: 12 },
    ],
  ),
  WALA_SURFACE_01: moon(
    'Wala',
    'Wala Broken Shelf',
    'wala',
    ['WALA_OUTPOST_01', 'WALA_SURFACE_02', 'WALA_CAVE_01'],
    [],
    'Hand',
  ),
  WALA_SURFACE_02: moon(
    'Wala',
    'Wala Switchback',
    'wala',
    ['WALA_SURFACE_01', 'WALA_OUTPOST_02', 'WALA_CAVE_02'],
    [],
    'Roc',
  ),
  WALA_CAVE_01: moon('Wala', 'Wala Shale Cave', 'walaCave', ['WALA_SURFACE_01', 'WALA_CAVE_02'], [], 'Hand'),
  WALA_CAVE_02: moon('Wala', 'Wala Lower Rift', 'walaCave', ['WALA_CAVE_01', 'WALA_SURFACE_02'], [], 'Hand'),
  WALA_ASOP: moon(
    'Wala',
    'Wala Vehicle Bay',
    'wala',
    ['WALA_OUTPOST_01'],
    [
      { id: 'asop', label: 'Owned vehicle terminal', kind: 'asop', x: 16, y: 11 },
      { id: 'bayWorker', label: 'Vehicle bay worker', kind: 'npc', x: 20, y: 14 },
    ],
  ),
  WALA_LANDING_PAD: moon(
    'Wala',
    'Wala Ridge Landing Pad',
    'wala',
    ['WALA_OUTPOST_01'],
    [{ id: 'departure', label: 'Assigned ship departure point', kind: 'travel', x: 16, y: 11 }],
  ),
  AREA18_SPACEPORT: city(
    'Area18 Spaceport',
    ['AREA18_SECURITY', 'AREA18_HANGAR', 'AREA18_CARGO'],
    [{ id: 'travel', label: 'Owned ship terminal', kind: 'travel', x: 33, y: 20 }],
  ),
  AREA18_HANGAR: city(
    'Area18 Assigned Hangar',
    ['AREA18_SPACEPORT'],
    [{ id: 'departure', label: 'Assigned ship departure point', kind: 'travel', x: 33, y: 20 }],
  ),
  AREA18_SECURITY: city(
    'Area18 Port Checkpoint',
    ['AREA18_SPACEPORT', 'AREA18_SPACEPORT_PLATFORM'],
    [{ id: 'portGuide', label: 'Port wayfinding guide', kind: 'npc', x: 20, y: 15 }],
  ),
  AREA18_SPACEPORT_PLATFORM: city(
    'Area18 Spaceport Platform',
    ['AREA18_SECURITY', 'AREA18_SHUTTLE'],
    [{ id: 'platformGuide', label: 'City-bound platform guide', kind: 'npc', x: 22, y: 15 }],
  ),
  AREA18_SHUTTLE: city(
    'Area18 City Shuttle',
    ['AREA18_SPACEPORT_PLATFORM', 'AREA18_CITY_PLATFORM'],
    [{ id: 'commuter', label: 'Shuttle commuter', kind: 'npc', x: 24, y: 17 }],
  ),
  AREA18_CITY_PLATFORM: city(
    'Area18 City Platform',
    ['AREA18_SHUTTLE', 'AREA18_TRANSIT'],
    [{ id: 'cityGuide', label: 'District wayfinding guide', kind: 'npc', x: 22, y: 15 }],
  ),
  AREA18_TRANSIT: city('Area18 Transit Hall', ['AREA18_CITY_PLATFORM', 'AREA18_PLAZA', 'AREA18_INDUSTRIAL']),
  AREA18_PLAZA: city('Area18 Central Plaza', [
    'AREA18_TRANSIT',
    'AREA18_MARKET',
    'AREA18_RETAIL',
    'AREA18_ALLEY',
    'AREA18_SKYBRIDGE',
  ]),
  AREA18_HABITATION: city('Area18 Habitation Row', ['AREA18_SKYBRIDGE', 'AREA18_ALLEY']),
  AREA18_SKYBRIDGE: city('Area18 Upper Walk', ['AREA18_PLAZA', 'AREA18_HABITATION']),
  AREA18_MARKET: city(
    'Area18 Commodity Hall',
    ['AREA18_PLAZA', 'AREA18_INDUSTRIAL'],
    [{ id: 'market', label: 'Commodity exchange', kind: 'market', x: 33, y: 20 }],
  ),
  AREA18_RETAIL: city(
    'Area18 Retail Walk',
    ['AREA18_PLAZA', 'AREA18_ALLEY'],
    [{ id: 'equipment', label: 'Mining supply shop', kind: 'equipment', x: 33, y: 20 }],
  ),
  AREA18_ALLEY: city('Area18 Service Alley', [
    'AREA18_PLAZA',
    'AREA18_RETAIL',
    'AREA18_HABITATION',
    'AREA18_INDUSTRIAL',
  ]),
  AREA18_INDUSTRIAL: city('Area18 Back-Service District', [
    'AREA18_ALLEY',
    'AREA18_MARKET',
    'AREA18_TRANSIT',
  ]),
  AREA18_CARGO: city(
    'Area18 Port Cargo Lane',
    ['AREA18_SPACEPORT'],
    [{ id: 'cargo', label: 'Port cargo service', kind: 'cargo', x: 33, y: 20 }],
  ),
  HALO_ASTEROIDS: {
    location: 'Halo',
    label: 'Aaron Halo Mining Field',
    palette: 'space',
    width: 30,
    height: 24,
    spawn: [15.5, 12.5],
    links: [],
    objects: [{ id: 'cockpit', label: 'Ship cockpit departure', kind: 'travel', x: 14, y: 10 }],
    regions: [],
    landmarks: ['Mining Field'],
  },
};

export const ZONES: Readonly<Record<ZoneId, Zone>> = Object.fromEntries(
  ZONE_IDS.map((id) => {
    const draft = drafts[id];
    const used: { x: number; y: number }[] = [];
    const exits = draft.links.map((to, index): ZoneExit => {
      const owner = id < to ? id : to;
      const ownerIndex = drafts[owner].links.indexOf(owner === id ? to : id);
      const side = (ownerIndex + (owner === id ? 0 : 2)) % 4;
      const along = 5 + Math.floor(index / 4) * 4;
      const [baseX, baseY, facing] = (
        [
          [Math.min(draft.width - 4, along), 2, 'south'],
          [draft.width - 4, Math.min(draft.height - 4, along), 'west'],
          [Math.min(draft.width - 4, along), draft.height - 3, 'north'],
          [2, Math.min(draft.height - 4, along), 'east'],
        ] as const
      )[side];
      const [dx, dy] = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] }[facing];
      const candidate = [0, -3, 3, -6, 6, -9, 9, -12, 12]
        .flatMap((offset) =>
          [0, 1, 2].map((depth) => ({
            x: baseX + (side % 2 === 0 ? offset : dx * depth),
            y: baseY + (side % 2 === 1 ? offset : dy * depth),
          })),
        )
        .find(
          ({ x, y }) =>
            zoneWalkable(draft, x, y) &&
            zoneWalkable(draft, x + dx, y + dy) &&
            !draft.objects.some(
              (object) => (object.x === x && object.y === y) || (object.x === x + dx && object.y === y + dy),
            ) &&
            used.every((exit) => Math.hypot(exit.x - x, exit.y - y) >= 3),
        );
      if (!candidate) throw new Error(`No safe exit tile for ${id} → ${to}`);
      const { x, y } = candidate;
      used.push(candidate);
      return { id: `exit-${index}`, to, x, y, facing, entry: `from:${id}` };
    });
    return [id, { ...draft, id, version: 1, exits }];
  }),
) as unknown as Record<ZoneId, Zone>;

export const START_ZONE: ZoneId = 'ARC_L1_START';
export const LEGACY_ZONE: Partial<Record<Location, ZoneId>> = {
  'ARC-L1': START_ZONE,
  Lyria: 'LYRIA_OUTPOST_01',
  Wala: 'WALA_OUTPOST_01',
  'Area-18': 'AREA18_SPACEPORT',
  Halo: 'HALO_ASTEROIDS',
};
export const DEPARTURE_POINTS: Readonly<Record<Location, { service: ZoneId; point: ZoneId }>> = {
  'ARC-L1': { service: 'ARC_L1_DEPARTURE', point: 'ARC_L1_HANGAR' },
  Lyria: { service: 'LYRIA_OUTPOST_01', point: 'LYRIA_LANDING_PAD' },
  Wala: { service: 'WALA_OUTPOST_01', point: 'WALA_LANDING_PAD' },
  'Area-18': { service: 'AREA18_SPACEPORT', point: 'AREA18_HANGAR' },
  Halo: { service: 'HALO_ASTEROIDS', point: 'HALO_ASTEROIDS' },
};
export function zoneForSave(location: Location, zone?: string): Zone | null {
  if (!zone) return ZONES[LEGACY_ZONE[location]!] ?? null;
  const match = ZONES[zone as ZoneId];
  return match?.location === location ? match : null;
}

/** Only canonical arrival or a real neighboring zone may name a saved entry. */
export function validZoneEntry(zone: Zone, entry: string | undefined): boolean {
  return !entry || entry === 'arrival' || zone.exits.some((exit) => entry === `from:${exit.to}`);
}

/** A server-issued entry names the previous zone; coordinates are never accepted from the browser. */
export function zoneArrival(
  zone: Zone,
  entry: string | undefined,
): { x: number; y: number; facing: ZoneExit['facing'] } {
  if (!entry || entry === 'arrival') return { x: zone.spawn[0], y: zone.spawn[1], facing: 'south' };
  const returnExit = zone.exits.find((exit) => entry === `from:${exit.to}`);
  if (!returnExit) throw new Error(`Unrecognized entry for ${zone.id}.`);
  const directions = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
  const [dx, dy] = directions[returnExit.facing];
  const x = returnExit.x + dx;
  const y = returnExit.y + dy;
  if (!zoneWalkable(zone, x, y) || zone.objects.some((object) => object.x === x && object.y === y))
    throw new Error(`Unsafe entry for ${zone.id}.`);
  return { x: x + 0.5, y: y + 0.5, facing: returnExit.facing };
}

export function zoneWalkable(
  zone: Pick<Zone, 'width' | 'height' | 'palette'>,
  x: number,
  y: number,
): boolean {
  if (x < 1 || y < 1 || x >= zone.width - 1 || y >= zone.height - 1) return false;
  if (zone.palette === 'station')
    return !(x % 9 === 0 && y > 4 && y < zone.height - 5 && y % 9 > 2 && y % 9 < 7);
  if (zone.palette === 'city')
    return !(x % 7 === 0 && y > 4 && y < zone.height - 5 && y % 9 > 2 && y % 9 < 7);
  if (zone.palette === 'wala' || zone.palette === 'walaCave')
    return !((x + Math.floor(y / 3)) % 13 === 0 && y > 4 && y < zone.height - 5 && x % 5 > 0);
  return !(x % 11 === 0 && y > 4 && y < zone.height - 5 && y % 9 > 2 && y % 9 < 7);
}
