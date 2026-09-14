import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, PlayerState } from '../../shared/schema';
import type { Zone, ZoneExit, ZoneObject } from '../../shared/world';
import { ZONES, zoneArrival, zoneWalkable } from '../../shared/world';
import type { GameView } from './ui/Screens';
import { format } from '../ui';
import {
  EMPTY_LASER,
  generatedNodes,
  laserRules,
  laserStep,
  scannerRadius,
  scannerSignal,
  type MiningNode,
} from '../../shared/miningWorld';
import { firstShiftOf, HAND_TOOL } from '../../shared/firstShift';
import { objectiveText } from './ui/FirstShiftUI';
import { formatCscuMinor } from '../../shared/mineralUnits';
import styles from '../RpgPanel.module.css';

const TILE = 16;
const VIEW_WIDTH = 160;
type Direction = 'up' | 'down' | 'left' | 'right';
type Target = { label: string; exit?: ZoneExit; object?: ZoneObject; node?: MiningNode; pieceId?: string };
type Props = {
  state: PlayerState;
  zone: Zone;
  canAct: boolean;
  mutate: (action?: Action) => Promise<void>;
  status: string;
  notice: string;
  busy: boolean;
  overlay: boolean;
  navigate: (view: GameView) => void;
  openTravelFromTerminal: () => void;
};
const colors: Record<
  Zone['palette'],
  { floor: string; wall: string; trim: string; light: string; accent: string }
