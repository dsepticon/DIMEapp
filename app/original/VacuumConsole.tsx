import { useEffect, useRef, useState } from 'react';
import type { OriginalPlayerState } from '../../shared/originalSchema';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import {
  fragmentCenter,
  nearestFragment,
  nodeInZone,
  vacuumCapacity,
  vacuumDuration,
  vacuumEligibility,
  VACUUM_RETARGET_MS,
  type FragmentTarget,
  type Point,
} from '../../shared/originalVacuum';
export type VacuumVisual = {
  nodeId: string;
  pieceId: string;
  progress: number;
  stage: 'attracting' | 'awaiting';
};
export type ToolMode = 'laser' | 'extraction';
export function VacuumConsole({
  state,
  busy,
  mode,
  setMode,
  getPlayer,
  mutate,
  onVisual,
  onTarget,
}: {
  state: OriginalPlayerState;
  busy: boolean;
  mode: ToolMode;
  setMode: (mode: ToolMode) => void;
  getPlayer: () => Point;
  mutate: (action: Record<string, unknown>) => Promise<OriginalPlayerState | null>;
  onVisual: (visual: VacuumVisual | null) => void;
  onTarget: (target: { nodeId: string; pieceId: string } | null) => void;
}) {
  const latest = useRef({ state, busy, mode, getPlayer, mutate, onVisual, onTarget });
  latest.current = { state, busy, mode, getPlayer, mutate, onVisual, onTarget };
  const held = useRef(false),
    running = useRef(false),
    mounted = useRef(true);
  const [target, setTarget] = useState<FragmentTarget>(),
    [feedback, setFeedback] = useState(''),
    [phase, setPhase] = useState('idle');
  const release = () => {
    held.current = false;
  };
  useEffect(() => {
    mounted.current = true;
    const stop = () => {
      held.current = false;
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyV') stop();
    };
    window.addEventListener('blur', stop);
    window.addEventListener('keyup', keyup);
    document.addEventListener('visibilitychange', stop);
    const timer = setInterval(() => {
      const p = latest.current;
      if (running.current) return;
      const next = p.mode === 'extraction' ? nearestFragment(p.state, p.getPlayer()) : undefined;
      setTarget(next);
      p.onTarget(next ? { nodeId: next.node.id, pieceId: next.piece.id } : null);
    }, 100);
    return () => {
      mounted.current = false;
      stop();
      clearInterval(timer);
      window.removeEventListener('blur', stop);
      window.removeEventListener('keyup', keyup);
      document.removeEventListener('visibilitychange', stop);
    };
  }, []);
  useEffect(() => {
    if (mode !== 'extraction') release();
  }, [mode]);
  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const start = async () => {
    if (running.current || latest.current.busy || latest.current.mode !== 'extraction') return;
    held.current = true;
    running.current = true;
    setFeedback('');
    try {
      // A persisted or recovered interrupted session is canceled through its guarded transaction first.
      if (latest.current.state.world.extractionSession) {
        const canceled = await latest.current.mutate({ type: 'cancelVacuum' });
        if (!canceled) {
          setFeedback('Review the pending result before extracting again.');
          return;
        }
        latest.current.state = canceled;
      }
      while (held.current && mounted.current) {
        const p = latest.current,
          chosen = nearestFragment(p.state, p.getPlayer());
        if (!chosen) {
          setFeedback('Move within tool range with a clear line to a fragment.');
          break;
        }
        setTarget(chosen);
        p.onTarget({ nodeId: chosen.node.id, pieceId: chosen.piece.id });
        if (chosen.full) {
          setFeedback(
            `Hold full. Free ${chosen.piece.units - vacuumCapacity(p.state, chosen.node).free} more units.`,
          );
          break;
        }
        const generation = p.state.saveGeneration,
          zone = p.state.world.zone;
        setPhase('starting');
        const started = await p.mutate({
          type: 'startVacuum',
          nodeId: chosen.node.id,
          pieceId: chosen.piece.id,
          player: p.getPlayer(),
        });
        if (!started) {
          setFeedback('Extraction not started. Review the save status and retry.');
          break;
        }
        latest.current.state = started;
        const origin = started.world.extractionSession!.origin;
        const duration = vacuumDuration(
          Math.hypot(chosen.piece.x + 0.5 - origin.x, chosen.piece.y + 0.5 - origin.y),
        );
        const began = performance.now();
        let progress = 0;
        setPhase('attracting');
        while (held.current && mounted.current && progress < 1) {
          const live = latest.current,
            reason = vacuumEligibility(live.state, chosen.node, chosen.piece, live.getPlayer());
          if (
            live.state.saveGeneration !== generation ||
            live.state.world.zone !== zone ||
            reason !== 'AVAILABLE'
          ) {
            release();
            break;
          }
          progress = Math.min(1, (performance.now() - began) / duration);
          live.onVisual({ nodeId: chosen.node.id, pieceId: chosen.piece.id, progress, stage: 'attracting' });
          await pause(16);
        }
        if (!mounted.current) return;
        if (!held.current || progress < 1) {
          latest.current.onVisual(null);
          setPhase('canceling');
          if (latest.current.state.saveGeneration === generation && latest.current.state.world.zone === zone)
            await latest.current.mutate({ type: 'cancelVacuum' });
          setFeedback('Extraction stopped. Fragment remains on the ground.');
          break;
        }
        // Do not remove the visual or credit inventory until the server accepts this exact piece.
        setPhase('awaiting');
        latest.current.onVisual({
          nodeId: chosen.node.id,
          pieceId: chosen.piece.id,
          progress: 1,
          stage: 'awaiting',
        });
        const finished = await latest.current.mutate({
          type: 'finishVacuum',
          nodeId: chosen.node.id,
          pieceId: chosen.piece.id,
          player: latest.current.getPlayer(),
        });
        latest.current.onVisual(null);
        if (!finished) {
          setFeedback(
            'Collection unconfirmed or rejected. Ground state is preserved; review the save status.',
          );
          break;
        }
        latest.current.state = finished;
        setFeedback(`Collected ${chosen.piece.units} units.`);
        setPhase('retargeting');
        await pause(VACUUM_RETARGET_MS);
      }
    } finally {
      held.current = false;
      running.current = false;
      if (mounted.current) {
        latest.current.onVisual(null);
        setPhase('idle');
      }
    }
  };
  const piece = target?.piece,
    node = target?.node;
  const name =
    node && state.world.scanner.analyzed.includes(node.id)
      ? ORIGINAL_CONTENT.minerals.find((m) => m.id === node.ore)?.name
      : 'Unanalyzed mineral';
  const capacity = node ? vacuumCapacity(state, node) : null;
  const miningZone = ORIGINAL_CONTENT.zones.find((z) => z.id === state.world.zone)?.regionCount;
  if (!miningZone) return null;
  return (
    <section className="vacuumConsole" aria-label="Mining tool mode">
      <div className="toolModes">
        <button
          disabled={running.current || busy || !!state.world.miningSession}
          aria-pressed={mode === 'laser'}
          onClick={() => setMode('laser')}
        >
          Laser mode
        </button>
        <button
          disabled={running.current || busy || !!state.world.miningSession}
          aria-pressed={mode === 'extraction'}
          onClick={() => setMode('extraction')}
        >
          Extraction mode
        </button>
      </div>
      {mode === 'extraction' && (
        <>
          <div className="fragmentPrompt" role="status">
            {piece && node && nodeInZone(state, node) ? (
              <>
                <b>
                  {name} · {piece.units} units
                </b>
                <span>
                  {target.full
                    ? `Hold full. Free ${piece.units - (capacity?.free ?? 0)} more units.`
                    : 'Hold Vacuum · release to stop'}
                </span>
                <small>
                  Available hold: {capacity?.free} / {capacity?.capacity} units
                </small>
              </>
            ) : (
              <span>Move near a ground fragment with a clear line of sight.</span>
            )}
          </div>
          <button
            className="vacuumHold"
            aria-label="Hold Vacuum"
            aria-disabled={busy && !running.current}
            data-phase={phase}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.focus();
              e.currentTarget.setPointerCapture(e.pointerId);
              void start();
            }}
            onPointerMove={(e) => {
              if (e.buttons || e.pointerType === 'touch') {
                const b = e.currentTarget.getBoundingClientRect();
                if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
                  release();
              }
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
            onBlur={release}
            onKeyDown={(e) => {
              if ((e.code === 'Space' || e.code === 'KeyV') && !e.repeat) {
                e.preventDefault();
                void start();
              }
            }}
            onKeyUp={(e) => {
              if (e.code === 'Space' || e.code === 'KeyV') {
                e.preventDefault();
                release();
              }
            }}
          >
            {busy && !running.current
              ? 'Wait for save confirmation'
              : phase === 'retargeting'
                ? 'Acquiring next fragment…'
                : phase === 'awaiting'
                  ? 'Confirming collection…'
                  : 'Hold Vacuum'}
          </button>
          <small className="vacuumFeedback" role="status">
            {feedback || 'Hold Space, V, or the Vacuum control. No exact overlap needed.'}
          </small>
        </>
      )}
    </section>
  );
}
export function attractedPosition(ground: Point, player: Point, progress: number): Point {
  const center = fragmentCenter(ground),
    p = Math.max(0, Math.min(1, progress));
  return { x: center.x + (player.x - center.x) * p, y: center.y + (player.y - center.y) * p };
}
