import type { LaserVisual } from './MiningConsole';
import { emitGameAudio } from './audioEvents';
import {
  sceneCamera,
  settledFragmentPosition,
  drawTerrain,
  drawExit,
  drawService,
  drawWorker,
  SCENE_PALETTES,
  ART_LIMITS,
  artHash,
} from './sceneArt';
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
  laser,
  vacuum,
  fragmentTarget,
  mode,
}: {
  laser?: LaserVisual | null;
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
    laser,
    vacuum,
    fragmentTarget,
    mode,
  });
  latest.current = {
    state,
    paused,
    onPosition,
    onTarget,
    target,
    marker,
    laser,
    vacuum,
    fragmentTarget,
    mode,
  };
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
      lastFootstep = 0,
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
    let previousNodes: Record<string, string> | null = null;
    let bursts: Array<{ x: number; y: number; born: number; destroyed: boolean }> = [];
    let settling = new Map<string, { x: number; y: number; born: number }>();
    emitGameAudio('transit');
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
      if (Object.values(input).some(Boolean) && now - lastFootstep > 300) {
        emitGameAudio('footstep');
        lastFootstep = now;
      }
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
      const { scale, x: cx, y: cy } = sceneCamera(map, width, height, position.current);
      camera.current = { x: cx, y: cy, scale };
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#071116';
      context.fillRect(0, 0, width, height);
      const at = (x: number, y: number, paint: () => void) => {
        context.save();
        context.translate(Math.round((x - cx) * scale), Math.round((y - cy) * scale));
        context.scale(scale / 24, scale / 24);
        paint();
        context.restore();
      };
      for (let y = Math.max(0, Math.floor(cy)); y < Math.min(map.height, cy + height / scale + 1); y++)
        for (let x = Math.max(0, Math.floor(cx)); x < Math.min(map.width, cx + width / scale + 1); x++)
          at(x, y, () => drawTerrain(context, map, x, y));
      const accent = SCENE_PALETTES[map.palette].accent;
      for (const exit of map.exits)
        at(exit.x + 0.5, exit.y + 0.5, () => drawExit(context, exit.facing, accent));
      const actors: Array<{ y: number; draw: () => void }> = [];
      for (let y = Math.max(0, Math.floor(cy)); y < Math.min(map.height, cy + height / scale + 1); y++)
        for (let x = Math.max(0, Math.floor(cx)); x < Math.min(map.width, cx + width / scale + 1); x++)
          if (!map.tiles[y * map.width + x])
            actors.push({
              y: y + 1,
              draw: () =>
                at(x, y, () => {
                  if (
                    position.current.y < y + 1 &&
                    Math.abs(position.current.x - x - 0.5) < 0.8 &&
                    Math.abs(position.current.y - y) < 0.7
                  )
                    context.globalAlpha = 0.65;
                  drawTerrain(context, map, x, y);
                }),
            });
      for (const [i, service] of map.services.entries()) {
        actors.push({
          y: service.y + 0.5,
          draw: () =>
            at(service.x + 0.5, service.y + 0.5, () =>
              drawService(
                context,
                service.kind,
                i < ART_LIMITS.animatedProps ? now : 0,
                reduced.matches,
                accent,
              ),
            ),
        });
        if (i < ART_LIMITS.workers && map.tiles[service.y * map.width + service.x + 1]) {
          const nx = service.x + 1.5,
            ny = service.y + 0.5 + (reduced.matches ? 0 : Math.sin(now / 2400 + i) * 0.12);
          actors.push({
            y: ny,
            draw: () =>
              at(nx, ny, () =>
                drawWorker(context, 'W', false, now + i * 200, reduced.matches, null, false, true),
              ),
          });
        }
      }
      const objective = latest.current.marker;
      if (objective) {
        const mx = Math.max(9, Math.min(width - 9, (objective.x + 0.5 - cx) * scale)),
          my = Math.max(9, Math.min(height - 9, (objective.y + 0.5 - cy) * scale));
        context.strokeStyle = '#fff19a';
        context.lineWidth = 2;
        context.strokeRect(mx - 7, my - 7, 14, 14);
      }
      const currentNodes = Object.values(latest.current.state.world.nodes).filter((node) =>
        nodeInZone(latest.current.state, node),
      );
      if (previousNodes)
        for (const node of currentNodes) {
          if (previousNodes[node.id] === 'INTACT' && ['FRACTURED', 'DESTROYED'].includes(node.status)) {
            bursts.push({
              x: node.x + 0.5,
              y: node.y + 0.5,
              born: now,
              destroyed: node.status === 'DESTROYED',
            });
            if (node.status === 'FRACTURED') {
              emitGameAudio('fracture');
              for (const piece of node.fragments)
                if (!piece.collected) settling.set(piece.id, { x: node.x + 0.5, y: node.y + 0.5, born: now });
            }
          }
        }
      previousNodes = Object.fromEntries(currentNodes.map((node) => [node.id, node.status]));
      bursts = bursts.filter((b) => now - b.born < 700).slice(-2);
      settling = new Map([...settling].filter(([, value]) => now - value.born < 450));
      let visiblePieces = 0;
      for (const node of Object.values(latest.current.state.world.nodes)) {
        if (!nodeInZone(latest.current.state, node)) continue;
        if (node.status === 'INTACT') {
          actors.push({
            y: node.y + 0.5,
            draw: () =>
              at(node.x + 0.5, node.y + 0.5, () => {
                drawNodeFormation(
                  context,
                  0,
                  0,
                  node.size,
                  latest.current.state.world.scanner.analyzed.includes(node.id) ? node.ore : undefined,
                  latest.current.mode === 'laser' && node.id === latest.current.target,
                  latest.current.state.world.miningSession?.nodeId === node.id,
                  now,
                  reduced.matches,
                  artHash(node.id),
                );
                if (
                  latest.current.state.world.scanner.scannedZones?.includes(map.id) &&
                  !latest.current.state.world.scanner.analyzed.includes(node.id)
                ) {
                  context.strokeStyle = '#b7d0c088';
                  context.lineWidth = 1;
                  for (let i = -6; i <= 6; i += 6) {
                    context.beginPath();
                    context.moveTo(-9, i);
                    context.lineTo(9, i);
                    context.moveTo(i, -9);
                    context.lineTo(i, 9);
                    context.stroke();
                  }
                }
              }),
          });
        }
        for (const piece of node.fragments)
          if (!piece.collected) {
            visiblePieces++;
            const active =
              latest.current.vacuum?.nodeId === node.id && latest.current.vacuum.pieceId === piece.id
                ? latest.current.vacuum
                : null;
            const settled = settling.get(piece.id),
              t = settled && !reduced.matches ? Math.min(1, (now - settled.born) / 450) : 1;
            const point = active
              ? attractedPosition(piece, position.current, active.progress)
              : settledFragmentPosition(piece, settled, t);
            if (active) {
              context.strokeStyle = '#adf1dc';
              context.lineWidth = 2;
              context.beginPath();
              context.moveTo((position.current.x - cx) * scale, (position.current.y - cy) * scale);
              context.lineTo((point.x - cx) * scale, (point.y - cy) * scale);
              context.stroke();
              if (!reduced.matches)
                for (let i = 0; i < 6; i++) {
                  const t = (now / 650 + i / 6) % 1,
                    ax = point.x + (position.current.x - point.x) * t,
                    ay = point.y + (position.current.y - point.y) * t;
                  context.fillStyle = '#c4e0c5';
                  context.fillRect(
                    (ax - cx) * scale,
                    (ay - cy) * scale + Math.sin(i * 3 + now / 300) * 2,
                    2,
                    2,
                  );
                }
            }
            actors.push({
              y: point.y,
              draw: () =>
                at(point.x, point.y, () => {
                  drawMineralFragment(
                    context,
                    0,
                    0,
                    node.ore,
                    latest.current.fragmentTarget?.pieceId === piece.id,
                    now,
                    reduced.matches,
                  );
                }),
            });
          }
      }
      actors.push({
        y: position.current.y,
        draw: () =>
          at(position.current.x, position.current.y, () =>
            drawWorker(
              context,
              facing,
              Object.values(input).some(Boolean),
              now,
              reduced.matches,
              latest.current.mode,
              !!latest.current.vacuum || !!latest.current.state.world.miningSession,
            ),
          ),
      });
      actors.sort((a, b) => a.y - b.y).forEach((actor) => actor.draw());
      const laser = latest.current.laser,
        laserNode = laser && latest.current.state.world.nodes[laser.nodeId];
      if (laser && laserNode?.status === 'INTACT') {
        const lx = (laserNode.x + 0.5 - cx) * scale,
          ly = (laserNode.y + 0.5 - cy) * scale;
        const danger = laser.charge > laser.upper,
          optimal = laser.charge >= laser.lower && !danger;
        if (laser.held) {
          context.strokeStyle = danger ? '#f49a78' : optimal ? '#b9f5df' : '#e5c575';
          context.lineWidth = ((2 + laser.charge / 350) * scale) / 24;
          context.beginPath();
          context.moveTo((position.current.x - cx) * scale + 7, (position.current.y - cy) * scale + 2);
          context.lineTo(lx, ly);
          context.stroke();
          context.strokeStyle = '#fff3ce';
          context.lineWidth = 1;
          context.stroke();
        }
        if (laser.progress > 0)
          at(laserNode.x + 0.5, laserNode.y + 0.5, () => {
            context.strokeStyle = '#101a23';
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(-7, -8);
            context.lineTo(1, -2);
            context.lineTo(-2, 3);
            context.lineTo(6, 7);
            context.stroke();
          });
      }

      if (!reduced.matches)
        for (const burst of bursts)
          for (let i = 0; i < 16; i++) {
            const age = (now - burst.born) / 700,
              angle = i * 2.39996;
            context.globalAlpha = 1 - age;
            context.fillStyle = burst.destroyed ? '#ca9775' : '#9dafa5';
            context.fillRect(
              (burst.x - cx) * scale + Math.cos(angle) * age * 28,
              (burst.y - cy) * scale + Math.sin(angle) * age * 20,
              3,
              2,
            );
          }
      context.globalAlpha = 1;
      element.dataset.particles = String(reduced.matches ? 0 : bursts.length * 16);
      element.dataset.artSystem = 'destroya-16bit-v1';
      element.dataset.cameraScale = String(scale);
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
