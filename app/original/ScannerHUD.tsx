import { scannerCardLayout } from './scannerLayout';
import { nodeInZone } from '../../shared/originalVacuum';
import { useEffect, useRef, useState } from 'react';
import type { OriginalPlayerState } from '../../shared/originalSchema';
import {
  analysisStatus,
  scannerCandidates,
  scannerSignals,
  ANALYZE_HOLD_MS,
} from '../../shared/originalScanner';
import { nodeToolRange, type Facing } from '../../shared/originalNodeTargeting';
import { originalNodeSpec } from '../../shared/originalMining';
import { parameters } from '../../shared/continuousMining';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import type { Position } from './walking';
export type ScannerPulse = { born: number; x: number; y: number; zone: string };
type Props = {
  state: OriginalPlayerState;
  target: string;
  busy: boolean;
  paused: boolean;
  laserMode: boolean;
  getPlayer: () => Position;
  onTarget: (id: string) => void;
  mutate: (a: Record<string, unknown>) => Promise<OriginalPlayerState | null>;
  onPulse: (pulse: ScannerPulse) => void;
  onHolding: (held: boolean) => void;
};
export function ScannerHUD(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [status, setStatus] = useState('No signal'),
    [progress, setProgress] = useState<number | null>(null),
    [feedback, setFeedback] = useState(''),
    [detail, setDetail] = useState(''),
    [choices, setChoices] = useState(0);
  const [pointerHeld, setPointerHeld] = useState(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releasePointer = () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => setPointerHeld(false), 250);
  };
  const hold = useRef<{ id: string; generation: string; zone: string; born: number } | null>(null);
  const facing = (): Facing =>
    (document.querySelector('canvas')?.getAttribute('data-facing') as Facing) || 'S';
  const stop = () => {
    hold.current = null;
    setProgress(null);
    latest.current.onHolding(false);
  };
  const ping = () => {
    const p = latest.current;
    if (p.paused || document.hidden) return;
    const player = p.getPlayer(),
      signals = scannerSignals(p.state, player, facing()),
      candidates = scannerCandidates(p.state, player, facing());
    p.onPulse({ ...player, born: performance.now(), zone: p.state.world.zone });
    if (candidates[0]) p.onTarget(candidates[0].id);
    setFeedback(
      signals.length
        ? `${signals.length} signal${signals.length === 1 ? '' : 's'} · ${signals[0]!.status === 'Ready' ? 'Approach and hold Analyze' : signals[0]!.status}`
        : 'No signal',
    );
    const id = candidates[0]?.id ?? p.target;
    if (p.state.world.scanner.analyzed.includes(id)) setDetail(id);
  };
  const cycle = () => {
    const p = latest.current;
    if (p.paused || hold.current) return;
    const list = scannerCandidates(p.state, p.getPlayer(), facing());
    if (list.length > 1) {
      const id = list[(list.findIndex((n) => n.id === p.target) + 1) % list.length]!.id;
      p.onTarget(id);
      setDetail(p.state.world.scanner.analyzed.includes(id) ? id : '');
    }
  };
  const start = () => {
    const p = latest.current;
    if (
      p.paused ||
      p.busy ||
      !p.laserMode ||
      document.hidden ||
      hold.current ||
      analysisStatus(p.state, p.target, p.getPlayer()) !== 'Ready'
    )
      return;
    hold.current = {
      id: p.target,
      generation: p.state.saveGeneration,
      zone: p.state.world.zone,
      born: performance.now(),
    };
    setProgress(0);
    setFeedback('');
    p.onHolding(true);
  };
  const controls = useRef({ ping, cycle, start, stop });
  controls.current = { ping, cycle, start, stop };
  useEffect(() => {
    const timer = setInterval(() => {
      const p = latest.current,
        h = hold.current;
      setStatus(analysisStatus(p.state, p.target, p.getPlayer()));
      setChoices(scannerCandidates(p.state, p.getPlayer(), facing()).length);
      if (!h) return;
      if (
        p.busy ||
        p.paused ||
        !p.laserMode ||
        document.hidden ||
        p.state.saveGeneration !== h.generation ||
        p.state.world.zone !== h.zone ||
        p.target !== h.id ||
        analysisStatus(p.state, h.id, p.getPlayer()) !== 'Ready'
      ) {
        controls.current.stop();
        return;
      }
      const elapsed = performance.now() - h.born;
      setProgress(Math.min(1, elapsed / ANALYZE_HOLD_MS));
      if (elapsed >= ANALYZE_HOLD_MS) {
        controls.current.stop();
        setFeedback('Confirming analysis…');
        void p.mutate({ type: 'analyzeNearby', nodeId: h.id, player: p.getPlayer() }).then((next) => {
          if (next?.saveGeneration === h.generation && next.world.scanner.analyzed.includes(h.id)) {
            setDetail(h.id);
            setFeedback('Analysis confirmed');
          } else setFeedback('Analysis not confirmed · retry when ready');
        });
      }
    }, 50);
    const down = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        !(e.target instanceof HTMLElement) ||
        e.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (e.code === 'KeyP') {
        e.preventDefault();
        controls.current.ping();
      }
      if (e.code === 'KeyF') {
        e.preventDefault();
        controls.current.start();
      }
      if (e.code === 'KeyQ') {
        e.preventDefault();
        controls.current.cycle();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyF') controls.current.stop();
    };
    const release = () => {
      controls.current.stop();
      setPointerHeld(false);
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      clearInterval(timer);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      latest.current.onHolding(false);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(''), 3000);
    return () => clearTimeout(t);
  }, [feedback]);
  useEffect(() => {
    if (!detail) return;
    const t = setTimeout(() => setDetail(''), 8000);
    return () => clearTimeout(t);
  }, [detail]);
  const node = props.state.world.nodes[detail],
    known =
      !!node &&
      detail === props.target &&
      node.status === 'INTACT' &&
      props.state.world.scanner.analyzed.includes(detail) &&
      nodeInZone(props.state, node);
  const spec = known ? originalNodeSpec(node) : null,
    band = spec ? parameters(spec) : null;
  const canvas = document.querySelector<HTMLCanvasElement>('canvas');
  const view = canvas?.getBoundingClientRect();
  const scale = Number(canvas?.dataset.cameraScale ?? 24),
    cy = Number(canvas?.dataset.cameraY ?? 0);
  const playerY = (props.getPlayer().y - cy) * scale;
  const menuBottom = document.querySelector('.menuToggle')?.getBoundingClientRect().bottom ?? 48;
  const padBottom = document.querySelector('.walkingControls')?.getBoundingClientRect().bottom;
  const cardLayout =
    known && view
      ? scannerCardLayout(
          view.height,
          menuBottom + 30,
          (padBottom ? view.height - padBottom : 4) + 48,
          playerY,
          (node.y + 0.5 - cy) * scale,
        )
      : undefined;
  return (
    <section className="scannerHUD" aria-label="Field scanner" data-focus={props.target}>
      <button className="pingControl" aria-label="Ping (P)" disabled={props.paused} onClick={ping}>
        ◎<small>Ping P</small>
      </button>
      {choices > 1 && props.laserMode && !props.paused && !props.state.world.miningSession && (
        <button className="cycleControl" aria-label="Next scanner target (Q)" onClick={cycle}>
          ↻ Q
        </button>
      )}
      {props.laserMode && (status === 'Ready' || pointerHeld) && !props.paused && (
        <button
          className="analyzeControl"
          aria-label="Hold Analyze (F)"
          disabled={props.busy}
          data-progress={progress ?? 0}
          onPointerDown={(e) => {
            e.preventDefault();
            if (releaseTimer.current) clearTimeout(releaseTimer.current);
            setPointerHeld(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            start();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
              stop();
          }}
          onBlur={stop}
          onKeyDown={(e) => {
            if (e.code === 'Space' && !e.repeat) {
              e.preventDefault();
              start();
            }
          }}
          onKeyUp={(e) => {
            if (e.code === 'Space') stop();
          }}
        >
          {status === 'Already analyzed'
            ? 'Confirmed · release'
            : progress === null
              ? 'Hold Analyze · F'
              : `Analyzing ${Math.round(progress * 100)}%`}
        </button>
      )}
      {feedback && !props.paused && !known && (
        <small className="scannerFeedback" role="status">
          {feedback}
        </small>
      )}
      {known &&
        band &&
        !props.paused &&
        !props.state.world.miningSession &&
        !props.state.world.extractionSession && (
          <aside className="analysisCard" style={cardLayout} aria-label="Confirmed rock analysis">
            <b>{ORIGINAL_CONTENT.minerals.find((m) => m.id === node.ore)?.name}</b>
            <span>
              Rarity {['Common', 'Uncommon', 'Scarce', 'Rare', 'Exceptional'][spec!.rarity]} · Size{' '}
              {node.size}
            </span>
            <span>
              Instability {Math.round(node.instability * 100)}% · Est. yield {node.yieldUnits} units
            </span>
            <span>
              Optimal {band.lower / 10}–{band.upper / 10}%
            </span>
            <span>
              {nodeToolRange(props.state, node) ? 'Current tool compatible' : 'Requires occupied Crawl Rig'}
            </span>
            <button onClick={() => setDetail('')}>Close analysis · Ping to recall</button>
          </aside>
        )}
    </section>
  );
}