> = {
  station: { floor: '#203543', wall: '#0c1b2a', trim: '#58717b', light: '#7ad8da', accent: '#d7a966' },
  lyria: { floor: '#655d72', wall: '#302e46', trim: '#aca2b7', light: '#d2c7e5', accent: '#c7a778' },
  lyriaCave: { floor: '#4a455c', wall: '#222139', trim: '#807c9b', light: '#bcb5d4', accent: '#71cac2' },
  wala: { floor: '#675a50', wall: '#332c33', trim: '#b99675', light: '#e4c6a0', accent: '#80abc2' },
  walaCave: { floor: '#514744', wall: '#29252b', trim: '#927e71', light: '#c5a995', accent: '#6a9baf' },
  city: { floor: '#2d3447', wall: '#151a2a', trim: '#66758e', light: '#c3b7d9', accent: '#df849b' },
  space: { floor: '#142030', wall: '#07101e', trim: '#3b596c', light: '#9ac9d8', accent: '#dfb56e' },
};
function blocked(zone: Zone, x: number, y: number): boolean {
  return !zoneWalkable(zone, x, y);
}
function nearTarget(zone: Zone, x: number, y: number, nodes: MiningNode[], scanned: boolean): Target | null {
  const entries: Target[] = [
    ...zone.exits.map((exit) => ({ label: `Route to ${ZONES[exit.to].label}`, exit })),
    ...zone.objects.map((object) => ({ label: object.label, object })),
    ...nodes.flatMap((node): Target[] =>
      node.status === 'FRACTURED'
        ? node.fragments
            .filter((piece) => !piece.collected)
            .map((piece) => ({
              label: `${node.ore} fragment · ${formatCscuMinor(piece.units)} cSCU`,
              node,
              pieceId: piece.id,
            }))
        : scanned && node.status === 'INTACT'
          ? [{ label: 'Mineral signature', node }]
          : [],
    ),
  ];
  return (
    entries
      .filter((entry) => {
        const target =
          entry.exit ??
          entry.object ??
          (entry.pieceId ? entry.node!.fragments.find((piece) => piece.id === entry.pieceId)! : entry.node!);
        return Math.hypot(target.x + 0.5 - x, target.y + 0.5 - y) <= 1.8;
      })
      .sort((a, b) => {
        const aa =
          a.exit ??
          a.object ??
          (a.pieceId ? a.node!.fragments.find((piece) => piece.id === a.pieceId)! : a.node!);
        const bb =
          b.exit ??
          b.object ??
          (b.pieceId ? b.node!.fragments.find((piece) => piece.id === b.pieceId)! : b.node!);
        return Math.hypot(aa.x + 0.5 - x, aa.y + 0.5 - y) - Math.hypot(bb.x + 0.5 - x, bb.y + 0.5 - y);
      })[0] ?? null
  );
}
function signalHint(nodes: MiningNode[], x: number, y: number): string {
  const candidates = nodes
    .filter((node) => node.status === 'INTACT')
    .map((node) => ({
      node,
      strength: scannerSignal(node, x, y),
      distance: Math.hypot(node.x - x, node.y - y),
    }))
    .filter((candidate) => candidate.strength !== 'none')
    .sort((a, b) => a.distance / scannerRadius(a.node) - b.distance / scannerRadius(b.node));
  const nearest = candidates[0];
  if (!nearest) return 'No nearby signature';
  const dx = nearest.node.x - x;
  const dy = nearest.node.y - y;
  const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'south' : 'north';
  return `${nearest.strength} signal · ${direction}`;
}
function draw(
  ctx: CanvasRenderingContext2D,
  zone: Zone,
  x: number,
  y: number,
  width: number,
  height: number,
  time: number,
  nodes: MiningNode[],
  scanned: boolean,
  rocOccupied: boolean,
  rocParked: boolean,
  facing: ZoneExit['facing'],
) {
  const p = colors[zone.palette];
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = p.wall;
  ctx.fillRect(0, 0, width, height);
  const cameraX = Math.max(0, Math.min(zone.width * TILE - width, Math.round(x * TILE - width / 2)));
  // Allow a little camera overscan at room edges. The wall-coloured margin sits
  // behind fixed HUD controls while a player entering near an edge stays visible.
  const cameraY = Math.max(
    -100,
    Math.min(zone.height * TILE - height + 60, Math.round(y * TILE - height / 2)),
  );
  for (let ty = Math.floor(cameraY / TILE); ty <= Math.ceil((cameraY + height) / TILE); ty++) {
    for (let tx = Math.floor(cameraX / TILE); tx <= Math.ceil((cameraX + width) / TILE); tx++) {
      const px = tx * TILE - cameraX,
        py = ty * TILE - cameraY;
      const wall = blocked(zone, tx, ty);
      ctx.fillStyle = wall ? p.wall : p.floor;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = wall ? p.trim : (tx * 17 + ty * 29) % 7 === 0 ? p.trim : p.floor;
      ctx.fillRect(px + 2, py + (wall ? 3 : 12), wall ? 12 : 5, 1);
      const motif = (Math.imul(tx + 31, 73856093) ^ Math.imul(ty + 17, 19349663)) >>> 0;
      if (zone.palette === 'station') {
        ctx.fillStyle = wall ? '#325063' : '#294655';
        ctx.fillRect(px + 1, py + 1, 14, 1);
        ctx.fillRect(px + 1, py + 14, 14, 1);
        if (!wall && (tx + ty) % 5 === 0) {
          ctx.fillStyle = '#836a4a';
          ctx.fillRect(px + 3, py + 3, 2, 2);
          ctx.fillRect(px + 11, py + 11, 2, 2);
        }
        if (wall && motif % 4 === 0) {
          ctx.fillStyle = p.light;
          ctx.fillRect(px + 5, py + 7, 6, 1);
        }
      } else if (zone.palette === 'city') {
        const platform = zone.id.includes('PLATFORM') || zone.id === 'AREA18_SHUTTLE';
        const port = zone.id.includes('SPACEPORT') || zone.id === 'AREA18_HANGAR';
        const trade = zone.id === 'AREA18_MARKET' || zone.id === 'AREA18_RETAIL';
        ctx.fillStyle = wall ? '#3f4e67' : platform ? '#34435c' : port ? '#586273' : '#3c465d';
        ctx.fillRect(px + 1, py + 1, 14, 1);
        ctx.fillRect(px + 1, py + 1, 1, 14);
        if (wall) {
          ctx.fillStyle = motif % 3 === 0 ? p.accent : p.light;
          ctx.fillRect(px + 4, py + 4, 4, 6);
          ctx.fillRect(px + 10, py + 4, 3, 6);
        } else if (motif % 13 === 0) {
          ctx.fillStyle = '#8b839d';
          ctx.fillRect(px + 4, py + 9, 5, 1);
        }
        if (!wall && platform && ty % 7 === 0) {
          ctx.fillStyle = '#dfb56e';
          ctx.fillRect(px + 1, py + 12, 14, 2);
          if (zone.id === 'AREA18_SHUTTLE') {
            ctx.fillStyle = '#80c8d7';
            ctx.fillRect(px + 4, py + 4, 8, 4);
          }
        }
        if (zone.id === 'AREA18_SHUTTLE' && wall && motif % 3 === 0) {
          ctx.fillStyle = (Math.floor(time / 220) + tx) % 4 === 0 ? '#a4d7e1' : '#40627c';
          ctx.fillRect(px + 3, py + 5, 10, 4);
        }
        if (!wall && port && (tx + ty) % 8 === 0) {
          ctx.fillStyle = '#d4c39f';
          ctx.fillRect(px + 5, py + 5, 6, 2);
        }
        if (!wall && trade && motif % 9 === 0) {
          ctx.fillStyle = '#e696a8';
          ctx.fillRect(px + 2, py + 2, 11, 2);
          ctx.fillStyle = '#91cada';
          ctx.fillRect(px + 5, py + 5, 5, 3);
        }
      } else if (zone.palette === 'lyria' || zone.palette === 'lyriaCave') {
        if (motif % 5 === 0) {
          ctx.fillStyle = wall ? '#948eaa' : '#817b90';
          ctx.fillRect(px + 4, py + 4, 4, 1);
          ctx.fillRect(px + 9, py + 10, 3, 1);
        }
        if (wall && motif % 3 === 0) {
          ctx.fillStyle = p.light;
          ctx.fillRect(px + 7, py + 2, 2, 5);
        }
      } else if (zone.palette === 'wala' || zone.palette === 'walaCave') {
        if (motif % 4 === 0) {
          ctx.fillStyle = wall ? '#b99a81' : '#947967';
          ctx.fillRect(px + 2, py + 4, 9, 1);
          ctx.fillRect(px + 5, py + 10, 7, 1);
        }
      }
      if (!wall && (tx * 7 + ty * 13) % 23 === 0) {
        ctx.fillStyle = p.light;
        ctx.fillRect(px + 7, py + 5, 2, 2);
      }
      if (!wall && (zone.palette === 'wala' || zone.palette === 'walaCave') && (tx + ty * 2) % 6 === 0) {
        ctx.fillStyle = p.trim;
        ctx.fillRect(px + 3, py + 5, 9, 1);
        ctx.fillRect(px + 5, py + 8, 7, 1);
      }
      if (zone.palette === 'station' && ty === 3 && tx % 4 === 0) {
        ctx.fillStyle = p.light;
        ctx.fillRect(px + 5, py + 2, 6, 2);
      }
      if (zone.palette === 'city' && tx % 6 === 0 && ty % 5 === 0) {
        ctx.fillStyle = p.accent;
        ctx.fillRect(px + 3, py + 2, 10, 3);
        ctx.fillStyle = p.light;
        ctx.fillRect(px + 5, py + 3, 3, 1);
      }
    }
  }
  for (const exit of zone.exits) {
    const px = exit.x * TILE - cameraX,
      py = exit.y * TILE - cameraY;
    ctx.fillStyle = p.accent;
    ctx.fillRect(px + 2, py + 2, 12, 12);
    ctx.fillStyle = p.wall;
    ctx.fillRect(px + 4, py + 5, 8, 9);
    ctx.fillStyle = p.light;
    ctx.fillRect(px + 6, py + 3, 4, 2);
  }
  for (const object of zone.objects) {
    const px = object.x * TILE - cameraX,
      py = object.y * TILE - cameraY;
    ctx.fillStyle = object.kind === 'npc' || object.kind === 'foreman' ? p.accent : p.light;
    ctx.fillRect(px + 4, py + 3, 8, 10);
    ctx.fillStyle = p.wall;
    ctx.fillRect(px + 6, py + 5, 4, 3);
    ctx.fillStyle = p.trim;
    ctx.fillRect(px + 2, py + 13, 12, 2);
  }
  for (const node of nodes) {
    if (
      node.status === 'INTACT' &&
      (!scanned || Math.hypot(node.x + 0.5 - x, node.y + 0.5 - y) > scannerRadius(node))
    )
      continue;
    const px = node.x * TILE - cameraX,
      py = node.y * TILE - cameraY;
    if (node.status === 'INTACT') {
      ctx.fillStyle = p.accent;
      ctx.fillRect(px + 5, py + 5, 7, 7);
      ctx.fillStyle = p.light;
      ctx.fillRect(px + 7, py + 3, 3, 4);
    } else if (node.status === 'FRACTURED') {
      for (const piece of node.fragments.filter((part) => !part.collected)) {
        const fx = piece.x * TILE - cameraX,
          fy = piece.y * TILE - cameraY;
        ctx.fillStyle = '#13283a';
        ctx.fillRect(fx + 3, fy + 5, 10, 8);
        ctx.fillStyle = '#67e0de';
        ctx.fillRect(fx + 6, fy + 3, 4, 2);
        ctx.fillRect(fx + 4, fy + 5, 8, 5);
        ctx.fillRect(fx + 6, fy + 10, 4, 2);
        ctx.fillStyle = '#e6ffff';
        ctx.fillRect(fx + 6, fy + 5, 2, 2);
      }
    }
  }
  if (rocParked) {
    const vx = Math.round((zone.spawn[0] + 2) * TILE - cameraX);
    const vy = Math.round((zone.spawn[1] + 1) * TILE - cameraY);
    ctx.fillStyle = '#132535';
    ctx.fillRect(vx - 8, vy - 5, 18, 13);
    ctx.fillStyle = '#d1a650';
    ctx.fillRect(vx - 6, vy - 6, 14, 8);
    ctx.fillStyle = '#75c5d4';
    ctx.fillRect(vx - 2, vy - 5, 6, 3);
    ctx.fillStyle = '#3a4a50';
    ctx.fillRect(vx - 6, vy + 4, 4, 4);
    ctx.fillRect(vx + 4, vy + 4, 4, 4);
  }
  const px = x * TILE - cameraX,
    py = y * TILE - cameraY;
  if (rocOccupied) {
    ctx.fillStyle = '#102735';
    ctx.fillRect(px - 10, py - 8, 21, 16);
    ctx.fillStyle = '#d2a657';
    ctx.fillRect(px - 8, py - 10, 17, 12);
    ctx.fillStyle = '#77cbd6';
    ctx.fillRect(px - 2, py - 8, 7, 4);
    ctx.fillStyle = '#394b50';
    ctx.fillRect(px - 9, py + 3, 5, 5);
    ctx.fillRect(px + 4, py + 3, 5, 5);
  } else {
    ctx.fillStyle = p.wall;
    ctx.fillRect(px - 5, py - 9, 10, 10);
    ctx.fillStyle = p.accent;
    ctx.fillRect(px - 4, py - 11, 8, 7);
    ctx.fillStyle = p.light;
    ctx.fillRect(px - 2, py - 9, 4, 2);
    ctx.fillStyle = p.trim;
    ctx.fillRect(px - 4, py + 1 + Math.round(Math.sin(time / 180) * 0.4), 3, 4);
    ctx.fillRect(px + 1, py + 1 + Math.round(Math.sin(time / 180) * -0.4), 3, 4);
    const nose = { north: [0, -13], east: [6, -5], south: [0, 5], west: [-7, -5] }[facing];
    ctx.fillStyle = '#f7e6a8';
    ctx.fillRect(px + nose[0], py + nose[1], 2, 2);
  }
}

