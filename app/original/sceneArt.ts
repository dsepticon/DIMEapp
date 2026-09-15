import { fragmentCenter } from '../../shared/originalVacuum';
/** Original Destroya Industries code-native art. All coordinates are logical pixels. */
import type { OriginalZoneMap } from '../../shared/originalWorld';
import type { Facing } from '../../shared/originalNodeTargeting';
export const ART_LIMITS = Object.freeze({ tile: 24, workers: 4, particles: 32, animatedProps: 12 });
type Palette = { ground: string; light: string; seam: string; wall: string; edge: string; accent: string };
export const SCENE_PALETTES: Record<OriginalZoneMap['palette'], Palette> = {
  STATION: {
    ground: '#293d48',
    light: '#354c58',
    seam: '#182a35',
    wall: '#162630',
    edge: '#60838b',
    accent: '#e5b863',
  },
  LOAM: {
    ground: '#675749',
    light: '#79684e',
    seam: '#443c35',
    wall: '#423e36',
    edge: '#9c8968',
    accent: '#b8cc82',
  },
  MICA: {
    ground: '#454a67',
    light: '#545e79',
    seam: '#2c354f',
    wall: '#273348',
    edge: '#94a4be',
    accent: '#c5b2db',
  },
  CITY: {
    ground: '#2b4054',
    light: '#375168',
    seam: '#192b40',
    wall: '#17243b',
    edge: '#6d95ad',
    accent: '#e7c489',
  },
  CLAIM: {
    ground: '#35434b',
    light: '#45535b',
    seam: '#202c35',
    wall: '#18222f',
    edge: '#708d9a',
    accent: '#ecb78b',
  },
};
export function artHash(text: string) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function sceneCamera(
  map: Pick<OriginalZoneMap, 'width' | 'height'>,
  width: number,
  height: number,
  player: { x: number; y: number },
) {
  const scale = 24 * Math.max(1, Math.ceil(width / (map.width * 24)), Math.ceil(height / (map.height * 24)));
  const x = Math.max(0, Math.min(map.width - width / scale, player.x - width / scale / 2));
  const y = Math.max(0, Math.min(map.height - height / scale, player.y - height / scale / 2));
  return { scale, x: Math.floor(x * scale) / scale, y: Math.floor(y * scale) / scale };
}
export function drawTerrain(ctx: CanvasRenderingContext2D, map: OriginalZoneMap, x: number, y: number) {
  const p = SCENE_PALETTES[map.palette],
    v = map.tiles[y * map.width + x],
    n = (x * 17 + y * 31) >>> 0;
  const rect = (color: string, a: number, b: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(a, b, w, h);
  };
  rect(p.ground, 0, 0, 24, 24);
  if (!v) {
    rect(p.seam, 0, 0, 24, 24);
    rect(p.wall, 1, 1, 22, 21);
    rect(p.edge, 2, 2, 20, 2);
    if (map.palette === 'STATION' || map.palette === 'CITY') {
      rect(p.light, 3, 5, 18, 9);
      rect(p.seam, 5, 7, 14, 2);
      rect(p.edge, 3, 17, 2, 5);
      if (n % 3 === 0) {
        rect('#0b1b29', 6, 6, 12, 7);
        rect(p.accent, 8, 8, 3, 1);
      }
    } else if (map.palette === 'MICA') {
      for (let i = 0; i < 4; i++) rect(p.light, 4 + i * 3, 5 + i * 3, 14 - i * 2, 2);
    } else {
      rect(p.light, 4, 5, 10, 5);
      rect(p.edge, 5, 5, 6, 1);
      rect(p.seam, 13, 12, 6, 7);
    }
    if (map.palette === 'CITY') {
      const district = artHash(map.id) % 4;
      rect(p.edge, 19, 5, 2, 15);
      if (district === 0) {
        rect('#a2c5c7', 4, 6, 12, 5);
        rect(p.wall, 8, 6, 2, 5);
      } else if (district === 1) {
        rect(p.accent, 5, 6, 3, 12);
        rect(p.light, 9, 8, 7, 8);
      } else if (district === 2) {
        for (let i = 0; i < 3; i++) rect('#83a8b9', 4 + i * 4, 6, 2, 10);
      } else {
        rect(p.accent, 3, 5, 14, 2);
        rect(p.seam, 5, 10, 10, 8);
      }
    }
    if (map.palette === 'STATION' && n % 4 === 0) {
      rect('#78999e', 2, 12, 20, 3);
      rect('#172c3a', 4, 13, 16, 1);
      rect(p.accent, 17, 15, 3, 4);
    }
    // Strong lower lip precisely identifies the blocked footprint.
    rect('#0b1720', 0, 22, 24, 2);
    return;
  }
  if (map.palette === 'STATION') {
    rect(p.seam, 0, 23, 24, 1);
    rect(p.seam, 23, 0, 1, 24);
    rect(p.light, 2, 2, 19, 1);
    if (v === 2) {
      for (let i = 3; i < 21; i += 4) rect(p.seam, i, 5, 2, 14);
    } else if (n % 7 === 0) {
      rect(p.edge, 3, 19, 2, 2);
      rect(p.edge, 19, 3, 2, 2);
    }
  } else if (map.palette === 'MICA') {
    // Offset diagonal strata, unlike Loam's broad sediment shelves.
    for (let i = 0; i < 3; i++) {
      const a = (n + i * 7) % 20;
      rect(p.light, a, 4 + i * 7, 4, 2);
      rect(p.seam, a + 1, 6 + i * 7, 3, 1);
    }
    if (v === 2) {
      rect(p.edge, 7, 10, 2, 4);
      rect(p.light, 9, 8, 2, 6);
    }
  } else if (map.palette === 'CITY') {
    rect(p.seam, 0, 22, 24, 2);
    rect(p.light, 1, 1, 22, 1);
    if (x % 6 === 0) {
      rect(p.edge, 3, 4, 2, 16);
      rect(p.seam, 7, 3, 2, 18);
    }
    if (v === 2) for (let i = 4; i < 22; i += 6) rect(p.light, i, 5, 3, 14);
  } else if (map.palette === 'LOAM') {
    rect(p.light, n % 9, 4 + (n % 4), 12, 2);
    rect(p.seam, 4 + (n % 8), 17, 9, 1);
    if (v === 2) {
      rect('#8b805e', 2, 10, 15, 3);
      rect(p.light, 8, 13, 12, 2);
    }
  } else {
    if (n % 3 === 0) {
      rect(p.light, 4, 5, 4, 2);
      rect(p.seam, 15, 18, 5, 2);
    }
    if (v === 2) {
      rect(p.seam, 2, 2, 20, 20);
      rect(p.light, 3, 3, 18, 2);
      rect(p.accent, 3, 17, 4, 2);
    }
  }
  if ((map.palette === 'STATION' || map.palette === 'CITY') && x === map.spawn.x && y % 4 === 0) {
    rect(p.accent, 10, 8, 4, 2);
    rect(p.accent, 8, 10, 8, 2);
    rect(p.accent, 11, 12, 2, 5);
  }
  // Edge transitions are derived from collision, never a second collision map.
  if (!map.tiles[(y - 1) * map.width + x]) rect(p.seam, 0, 0, 24, 3);
  if (!map.tiles[y * map.width + x - 1]) rect(p.seam, 0, 0, 2, 24);
}
export function drawService(
  ctx: CanvasRenderingContext2D,
  kind: string,
  now: number,
  reduced: boolean,
  accent: string,
) {
  ctx.fillStyle = '#101e29';
  ctx.fillRect(-10, -12, 20, 22);
  ctx.fillStyle = '#64818b';
  ctx.fillRect(-9, -11, 18, 3);
  ctx.fillStyle = '#364f5d';
  ctx.fillRect(-8, -8, 16, 14);
  ctx.fillStyle = '#091b29';
  ctx.fillRect(-6, -6, 12, 8);
  ctx.fillStyle = accent;
  ctx.fillRect(-4, -4, 8, 1);
  ctx.fillRect(-4, -1, reduced || Math.floor(now / 600) % 2 ? 6 : 3, 1);
  ctx.fillStyle = '#d2dace';
  ctx.fillRect(-5, 5, 3, 2);
  ctx.fillRect(2, 5, 3, 2);
  const role = kind.toLowerCase();
  ctx.fillStyle = accent;
  if (/ship|hangar/.test(role)) {
    ctx.fillRect(-2, -7, 4, 9);
    ctx.fillRect(-5, -2, 10, 3);
  } else if (/market|trade/.test(role)) {
    ctx.strokeStyle = accent;
    ctx.strokeRect(-4, -5, 8, 6);
  } else if (/process|refin/.test(role)) {
    ctx.fillRect(-4, -5, 2, 6);
    ctx.fillRect(2, -5, 2, 6);
  } else if (/rig|vehicle/.test(role)) {
    ctx.fillRect(-5, -3, 10, 3);
    ctx.fillRect(-4, 0, 2, 2);
    ctx.fillRect(2, 0, 2, 2);
  }
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(kind.slice(0, 2).toUpperCase(), 0, -14);
}
export function drawExit(ctx: CanvasRenderingContext2D, facing: Facing, accent: string) {
  ctx.fillStyle = '#12242f';
  ctx.fillRect(-11, -11, 22, 22);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(-10, -10, 20, 20);
  ctx.save();
  ctx.rotate(({ N: 0, E: 1, S: 2, W: 3 }[facing] * Math.PI) / 2);
  ctx.fillStyle = accent;
  ctx.fillRect(-2, -7, 4, 13);
  ctx.fillRect(-5, -4, 10, 2);
  ctx.fillRect(-3, -6, 6, 2);
  ctx.restore();
}
export function drawWorker(
  ctx: CanvasRenderingContext2D,
  facing: Facing,
  moving: boolean,
  now: number,
  reduced: boolean,
  tool: 'laser' | 'extraction' | null,
  active: boolean,
  npc = false,
) {
  const stride = moving && !reduced ? (Math.floor(now / 140) % 4 < 2 ? 1 : -1) : 0;
  const idle = !moving && !reduced && Math.floor(now / 1200) % 2 ? 1 : 0;
  ctx.fillStyle = '#101b26aa';
  ctx.fillRect(-7, 7, 14, 4);
  ctx.fillStyle = '#111e2a';
  ctx.fillRect(-5, -12 + idle, 10, 8);
  ctx.fillRect(-7, -4, 14, 12);
  ctx.fillStyle = npc ? '#b69b70' : '#d8b765';
  ctx.fillRect(-4, -11 + idle, 8, 5);
  ctx.fillStyle = '#385661';
  ctx.fillRect(-4, -6 + idle, 8, 3);
  ctx.fillStyle = '#bee6df';
  if (facing !== 'N') ctx.fillRect(facing === 'E' ? 1 : -3, -7 + idle, facing === 'S' ? 6 : 3, 2);
  ctx.fillStyle = npc ? '#748e91' : '#5aa398';
  ctx.fillRect(-5, -3, 10, 8);
  ctx.fillStyle = '#e4c779';
  ctx.fillRect(-4, 0, 8, 1);
  ctx.fillRect(-1, -2, 2, 6);
  ctx.fillStyle = '#2b3d4c';
  ctx.fillRect(-4, 5, 3, 5 + stride);
  ctx.fillRect(1, 5, 3, 5 - stride);
  ctx.fillStyle = '#b3bdad';
  ctx.fillRect(-5, 9 + stride, 4, 2);
  ctx.fillRect(1, 9 - stride, 4, 2);
  if (tool) {
    const dx = facing === 'W' ? -1 : 1;
    ctx.fillStyle = '#172531';
    ctx.fillRect(dx * 6 - 3, 0, 7, 5);
    ctx.fillStyle = active ? '#f8e5aa' : '#9eb6bb';
    ctx.fillRect(dx * 8 - 2, 1, 5, 2);
  }
}

/** Settling and vacuum share authoritative tile-center coordinates. */
export function settledFragmentPosition(
  tile: { x: number; y: number },
  source: { x: number; y: number } | undefined,
  progress: number,
) {
  const ground = fragmentCenter(tile),
    t = Math.max(0, Math.min(1, progress));
  return source
    ? { x: source.x + (ground.x - source.x) * t, y: source.y + (ground.y - source.y) * t }
    : ground;
}
