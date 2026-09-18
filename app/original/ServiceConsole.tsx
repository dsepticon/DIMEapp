import { useEffect, useState } from 'react';
import type { OriginalPlayerState } from '../../shared/originalSchema';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import { formatCscuMinor, parseCscuMinor } from '../../shared/mineralUnits';
import { originalRefineryQuote } from '../../shared/originalEconomy';
import { materialName, quantity, salePreview, serviceInventory } from './serviceModel';
type Props = {
  guest?: boolean;
  state: OriginalPlayerState;
  busy: boolean;
  mutate: (action: Record<string, unknown>) => Promise<OriginalPlayerState | null>;
  kinds: readonly string[];
};
export function ServiceConsole(props: Props) {
  return (
    <Services
      key={`${props.state.saveGeneration}:${props.state.location}:${props.state.world.zone}`}
      {...props}
    />
  );
}
function Services({ state, busy, mutate, kinds, guest = false }: Props) {
  const inventory = serviceInventory(state);
  const processing = kinds.includes('refinery');
  const raw = inventory.raw.filter((item) => !processing || item.processable);
  const [rawKey, setRawKey] = useState(raw[0]?.key ?? '');
  const [saleKey, setSaleKey] = useState(inventory.cargo[0]?.key ?? '');
  const [shipId, setShipId] = useState(inventory.ships[0]?.id ?? '');
  const [amount, setAmount] = useState('1');
  const [process, setProcess] = useState<keyof OriginalPlayerState['refineryRates']>('process.p001');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!processing || !state.orders.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [processing, state.orders.length]);
  const units = parseCscuMinor(amount);
  const item = raw.find((entry) => entry.key === rawKey);
  const sale = inventory.cargo.find((entry) => entry.key === saleKey);
  const ship = inventory.ships.find((entry) => entry.id === shipId);
  const quantityError =
    units === null || units <= 0 ? 'Enter a positive quantity with at most two decimal places.' : '';
  const sourceError = !item
    ? 'Select an available extraction hold and material.'
    : units !== null && units > item.units
      ? 'Quantity exceeds the selected hold.'
      : quantityError;
  const transferError =
    sourceError ||
    (!ship
      ? 'Bring an owned cargo ship to this location.'
      : units !== null && units > ship.free
        ? 'Not enough free cargo capacity.'
        : '');
  const quote =
    processing && item && !sourceError && units ? originalRefineryQuote(state, process, units) : null;
  const processingError =
    sourceError ||
    (quote && quote.refinedUnits <= 0
      ? 'Quantity is too small to produce processed material.'
      : quote && quote.cost > state.wallet
        ? 'Not enough shift marks for the processing fee.'
        : '');
  const saleError = !sale
    ? 'Select cargo aboard a ship at this location.'
    : sale.price <= 0
      ? 'This material cannot be sold in this form.'
      : quantityError || (units !== null && units > sale.units ? 'Quantity exceeds the selected cargo.' : '');
  if (!kinds.some((kind) => ['cargo', 'refinery', 'market'].includes(kind))) return null;
  return (
    <section className="serviceConsole" aria-label="Industrial services">
      <header>
        <b>{guest ? 'LOCAL DEMO SERVICES' : 'INDUSTRIAL SERVICES'}</b>
        <p>
          {guest
            ? 'Local demonstration only. Progress is not saved.'
            : 'Selections and estimates use your current save. The server confirms each operation.'}
        </p>
      </header>
      <label>
        Quantity (cSCU)
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      {(kinds.includes('cargo') || processing) && (
        <>
          <label>
            Extraction material
            <select value={item ? rawKey : ''} onChange={(e) => setRawKey(e.target.value)}>
              <option value="">Select material</option>
              {raw.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {materialName(entry.material)} · {entry.sourceName} · {quantity(entry.units)}
                </option>
              ))}
            </select>
          </label>
          {!raw.length && (
            <p>
              {processing
                ? 'Processing requires refinable ore in a mining ship at this location. Hand and ground-rig holds cannot supply refinery orders.'
                : 'No extracted material is available here.'}
            </p>
          )}
          <label>
            Receiving cargo ship
            <select value={ship?.id ?? ''} onChange={(e) => setShipId(e.target.value as typeof shipId)}>
              <option value="">Select cargo ship</option>
              {inventory.ships.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {quantity(entry.free)} free
                </option>
              ))}
            </select>
          </label>
          {ship && (
            <p className="serviceSummary">
              {ship.name}: {quantity(ship.used)} / {quantity(ship.capacity)} occupied
            </p>
          )}
        </>
      )}
      {kinds.includes('cargo') && (
        <div className="serviceCard">
          <p>{transferError || `${quantity(units!)} moves to ${ship!.name}.`}</p>
          <button
            disabled={busy || !!transferError}
            onClick={() =>
              item &&
              ship &&
              units &&
              !transferError &&
              void mutate({
                type: 'transfer',
                source: item.source,
                material: item.material,
                ship: ship.id,
                units,
              })
            }
          >
            Transfer exact units to cargo
          </button>
        </div>
      )}
      {processing && (
        <>
          <label>
            Processing method
            <select value={process} onChange={(e) => setProcess(e.target.value as typeof process)}>
              {ORIGINAL_CONTENT.refineryMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </label>
          <div className="serviceCard">
            <p>
              {processingError ||
                (quote &&
                  `Estimate: ${quantity(quote.refinedUnits)} output · ${quote.cost} shift marks · ${Math.ceil(quote.duration / 1000)} seconds`)}
            </p>
            <button
              disabled={busy || !!processingError || !quote}
              onClick={() =>
                item &&
                units &&
                !processingError &&
                void mutate({
                  type: 'startProcessing',
                  source: item.source,
                  material: item.material,
                  process,
                  units,
                })
              }
            >
              Start Destroya processing order
            </button>
          </div>
          <h3>Processing orders ({state.orders.length})</h3>
          <small>
            Ready times use this device’s clock. Collection is confirmed by the server. A partly collected
            order keeps its remaining output.
          </small>
          {!state.orders.length && <p>No processing orders.</p>}
          {state.orders.map((order) => {
            const ready = now >= order.readyAt;
            const collectable = Math.min(ship?.free ?? 0, order.refinedUnits);
            return (
              <article className="serviceCard" key={order.id}>
                <b>{materialName(order.ore)} · processed</b>
                <p>
                  {quantity(order.refinedUnits)} remaining ·{' '}
                  {ready ? 'Ready to collect' : `Ready in ${Math.ceil((order.readyAt - now) / 1000)} seconds`}
                </p>
                <p>
                  {!ship
                    ? 'Select a cargo ship at this location.'
                    : !collectable
                      ? 'Cargo hold is full.'
                      : `${quantity(collectable)} fits aboard ${ship.name}.`}
                </p>
                <button
                  disabled={busy || !ready || !collectable}
                  onClick={() =>
                    ship &&
                    ready &&
                    collectable > 0 &&
                    void mutate({ type: 'collectOrder', orderId: order.id, ship: ship.id })
                  }
                >
                  {guest ? 'Collect demo processing order' : 'Collect processing order'}
                </button>
              </article>
            );
          })}
        </>
      )}
      {kinds.includes('market') && (
        <>
          <label>
            Cargo to sell
            <select value={sale ? saleKey : ''} onChange={(e) => setSaleKey(e.target.value)}>
              <option value="">Select cargo</option>
              {inventory.cargo.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {materialName(entry.material)} · {entry.category === 'refined' ? 'processed' : 'raw'} ·{' '}
                  {entry.shipName} · {quantity(entry.units)}
                </option>
              ))}
            </select>
          </label>
          <div className="serviceCard">
            <button disabled={busy || !sale} onClick={() => sale && setAmount(formatCscuMinor(sale.units))}>
              Use available cargo quantity
            </button>
            <p>
              {saleError ||
                `Estimate: ${salePreview(state, units!, sale!.price)} shift marks for ${quantity(units!)}. Fractional value is retained in your wallet.`}
            </p>
            <button
              disabled={busy || !!saleError}
              onClick={() =>
                sale &&
                units &&
                !saleError &&
                void mutate({
                  type: 'sell',
                  ship: sale.ship,
                  material: sale.material,
                  category: sale.category,
                  units,
                })
              }
            >
              {guest ? 'Sell selected demo cargo' : 'Sell selected cargo at server quote'}
            </button>
          </div>
        </>
      )}
      {busy && (
        <p role="status">
          Waiting for confirmation or pending-action recovery. New service actions are paused.
        </p>
      )}
    </section>
  );
}