export function ZonePanel({
  state,
  zone,
  canAct,
  mutate,
  status,
  notice,
  busy,
  overlay,
  navigate,
  openTravelFromTerminal,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const position = useRef(zoneArrival(zone, state.world?.entry));
  const [playerTile, setPlayerTile] = useState(() => ({
    x: Math.floor(position.current.x),
    y: Math.floor(position.current.y),
    facing: position.current.facing,
  }));
  const playerTileRef = useRef(playerTile);
  const [mapOpen, setMapOpen] = useState(false);
  const held = useRef<Record<Direction, boolean>>({ up: false, down: false, left: false, right: false });
  const latest = useRef({
    canAct,
    mutate,
    navigate,
    openTravelFromTerminal,
    overlay: overlay || mapOpen,
    mapOpen,
  });
  latest.current = { canAct, mutate, navigate, openTravelFromTerminal, overlay: overlay || mapOpen, mapOpen };
  const [nearby, setNearby] = useState<Target | null>(null);
  const [signal, setSignal] = useState('');
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState<string[]>([]);
  const [trackerOpen, setTrackerOpen] = useState(true);
  const lastObjective = useRef(firstShiftOf(state).objective);
  const lastNotice = useRef(notice === 'State synchronized.' ? notice : '');
  useEffect(() => {
    if (!notice || busy) return;
    const objective = firstShiftOf(state).objective;
    if (objective !== lastObjective.current) {
      const next =
        objective === 'COMPLETE'
          ? 'First Shift complete · 500 aUEC reward'
          : `Objective complete · ${objectiveText(state)}`;
      lastObjective.current = objective;
      lastNotice.current = notice;
      setNotifications((queued) => [...queued.filter((item) => item.startsWith('Objective complete')), next]);
    } else if (notice !== lastNotice.current) {
      lastNotice.current = notice;
      setNotifications([notice]);
    }
  }, [notice, busy, state]);
  useEffect(() => {
    if (!notifications.length) return;
    const timer = window.setTimeout(() => setNotifications((queued) => queued.slice(1)), 3600);
    return () => window.clearTimeout(timer);
  }, [notifications]);
  const [miningTarget, setMiningTarget] = useState<MiningNode | null>(null);
  const [asopOpen, setAsopOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState<'foreman' | 'officer' | null>(null);
  const nodes = useMemo(
    () => generatedNodes(state.saveGeneration ?? 'legacy', zone, state.world?.nodes ?? {}, Date.now()),
    [state.saveGeneration, state.world?.nodes, zone],
  );
  useEffect(() => {
    if (miningTarget && state.world?.nodes[miningTarget.id]?.status === 'FRACTURED') setMiningTarget(null);
  }, [miningTarget, state.world?.nodes]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const stateRef = useRef(state);
  stateRef.current = state;
  const scanned = state.world?.scanner.scannedZones?.includes(zone.id) ?? false;
  const groundPiecesNearby = nodes.some(
    (node) =>
      node.status === 'FRACTURED' &&
      node.fragments.some(
        (piece) => !piece.collected && Math.hypot(piece.x - playerTile.x, piece.y - playerTile.y) < 9,
      ),
  );
  const scannedRef = useRef(scanned);
  scannedRef.current = scanned;
  latest.current.overlay = overlay || mapOpen || !!miningTarget || asopOpen || !!questOpen;
  const act = () => {
    if (latest.current.mapOpen) return;
    if (latest.current.overlay) return;
    const target = nearTarget(
      zone,
      position.current.x,
      position.current.y,
      nodesRef.current,
      scannedRef.current,
    );
    if (!target) return;
    if (target.pieceId && target.node) {
      if (latest.current.canAct)
        void latest.current.mutate({ type: 'collectPiece', nodeId: target.node.id, pieceId: target.pieceId });
      return;
    }
    if (target.node) {
      if (latest.current.canAct) {
        if (!stateRef.current.world?.scanner.analyzed.includes(target.node.id))
          void latest.current.mutate({ type: 'analyzeNode', nodeId: target.node.id });
        setMiningTarget(target.node);
      }
      return;
    }
    if (target.exit) {
      if (latest.current.canAct) void latest.current.mutate({ type: 'enterZone', zone: target.exit.to });
      return;
    }
    const kind = target.object!.kind;
    if (target.object!.id === 'foreman') setQuestOpen('foreman');
    else if (target.object!.id === 'officer') setQuestOpen('officer');
    else if (kind === 'npc' || kind === 'foreman') setMessage(target.object!.label);
    else if (kind === 'asop') setAsopOpen(true);
    else if (kind === 'travel') latest.current.openTravelFromTerminal();
    else latest.current.navigate(kind === 'equipment' ? 'profile' : kind === 'cargo' ? 'cargo' : kind);
  };
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.width = VIEW_WIDTH;
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width && bounds.height)
        element.height = Math.max(160, Math.round((VIEW_WIDTH * bounds.height) / bounds.width));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const keys: Record<string, Direction> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
    };
    const down = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
      )
        return;
      if (keys[event.code]) {
        event.preventDefault();
        held.current[keys[event.code]] = true;
      } else if (event.code === 'Escape' && latest.current.mapOpen) setMapOpen(false);
      else if (event.code === 'KeyE' && !event.repeat) actRef.current();
      else if (event.code === 'KeyI' && !event.repeat) latest.current.navigate('cargo');
    };
    const up = (event: KeyboardEvent) => {
      if (keys[event.code]) held.current[keys[event.code]] = false;
    };
    const clear = () => {
      held.current = { up: false, down: false, left: false, right: false };
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    let frame = 0,
      last = 0,
      previous = '',
      previousSignal = '';
    const tick = (time: number) => {
      const dt = Math.min(0.05, last ? (time - last) / 1000 : 0);
      last = time;
      if (!latest.current.overlay && !document.hidden && document.hasFocus()) {
        const dx = Number(held.current.right) - Number(held.current.left);
        const dy = Number(held.current.down) - Number(held.current.up);
        const scale = dx && dy ? Math.SQRT1_2 : 1;
        const speed = stateRef.current.world?.roc?.occupied ? 5 : 3.5;
        const nextX = position.current.x + dx * scale * dt * speed;
        const nextY = position.current.y + dy * scale * dt * speed;
        if (!blocked(zone, Math.floor(nextX), Math.floor(position.current.y))) position.current.x = nextX;
        if (!blocked(zone, Math.floor(position.current.x), Math.floor(nextY))) position.current.y = nextY;
        if (dx || dy)
          position.current.facing =
            Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'south' : 'north';
      } else clear();
      const updated = {
        x: Math.floor(position.current.x),
        y: Math.floor(position.current.y),
        facing: position.current.facing,
      };
      if (
        updated.x !== playerTileRef.current.x ||
        updated.y !== playerTileRef.current.y ||
        updated.facing !== playerTileRef.current.facing
      ) {
        playerTileRef.current = updated;
        setPlayerTile(updated);
      }
      const next = nearTarget(
        zone,
        position.current.x,
        position.current.y,
        nodesRef.current,
        scannedRef.current,
      );
      if ((next?.label ?? '') !== previous) {
        previous = next?.label ?? '';
        setNearby(next);
      }
      const nextSignal = scannedRef.current
        ? signalHint(nodesRef.current, position.current.x, position.current.y)
        : '';
      if (nextSignal !== previousSignal) {
        previousSignal = nextSignal;
        setSignal(nextSignal);
      }
      const ctx = element.getContext('2d');
      if (ctx)
        draw(
          ctx,
          zone,
          position.current.x,
          position.current.y,
          element.width,
          element.height,
          time,
          nodesRef.current,
          scannedRef.current,
          !!stateRef.current.world?.roc?.occupied,
          !!stateRef.current.world?.roc?.active &&
            !stateRef.current.world?.roc?.occupied &&
            stateRef.current.world.roc.zone === zone.id,
          position.current.facing,
        );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [zone]);
  const touch = (direction: Direction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      held.current[direction] = true;
    },
    onPointerUp: () => {
      held.current[direction] = false;
    },
    onPointerCancel: () => {
      held.current[direction] = false;
    },
    onLostPointerCapture: () => {
      held.current[direction] = false;
    },
  });
  return (
    <section
      className={styles.panel}
      aria-label={`${zone.label} game`}
      data-player-tile={`${playerTile.x},${playerTile.y}`}
      data-facing={playerTile.facing}
    >
      <canvas
        ref={canvas}
        className={styles.canvas}
        role="img"
        aria-label={`Original pixel-art map of ${zone.label}`}
      />
      <div className={styles.hud}>
        <div className={styles.hudValues}>
          <strong aria-label="Wallet">◈ {format(state.wallet)} aUEC</strong>
          <span>
            {zone.location} · {zone.label}
          </span>
        </div>
        <button className={styles.menuButton} aria-label="Open game menu" onClick={() => navigate('menu')}>
          ☰
        </button>
      </div>
      <button className={styles.mapQuickButton} aria-label="Open local map" onClick={() => setMapOpen(true)}>
        Map
      </button>
      <div
        className={styles.questTracker}
        style={
          groundPiecesNearby
            ? { maxWidth: '130px' }
            : state.world?.roc?.active
              ? { maxWidth: 'calc(100% - 105px)' }
              : undefined
        }
      >
        <button
          aria-label="Toggle objective tracker"
          aria-expanded={trackerOpen}
          onClick={() => setTrackerOpen(!trackerOpen)}
        >
          ◈ THE FIRST SHIFT {trackerOpen ? '▴' : '▾'}
        </button>
        {trackerOpen && (
          <div>
            {objectiveText(state)} <button onClick={() => navigate('quest')}>Quest Log</button>
          </div>
        )}
      </div>
      {busy || status ? <div className={styles.connection}>{busy ? 'Saving…' : status}</div> : null}
      {(notifications[0] || message) && !overlay && !questOpen && !miningTarget && !asopOpen && (
        <div className={styles.toast} role="status">
          {notifications[0] || message}
        </div>
      )}
      {zone.regions.length > 0 && !overlay && !miningTarget && (
        <button
          className={styles.zoneQuickButton}
          disabled={!canAct || busy}
          onClick={() => void mutate({ type: 'scanZone' })}
        >
          Scan
        </button>
      )}
      {scanned && signal && !groundPiecesNearby && !overlay && !miningTarget && (
        <div className={styles.scanSignal} role="status" aria-label="Scanner signal">
          {signal}
        </div>
      )}
      {mapOpen && (
        <NavigationMap
          zone={zone}
          state={state}
          position={playerTile}
          signal={signal}
          close={() => setMapOpen(false)}
        />
      )}
      {nearby && !overlay && (
        <div className={styles.prompt} aria-label="Nearby interaction prompt">
          E · {nearby.label}
        </div>
      )}
      {!overlay && (
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
          <button className={styles.interact} disabled={!nearby || !canAct} onClick={act}>
            Interact
          </button>
        </div>
      )}
      {miningTarget && (
        <MiningOverlay
          node={nodes.find((candidate) => candidate.id === miningTarget.id) ?? miningTarget}
          state={state}
          mutate={mutate}
          canAct={canAct}
          close={() => setMiningTarget(null)}
        />
      )}
      {state.world?.roc?.active &&
        state.world.roc.zone === zone.id &&
        !overlay &&
        !asopOpen &&
        !miningTarget && (
          <button
            className={styles.rocQuickButton}
            disabled={!canAct}
            onClick={() => void mutate({ type: 'enterRoc', occupied: !state.world!.roc!.occupied })}
          >
            {state.world.roc.occupied ? 'Exit ROC' : 'Enter ROC'}
          </button>
        )}
      {asopOpen && (
        <div
          role="dialog"
          aria-label="Owned vehicle retrieval"
          style={{
            position: 'absolute',
            inset: '16% 5% 28%',
            overflowY: 'auto',
            zIndex: 12,
            background: '#152b38',
            border: '3px solid #8fc3c7',
            padding: 10,
            color: '#f1e9d6',
          }}
        >
          <h2>Ground vehicle service</h2>
          <p>Owned ROC: {(state.ships.Roc ?? 0) > 0 ? 'Available' : 'None owned'}</p>
          <p>Current retrieval: {state.world?.roc?.active ? 'Active' : 'Stored'}</p>
          <button
            disabled={!canAct || (state.ships.Roc ?? 0) < 1 || !!state.world?.roc?.active}
            onClick={() => void mutate({ type: 'retrieveRoc' })}
          >
            Retrieve owned ROC
          </button>
          <button
            disabled={!canAct || !state.world?.roc?.active || !!state.world.roc.occupied}
            onClick={() => void mutate({ type: 'stowRoc' })}
          >
            Store ROC
          </button>
          <button onClick={() => setAsopOpen(false)}>Close</button>
        </div>
      )}
      {questOpen && (
        <div
          role="dialog"
          aria-label="First Shift conversation"
          style={{
            position: 'absolute',
            inset: '16% 5% 28%',
            overflowY: 'auto',
            zIndex: 12,
            background: '#152b38',
            border: '3px solid #d7a966',
            padding: 10,
            color: '#f1e9d6',
          }}
        >
          <h2>{questOpen === 'foreman' ? 'Mara Voss · Shift Foreman' : 'Neri Vale · Supply Officer'}</h2>
          <p>
            {questOpen === 'foreman'
              ? 'Take a shift on Lyria: check your Basic Mining Tool, scan, fracture and collect raw Dolivine, then sell it here.'
              : `Basic Mining Tool: ${(state.equipment[HAND_TOOL] ?? 0) > 0 ? 'owned' : 'missing'}.`}
          </p>
          {questOpen === 'foreman' && firstShiftOf(state).status === 'NOT_STARTED' && (
            <button
              disabled={!canAct}
              onClick={() => {
                void mutate({ type: 'firstShift', step: 'accept' });
                setQuestOpen(null);
              }}
            >
              Accept First Shift
            </button>
          )}
          {questOpen === 'foreman' && firstShiftOf(state).objective === 'RETURN_TO_FOREMAN' && (
            <button
              disabled={!canAct}
              onClick={() => {
                void mutate({ type: 'firstShift', step: 'complete' });
                setQuestOpen(null);
              }}
            >
              Complete First Shift
            </button>
          )}
          {questOpen === 'officer' && firstShiftOf(state).objective === 'CHECK_EQUIPMENT' && (
            <button
              disabled={!canAct}
              onClick={() => {
                void mutate({
                  type: 'firstShift',
                  step: (state.equipment[HAND_TOOL] ?? 0) > 0 ? 'checkTool' : 'recoverTool',
                });
                setQuestOpen(null);
              }}
            >
              Confirm Basic Mining Tool
            </button>
          )}
          <button onClick={() => setQuestOpen(null)}>Close</button>
        </div>
      )}
    </section>
  );
}

