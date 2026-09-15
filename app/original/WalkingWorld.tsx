import { useEffect, useMemo, useRef } from 'react';
import { originalZoneMap } from '../../shared/originalWorld';
import { nodeInZone } from '../../shared/originalVacuum';
import { forwardNodeCandidates, pointedNode, type Facing } from '../../shared/originalNodeTargeting';
import { drawNodeFormation } from './nodeArt';
import type { ToolMode } from './VacuumConsole';
import type { OriginalPlayerState } from '../../shared/originalSchema';
import { drawMineralFragment } from './fragmentArt';
import { attractedPosition, type VacuumVisual } from './VacuumConsole';
import { arrivalPosition, walk, type Position, type WalkingInput } from './walking';
type Direction = keyof WalkingInput;
const directions: Record<string, Direction | undefined> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};
export function WalkingWorld({
  state,
  paused,
  onPosition,
  onTarget,
  target,
  marker,
  vacuum,
  fragmentTarget,
  mode,
}: {
  mode: ToolMode;
  state: OriginalPlayerState;
  paused: boolean;
  onPosition: (position: Position) => void;
  onTarget: (id: string) => void;
  target: string;
  marker?: Position;
  vacuum?: VacuumVisual | null;
  fragmentTarget?: { nodeId: string; pieceId: string } | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    keys = useRef(new Set<string>()),
    touch = useRef(new Map<number, Direction>());
  const latest = useRef({
    state,
    paused,
    onPosition,
    onTarget,
    target,
    marker,
    vacuum,
    fragmentTarget,
    mode,
  });
  latest.current = { state, paused, onPosition, onTarget, target, marker, vacuum, fragmentTarget, mode };
  const map = useMemo(() => originalZoneMap(state.world.zone), [state.world.zone]);
  const position = useRef(arrivalPosition(map, state.world.entry)),
    camera = useRef({ x: 0, y: 0, scale: 24 });
  const clear = () => {
    keys.current.clear();
    touch.current.clear();
  };
  useEffect(() => {
    if (paused) {
      keys.current.clear();
      touch.current.clear();
    }
  }, [paused]);
  useEffect(() => {
    const element = canvas.current!,
      context = element.getContext('2d');
    if (!context) return;
    position.current = arrivalPosition(map, latest.current.state.world.entry);
    latest.current.onPosition(position.current);
    keys.current.clear();
    touch.current.clear();
    const incoming = map.exits.find((exit) => `from:${exit.to}` === latest.current.state.world.entry);
    let facing: Facing = incoming ? ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[incoming.facing] : 'S';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      last = 0,
      lastTargetTime = 0,
      lastTargetPosition = { x: -1, y: -1 },
      lastMode = latest.current.mode;
    const down = (event: KeyboardEvent) => {
      if (
        !directions[event.code] ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        latest.current.paused ||
        document.hidden
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      event.preventDefault();
      keys.current.add(event.code);
    };
    const up = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
    };
    const reset = () => {
      keys.current.clear();
      touch.current.clear();
      last = 0;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    const draw = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const input: WalkingInput = { up: false, down: false, left: false, right: false };
      if (!latest.current.paused && !document.hidden) {
        for (const key of keys.current) {
          const d = directions[key];
          if (d) input[d] = true;
        }
        for (const d of touch.current.values()) input[d] = true;
      }
      if (input.right) facing = 'E';
      else if (input.left) facing = 'W';
      else if (input.up) facing = 'N';
      else if (input.down) facing = 'S';
      position.current = walk(map, position.current, input, dt);
      latest.current.onPosition(position.current);
      if (now - lastTargetTime > 100) {
        lastTargetTime = now;
        const current = latest.current,
          selected = current.state.world.nodes[current.target];
        const moved =
          Math.hypot(position.current.x - lastTargetPosition.x, position.current.y - lastTargetPosition.y) >
          0.15;
        if (current.mode === 'laser' && !current.state.world.miningSession) {
          if (moved || lastMode !== current.mode || !selected || selected.status !== 'INTACT') {
            const next = forwardNodeCandidates(current.state, position.current, facing)[0]?.node;
            if (next && next.id !== current.target) current.onTarget(next.id);
            else if (selected && (selected.status !== 'INTACT' || !nodeInZone(current.state, selected)))
              current.onTarget('');
          }
        }
        lastTargetPosition = { ...position.current };
        lastMode = current.mode;
      }

      const bounds = element.getBoundingClientRect(),
        ratio = Math.min(window.devicePixelRatio || 1, 2),
        width = Math.max(1, bounds.width),
        height = Math.max(1, bounds.height);
      if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const scale = 24,
        cx = Math.max(0, Math.min(map.width - width / scale, position.current.x - width / scale / 2)),
        cy = Math.max(0, Math.min(map.height - height / scale, position.current.y - height / scale / 2));
      camera.current = { x: cx, y: cy, scale };
      context.fillStyle = '#071116';
      context.fillRect(0, 0, width, height);
      for (let y = Math.max(0, Math.floor(cy)); y < Math.min(map.height, cy + height / scale + 1); y++)
        for (let x = Math.max(0, Math.floor(cx)); x < Math.min(map.width, cx + width / scale + 1); x++) {
          context.fillStyle = ['#0b171d', '#273c40', '#4e6e66'][map.tiles[y * map.width + x]!]!;
          context.fillRect((x - cx) * scale, (y - cy) * scale, scale, scale);
        }
      for (const exit of map.exits) {
        context.fillStyle = '#d3ad68';
        context.fillRect((exit.x - cx) * scale + 3, (exit.y - cy) * scale + 3, 18, 18);
      }
      for (const service of map.services) {
        context.fillStyle = '#8bbaf4';
        context.fillRect((service.x - cx) * scale + 5, (service.y - cy) * scale + 5, 14, 14);
      }
      const objective = latest.current.marker;
      if (objective) {
        const mx = Math.max(9, Math.min(width - 9, (objective.x + 0.5 - cx) * scale)),
          my = Math.max(9, Math.min(height - 9, (objective.y + 0.5 - cy) * scale));
        context.strokeStyle = '#fff19a';
        context.lineWidth = 2;
        context.strokeRect(mx - 7, my - 7, 14, 14);
      }
      let visiblePieces = 0;
      for (const node of Object.values(latest.current.state.world.nodes)) {
        if (!nodeInZone(latest.current.state, node)) continue;
        if (node.status === 'INTACT') {
          drawNodeFormation(
            context,
            (node.x + 0.5 - cx) * scale,
            (node.y + 0.5 - cy) * scale,
            node.size,
            latest.current.state.world.scanner.analyzed.includes(node.id) ? node.ore : undefined,
            latest.current.mode === 'laser' && node.id === latest.current.target,
            latest.current.state.world.miningSession?.nodeId === node.id,
            now,
            reduced.matches,
          );
        }
        for (const piece of node.fragments)
          if (!piece.collected) {
            visiblePieces++;
            const active =
              latest.current.vacuum?.nodeId === node.id && latest.current.vacuum.pieceId === piece.id
                ? latest.current.vacuum
                : null;
            const point = attractedPosition(piece, position.current, active?.progress ?? 0);
            if (active) {
              context.strokeStyle = '#adf1dc';
              context.lineWidth = 2;
              context.beginPath();
              context.moveTo((position.current.x - cx) * scale, (position.current.y - cy) * scale);
              context.lineTo((point.x - cx) * scale, (point.y - cy) * scale);
              context.stroke();
            }
            drawMineralFragment(
              context,
              (point.x - cx) * scale,
              (point.y - cy) * scale,
              node.ore,
              latest.current.fragmentTarget?.pieceId === piece.id,
              now,
              reduced.matches,
            );
          }
      }
      const px = (position.current.x - cx) * scale,
        py = (position.current.y - cy) * scale;
      context.fillStyle = '#f0d782';
      context.fillRect(px - 4, py - 9, 8, 7);
      context.fillStyle = '#91d8c0';
      context.fillRect(px - 5, py - 2, 10, 9);
      context.fillStyle = '#d5ebe0';
      context.fillRect(px - 4, py + 7, 3, 5);
      context.fillRect(px + 1, py + 7, 3, 5);
      const facingVector = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[facing]!;
      context.fillStyle = '#ffffff';
      context.fillRect(px + facingVector[0]! * 8 - 1, py + facingVector[1]! * 8 - 1, 3, 3);
      element.dataset.fragments = String(visiblePieces);
      element.dataset.vacuumProgress = String(latest.current.vacuum?.progress ?? 0);
      element.dataset.vacuumStage = latest.current.vacuum?.stage ?? 'idle';
      element.dataset.fragmentArt = 'pixel-shards';
      element.dataset.nodeArt = 'pixel-formations';
      element.dataset.nodeTarget = latest.current.mode === 'laser' ? latest.current.target : '';
      element.dataset.playerX = position.current.x.toFixed(3);
      element.dataset.playerY = position.current.y.toFixed(3);
      element.dataset.cameraX = cx.toFixed(3);
      element.dataset.cameraY = cy.toFixed(3);
      element.dataset.zone = map.id;
      element.dataset.facing = facing;
      element.dataset.paused = String(latest.current.paused);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      reset();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [map, state.saveGeneration]);
  return (
    <>
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label={`${map.name} local map. Move with WASD, arrow keys or directional controls.`}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          if (paused) return;
          const rect = event.currentTarget.getBoundingClientRect(),
            view = camera.current,
            x = (event.clientX - rect.left) / view.scale + view.x,
            y = (event.clientY - rect.top) / view.scale + view.y;
          const node = mode === 'laser' ? pointedNode(state, { x, y }, view.scale) : undefined;
          if (node) onTarget(node.id);
        }}
      />
      <div className="walkingControls" aria-label="Walking controls">
        {(['up', 'left', 'down', 'right'] as const).map((direction) => (
          <button
            key={direction}
            aria-label={`Walk ${direction}`}
            disabled={paused}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              touch.current.set(event.pointerId, direction);
            }}
            onPointerUp={(event) => touch.current.delete(event.pointerId)}
            onPointerCancel={(event) => touch.current.delete(event.pointerId)}
            onLostPointerCapture={(event) => touch.current.delete(event.pointerId)}
            onBlur={clear}
          >
            {{ up: '↑', left: '←', down: '↓', right: '→' }[direction]}
          </button>
        ))}
      </div>
    </>
  );
}
