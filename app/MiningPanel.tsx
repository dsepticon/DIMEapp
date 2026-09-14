import { useState } from 'react';
import styles from './page.module.css';
import { CAPACITIES, MINING_TYPES } from '../shared/catalog';
import { Action, MiningType, PlayerState } from '../shared/schema';
import { scu, total } from '../shared/game';
import { SurveyIcon } from './rpg/ui/SurveyIcon';
import { wholeCscuToMinor } from '../shared/mineralUnits';
export function MiningPanel({
  state,
  source,
  setSource,
  canAct,
  mutate,
}: {
  state: PlayerState;
  source: MiningType;
  setSource: (source: MiningType) => void;
  canAct: boolean;
  mutate: (action?: Action) => Promise<void>;
}) {
  const [head, setHead] = useState(source === 'Mole' ? 'Arbor MH2' : 'Arbor MH1');
  const [crew, setCrew] = useState('Terraphon');
  const [extraStations, setExtraStations] = useState<{ head: string; crew: string }[]>([]);
  return (
    <section className={styles.content}>
      <div className={styles.sectionHeading}>
        <div>
          <p>MINING CLAIMS</p>
          <h1>Mining operations</h1>
        </div>
      </div>
      <p className={styles.hint}>
        Hand and ROC: Lyria or Wala. Prospector and Mole: Halo. Travel from ARC-L1 in an owned ship.
      </p>
      <div className={styles.locationGrid}>
        {MINING_TYPES.map((name) => (
          <button
            className={styles.locationCard + ' ' + (name === source ? styles.selected : '')}
            key={name}
            onClick={() => {
              setSource(name);
              setHead(name === 'Mole' ? 'Arbor MH2' : 'Arbor MH1');
            }}
            aria-pressed={source === name}
          >
            <SurveyIcon source={name} />
            <span>
              <strong>{name}</strong>
              <small>
                {scu(total(state.mining[name]))} / {scu(wholeCscuToMinor(CAPACITIES[name]))} SCU
              </small>
            </span>
          </button>
        ))}
      </div>
      {(source === 'Prospector' || source === 'Mole') && (
        <div className={styles.refineForm}>
          <label>
            Mining head
            <select value={head} onChange={(event) => setHead(event.target.value)}>
              {(source === 'Prospector'
                ? ['Arbor MH1', 'Hofstede S1', 'Impact I', 'Helix I']
                : ['Arbor MH2', 'Hofstede S2', 'Impact II', 'Helix II']
              ).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          {source === 'Mole' && (
            <label>
              Crew
              <select value={crew} onChange={(event) => setCrew(event.target.value)}>
                {['Terraphon', 'Andirr', 'Dora'].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {source === 'Mole' && (
        <fieldset>
          <legend>Additional mining stations (optional)</legend>
          {[0, 1].map((index) => (
            <div key={index} className={styles.refineForm}>
              <label>
                Station {index + 2} crew
                <select
                  value={extraStations[index]?.crew ?? ''}
                  onChange={(event) => {
                    if (!event.target.value) setExtraStations(extraStations.slice(0, index));
                    else
                      setExtraStations([
                        ...extraStations.slice(0, index),
                        { head: extraStations[index]?.head ?? 'Arbor MH2', crew: event.target.value },
                      ]);
                  }}
                >
                  <option value="">None</option>
                  {['Terraphon', 'Andirr', 'Dora'].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              {extraStations[index] && (
                <label>
                  Station {index + 2} head
                  <select
                    value={extraStations[index].head}
                    onChange={(event) =>
                      setExtraStations(
                        extraStations.map((station, i) =>
                          i === index ? { ...station, head: event.target.value } : station,
                        ),
                      )
                    }
                  >
                    {['Arbor MH2', 'Hofstede S2', 'Impact II', 'Helix II'].map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ))}
        </fieldset>
      )}
      <button
        className={styles.primary}
        disabled={!canAct || total(state.mining[source]) >= wholeCscuToMinor(CAPACITIES[source])}
        onClick={() =>
          void mutate({
            type: 'mine',
            source,
            head,
            crew,
            extraStations: source === 'Mole' ? extraStations : [],
          })
        }
      >
        Scan and mine {source}
      </button>
      <p className={styles.hint}>
        Collect your ore when extraction finishes. Progress is saved if you close this view.
      </p>
    </section>
  );
}