function NavigationMap({
  zone,
  state,
  position,
  signal,
  close,
}: {
  zone: Zone;
  state: PlayerState;
  position: { x: number; y: number; facing: ZoneExit['facing'] };
  signal: string;
  close: () => void;
}) {
  const map = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = map.current?.getContext('2d');
    if (!ctx) return;
    const scaleX = 160 / zone.width;
    const scaleY = 105 / zone.height;
    ctx.fillStyle = '#0b1e2c';
    ctx.fillRect(0, 0, 160, 105);
    for (let y = 0; y < zone.height; y++)
      for (let x = 0; x < zone.width; x++) {
        ctx.fillStyle = zoneWalkable(zone, x, y) ? '#496474' : '#182d3d';
        ctx.fillRect(Math.floor(x * scaleX), Math.floor(y * scaleY), Math.ceil(scaleX), Math.ceil(scaleY));
      }
    for (const exit of zone.exits) {
      ctx.fillStyle = '#ebc477';
      ctx.fillRect(Math.floor(exit.x * scaleX) - 1, Math.floor(exit.y * scaleY) - 1, 4, 4);
    }
    for (const object of zone.objects.filter((item) => item.kind !== 'npc')) {
      ctx.fillStyle = object.kind === 'travel' ? '#eaa876' : object.kind === 'market' ? '#a5dfac' : '#82cde1';
      ctx.fillRect(Math.floor(object.x * scaleX) - 1, Math.floor(object.y * scaleY) - 1, 3, 3);
    }
    ctx.fillStyle = '#fff8ce';
    ctx.fillRect(Math.floor(position.x * scaleX) - 1, Math.floor(position.y * scaleY) - 1, 4, 4);
    const arrow = { north: [0, -3], east: [4, 0], south: [0, 4], west: [-3, 0] }[position.facing];
    ctx.fillRect(
      Math.floor(position.x * scaleX) + arrow[0],
      Math.floor(position.y * scaleY) + arrow[1],
      2,
      2,
    );
  }, [zone, position]);
  const returnTo = state.world?.entry?.startsWith('from:') ? state.world.entry.slice(5) : null;
  const services = zone.objects.filter((object) => object.kind !== 'npc');
  return (
    <div className={styles.navigationMap} role="dialog" aria-label="Local navigation map">
      <h2>
        {zone.location} · {zone.label}
      </h2>
      <p>Only this district is charted. Walk to a marked exit or terminal to interact.</p>
      <canvas
        ref={map}
        width={160}
        height={105}
        className={styles.navigationCanvas}
        role="img"
        aria-label={`Local map of ${zone.label}`}
      />
      <p aria-label="Player position">
        Tile {position.x},{position.y} · Facing {position.facing}
      </p>
      <p>White: you · Amber: exits · Blue/green/orange: services</p>
      <h3>Connected exits</h3>
      <ul>
        {zone.exits.map((exit) => (
          <li key={exit.id}>
            {exit.to === returnTo ? 'Return: ' : ''}
            {ZONES[exit.to].label} · {exit.facing} side
          </li>
        ))}
      </ul>
      {services.length > 0 && (
        <>
          <h3>Local services</h3>
          <ul>
            {services.map((object) => (
              <li key={object.id}>{object.label}</li>
            ))}
          </ul>
        </>
      )}
      {state.world?.departure && (
        <p>
          Assigned departure: {state.world.departure.ship} → {state.world.departure.destination}
        </p>
      )}
      {signal && <p>Scanner: {signal}</p>}
      <p>Objective: {objectiveText(state)}</p>
      <button onClick={close}>Close local map</button>
    </div>
  );
}

