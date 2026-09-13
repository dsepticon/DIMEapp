import { useEffect, useRef, useState } from 'react';
import { Action, MiningType, PlayerState } from '../shared/schema';
import { CanvasEngine } from './rpg/canvasEngine';
import { Direction, WorldObject } from './rpg/world';
import { MiningActionAdapter } from './rpg/actionAdapter';
import { MiningPanel } from './MiningPanel';
import styles from './RpgPanel.module.css';

export function RpgPanel({
  state,
  source,
  setSource,
  canAct,
  mutate,
  notice,
  navigate,
}: {
  state: PlayerState;
  source: MiningType;
  setSource: (source: MiningType) => void;
  canAct: boolean;
  mutate: (action?: Action) => Promise<void>;
  notice: string;
  navigate: (view: 'refinery' | 'market') => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const adapter = useRef(new MiningActionAdapter());
  const awaitingResult = useRef(false);
  const [nearby, setNearby] = useState<WorldObject | undefined>();
  const [dialogue, setDialogue] = useState<{ title: string; body: string } | null>(null);
  const [feedback, setFeedback] = useState('Walk toward a terminal or mineral seam.');
  const latest = useRef({ state, canAct, mutate, navigate });
  latest.current = { state, canAct, mutate, navigate };

  useEffect(() => {
    if (!awaitingResult.current) return;
    awaitingResult.current = false;
    setFeedback(
      notice === 'Operation saved.' || notice === 'Previous action confirmed. State synchronized.'
        ? 'Mining operation saved by the server. Collect ore when extraction finishes.'
        : 'Mining request was not confirmed. Review the status above; inventory remains server-managed.',
    );
  }, [notice]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new CanvasEngine(canvasRef.current, {
      prompt: setNearby,
      escape: () => setDialogue(null),
      interact: (object) => {
        const { state: current, canAct: enabled, mutate: submit, navigate: open } = latest.current;
        if (object.kind === 'refinery' || object.kind === 'market') {
          setDialogue({ title: object.label, body: `Opening ${object.kind} controls.` });
          open(object.kind);
          return;
        }
        if (object.kind === 'travel') {
          setDialogue({
            title: object.label,
            body: 'Use the travel controls below the map to select a claim.',
          });
          const details = document.querySelector<HTMLDetailsElement>(
            'section[aria-label="Location and travel"] details',
          );
          if (details) {
            details.open = true;
            details.scrollIntoView({ block: 'nearest' });
          }
          return;
        }
        if (current.location !== 'Lyria') {
          setDialogue({ title: object.label, body: 'Travel to Lyria before starting a mining operation.' });
          return;
        }
        if (!enabled || current.pending) {
          setDialogue({
            title: object.label,
            body: 'Finish the current operation or reconnect before mining.',
          });
          return;
        }
        if (adapter.current.busy) return;
        setDialogue({
          title: object.label,
          body: 'Requesting a server-managed hand mining operation. This seam does not guarantee a specific ore.',
        });
        setFeedback('Submitting mining request…');
        awaitingResult.current = true;
        void adapter.current
          .requestDeposit(current, enabled, submit)
          .then((result) => {
            if (result !== 'submitted') awaitingResult.current = false;
          })
          .catch(() => {
            awaitingResult.current = false;
            setFeedback('Mining request was not confirmed. Review the status above.');
          });
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const touch = (direction: Direction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      engineRef.current?.setDirection(direction, true);
    },
    onPointerUp: () => engineRef.current?.setDirection(direction, false),
    onPointerCancel: () => engineRef.current?.setDirection(direction, false),
    onLostPointerCapture: () => engineRef.current?.setDirection(direction, false),
  });

  return (
    <section className={styles.panel} aria-label="Lyria Mining Outpost game">
      <div className={styles.heading}>
        <div>
          <span>EXPLORE · MINE · RETURN</span>
          <h1>Lyria Mining Outpost</h1>
        </div>
        <small>Local walking · server-managed mining</small>
      </div>
      <div className={styles.stage}>
        <div className={styles.gameFrame}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Pixel-art map of Lyria Mining Outpost, mine entrance, and terminals"
          />
        </div>
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
            Interact<span>E / Space</span>
          </button>
        </div>
      </div>
      <p className={styles.prompt} aria-live="polite">
        {nearby
          ? `E / Space or Interact: ${nearby.label}`
          : state.location === 'Lyria'
            ? 'WASD / arrows · touch D-pad'
            : 'Preview · travel to Lyria to mine'}
      </p>
      {dialogue && (
        <div className={styles.dialogue} role="dialog" aria-label={dialogue.title}>
          <strong>{dialogue.title}</strong>
          <p>{dialogue.body}</p>
          <button onClick={() => setDialogue(null)}>Close · Esc</button>
        </div>
      )}
      <p className={styles.feedback} aria-live="polite">
        {feedback}
      </p>
      <details className={styles.classic}>
        <summary>Classic mining controls</summary>
        <MiningPanel state={state} source={source} setSource={setSource} canAct={canAct} mutate={mutate} />
      </details>
    </section>
  );
}
