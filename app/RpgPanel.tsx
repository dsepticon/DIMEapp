import { useEffect, useRef, useState } from 'react';
import { Action, PlayerState } from '../shared/schema';
import { CAPACITIES } from '../shared/catalog';
import { total } from '../shared/game';
import { format } from './ui';
import { CanvasEngine } from './rpg/canvasEngine';
import { Direction, WorldObject } from './rpg/world';
import { MiningActionAdapter } from './rpg/actionAdapter';
import styles from './RpgPanel.module.css';

type Overlay = 'game' | 'menu' | 'cargo' | 'refinery' | 'market' | 'profile' | 'travel' | 'mining';

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
  navigate: (view: Overlay) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const adapter = useRef(new MiningActionAdapter());
  const awaitingResult = useRef(false);
  const [nearby, setNearby] = useState<WorldObject | undefined>();
  const [message, setMessage] = useState('');
  const [area, setArea] = useState(true);
  const [title, setTitle] = useState(true);
  const latest = useRef({ state, canAct, mutate, navigate });
  latest.current = { state, canAct, mutate, navigate };

  useEffect(() => {
    const start = window.setTimeout(() => setTitle(false), 850);
    const areaTimer = window.setTimeout(() => setArea(false), 3400);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(areaTimer);
    };
  }, []);

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
      escape: () => navigate('game'),
      backpack: () => navigate('cargo'),
      interact: (object) => {
        const { state: current, canAct: enabled, mutate: submit, navigate: open } = latest.current;
        if (object.kind === 'refinery' || object.kind === 'market') {
          open(object.kind);
          return;
        }
        if (object.kind === 'travel') {
          open('travel');
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

  useEffect(() => engineRef.current?.setOverlay(overlay || title), [overlay, title]);

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
          <strong aria-label="Wallet">{format(state.wallet)} aUEC</strong>
          <span aria-label="Cargo capacity">
            Hand Cargo {cargo / 100}/{CAPACITIES.Hand / 100} SCU
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
          Lyria Mining Outpost
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
    </section>
  );
}
