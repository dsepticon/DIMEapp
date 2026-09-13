import { useState } from 'react';
import { Action, MiningType, Ore, PlayerState, Ship } from '../../../shared/schema';
import { CAPACITIES, MINING_TYPES, ORE_NAMES, SHIP_NAMES } from '../../../shared/catalog';
import { scu, total } from '../../../shared/game';
import { format } from '../../ui';
import { MiningPanel } from '../../MiningPanel';
import { CapacityBar, ChoiceRail, OreIcon, PixelPortrait, Stepper } from './UiBits';
import { MarketScreen, RefineryScreen, TravelScreen } from './Operations';
import styles from './GameUI.module.css';

export type GameView =
  | 'game'
  | 'menu'
  | 'cargo'
  | 'refinery'
  | 'market'
  | 'profile'
  | 'travel'
  | 'mining'
  | 'controls'
  | 'connection';
export type ScreensProps = {
  view: GameView;
  state: PlayerState;
  canAct: boolean;
  blocked: boolean;
  busy: boolean;
  now: number;
  notice: string;
  local: boolean;
  authenticated: boolean;
  mutate: (action?: Action) => Promise<void>;
  refresh: () => Promise<void>;
  navigate: (view: GameView) => void;
};

function CargoScreen({
  state,
  canAct,
  mutate,
  notice,
}: Pick<ScreensProps, 'state' | 'canAct' | 'mutate' | 'notice'>) {
  const [tab, setTab] = useState<'Mining' | 'Ship'>('Mining');
  const [source, setSource] = useState<MiningType>('Hand');
  const [ship, setShip] = useState<Ship>('Nomad');
  const [ore, setOre] = useState<Ore>('Dolivine');
  const [units, setUnits] = useState(1);
  const sources = MINING_TYPES.filter((name) => name === 'Hand' || (state.ships[name] ?? 0) > 0);
  const cargoShips = SHIP_NAMES.filter(
    (name) => (state.ships[name] ?? 0) > 0 && !MINING_TYPES.includes(name as MiningType),
  );
  const selectedShip = cargoShips.includes(ship) ? ship : (cargoShips[0] ?? 'Nomad');
  const hold = state.cargo[selectedShip];
  const available = state.mining[source][ore] ?? 0;
  const listed = ORE_NAMES.filter(
    (name) => (state.mining[source][name] ?? 0) + (hold?.raw[name] ?? 0) + (hold?.refined[name] ?? 0) > 0,
  );
  const entries = listed.length ? listed : ORE_NAMES.slice(0, 3);
  const disabled = !canAct
    ? 'Finish the current operation or reconnect.'
    : !available
      ? 'No selected raw ore in this mining hold.'
      : units > available
        ? 'Choose an amount within the available stock.'
        : '';
  return (
    <section className={styles.screen} aria-label="Cargo backpack">
      <h1>Backpack · Cargo</h1>
      <ChoiceRail label="Cargo view" choices={['Mining', 'Ship'] as const} value={tab} onChange={setTab} />
      <ChoiceRail label="Mining hold" choices={sources} value={source} onChange={setSource} />
      <ChoiceRail
        label="Cargo ship"
        choices={cargoShips.length ? cargoShips : (['Nomad'] as Ship[])}
        value={selectedShip}
        onChange={setShip}
      />
      <CapacityBar
        label={source + ' raw capacity'}
        used={total(state.mining[source])}
        capacity={CAPACITIES[source]}
      />
      <CapacityBar
        label={selectedShip + ' cargo capacity'}
        used={total(hold?.raw ?? {}) + total(hold?.refined ?? {})}
        capacity={CAPACITIES[selectedShip]}
      />
      <h2>{tab === 'Mining' ? 'Mineral inventory' : 'Ship inventory'}</h2>
      <div className={styles.cardGrid} role="group" aria-label="Ore inventory">
        {entries.map((name) => (
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
              <small>
                {tab === 'Mining'
                  ? scu(state.mining[source][name] ?? 0)
                  : scu((hold?.raw[name] ?? 0) + (hold?.refined[name] ?? 0))}{' '}
                SCU
              </small>
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
              {scu(available)} SCU raw · {source}
            </span>
            <span>
              Ship raw {scu(hold?.raw[ore] ?? 0)} · refined {scu(hold?.refined[ore] ?? 0)}
            </span>
          </div>
        </div>
        <Stepper label="Transfer amount" value={units} max={available} onChange={setUnits} />
        {disabled && <p className={styles.warning}>{disabled}</p>}
        <button
          className={styles.accentButton}
          disabled={!!disabled}
          onClick={() => void mutate({ type: 'transfer', source, ship: selectedShip, ore, units })}
        >
          Transfer raw cargo
        </button>
        <p className={styles.subtle} role="status">
          {notice}
        </p>
      </div>
    </section>
  );
}

function ProfileScreen({
  state,
  busy,
  refresh,
  local,
}: Pick<ScreensProps, 'state' | 'busy' | 'refresh' | 'local'>) {
  const ships = SHIP_NAMES.filter((name) => (state.ships[name] ?? 0) > 0);
  const equipped = Object.entries(state.equipment).filter(([, count]) => count > 0);
  return (
    <section className={styles.screen} aria-label="Character status">
      <h1>Character · Status</h1>
      <div className={styles.panel}>
        <div className={styles.portraitLine}>
          <PixelPortrait />
          <div>
            <strong>Mining operator</strong>
            <p>{state.location}</p>
            <p>{format(state.wallet)} aUEC</p>
          </div>
        </div>
      </div>
      <h2>Suit & equipment</h2>
      <div className={styles.slots}>
        <div>
          TOOL
          <br />
          <strong>{equipped[0]?.[0] ?? 'Hand mining tool'}</strong>
        </div>
        <div>
          SUIT
          <br />
          <strong>Mining suit</strong>
        </div>
        <div>
          PACK
          <br />
          <strong>Life support</strong>
        </div>
        <div>
          GEAR
          <br />
          <strong>{equipped.length} owned</strong>
        </div>
      </div>
      <h2>Fleet</h2>
      <div className={styles.panel}>
        {ships.map((name) => (
          <p key={name}>
            {name} × {state.ships[name]} · {state.positions[name]}
          </p>
        ))}
      </div>
      <h2>Progress</h2>
      <div className={styles.panel}>
        <p>Save revision {state.revision}</p>
        <p>
          Raw material held {scu(Object.values(state.mining).reduce((sum, hold) => sum + total(hold), 0))} SCU
        </p>
        <p>{local ? 'Local session only' : 'Permanent save · Twitch identity verified by the server'}</p>
      </div>
      <button disabled={busy} onClick={() => void refresh()}>
        Refresh authoritative state
      </button>
    </section>
  );
}

function MenuScreen({ navigate }: Pick<ScreensProps, 'navigate'>) {
  const choices: { label: string; view: GameView }[] = [
    { label: 'Resume', view: 'game' },
    { label: 'Cargo', view: 'cargo' },
    { label: 'Profile', view: 'profile' },
    { label: 'Refinery', view: 'refinery' },
    { label: 'Market', view: 'market' },
    { label: 'Travel', view: 'travel' },
    { label: 'Controls', view: 'controls' },
    { label: 'Connection status', view: 'connection' },
    { label: 'Mining operations', view: 'mining' },
  ];
  return (
    <section className={styles.screen}>
      <h1>Operations pause</h1>
      <nav className={styles.menuButtons} aria-label="Game menu">
        {choices.map(({ label, view }) => (
          <button key={view} onClick={() => navigate(view)}>
            {label}
          </button>
        ))}
        <a
          href="https://destroyaindustriesminingextension.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
      </nav>
    </section>
  );
}

export function RpgScreens(props: ScreensProps) {
  const { view, state, canAct, blocked, busy, now, notice, local, authenticated, mutate, refresh, navigate } =
    props;
  const [miningSource, setMiningSource] = useState<MiningType>('Hand');
  if (view === 'menu') return <MenuScreen navigate={navigate} />;
  if (view === 'cargo') return <CargoScreen state={state} canAct={canAct} mutate={mutate} notice={notice} />;
  if (view === 'profile') return <ProfileScreen state={state} busy={busy} refresh={refresh} local={local} />;
  if (view === 'market')
    return <MarketScreen state={state} canAct={canAct} mutate={mutate} notice={notice} />;
  if (view === 'refinery')
    return <RefineryScreen state={state} canAct={canAct} mutate={mutate} notice={notice} now={now} />;
  if (view === 'travel')
    return <TravelScreen state={state} canAct={canAct} blocked={blocked} mutate={mutate} now={now} />;
  if (view === 'controls')
    return (
      <section className={styles.screen}>
        <h1>Controls</h1>
        <div className={styles.panel}>
          <p>WASD or arrow keys · walk</p>
          <p>E or Space · interact</p>
          <p>I · backpack</p>
          <p>Escape · close a window</p>
          <p>Touch D-pad · move; Interact · use nearby object</p>
        </div>
      </section>
    );
  if (view === 'connection')
    return (
      <section className={styles.screen}>
        <h1>Connection status</h1>
        <div className={styles.panel}>
          <p>
            {authenticated
              ? 'Twitch connection ready'
              : local
                ? 'Local session active'
                : 'Twitch connection needs attention'}
          </p>
          <p>
            {local
              ? 'Local save for development.'
              : 'One permanent save follows your verified Twitch identity across channels.'}
          </p>
          <p>Last result: {notice || 'No recent operation.'}</p>
          <button disabled={busy} onClick={() => void refresh()}>
            Refresh connection
          </button>
        </div>
      </section>
    );
  if (view === 'mining')
    return (
      <section className={styles.screen}>
        <h1>Mining operations</h1>
        <p className={styles.subtle}>
          Select an available mining method. The server completes every extraction.
        </p>
        <MiningPanel
          state={state}
          source={miningSource}
          setSource={setMiningSource}
          canAct={canAct}
          mutate={mutate}
        />
      </section>
    );
  return null;
}
