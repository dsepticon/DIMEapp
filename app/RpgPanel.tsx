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
  const [nearby, setNearby] = useState<WorldObject | undefined>();
  const [message, setMessage] = useState('');
  const [area, setArea] = useState(true);
  const [areaLabel, setAreaLabel] = useState(areaName('outpost'));
  const [title, setTitle] = useState(true);
  const [dialogue, setDialogue] = useState<{ speaker: string; text: string; next?: () => void } | null>(null);
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
    if (awaitingResult.current) {
      awaitingResult.current = false;
      setMessage(
        notice === 'Operation saved.' || notice === 'Previous action confirmed. State synchronized.'
          ? 'Mining operation saved. Extraction remains server-managed.'
          : 'Mining request was not confirmed. Inventory is unchanged.',
      );
    } else setMessage(notice);
    const timer = window.setTimeout(() => setMessage(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice, busy]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new CanvasEngine(canvasRef.current, {
      prompt: setNearby,
      escape: () => {
        if (dialogueRef.current) setDialogue(null);
        else navigate('game');
      },
      backpack: () => navigate('cargo'),
      area: setAreaLabel,
      interact: (object) => {
        const { state: current, canAct: enabled, mutate: submit, navigate: open } = latest.current;
        if (object.kind === 'npc') {
          setDialogue({
            speaker: 'Station worker',
            text: 'Keep your lamp charged, miner. The chamber beyond the striped gate is safe, but the ore is stubborn.',
          });
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
        if (adapter.current.busy || current.pending) return;
        if (!enabled) {
          setMessage('Finish the current operation or reconnect before mining.');
          return;
        }
        setMessage('Submitting mining request…');
        awaitingResult.current = true;
        void adapter.current
          .requestDeposit(current, enabled, submit)
          .then((result) => {
            if (result !== 'submitted') awaitingResult.current = false;
          })
          .catch(() => {
            awaitingResult.current = false;
            setMessage('Mining request was not confirmed.');
          });
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [navigate]);

  useEffect(() => engineRef.current?.setOverlay(overlay || title || !!dialogue), [overlay, title, dialogue]);

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
      {message && !title && (
        <div className={styles.toast} role="status">
          {message}
        </div>
      )}
      {nearby && !overlay && !title && (
        <div className={styles.prompt} aria-live="polite">
          E · {nearby.label}
        </div>
      )}
      {!overlay && !title && (
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
          onAdvance={() => {
            setDialogue(null);
            dialogue.next?.();
          }}
        />
      )}
    </section>
  );
}
