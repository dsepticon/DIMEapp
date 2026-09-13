import { useEffect, useRef, useState } from 'react';
import { Action, PlayerState } from '../shared/schema';
import { CAPACITIES } from '../shared/catalog';
import { total } from '../shared/game';
import { format } from './ui';
import { CanvasEngine } from './rpg/canvasEngine';
import { Direction, WorldObject } from './rpg/world';
import { MiningActionAdapter } from './rpg/actionAdapter';
import { areaName } from './rpg/mapData';
import { Dialogue } from './rpg/ui/UiBits';
import { firstShiftOf } from '../shared/firstShift';
import { MiningSequence, objectiveText } from './rpg/ui/FirstShiftUI';
import type { GameView } from './rpg/ui/Screens';
import styles from './RpgPanel.module.css';

export function RpgPanel({
  state,
  canAct,
  mutate,
  notice,
  status,
  busy,
  overlay,
  navigate,
}: {
  state: PlayerState;
  canAct: boolean;
  mutate: (action?: Action) => Promise<void>;
  notice: string;
  status: string;
  busy: boolean;
  overlay: boolean;
  navigate: (view: GameView) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const adapter = useRef(new MiningActionAdapter());
  const awaitingResult = useRef(false);
  const lastObjective = useRef(firstShiftOf(state).objective);
  const [nearby, setNearby] = useState<WorldObject | undefined>();
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState<string[]>([]);
  const [area, setArea] = useState(true);
  const [areaLabel, setAreaLabel] = useState(areaName('outpost'));
  const [title, setTitle] = useState(true);
  const [trackerOpen, setTrackerOpen] = useState(true);
  const [miningTarget, setMiningTarget] = useState<WorldObject | null>(null);
  const miningLock = useRef(false);
  const [dialogue, setDialogue] = useState<{
    speaker: string;
    text: string;
    next?: () => void;
    choices?: { label: string; action: () => void }[];
    portrait?: 'foreman' | 'technician' | 'officer';
  } | null>(null);
  const dialogueRef = useRef(dialogue);
  dialogueRef.current = dialogue;
  const latest = useRef({ state, canAct, mutate, navigate });
  latest.current = { state, canAct, mutate, navigate };

  useEffect(() => {
    const start = window.setTimeout(() => setTitle(false), 850);
    return () => {
      window.clearTimeout(start);
    };
  }, []);
  useEffect(() => {
    setArea(true);
    const timer = window.setTimeout(() => setArea(false), areaLabel === 'Lyria Mining Outpost' ? 3400 : 2200);
    return () => window.clearTimeout(timer);
  }, [areaLabel]);

  useEffect(() => {
    if (busy || !notice) return;
    const objective = firstShiftOf(state).objective;
    let next = notice;
    if (awaitingResult.current) {
      awaitingResult.current = false;
      next =
        notice === 'Operation saved.' || notice === 'Previous action confirmed. State synchronized.'
          ? 'Mining operation saved. Extraction remains server-managed.'
          : 'Mining request was not confirmed. Inventory is unchanged.';
    }
    if (objective !== lastObjective.current) {
      next =
        notice === 'First Shift updated. Continue your assignment.'
          ? notice
          : objective === 'COMPLETE'
            ? 'First Shift complete · 500 aUEC reward'
            : `Objective complete · ${objectiveText(state)}`;
      lastObjective.current = objective;
      setNotifications((queued) => [...queued, next]);
    } else {
      setNotifications([next]);
    }
  }, [notice, busy, state]);
  useEffect(() => {
    if (!notifications.length) return;
    const timer = window.setTimeout(() => setNotifications((queued) => queued.slice(1)), 3600);
    return () => window.clearTimeout(timer);
  }, [notifications]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new CanvasEngine(canvasRef.current, {
      prompt: setNearby,
      escape: () => {
        if (dialogueRef.current) setDialogue(null);
        else navigate('game');
      },
      backpack: () => navigate('cargo'),
      area: (name) => {
        setAreaLabel(name);
        const { state: current, canAct: enabled, mutate: submit } = latest.current;
        const objective = firstShiftOf(current).objective;
        if (
          enabled &&
          current.location === 'Lyria' &&
          name === 'Lyria Mine Chamber' &&
          objective === 'ENTER_MINE'
        )
          void submit({ type: 'firstShift', step: 'enterMine' });
        if (
          enabled &&
          current.location === 'Lyria' &&
          name === 'Lyria Mining Outpost' &&
          objective === 'RETURN_TO_OUTPOST'
        )
          void submit({ type: 'firstShift', step: 'returnOutpost' });
      },
      interact: (object) => {
        const { state: current, canAct: enabled, mutate: submit, navigate: open } = latest.current;
        const quest = firstShiftOf(current);
        if (object.kind === 'npc') {
          if (object.id === 'foreman') {
            const ready = quest.objective === 'RETURN_TO_FOREMAN';
            const start = quest.status === 'NOT_STARTED';
            setDialogue({
              speaker: 'Mara Voss · Shift Foreman',
              portrait: 'foreman',
              text:
                current.location !== 'Lyria'
                  ? 'Your ship is registered away from Lyria. Use the blue navigation console to arrive before taking this shift.'
                  : start
                    ? 'First shift? Take the Hand cutter, mine the marked Dolivine, then sell the raw gems to Neri.'
                    : ready
                      ? 'Good work. Your shift is complete. The next assignment is yours when you are ready.'
                      : quest.status === 'COMPLETE'
                        ? 'You earned your place on the crew. Watch for the next assignment.'
                        : `Keep at it, miner. ${objectiveText(current)}.`,
              choices:
                current.location !== 'Lyria'
                  ? [
                      {
                        label: 'Open Travel',
                        action: () => {
                          setDialogue(null);
                          open('travel');
                        },
                      },
                      { label: 'Back', action: () => setDialogue(null) },
                    ]
                  : start || ready
                    ? [
                        {
                          label: start ? 'Accept assignment' : 'Complete shift · claim reward',
                          action: () => {
                            setDialogue(null);
                            if (enabled)
                              void submit({ type: 'firstShift', step: start ? 'accept' : 'complete' });
                          },
                        },
                        { label: 'Not now', action: () => setDialogue(null) },
                      ]
                    : undefined,
            });
          } else if (object.id === 'officer') {
            const checking = quest.objective === 'CHECK_EQUIPMENT';
            const missing = (current.equipment['Hand mining tool'] ?? 0) < 1;
            setDialogue({
              speaker: 'Neri Vale · Supply Officer',
              portrait: 'officer',
              text: checking
                ? missing
                  ? 'Your Hand cutter is missing. I can issue one replacement for this shift.'
                  : 'Your Hand cutter is ready. Check its charge before entering the mine.'
                : 'Your Hand hold carries raw ore; Cargo shows what is aboard your ship. The amber counter handles the sale.',
              choices: checking
                ? [
                    {
                      label: missing ? 'Recover Hand tool' : 'Confirm Hand tool',
                      action: () => {
                        setDialogue(null);
                        if (enabled)
                          void submit({ type: 'firstShift', step: missing ? 'recoverTool' : 'checkTool' });
                      },
                    },
                    { label: 'Back', action: () => setDialogue(null) },
                  ]
                : [
                    {
                      label: 'Open Cargo',
                      action: () => {
                        setDialogue(null);
                        open('cargo');
                      },
                    },
                    {
                      label: 'Open market',
                      action: () => {
                        setDialogue(null);
                        open('market');
                      },
                    },
                    { label: 'Back', action: () => setDialogue(null) },
                  ],
            });
          } else {
            setDialogue({
              speaker: 'Ivo Sen · Refinery Technician',
              portrait: 'technician',
              text: 'Dolivine is a gem and cannot be refined. Bring ship-mined ore to my refinery for work orders.',
              choices: [
                {
                  label: 'Open refinery',
                  action: () => {
                    setDialogue(null);
                    open('refinery');
                  },
                },
                { label: 'Back', action: () => setDialogue(null) },
              ],
            });
          }
          return;
        }
        if (object.kind === 'refinery' || object.kind === 'market') {
          const target = object.kind;
          setDialogue({
            speaker: object.kind === 'refinery' ? 'Refinery console' : 'Supply counter',
            text:
              object.kind === 'refinery'
                ? 'Choose raw ore and a process. The station will queue a work order.'
                : 'Welcome to the exchange. Review a price before confirming a trade.',
            next: () => open(target),
          });
          return;
        }
        if (object.kind === 'travel') {
          setDialogue({
            speaker: 'Navigation console',
            text: 'Select a destination and ship. Every flight requires confirmation.',
            next: () => open('travel'),
          });
          return;
        }
        if (current.location !== 'Lyria') {
          setMessage('Travel to Lyria before mining here.');
          return;
        }
        if (adapter.current.busy || current.pending || miningLock.current) return;
        if (!enabled) {
          setMessage('Finish the current operation or reconnect before mining.');
          return;
        }
        if (quest.objective === 'MINE_ASSIGNED_ORE' && object.id !== 'dolivine') {
          setMessage('This shift assigns the Dolivine seam.');
          return;
        }
        setMiningTarget(object);
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [navigate]);

  useEffect(
    () => engineRef.current?.setOverlay(overlay || title || !!dialogue || !!miningTarget),
    [overlay, title, dialogue, miningTarget],
  );
  useEffect(() => engineRef.current?.setObjective(firstShiftOf(state).objective), [state]);

  const completeMining = () => {
    if (miningLock.current) return;
    miningLock.current = true;
    const { state: current, canAct: enabled, mutate: submit } = latest.current;
    const target = miningTarget;
    setMiningTarget(null);
    if (!target || !enabled) {
      miningLock.current = false;
      return;
    }
    awaitingResult.current = true;
    setMessage('Submitting extraction…');
    const operation =
      firstShiftOf(current).objective === 'MINE_ASSIGNED_ORE' && target.id === 'dolivine'
        ? submit({ type: 'firstShift', step: 'mineDolivine', depositId: 'dolivine' })
        : adapter.current.requestDeposit(current, enabled, submit).then((result) => {
            if (result !== 'submitted') awaitingResult.current = false;
          });
    void operation
      .catch(() => {
        awaitingResult.current = false;
        setMessage('Mining request was not confirmed.');
      })
      .finally(() => {
        miningLock.current = false;
      });
  };

  const touch = (direction: Direction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      engineRef.current?.setDirection(direction, true);
    },
    onPointerUp: () => engineRef.current?.setDirection(direction, false),
    onPointerCancel: () => engineRef.current?.setDirection(direction, false),
    onLostPointerCapture: () => engineRef.current?.setDirection(direction, false),
  });
  const cargo = total(state.mining.Hand);
  const healthy = !busy && !status;

  return (
    <section className={styles.panel} aria-label="Lyria Mining Outpost game">
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label="Pixel-art map of Lyria Mining Outpost, mine entrance, and terminals"
      />
      <div className={styles.hud}>
        <div className={styles.hudValues}>
          <strong aria-label="Wallet">◈ {format(state.wallet)} aUEC</strong>
          <span aria-label="Cargo capacity">
            ▣ Hand Cargo {cargo / 100}/{CAPACITIES.Hand / 100} SCU
          </span>
        </div>
        <button className={styles.menuButton} aria-label="Open game menu" onClick={() => navigate('menu')}>
          ☰
        </button>
      </div>
      {!title && (
        <div className={styles.questTracker}>
          <button
            aria-label="Toggle objective tracker"
            aria-expanded={trackerOpen}
            onClick={() => setTrackerOpen(!trackerOpen)}
          >
            ◈ THE FIRST SHIFT {trackerOpen ? '▴' : '▾'}
          </button>
          {trackerOpen && (
            <div>
              {objectiveText(state)} <button onClick={() => navigate('quest')}>Quest Log</button>
            </div>
          )}
        </div>
      )}
      {!healthy && <div className={styles.connection}>{busy ? 'Saving…' : status}</div>}
      {title && (
        <div className={styles.title} aria-label="DIME title scene">
          <strong>D.I.M.E.</strong>
          <span>LYRIA MINING OUTPOST</span>
        </div>
      )}
      {!title && area && (
        <div className={styles.area} aria-label="Area introduction">
          {areaLabel}
        </div>
      )}
      {(notifications[0] || message) && !title && !dialogue && !miningTarget && (
        <div className={styles.toast} role="status">
          {notifications[0] || message}
        </div>
      )}
      {nearby && !overlay && !title && !miningTarget && (
        <div className={styles.prompt} aria-live="polite">
          E · {nearby.label}
        </div>
      )}
      {!overlay && !title && !miningTarget && (
        <div className={styles.controls} aria-label="Game controls">
          <div className={styles.dpad} aria-label="Touch movement">
            <button className={styles.up} aria-label="Move up" {...touch('up')}>
              ▲
            </button>
            <button className={styles.left} aria-label="Move left" {...touch('left')}>
              ◀
            </button>
            <button className={styles.down} aria-label="Move down" {...touch('down')}>
              ▼
            </button>
            <button className={styles.right} aria-label="Move right" {...touch('right')}>
              ▶
            </button>
          </div>
          <button
            className={styles.interact}
            onClick={() => engineRef.current?.interact()}
            disabled={!nearby}
          >
            Interact
          </button>
        </div>
      )}
      {dialogue && !overlay && (
        <Dialogue
          speaker={dialogue.speaker}
          text={dialogue.text}
          portrait={dialogue.portrait}
          choices={dialogue.choices}
          onAdvance={() => {
            setDialogue(null);
            dialogue.next?.();
          }}
        />
      )}
      {miningTarget && !overlay && (
        <MiningSequence onCancel={() => setMiningTarget(null)} onComplete={completeMining} />
      )}
    </section>
  );
}
