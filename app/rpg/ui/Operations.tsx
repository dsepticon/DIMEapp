import { useState } from 'react';
import { Action, Location, Method, Ore, PlayerState, Ship, MiningType } from '../../../shared/schema';
import {
  CAPACITIES,
  EQUIPMENT,
  LOCATIONS,
  METHOD_NAMES,
  MINING_TYPES,
  ORES,
  ORE_NAMES,
  SHIP_NAMES,
  SHIP_PRICES,
} from '../../../shared/catalog';
import { refineryQuote, scu, total } from '../../../shared/game';
import { format, remaining } from '../../ui';
import { CapacityBar, ChoiceRail, OreIcon, Stepper } from './UiBits';
import styles from './GameUI.module.css';

type Props = {
  state: PlayerState;
  canAct: boolean;
  blocked?: boolean;
  mutate: (action?: Action) => Promise<void>;
  notice?: string;
  now?: number;
};
const cargoShips = (state: PlayerState) =>
  SHIP_NAMES.filter((name) => (state.ships[name] ?? 0) > 0 && !MINING_TYPES.includes(name as MiningType));

export function MarketScreen({ state, canAct, mutate, notice }: Props) {
  const [tab, setTab] = useState<'Buy' | 'Sell'>('Buy');
  const [item, setItem] = useState('Roc');
  const [itemCount, setItemCount] = useState(1);
  const [ship, setShip] = useState<Ship>('Nomad');
  const [ore, setOre] = useState<Ore>('Dolivine');
  const [category, setCategory] = useState<'raw' | 'refined'>('raw');
  const [units, setUnits] = useState(1);
  const ships = cargoShips(state);
  const selectedShip = ships.includes(ship) ? ship : (ships[0] ?? 'Nomad');
  const stock = state.cargo[selectedShip]?.[category][ore] ?? 0;
  const shop = { ...SHIP_PRICES, ...EQUIPMENT };
  const price = shop[item as keyof typeof shop] ?? 0;
  const owned = state.ships[item as Ship] ?? state.equipment[item] ?? 0;
  const availableOre = ORE_NAMES.filter((name) => (state.cargo[selectedShip]?.[category][name] ?? 0) > 0);
  const buyReason =
    state.location !== 'Area-18'
      ? 'Supply purchases require Area-18.'
      : !canAct
        ? 'Finish the active operation or reconnect.'
        : price * itemCount > state.wallet
          ? 'Insufficient aUEC.'
          : '';
  const sellReason = !canAct
    ? 'Finish the active operation or reconnect.'
    : !stock
      ? 'No selected material in this cargo ship.'
      : state.location !== 'ARC-L1' && state.location !== 'Area-18'
        ? 'Travel to a trading station.'
        : units > stock
          ? 'Select an available quantity.'
          : '';
  return (
    <section className={styles.screen} aria-label="Market shop">
      <div className={styles.portraitLine}>
        <span className={styles.vendor} aria-hidden="true">
          ◇
        </span>
        <div>
          <h1>Supply counter</h1>
          <p className={styles.subtle}>Dockside exchange · {format(state.wallet)} aUEC</p>
        </div>
      </div>
      <ChoiceRail label="Trade mode" choices={['Buy', 'Sell'] as const} value={tab} onChange={setTab} />
      {tab === 'Buy' ? (
        <>
          <h2>Available supplies</h2>
          <div className={`${styles.cardGrid} ${styles.catalogGrid}`} role="group" aria-label="Shop items">
            {Object.entries(shop).map(([name, cost]) => (
              <button
                key={name}
                className={styles.card + (item === name ? ' ' + styles.selected : '')}
                aria-label={`Select ${name} item`}
                aria-pressed={item === name}
                onClick={() => setItem(name)}
              >
                <span className={styles.itemIcon} aria-hidden="true">
                  ◈
                </span>
                <span>
                  {name}
                  <br />
                  <small>{format(cost)} aUEC</small>
                </span>
              </button>
            ))}
          </div>
          <div className={styles.panel}>
            <strong>{item}</strong>
            <p>
              Price {format(price)} aUEC · owned {owned}
            </p>
            <div className={styles.itemStepper} role="group" aria-label="Item quantity">
              <button
                aria-label="Decrease item quantity"
                onClick={() => setItemCount(Math.max(1, itemCount - 1))}
              >
                −
              </button>
              <span>{itemCount}</span>
              <button
                aria-label="Increase item quantity"
                onClick={() => setItemCount(Math.min(10, itemCount + 1))}
              >
                +
              </button>
            </div>
            <p>Total {format(price * itemCount)} aUEC</p>
            {buyReason && <p className={styles.warning}>{buyReason}</p>}
            <button
              className={styles.accentButton}
              disabled={!!buyReason}
              onClick={() => void mutate({ type: 'purchase', item, quantity: itemCount })}
            >
              Buy {itemCount}
            </button>
            <button
              disabled={!canAct || state.location !== 'Area-18' || owned < itemCount}
              onClick={() => void mutate({ type: 'sellItem', item, quantity: itemCount })}
            >
              Sell owned item
            </button>
          </div>
        </>
      ) : (
        <>
          <ChoiceRail
            label="Cargo ship"
            choices={ships.length ? ships : (['Nomad'] as Ship[])}
            value={selectedShip}
            onChange={setShip}
          />
          <ChoiceRail
            label="Material state"
            choices={['raw', 'refined'] as const}
            value={category}
            onChange={setCategory}
          />
          <h2>Ship materials</h2>
          <div className={styles.cardGrid} role="group" aria-label="Sellable materials">
            {(availableOre.length ? availableOre : ORE_NAMES.slice(0, 3)).map((name) => (
              <button
                key={name}
                className={styles.card + (ore === name ? ' ' + styles.selected : '')}
                aria-label={`Select ${name} material`}
                aria-pressed={ore === name}
                onClick={() => setOre(name)}
              >
                <OreIcon ore={name} />
                <span>
                  {name}
                  <br />
                  <small>{scu(state.cargo[selectedShip]?.[category][name] ?? 0)} SCU</small>
                </span>
              </button>
            ))}
          </div>
          <div className={styles.panel}>
            <div className={styles.detail}>
              <OreIcon ore={ore} />
              <div>
                <strong>{ore}</strong>
                <span>
                  {scu(stock)} SCU {category}
                </span>
              </div>
            </div>
            <Stepper label="Sell amount" value={units} max={stock} onChange={setUnits} />
            <p>Indicative value {format(Math.round((units * ORES[ore][category]) / 100))} aUEC</p>
            {sellReason && <p className={styles.warning}>{sellReason}</p>}
            <button
              className={styles.accentButton}
              disabled={!!sellReason}
              onClick={() => void mutate({ type: 'sell', ship: selectedShip, ore, category, units })}
            >
              Sell material
            </button>
          </div>
        </>
      )}
      {notice && <p className={styles.subtle}>Last server result: {notice}</p>}
    </section>
  );
}

