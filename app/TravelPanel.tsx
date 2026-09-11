import { useState } from 'react';
import styles from './page.module.css';
import { LOCATIONS, SHIP_NAMES } from '../shared/catalog';
import { Action, Location, PlayerState, Ship } from '../shared/schema';
import { remaining } from './ui';
export function TravelPanel({
  state,
  blocked,
  canAct,
  now,
  mutate,
}: {
  state: PlayerState;
  blocked: boolean;
  canAct: boolean;
  now: number;
  mutate: (action?: Action) => Promise<void>;
}) {
  const [travelShip, setTravelShip] = useState<Ship>(state.currentShip);
  const [destination, setDestination] = useState<Location>('Lyria');
  const [loadRoc, setLoadRoc] = useState(false);
  const destinations = LOCATIONS.filter(
    (name) =>
      name !== state?.location &&
      (['Prospector', 'Mole'].includes(travelShip) ? ['ARC-L1', 'Halo'].includes(name) : name !== 'Halo'),
  );
  const travelDestination = destinations.includes(destination) ? destination : destinations[0];

  const ownedShips = SHIP_NAMES.filter((name) => (state.ships[name] ?? 0) > 0);
  return (
    <section className={styles.travel} aria-label="Location and travel">
      <strong>
        {state.location} · {state.currentShip}
      </strong>
      {state.pending ? (
        <div>
          <p>
            {state.pending.kind === 'mine' ? 'Mining operation' : 'Travel to ' + state.pending.destination}:{' '}
            {remaining(state.pending.readyAt, now)} seconds remaining
          </p>
          <button
            disabled={blocked || now < state.pending.readyAt}
            onClick={() => void mutate({ type: 'finish' })}
          >
            {state.pending.kind === 'mine' ? 'Collect mined ore' : 'Complete arrival'}
          </button>
        </div>
      ) : (
        <details>
          <summary>Travel / select a claim</summary>
          <div className={styles.refineForm}>
            <label>
              Travel ship
              <select value={travelShip} onChange={(event) => setTravelShip(event.target.value as Ship)}>
                {ownedShips
                  .filter((name) => name !== 'Roc')
                  .map((name) => (
                    <option key={name}>{name}</option>
                  ))}
              </select>
            </label>
            <label>
              Destination
              <select
                value={travelDestination}
                onChange={(event) => setDestination(event.target.value as Location)}
              >
                {destinations.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={loadRoc}
                onChange={(event) => setLoadRoc(event.target.checked)}
              />{' '}
              Carry owned ROC in Nomad
            </label>
            <button
              disabled={!canAct}
              onClick={() =>
                void mutate({
                  type: 'travel',
                  ship: travelShip,
                  destination: travelDestination,
                  loadRoc,
                })
              }
            >
              Start travel
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
