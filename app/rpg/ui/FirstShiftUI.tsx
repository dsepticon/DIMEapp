import { useEffect, useRef, useState } from 'react';
import {
  firstShiftOf,
  FIRST_SHIFT_REWARD,
  TUTORIAL_DURATION_MS,
  TUTORIAL_SALE_AUEC,
} from '../../../shared/firstShift';
import type { Action, PlayerState } from '../../../shared/schema';
import styles from './GameUI.module.css';

const LABELS: Record<ReturnType<typeof firstShiftOf>['objective'], string> = {
  SPEAK_TO_FOREMAN: 'Meet Mara Voss at the outpost',
  CHECK_EQUIPMENT: 'Check your Hand tool with Neri Vale',
  ENTER_MINE: 'Enter the mine chamber',
  MINE_ASSIGNED_ORE: 'Mine the assigned Dolivine seam',
  RETURN_TO_OUTPOST: 'Return to the outpost',
  START_REFINERY_ORDER: 'Speak to Ivo Sen and start refining',
  COLLECT_REFINED_MATERIAL: 'Collect the refinery order',
  SELL_REFINED_MATERIAL: 'Sell refined Dolivine to Neri Vale',
  RETURN_TO_FOREMAN: 'Report back to Mara Voss',
  COMPLETE: 'First Shift complete · next assignment unlocked',
};
export function objectiveText(state: PlayerState): string {
  if (state.location !== 'Lyria' && firstShiftOf(state).status !== 'COMPLETE')
    return 'Travel to Lyria via the ship console';
  return LABELS[firstShiftOf(state).objective];
}
export function miningTick(energy: number, stability: number, held: boolean) {
  return held
    ? { energy: Math.min(100, energy + 5), stability: Math.max(0, stability - 4) }
    : { energy: Math.max(0, energy - 1), stability: energy > 0 ? Math.max(0, stability - 1) : stability };
}

export function QuestLog({ state }: { state: PlayerState }) {
  const quest = firstShiftOf(state);
  return (
    <section className={styles.screen} aria-label="Quest Log">
      <h1>Quest Log</h1>
      <div className={styles.panel}>
        <strong>The First Shift</strong>
        <p>{objectiveText(state)}</p>
        <p>Status: {quest.status.replaceAll('_', ' ')}</p>
        <p>
          Dolivine mined: {quest.counters.mined} cSCU · refined: {quest.counters.refined} cSCU · sold:{' '}
          {quest.counters.sold} cSCU
        </p>
        {quest.status === 'COMPLETE' && (
          <p>Reward claimed: {FIRST_SHIFT_REWARD} aUEC · Next assignment unlocked</p>
        )}
      </div>
    </section>
  );
}

export function TutorialOperations({
  state,
  canAct,
  busy,
  now,
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
    kind === 'refinery'
      ? quest.objective === 'START_REFINERY_ORDER'
        ? 'startRefinery'
        : quest.objective === 'COLLECT_REFINED_MATERIAL'
          ? 'collect'
          : null
      : quest.objective === 'SELL_REFINED_MATERIAL'
        ? 'sell'
        : null;
  const order = state.orders.find((item) => item.id === quest.tutorialOrderId);
  const disabled = !canAct || busy || (action === 'collect' && !!order && order.readyAt > now);
  return (
    <section className={styles.panel} aria-label={`${kind} tutorial`}>
      <strong>{kind === 'refinery' ? 'Ivo Sen · shift refinery' : 'Neri Vale · supply exchange'}</strong>
      <p>
        {kind === 'refinery'
          ? `Process 4 cSCU of assigned Dolivine into 3 cSCU in ${TUTORIAL_DURATION_MS / 1000} seconds at no charge.`
          : `Sell the assigned refined Dolivine for ${TUTORIAL_SALE_AUEC} aUEC.`}
      </p>
      {action && (
        <button
          className={styles.accentButton}
          disabled={disabled}
          onClick={() => void mutate({ type: 'firstShift', step: action })}
        >
          {action === 'startRefinery'
            ? 'Start tutorial order'
            : action === 'collect'
              ? 'Collect tutorial material'
              : 'Sell tutorial material'}
        </button>
      )}
      {action === 'collect' && order && order.readyAt > now && <p>Processing · ready shortly</p>}
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