export function RefineryScreen({ state, canAct, mutate, notice, now = Date.now() }: Props) {
  const [source, setSource] = useState<MiningType>('Prospector');
  const [ore, setOre] = useState<Ore>('Agricium');
  const [method, setMethod] = useState<Method>('Dinyx Solventation');
  const [units, setUnits] = useState(1);
  const [ship, setShip] = useState<Ship>('Nomad');
  const sources = (['Prospector', 'Mole'] as MiningType[]).filter(
    (name) => (state.ships[name as Ship] ?? 0) > 0,
  );
  const selectedSource = sources.includes(source) ? source : (sources[0] ?? 'Prospector');
  const stock = state.mining[selectedSource][ore] ?? 0;
  const quote = refineryQuote(state, method, units);
  const ships = cargoShips(state);
  const selectedShip = ships.includes(ship) ? ship : (ships[0] ?? 'Nomad');
  const recipes = ORE_NAMES.filter(
    (name) => !ORES[name].gem && (state.mining[selectedSource][name] ?? 0) > 0,
  );
  const reason =
    state.location !== 'ARC-L1'
      ? 'Refining requires ARC-L1.'
      : !canAct
        ? 'Finish the current operation or reconnect.'
        : !sources.length
          ? 'Bring an owned Prospector or Mole.'
          : ORES[ore].gem
            ? 'Gem minerals do not use a refinery recipe.'
            : !stock
              ? 'No selected raw ore is available.'
              : units > stock
                ? 'Select an available quantity.'
                : quote.cost > state.wallet
                  ? 'Insufficient aUEC for this work order.'
                  : '';
  return (
    <section className={styles.screen} aria-label="Refinery workshop">
      <div className={styles.portraitLine}>
        <span className={styles.refineryIcon} aria-hidden="true">
          ▤
        </span>
        <div>
          <h1>Refinery</h1>
          <p className={styles.subtle}>ARC-L1 processing bay</p>
        </div>
      </div>
      <ChoiceRail
        label="Mining hold"
        choices={sources.length ? sources : (['Prospector'] as MiningType[])}
        value={selectedSource}
        onChange={setSource}
      />
      <CapacityBar
        label={selectedSource + ' raw capacity'}
        used={total(state.mining[selectedSource])}
        capacity={CAPACITIES[selectedSource]}
      />
      <h2>Ore recipes</h2>
      <div className={styles.cardGrid} role="group" aria-label="Ore recipes">
        {(recipes.length ? recipes : ORE_NAMES.filter((name) => !ORES[name].gem).slice(0, 4)).map((name) => (
          <button
            key={name}
            className={styles.card + (ore === name ? ' ' + styles.selected : '')}
            aria-label={`Select ${name} recipe`}
            aria-pressed={ore === name}
            onClick={() => setOre(name)}
          >
            <OreIcon ore={name} />
            <span>
              {name}
              <br />
              <small>{scu(state.mining[selectedSource][name] ?? 0)} raw SCU</small>
            </span>
          </button>
        ))}
      </div>
      <div className={styles.panel}>
        <strong>
          {ore} · raw {scu(stock)} SCU
        </strong>
        <ChoiceRail label="Processing method" choices={METHOD_NAMES} value={method} onChange={setMethod} />
        <Stepper label="Refine amount" value={units} max={stock} onChange={setUnits} />
        <p>
          Expected output {scu(quote.refinedUnits)} SCU · cost {format(quote.cost)} aUEC ·{' '}
          {Math.round(quote.duration / 1000)} sec
        </p>
        {reason && <p className={styles.warning}>{reason}</p>}
        <button
          className={styles.accentButton}
          disabled={!!reason}
          onClick={() => void mutate({ type: 'refine', source: selectedSource, ore, units, method })}
        >
          Start Refining
        </button>
      </div>
      <h2>Work-order queue</h2>
      <ChoiceRail
        label="Collect into ship"
        choices={ships.length ? ships : (['Nomad'] as Ship[])}
        value={selectedShip}
        onChange={setShip}
      />
      <div className={styles.queue}>
        {state.orders.length ? (
          state.orders.map((order) => (
            <article key={order.id}>
              <strong>
                {order.ore} · {order.method}
              </strong>
              <span>
                {scu(order.refinedUnits)} SCU expected · paid {format(order.cost)} aUEC
              </span>
              <span>
                {now >= order.readyAt ? 'Ready' : remaining(order.readyAt, now) + ' seconds remain'}
              </span>
              <button
                disabled={!canAct || now < order.readyAt || state.location !== 'ARC-L1'}
                onClick={() => void mutate({ type: 'collect', orderId: order.id, ship: selectedShip })}
              >
                Collect into {selectedShip}
              </button>
            </article>
          ))
        ) : (
          <p className={styles.subtle}>No active work orders.</p>
        )}
      </div>
      {notice && <p className={styles.subtle}>Last server result: {notice}</p>}
    </section>
  );
}

