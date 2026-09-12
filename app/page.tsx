import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import {
  CAPACITIES,
  EQUIPMENT,
  METHOD_NAMES,
  MINING_TYPES,
  ORES,
  ORE_NAMES,
  SHIP_NAMES,
  SHIP_PRICES,
} from '../shared/catalog';
import { refineryQuote, scu, total } from '../shared/game';
import { Method, MiningType, Ore, Ship } from '../shared/schema';
import { twitchConnection, TwitchSession } from './twitch';
import { clientConfig } from './config';
import { ApiClient } from './api';
import { useGame } from './useGame';
type View = 'mining' | 'cargo' | 'refinery' | 'market' | 'profile';
import { format, asset, remaining } from './ui';
import { TravelPanel } from './TravelPanel';
import { MiningPanel } from './MiningPanel';
export default function Home() {
  const config = useMemo(() => {
    try {
      return {
        ...clientConfig({
          dev: import.meta.env.DEV,
          mode: import.meta.env.VITE_DIME_MODE,
          api: import.meta.env.VITE_DIME_API_URL,
          hostname: location.hostname,
        }),
        error: '',
      };
    } catch (error) {
      return {
        local: false,
        api: '',
        error: error instanceof Error ? error.message : 'Invalid configuration.',
      };
    }
  }, []);
  const [session, setSession] = useState<TwitchSession>({ status: 'connecting' });
  const [connection, setConnection] = useState<ReturnType<typeof twitchConnection> | null>(null);
  useEffect(() => {
    if (config.local || config.error) return;
    const active = twitchConnection(setSession);
    setConnection(active);
    return () => active.stop();
  }, [config.local, config.error]);
  const client = useMemo(
    () =>
      config.error || (!config.local && !connection)
        ? null
        : new ApiClient(
            config.api,
            () => connection?.token(),
            (token) => connection?.expired(token),
            config.local,
          ),
    [config, connection],
  );
  const identity = config.local ? 'local' : connection?.identity();
  const { state, notice, storageError, busy, pending, now, refresh, mutate } = useGame(client, identity);
  const [view, setView] = useState<View>('mining');
  const [source, setSource] = useState<MiningType>('Hand');
  const [ship, setShip] = useState<Ship>('Nomad');
  const [ore, setOre] = useState<Ore>('Dolivine');
  const [quantity, setQuantity] = useState('0.01');
  const [method, setMethod] = useState<Method>('Dinyx Solventation');
  const [item, setItem] = useState('Roc');
  const [category, setCategory] = useState<'raw' | 'refined'>('raw');
  const count = /^\d+(\.\d{1,2})?$/.test(quantity) ? Math.round(Number(quantity) * 100) : 0;
  const blocked =
    storageError || busy || !!pending || !state || (!config.local && session.status !== 'authorized');
  const operating = !!state?.pending;
  const canAct = !blocked && !operating;
  const ownedShips = SHIP_NAMES.filter((name) => (state?.ships[name] ?? 0) > 0);
  const cargoShips = ownedShips.filter((name) => !MINING_TYPES.some((t) => t === name));
  const hold = state?.cargo[ship];
  const preview = state && count > 0 ? refineryQuote(state, method, count) : null;
  const status = config.error || session.message || notice;
  const input = (
    <label>
      Amount (SCU)
      <input
        aria-label="Amount (SCU)"
        type="number"
        min=".01"
        step=".01"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
    </label>
  );
  const oreSelect = (
    <label>
      Ore
      <select value={ore} onChange={(event) => setOre(event.target.value as Ore)}>
        {ORE_NAMES.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </label>
  );
  const sourceSelect = (
    <label>
      Mining hold
      <select value={source} onChange={(event) => setSource(event.target.value as MiningType)}>
        {MINING_TYPES.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </label>
  );
  const shipSelect = (
    <label>
      Cargo ship
      <select value={ship} onChange={(event) => setShip(event.target.value as Ship)}>
        {cargoShips.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </label>
  );
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src={asset('DIME icon.png')} alt="D.I.M.E." width="52" height="52" />
          <div>
            <strong>D.I.M.E.</strong>
            <span>Destroya Industries Mining Extension</span>
          </div>
        </div>
        <div className={styles.account}>
          <span>
            {config.local
              ? 'Local development'
              : session.status === 'authorized'
                ? 'Twitch connected'
                : 'Waiting for Twitch'}
          </span>
          <strong>{format(state?.wallet ?? 0)} aUEC</strong>
        </div>
      </header>
      <nav className={styles.nav} aria-label="Mining operations">
        {(['mining', 'cargo', 'refinery', 'market', 'profile'] as View[]).map((tab) => (
          <button
            key={tab}
            aria-current={view === tab ? 'page' : undefined}
            className={view === tab ? styles.active : ''}
            onClick={() => setView(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
      <div className={styles.status} role="status">
        {busy ? 'Synchronizing…' : status}
      </div>
      {config.local && (
        <p className={styles.hint}>Local profile only. Nothing here changes your production account.</p>
      )}
      {!state && !config.error && (
        <section className={styles.content}>
          <h1>Connecting to your profile</h1>
          <p>
            Open this extension in Twitch and sign in for your permanent save across channels. Authorization
            may take a moment.
          </p>
          <button onClick={() => void refresh()} disabled={busy || !identity}>
            Retry connection
          </button>
        </section>
      )}
      {state && (
        <>
          <TravelPanel
            state={state}
            blocked={blocked}
            canAct={canAct}
            now={now}
            mutate={mutate}
            key={identity}
          />
          {pending && (
            <section className={styles.status}>
              <p>An action is pending confirmation. Keep this tab open or reopen it to retry safely.</p>
              <button
                disabled={busy || (!config.local && session.status !== 'authorized')}
                onClick={() => void mutate()}
              >
                Retry pending action
              </button>
            </section>
          )}
          {view === 'mining' && (
            <MiningPanel
              state={state}
              source={source}
              setSource={setSource}
              canAct={canAct}
              mutate={mutate}
            />
          )}
          {view === 'cargo' && (
            <section className={styles.content}>
              <h1>Cargo inventory</h1>
              <div className={styles.refineForm}>
                {sourceSelect}
                {shipSelect}
                {oreSelect}
                {input}
                <button
                  disabled={!canAct || count <= 0 || count > (state.mining[source][ore] ?? 0)}
                  onClick={() => void mutate({ type: 'transfer', source, ship, ore, units: count })}
                >
                  Transfer raw cargo
                </button>
              </div>
              <p>
                Mining hold: {scu(total(state.mining[source]))} / {scu(CAPACITIES[source])} SCU. Cargo ship:{' '}
                {scu(total(hold?.raw ?? {}) + total(hold?.refined ?? {}))} / {scu(CAPACITIES[ship])} SCU.
              </p>
              <div className={styles.tableWrap}>
                <table>
                  <caption>Material quantities in SCU</caption>
                  <thead>
                    <tr>
                      <th>Ore</th>
                      <th>{source} raw</th>
                      <th>{ship} raw</th>
                      <th>{ship} refined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ORE_NAMES.filter(
                      (name) =>
                        (state.mining[source][name] ?? 0) +
                          (hold?.raw[name] ?? 0) +
                          (hold?.refined[name] ?? 0) >
                        0,
                    ).map((name) => (
                      <tr key={name}>
                        <th>{name}</th>
                        <td>{scu(state.mining[source][name] ?? 0)}</td>
                        <td>{scu(hold?.raw[name] ?? 0)}</td>
                        <td>{scu(hold?.refined[name] ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!total(state.mining[source]) && !total(hold?.raw ?? {}) && !total(hold?.refined ?? {}) && (
                <p className={styles.empty}>No cargo in these holds. Start a mining operation.</p>
              )}
            </section>
          )}
          {view === 'refinery' && (
            <section className={styles.content}>
              <h1>Refinery & work orders</h1>
              <p className={styles.hint}>
                At ARC-L1, refine raw ore in a Prospector or Mole hold. Collect finished orders into a cargo
                ship, then sell at Area-18.
              </p>
              <div className={styles.refineForm}>
                {sourceSelect}
                {oreSelect}
                {input}
                <label>
                  Method
                  <select value={method} onChange={(event) => setMethod(event.target.value as Method)}>
                    {METHOD_NAMES.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={
                    !canAct ||
                    count <= 0 ||
                    state.location !== 'ARC-L1' ||
                    !['Prospector', 'Mole'].includes(source) ||
                    ORES[ore].gem ||
                    count > (state.mining[source][ore] ?? 0) ||
                    !preview ||
                    preview.cost > state.wallet
                  }
                  onClick={() => void mutate({ type: 'refine', source, ore, units: count, method })}
                >
                  Create work order
                </button>
              </div>
              {preview && (
                <p className={styles.hint}>
                  Quote: {format(preview.cost)} aUEC · {scu(preview.refinedUnits)} SCU refined ·{' '}
                  {preview.duration / 1000} seconds
                </p>
              )}
              {shipSelect}
              {state.orders.length === 0 ? (
                <p className={styles.empty}>No active work orders.</p>
              ) : (
                <div className={styles.orderList}>
                  {state.orders.map((order) => (
                    <article className={styles.order} key={order.id}>
                      <div>
                        <strong>{order.ore}</strong>
                        <span>{order.method}</span>
                        <span>
                          {scu(order.rawUnits)} SCU raw → {scu(order.refinedUnits)} SCU remaining
                        </span>
                      </div>
                      <div>
                        <small>
                          {now >= order.readyAt
                            ? 'READY TO COLLECT'
                            : remaining(order.readyAt, now) + ' SECONDS REMAINING'}
                        </small>
                        <span>Paid {format(order.cost)} aUEC</span>
                      </div>
                      <button
                        disabled={!canAct || now < order.readyAt || state.location !== 'ARC-L1'}
                        onClick={() => void mutate({ type: 'collect', orderId: order.id, ship })}
                      >
                        Collect into {ship}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {view === 'market' && (
            <section className={styles.content}>
              <h1>Market & supply shop</h1>
              <p className={styles.hint}>
                Sell raw minerals at ARC-L1. Sell gems and refined material at Area-18. The supply shop is at
                Area-18; purchased ships await you at ARC-L1.
              </p>
              <div className={styles.refineForm}>
                {shipSelect}
                {oreSelect}
                <label>
                  Material
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as 'raw' | 'refined')}
                  >
                    <option value="raw">Raw</option>
                    <option value="refined">Refined</option>
                  </select>
                </label>
                {input}
                <button
                  disabled={!canAct || count <= 0 || count > (hold?.[category][ore] ?? 0)}
                  onClick={() => void mutate({ type: 'sell', ship, ore, category, units: count })}
                >
                  Sell material
                </button>
              </div>
              <p>
                Indicative value: {format(Math.round((count * ORES[ore][category]) / 100))} aUEC. Your wallet
                updates when the sale completes.
              </p>
              <h2>Supply shop</h2>
              <div className={styles.refineForm}>
                <label>
                  Item
                  <select value={item} onChange={(event) => setItem(event.target.value)}>
                    {Object.entries({ ...SHIP_PRICES, ...EQUIPMENT }).map(([name, price]) => (
                      <option key={name} value={name}>
                        {name} — {format(price)} aUEC
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!canAct || state.location !== 'Area-18'}
                  onClick={() => void mutate({ type: 'purchase', item, quantity: 1 })}
                >
                  Buy one
                </button>
                <button
                  disabled={!canAct || state.location !== 'Area-18'}
                  onClick={() => void mutate({ type: 'sellItem', item, quantity: 1 })}
                >
                  Sell one owned item
                </button>
              </div>
            </section>
          )}
          {view === 'profile' && (
            <section className={styles.content}>
              <h1>Profile & fleet</h1>
              <p>
                {config.local ? 'Local test profile' : 'Twitch identity verified by the backend'} · revision{' '}
                {state.revision}
              </p>
              <h2>{format(state.wallet)} aUEC</h2>
              <ul>
                {ownedShips.map((name) => (
                  <li key={name}>
                    {name} × {state.ships[name]} — {state.positions[name]}
                  </li>
                ))}
              </ul>
              <h2>Equipment & crew</h2>
              <ul>
                {Object.entries(state.equipment).map(([name, count]) => (
                  <li key={name}>
                    {name} × {count}
                  </li>
                ))}
              </ul>
              <button disabled={busy} onClick={() => void refresh()}>
                Refresh authoritative state
              </button>
            </section>
          )}
        </>
      )}
      <footer>
        <span>Mining · Cargo · Refining · Trade</span>
        <span>{config.local ? 'Local only' : 'Twitch extension'}</span>
      </footer>
    </main>
  );
}
