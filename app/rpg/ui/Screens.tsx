import { useRef, useState } from 'react';
import { Action, MiningType, Ore, PlayerState, RESET_CONFIRMATION, Ship } from '../../../shared/schema';
import { CAPACITIES, MINING_TYPES, ORE_NAMES, SHIP_NAMES } from '../../../shared/catalog';
import { scu, total } from '../../../shared/game';
import { format } from '../../ui';
import { MINING_TOOLS } from '../../../shared/miningTool';
import { formatCscuMinor, wholeCscuToMinor } from '../../../shared/mineralUnits';
import { MiningPanel } from '../../MiningPanel';
import { CapacityBar, ChoiceRail, OreIcon, PixelPortrait, Stepper } from './UiBits';
import { MarketScreen, RefineryScreen, TravelScreen } from './Operations';
import styles from './GameUI.module.css';
import { QuestLog } from './FirstShiftUI';

export type GameView =
  | 'game'
  | 'menu'
  | 'cargo'
  | 'refinery'
  | 'market'
  | 'profile'
  | 'reset'
  | 'travel'
  | 'mining'
  | 'controls'
  | 'connection'
  | 'quest';
export type ScreensProps = {
  view: GameView;
  state: PlayerState;
  canAct: boolean;
  blocked: boolean;
  busy: boolean;
  now: number;
  notice: string;
  resetError: string;
  local: boolean;
  authenticated: boolean;
  mutate: (action?: Action) => Promise<void>;
  refresh: () => Promise<void>;
  resetProgress: (confirmation: string) => Promise<boolean>;
  navigate: (view: GameView) => void;
  travelAccess: boolean;
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
  const selectedUnits = Math.min(units, available);
  const listed = ORE_NAMES.filter(
    (name) => (state.mining[source][name] ?? 0) + (hold?.raw[name] ?? 0) + (hold?.refined[name] ?? 0) > 0,
  );
  const entries = listed.length ? listed : ORE_NAMES.slice(0, 3);
  const disabled = !canAct
    ? 'Finish the current operation or reconnect.'
    : !available
      ? 'No selected raw ore in this mining hold.'
      : selectedUnits <= 0
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
        capacity={wholeCscuToMinor(CAPACITIES[source])}
      />
      <CapacityBar
        label={selectedShip + ' cargo capacity'}
        used={total(hold?.raw ?? {}) + total(hold?.refined ?? {})}
        capacity={wholeCscuToMinor(CAPACITIES[selectedShip])}
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
                  ? `${formatCscuMinor(state.mining[source][name] ?? 0)} cSCU`
                  : `${scu((hold?.raw[name] ?? 0) + (hold?.refined[name] ?? 0))} SCU`}
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
              {formatCscuMinor(available)} cSCU raw · {source}
            </span>
            <span>
              Ship raw {formatCscuMinor(hold?.raw[ore] ?? 0)} cSCU · refined{' '}
              {formatCscuMinor(hold?.refined[ore] ?? 0)} cSCU
            </span>
          </div>
        </div>
        <Stepper label="Transfer amount" value={selectedUnits} max={available} onChange={setUnits} />
        {disabled && <p className={styles.warning}>{disabled}</p>}
        <button
          className={styles.accentButton}
          disabled={!!disabled}
          onClick={() =>
            void mutate({ type: 'transferMinor', source, ship: selectedShip, ore, unitsMinor: selectedUnits })
          }
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
  navigate,
  authenticated,
}: Pick<ScreensProps, 'state' | 'busy' | 'refresh' | 'local' | 'navigate' | 'authenticated'>) {
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
          <strong>
            {MINING_TOOLS[equipped[0]?.[0] ?? '']?.name ?? equipped[0]?.[0] ?? 'Basic Mining Tool'}
          </strong>
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
        <p>
          {import.meta.env.DEV && local
            ? 'Local session only'
            : 'Permanent save · Twitch identity verified by the server'}
        </p>
      </div>
      <button disabled={busy} onClick={() => void refresh()}>
        Refresh authoritative state
      </button>
      <section className={styles.dangerSection} aria-label="Reset Game Progress">
        <h2>Reset Game Progress</h2>
        <p>This resets your DIME progress across every Twitch channel.</p>
        <p>
          Wallet, ships, equipment, inventory, refinery orders, location and quest progress will be reset.
        </p>
        <p>Your Twitch account itself is not affected.</p>
        <p>The reset cannot be undone through the game.</p>
        <button disabled={busy || (!authenticated && !local)} onClick={() => navigate('reset')}>
          Reset Game Progress
        </button>
      </section>
    </section>
  );
}

