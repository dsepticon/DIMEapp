import { useEffect, useMemo } from 'react';
import type { OriginalPlayerState } from '../../shared/originalSchema';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import { originalZoneMap } from '../../shared/originalWorld';
import { originalTravelService } from '../../shared/originalTravel';
import {
  exitKind,
  navigationObjective,
  nearInteraction,
  servicePoint,
  type WorldPoint,
} from '../../shared/originalNavigation';
export function PhysicalNavigation({
  state,
  player,
  getPlayer,
  busy,
  mapOpen,
  closeMap,
  objective,
  select,
  marker,
  mutate,
}: {
  state: OriginalPlayerState;
  player: WorldPoint;
  getPlayer(): WorldPoint;
  busy: boolean;
  mapOpen: boolean;
  closeMap(): void;
  objective: string;
  select(id: string): void;
  marker(point: WorldPoint | undefined): void;
  mutate(action: Record<string, unknown>): Promise<OriginalPlayerState | null>;
}) {
  const map = useMemo(() => originalZoneMap(state.world.zone), [state.world.zone]);
  const plan = useMemo(
    () => (objective ? navigationObjective(state, objective) : undefined),
    [state, objective],
  );
  useEffect(() => marker(plan?.point), [plan, marker]);
  const exits = map.exits.filter((exit) => nearInteraction(map.id, player, exit));
  const activateExit = (to: string) => {
    const exit = map.exits.find((item) => item.to === to);
    if (!busy && exit && nearInteraction(map.id, getPlayer(), exit))
      void mutate({ type: 'moveZone', destination: to, player: getPlayer() });
  };
  useEffect(() => {
    const interact = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyE' ||
        event.repeat ||
        (event.target instanceof HTMLElement && event.target.closest('input,select,textarea'))
      )
        return;
      const exit = map.exits.find((item) => nearInteraction(map.id, getPlayer(), item));
      if (exit && !busy) {
        event.preventDefault();
        void mutate({ type: 'moveZone', destination: exit.to, player: getPlayer() });
      }
    };
    window.addEventListener('keydown', interact);
    return () => window.removeEventListener('keydown', interact);
  }, [map, busy, getPlayer, mutate]);
  const travel = servicePoint(map.id, 'travel'),
    rig = servicePoint(map.id, 'vehicle_terminal');
  const atTravel = !!travel && nearInteraction(map.id, player, travel),
    atRig = !!rig && nearInteraction(map.id, player, rig);
  const selectedLocation = ORIGINAL_CONTENT.locations.find(
    (item) => item.id === objective && item.id !== state.location,
  );
  const services = originalTravelService(state.location);
  return (
    <section className="physicalNavigation" aria-label="Physical navigation">
      {mapOpen && (
        <section className="destinationMap" aria-label="Destination map">
          <b>Select an objective · travel is physical</b>
          <button onClick={closeMap}>Close map</button>
          <div>
            {ORIGINAL_CONTENT.locations.map((location) => (
              <button
                key={location.id}
                aria-pressed={objective === location.id}
                onClick={() => select(location.id)}
              >
                {location.name}
              </button>
            ))}
          </div>
          <div>
            {ORIGINAL_CONTENT.zones
              .filter((zone) => zone.location === state.location)
              .map((zone) => (
                <button key={zone.id} aria-pressed={objective === zone.id} onClick={() => select(zone.id)}>
                  {zone.name}
                </button>
              ))}
          </div>
        </section>
      )}
      <p className="objective" role="status">
        {plan?.text ?? 'Walk to a marked exit or open NAV to choose an objective.'}
      </p>
      <div className="physicalInteractions">
        {exits.map((exit) => (
          <button key={exit.to} disabled={busy} onClick={() => activateExit(exit.to)}>
            Use {exitKind(map.id, exit)} · {ORIGINAL_CONTENT.zones.find((zone) => zone.id === exit.to)?.name}
          </button>
        ))}
        {atTravel && map.id === services.assign && !state.world.departure && (
          <button
            disabled={busy || !selectedLocation}
            onClick={() =>
              selectedLocation &&
              void mutate({
                type: 'assignDeparture',
                ship: state.currentShip,
                destination: selectedLocation.id,
                loadGroundVehicle: false,
                player: getPlayer(),
              })
            }
          >
            Assign Lark Skiff
            {selectedLocation ? ` · ${selectedLocation.name}` : ' · select a destination in NAV'}
          </button>
        )}
        {atTravel && map.id === services.depart && state.world.departure && (
          <button
            disabled={busy}
            onClick={() => void mutate({ type: 'completeDeparture', player: getPlayer() })}
          >
            Board assigned ship
          </button>
        )}
        {atRig && !state.world.groundVehicle && (
          <button
            disabled={busy || !state.ships['fleet.v002']}
            onClick={() => void mutate({ type: 'retrieveGroundRig', player: getPlayer() })}
          >
            Retrieve owned Crawl Rig
          </button>
        )}
        {state.world.groundVehicle?.active && (
          <button
            disabled={busy}
            onClick={() =>
              void mutate({ type: 'setGroundRigOccupied', occupied: !state.world.groundVehicle?.occupied })
            }
          >
            {state.world.groundVehicle.occupied ? 'Exit' : 'Enter'} ground rig
          </button>
        )}
        {atRig && state.world.groundVehicle?.active && !state.world.groundVehicle.occupied && (
          <button disabled={busy} onClick={() => void mutate({ type: 'stowGroundRig', player: getPlayer() })}>
            Stow ground rig
          </button>
        )}
      </div>
    </section>
  );
}