export function TravelScreen({ state, canAct, blocked = false, mutate, now = Date.now() }: Props) {
  const [ship, setShip] = useState<Ship>(state.currentShip);
  const [destination, setDestination] = useState<Location>('Lyria');
  const [loadRoc, setLoadRoc] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ships = SHIP_NAMES.filter((name) => (state.ships[name] ?? 0) > 0 && name !== 'Roc');
  const selectedShip = ships.includes(ship) ? ship : (ships[0] ?? 'Nomad');
  const allowed = LOCATIONS.filter(
    (name) =>
      name !== state.location &&
      (selectedShip === 'Prospector' || selectedShip === 'Mole'
        ? ['ARC-L1', 'Halo'].includes(name)
        : name !== 'Halo'),
  );
  const selectedDestination = allowed.includes(destination) ? destination : allowed[0];
  return (
    <section className={styles.screen} aria-label="Travel navigation">
      <h1>Navigation console</h1>
      <p className={styles.subtle}>
        Current location: {state.location} · {state.currentShip}
      </p>
      {state.pending ? (
        <div className={styles.panel}>
          <strong>
            {state.pending.kind === 'mine' ? 'Mining operation' : 'Travel to ' + state.pending.destination}
          </strong>
          <p>{remaining(state.pending.readyAt, now)} seconds remain</p>
          <button
            className={styles.accentButton}
            disabled={blocked || now < state.pending.readyAt}
            onClick={() => void mutate({ type: 'finish' })}
          >
            {state.pending.kind === 'mine' ? 'Collect mined ore' : 'Complete arrival'}
          </button>
        </div>
      ) : (
        <>
          <ChoiceRail
            label="Travel ship"
            choices={ships.length ? ships : (['Nomad'] as Ship[])}
            value={selectedShip}
            onChange={(name) => {
              setShip(name);
              setConfirm(false);
            }}
          />
          <div className={styles.nodeMap} role="group" aria-label="Location map">
            {LOCATIONS.map((name) => (
              <button
                key={name}
                aria-current={name === state.location ? 'location' : undefined}
                aria-pressed={selectedDestination === name}
                disabled={!allowed.includes(name)}
                onClick={() => {
                  setDestination(name);
                  setConfirm(false);
                }}
              >
                {name} {name === state.location ? '· HERE' : allowed.includes(name) ? '' : '· unavailable'}
              </button>
            ))}
            <button disabled>Frontier sector · future route</button>
          </div>
          <div className={styles.panel}>
            <strong>{selectedDestination ?? 'No route available'}</strong>
            <p>
              Ship: {selectedShip} ·{' '}
              {state.positions[selectedShip] === state.location ? 'at this location' : 'not at this location'}
            </p>
            {selectedShip === 'Nomad' && (state.ships.Roc ?? 0) > 0 && (
              <button aria-pressed={loadRoc} onClick={() => setLoadRoc(!loadRoc)}>
                {loadRoc ? '✓ ' : ''}Carry owned ROC
              </button>
            )}
            {confirm ? (
              <div className={styles.confirm}>
                <strong>Confirm travel to {selectedDestination}?</strong>
                <p>This starts a server-managed trip.</p>
                <button
                  className={styles.accentButton}
                  disabled={!canAct || !selectedDestination}
                  onClick={() => {
                    setConfirm(false);
                    if (selectedDestination)
                      void mutate({
                        type: 'travel',
                        ship: selectedShip,
                        destination: selectedDestination,
                        loadRoc,
                      });
                  }}
                >
                  Confirm travel
                </button>
                <button onClick={() => setConfirm(false)}>Cancel</button>
              </div>
            ) : (
              <button
                className={styles.accentButton}
                disabled={!canAct || !selectedDestination}
                onClick={() => setConfirm(true)}
              >
                Start travel
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