function ResetConfirmationScreen({
  busy,
  resetError,
  resetProgress,
  navigate,
}: Pick<ScreensProps, 'busy' | 'resetError' | 'resetProgress' | 'navigate'>) {
  const [phrase, setPhrase] = useState('');
  const submitting = useRef(false);
  return (
    <section className={styles.screen} aria-label="Reset confirmation">
      <h1>Reset Game Progress</h1>
      <div className={styles.dangerSection}>
        <p>
          This resets your global DIME save across every Twitch channel. It cannot be undone through the game.
        </p>
        <label htmlFor="reset-phrase">
          Type exactly: <strong>{RESET_CONFIRMATION}</strong>
        </label>
        <input
          id="reset-phrase"
          autoComplete="off"
          spellCheck={false}
          value={phrase}
          disabled={busy}
          onChange={(event) => setPhrase(event.target.value)}
        />
        {resetError && (
          <p className={styles.warning} role="alert">
            {resetError}
          </p>
        )}
        <button
          type="button"
          className={styles.dangerButton}
          disabled={phrase !== RESET_CONFIRMATION || busy}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
          onClick={async () => {
            if (submitting.current || phrase !== RESET_CONFIRMATION) return;
            submitting.current = true;
            try {
              await resetProgress(phrase);
            } finally {
              submitting.current = false;
            }
          }}
        >
          {busy ? 'Resetting…' : 'Reset All My Game Progress'}
        </button>
        <button type="button" disabled={busy} onClick={() => navigate('profile')}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function MenuScreen({ navigate }: Pick<ScreensProps, 'navigate'>) {
  const choices: { label: string; view: GameView }[] = [
    { label: 'Resume', view: 'game' },
    { label: 'Cargo', view: 'cargo' },
    { label: 'Quest Log', view: 'quest' },
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
  const {
    view,
    state,
    canAct,
    blocked,
    busy,
    now,
    notice,
    resetError,
    local,
    authenticated,
    mutate,
    refresh,
    resetProgress,
    navigate,
    travelAccess,
  } = props;
  const [miningSource, setMiningSource] = useState<MiningType>('Hand');
  if (view === 'menu') return <MenuScreen navigate={navigate} />;
  if (view === 'quest') return <QuestLog state={state} />;
  if (view === 'cargo') return <CargoScreen state={state} canAct={canAct} mutate={mutate} notice={notice} />;
  if (view === 'profile')
    return (
      <ProfileScreen
        state={state}
        busy={busy}
        refresh={refresh}
        local={local}
        authenticated={authenticated}
        navigate={navigate}
      />
    );
  if (view === 'reset')
    return (
      <ResetConfirmationScreen
        busy={busy}
        resetError={resetError}
        resetProgress={resetProgress}
        navigate={navigate}
      />
    );
  if (view === 'market')
    return <MarketScreen state={state} canAct={canAct} mutate={mutate} notice={notice} />;
  if (view === 'refinery')
    return <RefineryScreen state={state} canAct={canAct} mutate={mutate} notice={notice} now={now} />;
  if (view === 'travel')
    return (
      <TravelScreen
        state={state}
        canAct={canAct}
        blocked={blocked}
        mutate={mutate}
        now={now}
        terminalAccess={travelAccess}
      />
    );
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
              : import.meta.env.DEV && local
                ? 'Local session active'
                : 'Twitch connection needs attention'}
          </p>
          <p>
            {import.meta.env.DEV && local
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