function MiningOverlay({
  node,
  state,
  mutate,
  canAct,
  close,
}: {
  node: MiningNode;
  state: PlayerState;
  mutate: Props['mutate'];
  canAct: boolean;
  close: () => void;
}) {
  const [laser, setLaser] = useState(EMPTY_LASER);
  const [power, setPower] = useState(1);
  const powerRef = useRef(1);
  const laserRef = useRef(EMPTY_LASER);
  const holding = useRef(false);
  const rules = laserRules(node);
  const active = state.world?.miningSession?.nodeId === node.id;
  const analyzed = state.world?.scanner.analyzed.includes(node.id) ?? false;
  useEffect(() => {
    const release = () => {
      holding.current = false;
    };
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        holding.current = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    let frame = 0,
      last = 0,
      lastUi = 0;
    const tick = (time: number) => {
      const dt = last ? (time - last) / 1000 : 0;
      last = time;
      const firing = active && holding.current && document.hasFocus() && !document.hidden;
      laserRef.current = laserStep(laserRef.current, node, firing, dt, powerRef.current);
      if (time - lastUi > 100) {
        setLaser(laserRef.current);
        lastUi = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      release();
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [active, node]);
  return (
    <div
      role="dialog"
      aria-label="Mining analysis and laser"
      className={styles.miningDialog}
      style={{
        position: 'absolute',
        inset: '10% 4% 28%',
        overflowY: 'auto',
        zIndex: 12,
        background: '#152b38',
        border: '3px solid #8fc3c7',
        padding: 10,
        color: '#f1e9d6',
      }}
    >
      <h2>{analyzed ? node.ore : 'Mineral signature'}</h2>
      <p>
        Size {node.size} · Resistance {Math.round(node.resistance * 100)}% · Instability{' '}
        {Math.round(node.instability * 100)}%
      </p>
      <p>
        Estimated yield {formatCscuMinor(node.yieldUnits)} cSCU · {node.source} extraction
      </p>
      <label>
        Laser power {Math.round(power * 100)}%
        <input
          type="range"
          aria-label="Laser power"
          min="25"
          max="200"
          step="5"
          value={Math.round(power * 100)}
          onChange={(event) => {
            const selected = Number(event.currentTarget.value) / 100;
            powerRef.current = selected;
            setPower(selected);
          }}
        />
      </label>
      <p>
        Charge {Math.round(laser.charge * 100)}% · Heat {Math.round(laser.heat * 100)}%
      </p>
      <p>
        Optimal {Math.round(rules.optimalLow * 100)}–{Math.round(rules.optimalHigh * 100)}% · Overcharge at{' '}
        {Math.round(rules.overchargeStart * 100)}%
      </p>
      <p>
        Stable hold {laser.progress.toFixed(1)} / {rules.requiredSeconds.toFixed(1)} s · Risk{' '}
        {Math.round(laser.overcharge * 100)}%
      </p>
      {!active && node.status === 'INTACT' && (
        <button
          disabled={!canAct || !analyzed}
          onClick={() => void mutate({ type: 'beginFracture', nodeId: node.id, source: node.source })}
        >
          Begin fracture
        </button>
      )}
      {active && (
        <button
          disabled={!canAct}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            holding.current = true;
          }}
          onPointerUp={() => {
            holding.current = false;
          }}
          onPointerCancel={() => {
            holding.current = false;
          }}
          onLostPointerCapture={() => {
            holding.current = false;
          }}
        >
          Hold laser
        </button>
      )}
      {active && (
        <button
          disabled={!canAct || laser.progress < rules.requiredSeconds || laser.overcharge >= 1}
          onClick={() => {
            holding.current = false;
            void mutate({ type: 'completeFracture', nodeId: node.id });
          }}
        >
          Fracture node
        </button>
      )}
      <button
        onClick={() => {
          holding.current = false;
          if (active) void mutate({ type: 'cancelFracture', nodeId: node.id });
          close();
        }}
      >
        Close
      </button>
    </div>
  );
}
