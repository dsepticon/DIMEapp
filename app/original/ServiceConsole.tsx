import { useMemo, useState } from 'react';
import type { OriginalPlayerState } from '../../shared/originalSchema';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
type Props = {
  state: OriginalPlayerState;
  busy: boolean;
  mutate: (action: Record<string, unknown>) => Promise<OriginalPlayerState | null>;
  kinds: readonly string[];
};
export function ServiceConsole({ state, busy, mutate, kinds }: Props) {
  const [units, setUnits] = useState(100);
  const [process, setProcess] = useState('process.p001');
  const raw = useMemo(
    () =>
      Object.entries(state.mining).flatMap(([source, hold]) =>
        Object.entries(hold)
          .filter(([, q]) => (q ?? 0) > 0)
          .map(([material, q]) => ({ source, material, q: q ?? 0 })),
      ),
    [state.mining],
  );
  const cargo = useMemo(
    () =>
      Object.entries(state.cargo).flatMap(([ship, hold]) =>
        hold
          ? [
              ...Object.entries(hold.raw)
                .filter(([, q]) => (q ?? 0) > 0)
                .map(([material, q]) => ({ ship, material, category: 'raw', q: q ?? 0 })),
              ...Object.entries(hold.refined)
                .filter(([, q]) => (q ?? 0) > 0)
                .map(([material, q]) => ({
                  ship,
                  material: material.replace(/\.processed$/, ''),
                  category: 'refined',
                  q: q ?? 0,
                })),
            ]
          : [],
      ),
    [state.cargo],
  );
  const item = raw[0],
    sale = cargo[0],
    ship = Object.keys(state.ships).find(
      (id) =>
        ORIGINAL_CONTENT.shipsAndVehicles.find((x) => x.id === id)?.cargoRole &&
        state.positions[id as keyof typeof state.positions] === state.location,
    );
  if (!kinds.some((kind) => ['cargo', 'refinery', 'market'].includes(kind))) return null;
  return (
    <section className="serviceConsole">
      <b>INDUSTRIAL SERVICES</b>
      <label>
        Quantity (0.01 cSCU units)
        <input
          type="number"
          min="1"
          step="1"
          value={units}
          onChange={(e) => setUnits(Math.max(1, Math.trunc(Number(e.target.value))))}
        />
      </label>
      {kinds.includes('cargo') && (
        <button
          disabled={busy || !item || !ship}
          onClick={() =>
            item &&
            ship &&
            void mutate({
              type: 'transfer',
              source: item.source,
              material: item.material,
              ship,
              units: Math.min(units, item.q),
            })
          }
        >
          Transfer exact units to cargo
        </button>
      )}
      {kinds.includes('refinery') && (
        <>
          <select value={process} onChange={(e) => setProcess(e.target.value)}>
            {ORIGINAL_CONTENT.refineryMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </select>
          <button
            disabled={busy || !item || !['extract.x003', 'extract.x004'].includes(item.source)}
            onClick={() =>
              item &&
              void mutate({
                type: 'startProcessing',
                source: item.source,
                material: item.material,
                process,
                units: Math.min(units, item.q),
              })
            }
          >
            Start Destroya processing order
          </button>
        </>
      )}
      {kinds.includes('market') && (
        <button
          disabled={busy || !sale}
          onClick={() =>
            sale &&
            void mutate({
              type: 'sell',
              ship: sale.ship,
              material: sale.material,
              category: sale.category,
              units: Math.min(units, sale.q),
            })
          }
        >
          Sell selected cargo at server quote
        </button>
      )}
    </section>
  );
}
