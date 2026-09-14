import { useEffect, useRef, useState } from 'react';
import {
  firstShiftOf,
  FIRST_SHIFT_REWARD,
  LEGACY_TUTORIAL_SALE_AUEC,
  TUTORIAL_RAW_UNITS,
} from '../../../shared/firstShift';
import { rawMineral } from '../../../shared/catalog';
import { saleProceeds, wholeCscuToMinor } from '../../../shared/mineralUnits';
import type { Action, PlayerState } from '../../../shared/schema';
import styles from './GameUI.module.css';

const LABELS: Record<ReturnType<typeof firstShiftOf>['objective'], string> = {
  SPEAK_TO_FOREMAN: 'Meet Mara Voss at the outpost',
  CHECK_EQUIPMENT: 'Confirm your Basic Mining Tool with Neri Vale',
  ENTER_MINE: 'Reach a Lyria surface mining region',
  MINE_ASSIGNED_ORE: 'Mine the assigned Dolivine seam',
  SCAN_ASSIGNED_NODE: 'Scan the Lyria surface for a mineral signature',
  ANALYZE_ASSIGNED_NODE: 'Analyze the assigned Dolivine node',
  FRACTURE_ASSIGNED_NODE: 'Hold the laser in the optimal range to fracture Dolivine',
  COLLECT_ASSIGNED_GEMS: 'Collect all three raw Dolivine fragments',
  RETURN_TO_OUTPOST: 'Return to the outpost',
  START_REFINERY_ORDER: 'Speak to Ivo Sen and start refining',
  COLLECT_REFINED_MATERIAL: 'Collect the refinery order',
  SELL_REFINED_MATERIAL: 'Sell refined Dolivine to Neri Vale',
  SELL_MINED_GEM: 'Sell the raw Dolivine to Neri Vale',
  RETURN_TO_FOREMAN: 'Report back to Mara Voss',
  COMPLETE: 'First Shift complete · next assignment unlocked',
};
export function objectiveText(state: PlayerState): string {
  if (state.firstShift?.reconciliation === 'SUPPORT_REQUIRED') return 'Contact support about this assignment';
  if (
    state.firstShift &&
    ![2, 3].includes(state.firstShift.version ?? 0) &&
    state.firstShift.status === 'ACTIVE'
  )
    return state.firstShift.version === undefined || state.firstShift.version === 1
      ? 'Updating your earlier First Shift assignment'
      : 'Contact support about this assignment';
  if (state.location !== 'Lyria' && firstShiftOf(state).status !== 'COMPLETE')
    return 'Travel to Lyria via the ship console';
  return LABELS[firstShiftOf(state).objective];
}

function legacySale(quest: ReturnType<typeof firstShiftOf>): boolean {
  return (
    (quest.version !== 2 && quest.version !== 3) ||
    quest.reconciliation === 'LEGACY_SOLD' ||
    quest.reconciliation === 'LEGACY_COMPLETE' ||
    quest.reconciliation === 'SUPPORT_REQUIRED'
  );
}
export function miningTick(energy: number, stability: number, held: boolean) {
  return held
    ? { energy: Math.min(100, energy + 5), stability: Math.max(0, stability - 4) }
    : { energy: Math.max(0, energy - 1), stability: energy > 0 ? Math.max(0, stability - 1) : stability };
}

