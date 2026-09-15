import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import {
  acceptCollection,
  conservedUnits,
  initialState,
  NodeSpec,
  parameters,
  PIECE_RADIUS,
  SOURCE_RADIUS,
  tickMining,
} from './mining';
import './prototype.css';

const presets: Record<number, NodeSpec> = Object.fromEntries(
  [3, 4, 5, 6, 7, 8].map((count) => [
    count,
    {
      seed: 631 + count,
      rarity: 1,
      size: 1,
      mass: 2,
      instability: 28,
      yieldUnits: count === 3 ? 199 : 200 * (count - 2),
      fragility: 0,
    },
  ]),
) as Record<number, NodeSpec>;

const PREVIEW_KEY = 'dime-m4-synthetic-prototype-v1';
function restorePreview(): {
  spec: NodeSpec;
  game: ReturnType<typeof initialState>;
  preset: number;
  capacity: number;
} | null {
  try {
    const text = sessionStorage.getItem(PREVIEW_KEY);
    if (!text) return null;
    const value = JSON.parse(text) as {
      spec: NodeSpec;
      game: ReturnType<typeof initialState>;
      preset: number;
      capacity: number;
    };
    if (
      !presets[value.preset] ||
      !Array.isArray(value.game?.pieces) ||
      !Number.isSafeInteger(value.game?.heldUnits)
    )
      return null;
    const game =
      value.game.phase === 'charging'
        ? { ...value.game, phase: 'intact' as const, charge: 0, progress: 0 }
        : value.game;
    return { ...value, game };
  } catch {
    return null;
  }
}
const restored = restorePreview();

