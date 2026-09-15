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
import { FIRST_CONTRACT_NODE } from '../../shared/originalQuest';

type Props = {
  state: OriginalPlayerState;
  busy: boolean;
  getPlayer: () => Position;
  target: string;
  onTarget: (id: string) => void;
  mutate: (action: Record<string, unknown>) => Promise<OriginalPlayerState | null>;
};
export function MiningConsole({ state, busy, mutate, getPlayer, target, onTarget }: Props) {
  const nodes = Object.values(state.world.nodes).filter(
    (node) =>
      node.id.startsWith(`${state.world.zone}.node.`) ||
      (state.world.zone === 'zone.z014' && node.id === FIRST_CONTRACT_NODE),
  );
  const selected = nodes.some((node) => node.id === target) ? target : (nodes[0]?.id ?? '');
  const setSelected = onTarget;
  const [sim, setSim] = useState<MiningState>(initialState());
  const [held, setHeld] = useState(false);
  const [vacuuming, setVacuuming] = useState(false);
  const [runs, setRuns] = useState<PulseRun[]>([]);
  const runsRef = useRef<PulseRun[]>([]);
  runsRef.current = runs;
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const resolving = useRef(false);
  const extractionHeld = useRef(false);
  const node = state.world.nodes[selected];
  const spec = node ? originalNodeSpec(node) : null;
  const specRef = useRef(spec);
  specRef.current = spec;
  const analyzed = !!node && state.world.scanner.analyzed.includes(node.id);
  useEffect(() => {
    const release = () => {
      setHeld(false);
      extractionHeld.current = false;
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, []);
  useEffect(() => {
    if (!state.world.miningSession || !specRef.current || resolving.current) return;
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
              await mutateRef.current({ type: 'resolveLaser', runs: runsRef.current });
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
  }, [state.world.miningSession, held, spec?.seed]);
  const start = async () => {
    if (!node) return;
    const next = await mutate({
      type: 'startLaser',
      nodeId: node.id,
      player: getPlayer(),
    });
    if (next) {
      setSim(initialState());
      runsRef.current = [];
      setRuns([]);
    }
  };
  const vacuum = async (pieceId: string) => {
    if (!node) return;
    const piece = node.fragments.find((x) => x.id === pieceId);
    if (!piece) return;
    const player = getPlayer();
    const started = await mutate({ type: 'startVacuum', nodeId: node.id, pieceId, player });
    if (!started) return;
    setVacuuming(true);
    const travelMs = 250 + Math.ceil(Math.hypot(piece.x + 0.5 - player.x, piece.y + 0.5 - player.y) * 200);
    await new Promise((resolve) => setTimeout(resolve, travelMs));
    if (extractionHeld.current)
      await mutateRef.current({ type: 'finishVacuum', nodeId: node.id, pieceId, player });
    else await mutateRef.current({ type: 'cancelVacuum' });
    setVacuuming(false);
  };
  if (!ORIGINAL_CONTENT.zones.find((item) => item.id === state.world.zone)?.regionCount) return null;
  const p = spec ? parameters(spec) : null;
  return (
    <section className="miningConsole">
      <div>
        <b>{node?.status === 'FRACTURED' ? 'MODE: EXTRACTION' : 'MODE: LASER'} · FIELD SCANNER</b>
        <button disabled={busy} onClick={() => void mutate({ type: 'scan' })}>
          Ping signatures
        </button>
      </div>
      {nodes.length > 0 && (
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
      {node && !analyzed && (
        <button disabled={busy} onClick={() => void mutate({ type: 'analyze', nodeId: node.id })}>
          Analyze selected signature
        </button>
      )}
      {node && analyzed && node.status === 'INTACT' && (
        <>
          <p>
            {ORIGINAL_CONTENT.minerals.find((x) => x.id === node.ore)?.name} · size {node.size} · instability{' '}
            {Math.round(node.instability * 100)}
          </p>
          {!state.world.miningSession ? (
            <button disabled={busy} onClick={() => void start()}>
              Target node
            </button>
          ) : (
            <>
              <div className="charge">
                <i style={{ width: `${sim.charge / 10}%` }} />
                <em
                  style={{
                    left: `${(p?.lower ?? 0) / 10}%`,
                    width: `${((p?.upper ?? 0) - (p?.lower ?? 0)) / 10}%`,
                  }}
                />
              </div>
              <button
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
                Hold laser · release to cool
              </button>
              {held && (
                <div className="beamEffect" aria-label="Laser active">
                  <i />
                  <b>IMPACT</b>
                </div>
              )}
              <small>
                Stable {sim.progress}/{p?.stableTicks} · {sim.phase}
              </small>
            </>
          )}
        </>
      )}
      {node?.status === 'FRACTURED' && (
        <div className="fragments">
          {node.fragments
            .filter((x) => !x.collected)
            .map((piece) => (
              <button
                key={piece.id}
                disabled={busy}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  extractionHeld.current = true;
                  void vacuum(piece.id);
                }}
                onPointerUp={() => (extractionHeld.current = false)}
                onPointerCancel={() => (extractionHeld.current = false)}
                onLostPointerCapture={() => (extractionHeld.current = false)}
                onBlur={() => (extractionHeld.current = false)}
                onKeyDown={(event) => {
                  if (event.code === 'Space' && !event.repeat) {
                    event.preventDefault();
                    extractionHeld.current = true;
                    void vacuum(piece.id);
                  }
                }}
                onKeyUp={(event) => {
                  if (event.code === 'Space' && !event.repeat) {
                    event.preventDefault();
                    extractionHeld.current = false;
                  }
                }}
              >
                Vacuum {piece.units} units
              </button>
            ))}
        </div>
      )}
      {vacuuming && (
        <div className="vacuumEffect" role="status">
          EXTRACTION FIELD · drawing fragment
        </div>
      )}
      {node?.status === 'DESTROYED' && <p>Overcharge destroyed this node. Zero yield; respawn pending.</p>}
    </section>
  );
}
