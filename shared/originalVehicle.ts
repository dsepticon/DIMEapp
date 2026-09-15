import { ORIGINAL_CONTENT } from './originalCatalog';
import { originalStateSchema, type OriginalPlayerState } from './originalSchema';
const atTerminal = (state: OriginalPlayerState) =>
  (
    ORIGINAL_CONTENT.zones.find((zone) => zone.id === state.world.zone)?.objectKinds as
      | readonly string[]
      | undefined
  )?.includes('vehicle_terminal');
export function retrieveOriginalGroundRig(source: OriginalPlayerState): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  if (!atTerminal(state)) throw Error('VEHICLE_SERVICE_REQUIRED');
  if ((state.ships['fleet.v002'] ?? 0) < 1) throw Error('VEHICLE_NOT_OWNED');
  if (state.world.groundVehicle?.active) throw Error('VEHICLE_ALREADY_ACTIVE');
  state.world.groundVehicle = { zone: state.world.zone, active: true, occupied: false };
  state.revision++;
  return originalStateSchema.parse(state);
}
export function setOriginalGroundRigOccupied(
  source: OriginalPlayerState,
  occupied: boolean,
): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  if (!state.world.groundVehicle?.active || state.world.groundVehicle.zone !== state.world.zone)
    throw Error('VEHICLE_UNAVAILABLE');
  state.world.groundVehicle.occupied = occupied;
  state.revision++;
  return originalStateSchema.parse(state);
}
export function stowOriginalGroundRig(source: OriginalPlayerState): OriginalPlayerState {
  const state = originalStateSchema.parse(structuredClone(source));
  if (!atTerminal(state) || !state.world.groundVehicle?.active || state.world.groundVehicle.occupied)
    throw Error('VEHICLE_STOW_UNAVAILABLE');
  state.world.groundVehicle = null;
  state.revision++;
  return originalStateSchema.parse(state);
}