function Prototype() {
  const [piecePreset, setPiecePreset] = useState(restored?.preset ?? 3);
  const [spec, setSpec] = useState<NodeSpec>(restored?.spec ?? presets[3]!);
  const [game, setGame] = useState(restored?.game ?? initialState());
  const [mode, setMode] = useState<'laser' | 'extraction'>('laser');
  const [notice, setNotice] = useState('Hold the laser; release to cool and pulse inside the optimal band.');
  const [capacity, setCapacity] = useState(restored?.capacity ?? 1200);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [stress, setStress] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [vacuum, setVacuum] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const [held, setHeld] = useState(false);
  const [motionPreference, setMotionPreference] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const heldRef = useRef(false);
  const modeRef = useRef(mode);
  const gameRef = useRef(game);
  const specRef = useRef(spec);
  const vacuumRef = useRef<number | null>(null);
  const positionRef = useRef(0);
  const capacityRef = useRef(capacity);
  const stressRef = useRef(stress);
  const failNextRef = useRef(failNext);
  const counter = useRef(0);
  const renderCount = useRef(0);
  const savedSignature = useRef('');
  modeRef.current = mode;
  gameRef.current = game;
  specRef.current = spec;
  vacuumRef.current = vacuum;
  positionRef.current = position;
  capacityRef.current = capacity;
  stressRef.current = stress;
  failNextRef.current = failNext;

  useEffect(() => {
    const signature = `${game.phase}:${game.heldUnits}:${game.pieces.map((piece) => `${piece.id}-${piece.collected}`).join(',')}:${piecePreset}:${capacity}:${spec.seed}`;
    if (signature === savedSignature.current) return;
    savedSignature.current = signature;
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify({ spec, game, preset: piecePreset, capacity }));
  }, [spec, game, piecePreset, capacity]);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setMotionPreference(query.matches);
    change();
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const motionOff = reducedMotion || motionPreference;

  useEffect(() => {
    const stop = () => {
      heldRef.current = false;
      setHeld(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === 'Space') {
        event.preventDefault();
        heldRef.current = true;
        setHeld(true);
      }
      if (event.code === 'KeyM') {
        stop();
        setMode((value) => (value === 'laser' ? 'extraction' : 'laser'));
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', stop);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if ((modeRef.current === 'laser' && heldRef.current) || gameRef.current.charge > 0) {
        const previousPhase = gameRef.current.phase;
        const next = tickMining(
          gameRef.current,
          specRef.current,
          modeRef.current === 'laser' && heldRef.current,
          modeRef.current === 'laser',
        );
        gameRef.current = next;
        setGame(next);
        if (next.phase === 'fractured' && previousPhase !== 'fractured')
          setNotice('Fracture complete. Switch to Extraction and hold near a piece.');
        if (next.phase === 'destroyed') {
          heldRef.current = false;
          setHeld(false);
          setNotice('Overcharge: node destroyed. Zero yield.');
        }
      }
      if (modeRef.current === 'extraction' && heldRef.current && vacuumRef.current !== null) {
        const nextPosition = Math.min(1, positionRef.current + 0.07);
        positionRef.current = nextPosition;
        setPosition(nextPosition);
        if (nextPosition >= 1) {
          if (failNextRef.current) {
            failNextRef.current = false;
            setFailNext(false);
            setNotice('Synthetic network failure. Fragment remains available.');
            vacuumRef.current = null;
            setVacuum(null);
            setPosition(0);
            return;
          }
          const requestId = `synthetic-${++counter.current}`;
          const result = acceptCollection(gameRef.current, vacuumRef.current, requestId, capacityRef.current);
          gameRef.current = result.state;
          setGame(result.state);
          setNotice(
            result.code === 'FULL'
              ? 'Hold full. Fragment remains available.'
              : result.code === 'ACCEPTED'
                ? 'Fragment accepted into hold.'
                : 'Fragment unavailable.',
          );
          vacuumRef.current = null;
          setVacuum(null);
          setPosition(0);
        }
      }
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let frame = 0;
    const render = () => {
      const started = performance.now();
      const element = canvas.current;
      const context = element?.getContext('2d');
      if (!element || !context) return;
      const width = element.width;
      const height = element.height;
      const current = gameRef.current;
      const target = { x: width * 0.57, y: height * 0.37 };
      const player = { x: width * 0.44, y: height * 0.7 };
      context.fillStyle = '#101c22';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#263a3d';
      for (let y = 0; y < height; y += 28)
        for (let x = 0; x < width; x += 28) context.fillRect(x + 2, y + 2, 23, 23);
      context.fillStyle = '#75c4b5';
      context.fillRect(player.x - 9, player.y - 13, 18, 21);
      context.fillStyle = '#dceee4';
      context.fillRect(player.x - 4, player.y - 19, 8, 8);
      if (current.phase === 'intact' || current.phase === 'charging') {
        context.fillStyle = current.charge >= 800 ? '#e18865' : '#aac4b6';
        context.beginPath();
        context.arc(target.x, target.y, SOURCE_RADIUS, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#38575a';
        context.lineWidth = 3;
        context.stroke();
      }
      if (
        modeRef.current === 'laser' &&
        heldRef.current &&
        current.phase !== 'destroyed' &&
        current.phase !== 'fractured'
      ) {
        context.strokeStyle = '#9ce7d2';
        context.lineWidth = motionOff ? 2 : 2 + (renderCount.current % 3);
        context.beginPath();
        context.moveTo(player.x, player.y - 8);
        context.lineTo(target.x, target.y);
        context.stroke();
        context.fillStyle = '#f5e0a5';
        context.beginPath();
        context.arc(target.x, target.y, 4, 0, Math.PI * 2);
        context.fill();
        if (!motionOff)
          for (let n = 0; n < 8; n++) {
            const angle = (n * 2 * Math.PI) / 8 + renderCount.current * 0.02;
            context.fillRect(target.x + Math.cos(angle) * 9, target.y + Math.sin(angle) * 9, 2, 2);
          }
      }
      current.pieces
        .filter((piece) => !piece.collected)
        .forEach((piece) => {
          const x = width * piece.x;
          const y = height * piece.y;
          const active = vacuumRef.current === piece.id;
          const fraction = active ? positionRef.current : 0;
          const px = x + (player.x - x) * fraction;
          const py = y + (player.y - y) * fraction;
          if (active && heldRef.current) {
            context.strokeStyle = '#77d8d1';
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(player.x, player.y);
            context.lineTo(px, py);
            context.stroke();
          }
          context.fillStyle = '#e6c77c';
          context.beginPath();
          context.arc(px, py, PIECE_RADIUS, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#152222';
          context.fillRect(px - 2, py - 2, 4, 4);
        });
      if (stressRef.current && !motionOff) {
        context.fillStyle = '#8dd8c0';
        for (let n = 0; n < 96; n++) {
          const angle = n * 2.39996 + renderCount.current * 0.004;
          const radius = 8 + (n % 12) * 3;
          context.fillRect(target.x + Math.cos(angle) * radius, target.y + Math.sin(angle) * radius, 2, 2);
        }
      }
      if (stressRef.current) {
        const target = window as Window & { __m4RenderTimings?: number[] };
        const timings = target.__m4RenderTimings ?? (target.__m4RenderTimings = []);
        timings.push(performance.now() - started);
        if (timings.length > 500) timings.shift();
      }
      renderCount.current++;
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [motionOff]);

  const reset = (count: number) => {
    heldRef.current = false;
    setHeld(false);
    setVacuum(null);
    setPosition(0);
    setPiecePreset(count);
    setSpec(presets[count]!);
    setGame(initialState());
    setMode('laser');
    setNotice('New Garnet node. Hold laser and pulse in band.');
  };
  const p = parameters(spec);
  const showHud = game.phase !== 'intact' || held || vacuum !== null;
  return (
    <main className="prototype">
      <header>
        <strong>Destroya Industries · mining study</strong>
        <small>Development-only · synthetic state</small>
      </header>
      <div className="playfield">
        <canvas ref={canvas} width="480" height="320" aria-label="Original programmatic mining scene" />
        <div className="sceneLabel">Loam Crescent · Garnet field</div>
      </div>
      {showHud && (
        <section className="hud" aria-label="Mining HUD">
          <div className="hudTop">
            <strong>Charge {Math.round(game.charge / 10)}%</strong>
            <span>
              {game.phase === 'destroyed'
                ? 'NODE DESTROYED'
                : game.charge >= 800
                  ? 'DANGER · release'
                  : `Optimal ${Math.round(p.lower / 10)}–${Math.round(p.upper / 10)}%`}
            </span>
          </div>
          <div className="meter" aria-label="Charge meter">
            <div
              className="band"
              style={{ left: `${p.lower / 10}%`, width: `${(p.upper - p.lower) / 10}%` }}
            />
            <div className="danger" />
            <div className="needle" style={{ left: `${game.charge / 10}%` }} />
          </div>
          <div className="hudBottom">
            <span>
              Stable hold {game.progress}/{p.stableTicks}
            </span>
            <span>
              Integrity {game.phase === 'intact' || game.phase === 'charging' ? '100' : '0'} · Instability{' '}
              {spec.instability} · Size {spec.size}
            </span>
          </div>
          <small>
            {mode === 'laser'
              ? 'Laser · hold / pulse; release to cool'
              : 'Extraction · select fragment, then hold'}
          </small>
        </section>
      )}
      <div className="notice" role="status">
        {notice}
      </div>
      <p className="catalogNotice">
        Material names are real. Availability, rarity, value and Destroya Industries processing compatibility
        are fictional game rules.
      </p>
      <div className="controls">
        <button
          type="button"
          aria-label="Switch tool mode"
          onClick={() => {
            heldRef.current = false;
            setHeld(false);
            setMode(mode === 'laser' ? 'extraction' : 'laser');
          }}
        >
          Mode: {mode === 'laser' ? 'Laser' : 'Extraction'}
        </button>
        <button
          type="button"
          aria-label="Hold mining control"
          onPointerDown={(event) => {
            if (event.nativeEvent.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
            heldRef.current = true;
            setHeld(true);
          }}
          onPointerUp={() => {
            heldRef.current = false;
            setHeld(false);
          }}
          onPointerCancel={() => {
            heldRef.current = false;
            setHeld(false);
          }}
        >
          Hold {mode === 'laser' ? 'laser' : 'vacuum'} · Space
        </button>
      </div>
      <div className="settings">
        <label>
          Piece fixture{' '}
          <select
            aria-label="Piece fixture"
            value={piecePreset}
            onChange={(event) => reset(Number(event.target.value))}
          >
            {[3, 4, 5, 6, 7, 8].map((count) => (
              <option key={count} value={count}>
                {count} pieces
              </option>
            ))}
          </select>
        </label>
        <label>
          Hold capacity{' '}
          <input
            aria-label="Hold capacity"
            type="number"
            min="0"
            value={capacity}
            onChange={(event) => setCapacity(Math.max(0, Number(event.target.value)))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => setReducedMotion(event.target.checked)}
          />{' '}
          Reduced motion
        </label>
        <label>
          <input type="checkbox" checked={stress} onChange={(event) => setStress(event.target.checked)} />{' '}
          96-particle stress
        </label>
        <label>
          <input type="checkbox" checked={failNext} onChange={(event) => setFailNext(event.target.checked)} />{' '}
          Fail next collection
        </label>
        <button type="button" onClick={() => reset(piecePreset)}>
          Reset node
        </button>
      </div>
      {game.pieces.length > 0 && (
        <div className="pieces" aria-label="Ground pieces">
          {game.pieces.map((piece) => (
            <button
              key={piece.id}
              type="button"
              disabled={piece.collected || mode !== 'extraction'}
              onClick={() => {
                setVacuum(piece.id);
                setPosition(0);
                setNotice('Vacuum drawing fragment. Hold until it reaches the tool.');
              }}
            >
              {piece.collected
                ? 'Collected'
                : `Fragment ${piece.id + 1} · ${(piece.units / 100).toFixed(2)} cSCU`}
            </button>
          ))}
        </div>
      )}
      <footer>
        Hold {game.heldUnits}/{capacity} units · Conservation{' '}
        {game.phase === 'fractured' || game.phase === 'depleted' || game.phase === 'destroyed'
          ? conservedUnits(game, spec)
          : 'pending'}{' '}
        / {spec.yieldUnits} · {game.phase}
      </footer>
    </main>
  );
}

if (!import.meta.env.DEV) throw new Error('The mining prototype is available only in development.');
createRoot(document.getElementById('prototype-root')!).render(<Prototype />);
