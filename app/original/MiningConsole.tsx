import { emitGameAudio } from './audioEvents';
import { useEffect, useRef, useState } from 'react';
import type { OriginalPlayerState } from '../../shared/originalSchema';
import {
  initialState,
  parameters,
  tickMining,
  type MiningState,
  type PulseRun,
} from '../../shared/continuousMining';
import { originalNodeSpec } from '../../shared/originalMining';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import type { Position } from './walking';
import type { ToolMode } from './VacuumConsole';
import { nodeInZone } from '../../shared/originalVacuum';
import { nodeTargetStatus, nodeToolRange } from '../../shared/originalNodeTargeting';

export type LaserVisual = {
  nodeId: string;
  held: boolean;
  charge: number;
  progress: number;
  lower: number;
  upper: number;
  stable: number;
};
type Props = {
  onVisual?: (visual: LaserVisual | null) => void;
  state: OriginalPlayerState;
  busy: boolean;
  mode: ToolMode;
  getPlayer: () => Position;
  target: string;
  onTarget: (id: string) => void;
  mutate: (action: Record<string, unknown>) => Promise<OriginalPlayerState | null>;
};
export function MiningConsole({ state, busy, mode, mutate, getPlayer, target, onTarget, onVisual }: Props) {
  const nodes = Object.values(state.world.nodes).filter(
    (node) => nodeInZone(state, node) && node.status === 'INTACT',
  );
  const selected =
    state.world.miningSession?.nodeId ??
    (nodes.some((node) => node.id === target) ? target : (nodes[0]?.id ?? ''));
  const setSelected = onTarget;
  const [sim, setSim] = useState<MiningState>(initialState());
  const [held, setHeld] = useState(false);
  const [outcome, setOutcome] = useState('');
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(''), 8000);
    return () => clearTimeout(timer);
  }, [outcome]);
  const [runs, setRuns] = useState<PulseRun[]>([]);
  const runsRef = useRef<PulseRun[]>([]);
  runsRef.current = runs;
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const resolving = useRef(false);
  const node = state.world.nodes[selected];
  const spec = node ? originalNodeSpec(node) : null;
  const specRef = useRef(spec);
  specRef.current = spec;
  const [rangeStatus, setRangeStatus] = useState('Move closer');
  useEffect(() => {
    const timer = setInterval(
      () => setRangeStatus(node ? nodeTargetStatus(state, node, getPlayer()) : 'Move closer'),
      100,
    );
    return () => clearInterval(timer);
  }, [state, node, getPlayer]);
  const analyzed = !!node && state.world.scanner.analyzed.includes(node.id);
  useEffect(() => {
    const release = () => {
      setHeld(false);
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, []);
  useEffect(() => {
    if (busy || !state.world.miningSession || !specRef.current || resolving.current) return;
    const timer = setInterval(
      () =>
        setSim((value) => {
          const next = tickMining(value, specRef.current!, held, true),
            items = runsRef.current,
            last = items.at(-1);
          const trace: PulseRun[] =
            last?.held === held
              ? [...items.slice(0, -1), { held, ticks: last.ticks + 1 }]
              : [...items, { held, ticks: 1 }];
          runsRef.current = trace;
          setRuns(trace);
          if (['fractured', 'destroyed'].includes(next.phase)) {
            resolving.current = true;
            setHeld(false);
            queueMicrotask(async () => {
              const result = await mutateRef.current({ type: 'resolveLaser', runs: runsRef.current });
              if (
                result &&
                Object.values(result.world.nodes).some((n) => n.id === selected && n.status === 'DESTROYED')
              )
                setOutcome('Overcharge destroyed this node. Zero yield; respawn pending.');
              resolving.current = false;
              runsRef.current = [];
              setRuns([]);
            });
          }
          return next;
        }),
      50,
    );
    return () => clearInterval(timer);
  }, [state.world.miningSession, held, spec?.seed, busy, selected]);
  useEffect(() => {
    const config = specRef.current ? parameters(specRef.current) : null;
    onVisual?.(
      state.world.miningSession && config
        ? {
            nodeId: selected,
            held,
            charge: sim.charge,
            progress: sim.progress,
            lower: config.lower,
            upper: config.upper,
            stable: config.stableTicks,
          }
        : null,
    );
  }, [onVisual, state.world.miningSession, selected, held, sim.charge, sim.progress]);
  useEffect(() => {
    if (held) emitGameAudio('laser');
  }, [held]);
  const chargeBand = !spec
    ? 'idle'
    : sim.charge > parameters(spec).upper
      ? 'danger'
      : sim.charge >= parameters(spec).lower
        ? 'optimal'
        : 'charging';
  useEffect(() => {
    if (chargeBand === 'optimal' || chargeBand === 'danger') emitGameAudio(chargeBand);
  }, [chargeBand]);
  const start = async () => {
    if (!node) return;
    const next = await mutate({
      type: 'startLaser',
      nodeId: node.id,
      player: getPlayer(),
    });
    if (next) {
      setOutcome('');
      setSim(initialState());
      runsRef.current = [];
      setRuns([]);
    }
  };
  const keyboardAction = useRef<() => void>(() => {});
  keyboardAction.current = () => {
    if (busy || mode !== 'laser' || document.querySelector('.originalApp[data-menu="true"]')) return;
    if (state.world.miningSession) setHeld(true);
    else if (rangeStatus === 'In range') document.querySelector<HTMLButtonElement>('.primaryMine')?.click();
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat && event.target instanceof HTMLCanvasElement) {
        event.preventDefault();
        keyboardAction.current();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  if (mode !== 'laser') return null;
  if (!ORIGINAL_CONTENT.zones.find((item) => item.id === state.world.zone)?.regionCount) return null;
  const p = spec ? parameters(spec) : null;
  return (
    <section
      className="miningConsole"
      data-near={rangeStatus === 'In range'}
      data-active={!!state.world.miningSession}
    >
      <div className="scannerHeading">
        <b>{node?.status === 'FRACTURED' ? 'MODE: EXTRACTION' : 'MODE: LASER'} · FIELD SCANNER</b>
        <button disabled={busy} onClick={() => void mutate({ type: 'scan' })}>
          Ping signatures
        </button>
      </div>
      {state.world.miningSession && (
        <button
          disabled={busy}
          onClick={() => {
            setHeld(false);
            void mutate({ type: 'cancelLaser' });
          }}
        >
          Stop laser without yield
        </button>
      )}
      {nodes.length > 0 && !state.world.miningSession && (
        <select
          disabled={busy || !!state.world.miningSession || !!state.world.extractionSession}
          aria-label="Nearby signature"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {nodes.map((item, index) => (
            <option key={item.id} value={item.id}>
              {state.world.scanner.analyzed.includes(item.id)
                ? ORIGINAL_CONTENT.minerals.find((x) => x.id === item.ore)?.name
                : `Signature ${index + 1}`}
            </option>
          ))}
        </select>
      )}
      {node && (
        <div className="nodeTargetStatus" role="status">
          {rangeStatus}
          {!nodeToolRange(state, node) && ' · Requires occupied Crawl Rig'}
        </div>
      )}
      {node && !analyzed && (
        <button
          className="primaryMine"
          disabled={busy}
          onClick={async () => {
            const scanned = state.world.scanner.scannedZones?.includes(state.world.zone)
              ? state
              : await mutate({ type: 'scan' });
            if (!scanned || scanned.saveGeneration !== state.saveGeneration) return;
            const next = await mutate({ type: 'analyze', nodeId: node.id });
            if (!next || next.saveGeneration !== state.saveGeneration) return;
            setOutcome('');
            setSim(initialState());
            runsRef.current = [];
            setRuns([]);
            await mutate({ type: 'startLaser', nodeId: node.id, player: getPlayer() });
          }}
        >
          Mine
        </button>
      )}
      {node && !analyzed && (
        <button disabled={busy} onClick={() => void mutate({ type: 'analyze', nodeId: node.id })}>
          Analyze selected signature
        </button>
      )}
      {node && analyzed && node.status === 'INTACT' && (
        <>
          <p className="nodeDetails">
            {ORIGINAL_CONTENT.minerals.find((x) => x.id === node.ore)?.name} · size {node.size} · instability{' '}
            {Math.round(node.instability * 100)}
          </p>
          {!state.world.miningSession ? (
            <button
              className="primaryMine"
              aria-label="Target node"
              disabled={busy}
              onClick={() => void start()}
            >
              Mine
            </button>
          ) : (
            <>
              <div
                className="charge"
                role="meter"
                aria-label="Node charge"
                aria-valuenow={sim.charge}
                aria-valuemin={0}
                aria-valuemax={1000}
                data-band={
                  sim.charge > (p?.upper ?? 1000)
                    ? 'danger'
                    : sim.charge >= (p?.lower ?? 1000)
                      ? 'optimal'
                      : 'charging'
                }
              >
                <i style={{ width: `${sim.charge / 10}%` }} />
                <em
                  style={{
                    left: `${(p?.lower ?? 0) / 10}%`,
                    width: `${((p?.upper ?? 0) - (p?.lower ?? 0)) / 10}%`,
                  }}
                />
              </div>
              <button
                className="laserHold"
                aria-label="Hold laser · release to cool"
                disabled={busy}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setHeld(true);
                }}
                onPointerUp={() => setHeld(false)}
                onPointerCancel={() => setHeld(false)}
                onLostPointerCapture={() => setHeld(false)}
                onKeyDown={(event) => {
                  if (event.code === 'Space') {
                    event.preventDefault();
                    setHeld(true);
                  }
                }}
                onKeyUp={(event) => {
                  if (event.code === 'Space') {
                    event.preventDefault();
                    setHeld(false);
                  }
                }}
                onBlur={() => setHeld(false)}
              >
                Mine
              </button>
              {held && (
                <div className="beamEffect" aria-label="Laser active">
                  <i />
                  <b>IMPACT</b>
                </div>
              )}
              <small>
                Stable {sim.progress}/{p?.stableTicks} ·{' '}
                {sim.charge > (p?.upper ?? 1000)
                  ? '⚠ Danger — release'
                  : sim.charge >= (p?.lower ?? 1000)
                    ? '◆ Optimal'
                    : '↑ Charging'}
              </small>
            </>
          )}
        </>
      )}
      {outcome && (
        <p className="miningOutcome" role="status">
          {outcome}
        </p>
      )}
    </section>
  );
}
