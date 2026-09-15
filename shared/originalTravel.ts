import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalStateSchema, type OriginalPlayerState } from './originalSchema';

type LocationId = OriginalPlayerState['location'];
type ShipId = OriginalPlayerState['currentShip'];
const services: Record<
  LocationId,
  { assign: OriginalPlayerState['world']['zone']; depart: OriginalPlayerState['world']['zone'] }
> = {
  'loc.l001': { assign: 'zone.z008', depart: 'zone.z009' },
  'loc.l002': { assign: 'zone.z012', depart: 'zone.z019' },
  'loc.l003': { assign: 'zone.z020', depart: 'zone.z027' },
  'loc.l004': { assign: 'zone.z028', depart: 'zone.z029' },
  'loc.l005': { assign: 'zone.z043', depart: 'zone.z043' },
};
const arrivals: Record<LocationId, OriginalPlayerState['world']['zone']> = {
  'loc.l001': 'zone.z009',
  'loc.l002': 'zone.z019',
  'loc.l003': 'zone.z027',
  'loc.l004': 'zone.z029',
  'loc.l005': 'zone.z043',
};
const asset = (id: ShipId) => ORIGINAL_CONTENT.shipsAndVehicles.find((item) => item.id === id);

export function assignOriginalDeparture(
  source: OriginalPlayerState,
  ship: ShipId,
  destination: LocationId,
  loadGroundVehicle: boolean,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  if (state.world.zone !== services[state.location].assign || destination === state.location)
    throw new Error('DEPARTURE_SERVICE_REQUIRED');
  const selected = asset(ship);
  if (!selected?.canTravel || (state.ships[ship] ?? 0) < 1 || state.positions[ship] !== state.location)
    throw new Error('SHIP_UNAVAILABLE');
  if (state.world.departure) throw new Error('DEPARTURE_ALREADY_ASSIGNED');
  if (state.world.miningSession || state.world.extractionSession || state.pending)
    throw new Error('DEPARTURE_BLOCKED');
  if (state.world.groundVehicle?.active) throw new Error('STORE_GROUND_VEHICLE');
  if (loadGroundVehicle && ((state.ships['fleet.v002'] ?? 0) < 1 || ship !== 'fleet.v001'))
    throw new Error('GROUND_VEHICLE_LOAD_INVALID');
  state.world.departure = { ship, destination, loadGroundVehicle };
  state.revision++;
  return originalStateSchema.parse(state);
}

export function completeOriginalDeparture(source: OriginalPlayerState): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  const departure = state.world.departure;
  if (!departure || state.world.zone !== services[state.location].depart)
    throw new Error('ASSIGNED_DEPARTURE_POINT_REQUIRED');
  if ((state.ships[departure.ship] ?? 0) < 1 || state.positions[departure.ship] !== state.location)
    throw new Error('SHIP_UNAVAILABLE');
  state.location = departure.destination;
  state.currentShip = departure.ship;
  state.positions[departure.ship] = departure.destination;
  state.world.zone = arrivals[departure.destination];
  state.world.entry = 'arrival';
  state.world.departure = null;
  state.world.groundVehicle = null;
  state.revision++;
  return originalStateSchema.parse(state);
}

export const originalTravelService = (location: LocationId) => services[location];