export function QuestLog({ state }: { state: PlayerState }) {
  const quest = firstShiftOf(state);
  const legacy =
    !!state.firstShift &&
    (![2, 3].includes(state.firstShift.version ?? 0) ||
      state.firstShift.reconciliation === 'LEGACY_SOLD' ||
      state.firstShift.reconciliation === 'LEGACY_COMPLETE' ||
      state.firstShift.reconciliation === 'SUPPORT_REQUIRED');
  const saleUnits = TUTORIAL_RAW_UNITS;
  const saleRevenue = saleProceeds(wholeCscuToMinor(saleUnits), rawMineral('Dolivine').pricePerScu);
  const walletChange = saleRevenue + FIRST_SHIFT_REWARD;
  return (
    <section className={styles.screen} aria-label="Quest Log">
      <h1>Quest Log</h1>
      <div className={styles.panel}>
        <strong>The First Shift</strong>
        <p>{objectiveText(state)}</p>
        <p>
          Status:{' '}
          {quest.status === 'COMPLETE'
            ? 'Completed'
            : quest.status === 'ACTIVE'
              ? 'In progress'
              : 'Available'}
        </p>
        <p>
          Dolivine mined: {quest.counters.mined} cSCU · refined: {quest.counters.refined} cSCU ·{' '}
          {legacy ? 'sold' : 'sold raw'}: {quest.counters.sold} cSCU
        </p>
        {(quest.reconciliation === 'SUPPORT_REQUIRED' ||
          (quest.version !== undefined && ![1, 2, 3].includes(quest.version))) && (
          <p>Contact support about this assignment. Other game features remain available.</p>
        )}
        {legacy && quest.status === 'COMPLETE' && <p>Completed under an earlier First Shift route.</p>}
        {quest.reconciliation === 'LEGACY_SOLD' && (
          <p>
            Earlier refinery sale credited: {LEGACY_TUTORIAL_SALE_AUEC} aUEC. No raw-gem sale will be added.
          </p>
        )}
        {quest.status === 'COMPLETE' && !legacy && (
          <div aria-label="Final reward summary">
            <p>Sale revenue: +{saleRevenue} aUEC</p>
            <p>Refinery cost: 0 aUEC · gems are sold raw</p>
            <p>Reward claimed: +{FIRST_SHIFT_REWARD} aUEC</p>
            <p>Total wallet change: +{walletChange} aUEC</p>
            <p>Final wallet: {state.wallet} aUEC</p>
            <p>
              Assigned Dolivine: {quest.counters.mined} cSCU mined · {quest.counters.refined} cSCU refined ·{' '}
              {quest.counters.sold} cSCU sold raw
            </p>
            <p>Next assignment unlocked</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function TutorialOperations({
  state,
  canAct,
  busy,
  mutate,
  kind,
}: {
  state: PlayerState;
  canAct: boolean;
  busy: boolean;
  now: number;
  mutate: (action?: Action) => Promise<void>;
  kind: 'refinery' | 'market';
}) {
  const quest = firstShiftOf(state);
  const action =
    kind === 'market' &&
    quest.objective === 'SELL_MINED_GEM' &&
    (quest.version === 2 || quest.version === 3) &&
    quest.reconciliation !== 'SUPPORT_REQUIRED'
      ? 'sell'
      : null;
  const disabled = !canAct || busy;
  const saleUnits = TUTORIAL_RAW_UNITS;
  const saleRevenue = saleProceeds(wholeCscuToMinor(saleUnits), rawMineral('Dolivine').pricePerScu);
  return (
    <section className={styles.panel} aria-label={`${kind} tutorial`}>
      <strong>{kind === 'refinery' ? 'Ivo Sen · shift refinery' : 'Neri Vale · supply exchange'}</strong>
      <p>
        {quest.reconciliation === 'SUPPORT_REQUIRED'
          ? 'Contact support about this assignment.'
          : quest.version !== 2 && quest.version !== 3
            ? 'Updating your earlier First Shift assignment.'
            : quest.reconciliation === 'LEGACY_SOLD' || quest.reconciliation === 'LEGACY_COMPLETE'
              ? 'Your earlier refinery sale remains credited. No new raw-gem sale is due.'
              : kind === 'refinery'
                ? 'Dolivine and other gems cannot enter a refinery work order. Sell them raw at the supply exchange.'
                : `Sell the assigned ${saleUnits} cSCU of raw Dolivine for ${saleRevenue} aUEC.`}
      </p>
      {action && (
        <button
          className={styles.accentButton}
          disabled={disabled}
          onClick={() => void mutate({ type: 'firstShift', step: action })}
        >
          Sell raw Dolivine
        </button>
      )}
      {kind === 'market' && quest.counters.sold > 0 && quest.reconciliation !== 'SUPPORT_REQUIRED' && (
        <p>
          {legacySale(quest)
            ? `Earlier sale confirmed: ${quest.counters.sold} cSCU refined Dolivine for ${LEGACY_TUTORIAL_SALE_AUEC} aUEC.`
            : `Sale confirmed: ${quest.counters.sold} cSCU raw Dolivine for ${saleRevenue} aUEC.`}
        </p>
      )}
    </section>
  );
}

export function MiningSequence({ onCancel, onComplete }: { onCancel: () => void; onComplete: () => void }) {
  const [{ energy, stability }, setMining] = useState({ energy: 0, stability: 100 });
  const [failed, setFailed] = useState(false);
  const held = useRef(false);
  const finished = useRef(false);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (finished.current) return;
      setMining((value) => miningTick(value.energy, value.stability, held.current));
    }, 100);
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        cancelRef.current();
        return;
      }
      if (event.code === 'KeyE' || event.code === 'Space') {
        event.preventDefault();
        held.current = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'KeyE' || event.code === 'Space') held.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      held.current = false;
    };
  }, []);
  useEffect(() => {
    if (energy >= 100 && !finished.current) {
      finished.current = true;
      onComplete();
    } else if (stability <= 0 && !finished.current) {
      finished.current = true;
      setFailed(true);
    }
  }, [energy, stability, onComplete]);
  return (
    <div className={styles.dialogueShade}>
      <section className={styles.dialogue} role="dialog" aria-label="Dolivine mining sequence">
        <strong>Dolivine · Hand extraction</strong>
        <p>Hold E, Space or the tool button to charge the cutter. Release if you need to pause.</p>
        <label>
          Energy {energy}% <progress value={energy} max={100} />
        </label>
        <label>
          Stability {stability}% <progress value={stability} max={100} />
        </label>
        {failed && <p>Extraction failed. No ore was awarded.</p>}
        <button
          onPointerDown={(event) => {
            event.preventDefault();
            held.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={() => {
            held.current = false;
          }}
          onPointerCancel={() => {
            held.current = false;
          }}
          onLostPointerCapture={() => {
            held.current = false;
          }}
          disabled={failed || finished.current}
        >
          Hold mining tool
        </button>
        <button onClick={onCancel}>{failed ? 'Close' : 'Cancel extraction'}</button>
      </section>
    </div>
  );
}
