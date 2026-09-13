import { areaForX, HEIGHT, OBJECTS, SCENERY, TILE, tileAt, WIDTH } from './mapData';
import { P } from './palette';
import { drawMiner, drawWorker, toolFrame, walkFrame } from './sprites';
import type { Direction, WorldState } from './world';
import type { PlayerState } from '../../shared/schema';

type Objective = NonNullable<PlayerState['firstShift']>['objective'];
export function questMarkerFor(id: string, objective?: Objective): 'available' | 'active' | 'ready' | null {
  if (id === 'foreman') {
    if (!objective || objective === 'SPEAK_TO_FOREMAN') return 'available';
    return objective === 'RETURN_TO_FOREMAN' ? 'ready' : null;
  }
  if (id === 'officer' && objective === 'CHECK_EQUIPMENT') return 'active';
  if (id === 'technician' && ['START_REFINERY_ORDER', 'COLLECT_REFINED_MATERIAL'].includes(objective ?? ''))
    return 'active';
  return null;
}

const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

export function cameraFor(world: WorldState, viewWidth: number, viewHeight: number) {
  return {
    x: Math.max(0, Math.min(WIDTH * TILE - viewWidth, Math.round(world.x * TILE - viewWidth / 2))),
    y: Math.max(0, Math.min(HEIGHT * TILE - viewHeight, Math.round(world.y * TILE - viewHeight / 2))),
  };
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  py: number,
  clock: number,
) {
  const kind = tileAt(x, y),
    mine = x > 16,
    grain = (x * 17 + y * 29) % 7;
  if (kind === 'wall' || kind === 'blocked') {
    rect(ctx, px, py, 16, 16, mine ? P.rockDark : P.steelDark);
    rect(ctx, px + 1, py + 2, 14, 3, mine ? P.rock : P.steel);
    rect(ctx, px + 1, py + 13, 14, 3, P.shadow);
    if (mine) {
      rect(ctx, px + 2 + grain, py + 6, 5, 2, P.rockLight);
      rect(ctx, px + 10, py + 9, 4, 3, P.rock);
      if (kind === 'blocked') {
        rect(ctx, px + 2, py + 4, 12, 3, P.amberDark);
        rect(ctx, px + 4, py + 5, 3, 1, P.amberLight);
      }
    } else {
      rect(ctx, px + 4, py + 5, 2, 8, P.steel);
      rect(ctx, px + 11, py + 5, 1, 8, P.steel);
      if (tileAt(x, y - 1) !== 'wall') rect(ctx, px, py, 16, 2, P.steelLight);
    }
    return;
  }
  rect(ctx, px, py, 16, 16, mine ? P.rock : P.floor);
  if (mine) {
    rect(ctx, px + grain, py + 3, 4, 2, P.rockLight);
    rect(ctx, px + 9, py + 11, 3, 1, P.rockDark);
    if ((x + y * 3) % 5 === 0) rect(ctx, px + 4, py + 8, 5, 2, P.rockDark);
    if ((x * 2 + y) % 11 === 0) rect(ctx, px + 8, py + 3, 2, 2, P.green);
    // A narrow haul rail and survey markings give the chamber readable structure.
    if (y === 12 && x >= 18 && x <= 29) {
      rect(ctx, px, py + 4, 16, 2, P.steelDark);
      rect(ctx, px, py + 11, 16, 2, P.steelDark);
      rect(ctx, px + 3, py + 3, 3, 11, P.steelLight);
      rect(ctx, px + 12, py + 3, 3, 11, P.steelLight);
    }
    if ((x === 21 && y === 7) || (x === 27 && y === 16)) {
      rect(ctx, px + 3, py + 2, 7, 2, P.amberDark);
      rect(ctx, px + 5, py + 5, 4, 2, P.amber);
      rect(ctx, px + 8, py + 7, 3, 1, P.amberLight);
    }
  } else {
    rect(ctx, px + 1, py + 1, 14, 1, P.floorEdge);
    rect(ctx, px + 1, py + 14, 14, 1, P.steelDark);
    rect(ctx, px + grain + 2, py + 8, 2, 1, P.steelLight);
    if ((x + y * 2) % 6 === 0) {
      rect(ctx, px + 3, py + 4, 9, 1, P.steelDark);
      rect(ctx, px + 3, py + 5, 1, 5, P.steelDark);
    }
    // Arrival-pad ring and equipment staging markings.
    if (x >= 3 && x <= 8 && y >= 14 && y <= 19 && (x === 3 || x === 8 || y === 14 || y === 19))
      rect(ctx, px + 2, py + 7, 12, 2, P.amberDark);
    if (y === 9 && x >= 3 && x <= 15) {
      rect(ctx, px, py + 13, 16, 2, P.steelLight);
      rect(ctx, px + 7, py + 13, 2, 2, P.amber);
    }
    if (y === 13 && x >= 7 && x <= 13) {
      rect(ctx, px + 1, py + 12, 8, 2, P.amberDark);
      rect(ctx, px + 10, py + 12, 3, 2, P.amber);
    }
    if (x === 15 && y >= 9 && y <= 12) rect(ctx, px + 12, py, 3, 16, P.amber);
  }
  if (kind === 'entrance') {
    rect(ctx, px, py + 1, 16, 3, P.amberDark);
    rect(ctx, px + 2, py + 5, 12, 2, P.amber);
    rect(ctx, px + 1, py + 12, 14, 2, P.steelLight);
  }
  if (mine && ((x === 18 && y === 10) || (x === 27 && y === 14))) {
    rect(ctx, px + 6, py + 2, 4, 4, Math.floor(clock * 2) % 2 ? P.amber : P.amberLight);
    rect(ctx, px + 4, py + 6, 8, 2, P.amberDark);
  }
}

function drawScenery(ctx: CanvasRenderingContext2D, kind: string, px: number, py: number) {
  rect(ctx, px + 1, py + 13, 14, 3, P.shadow);
  if (kind === 'crate' || kind === 'cart') {
    rect(
      ctx,
      px + 1,
      py + (kind === 'cart' ? 7 : 3),
      14,
      kind === 'cart' ? 7 : 11,
      kind === 'cart' ? P.steel : P.amberDark,
    );
    rect(ctx, px + 2, py + 4, 12, 3, kind === 'cart' ? P.green : P.amber);
    rect(ctx, px + 7, py + 7, 2, 6, P.shadow);
    if (kind === 'cart') {
      rect(ctx, px + 3, py + 14, 3, 2, P.void);
      rect(ctx, px + 11, py + 14, 3, 2, P.void);
    }
  } else if (kind === 'machine' || kind === 'cabinet' || kind === 'rack') {
    rect(ctx, px + 1, py + 1, 14, 13, P.steel);
    rect(ctx, px + 3, py + 3, 10, kind === 'rack' ? 2 : 5, kind === 'cabinet' ? P.amber : P.cyanDark);
    rect(ctx, px + 4, py + 4, 7, 2, kind === 'cabinet' ? P.amberLight : P.cyan);
    rect(ctx, px + 2, py + 10, 12, 2, P.steelDark);
    if (kind === 'rack') rect(ctx, px + 4, py + 7, 8, 2, P.suit);
  } else if (kind === 'support') {
    rect(ctx, px + 1, py, 3, 15, P.amberDark);
    rect(ctx, px + 12, py, 3, 15, P.amberDark);
    rect(ctx, px + 1, py, 14, 3, P.amber);
    rect(ctx, px + 5, py + 4, 6, 2, P.steelLight);
  } else {
    rect(ctx, px + 2, py + 5, 12, 9, P.rockDark);
    rect(ctx, px + 5, py + 2, 7, 6, P.rockLight);
    rect(ctx, px + 8, py + 4, 3, 2, P.rock);
  }
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  item: (typeof OBJECTS)[number],
  px: number,
  py: number,
  clock: number,
  npcFacing?: { id: string; direction: Direction },
  objective?: Objective,
) {
  rect(ctx, px + 1, py + 13, 14, 3, P.shadow);
  if (item.kind === 'npc') {
    drawWorker(
      ctx,
      px + 8,
      py + 15,
      clock,
      item.color,
      npcFacing?.id === item.id ? npcFacing.direction : 'down',
    );
    const marker = questMarkerFor(item.id, objective);
    if (marker) {
      rect(ctx, px + 5, py - 8, 6, 6, P.amberDark);
      rect(
        ctx,
        px + 7,
        py - 7,
        2,
        4,
        marker === 'ready' ? P.green : marker === 'active' ? P.cyan : P.amberLight,
      );
    }
    return;
  }
  if (item.kind === 'deposit') {
    const hue = item.color;
    rect(ctx, px + 3, py + 9, 12, 5, P.rockDark);
    rect(ctx, px + 5, py + 5, 7, 8, hue);
    rect(ctx, px + 7, py + 1, 4, 7, hue);
    rect(ctx, px + 3, py + 7, 4, 5, hue);
    rect(ctx, px + 7, py + 3, 2, 4, P.cream);
    if (Math.floor(clock * 2 + item.x) % 3 === 0) rect(ctx, px + 12, py + 2, 2, 2, P.cyanLight);
    return;
  }
  if (item.kind === 'refinery') {
    rect(ctx, px + 1, py + 5, 14, 9, P.steel);
    rect(ctx, px + 3, py + 1, 5, 8, P.cyanDark);
    rect(ctx, px + 4, py + 2, 3, 5, P.cyanLight);
    rect(ctx, px + 10, py + 2, 3, 10, P.steelLight);
    rect(ctx, px + 2, py + 11, 12, 2, P.cyan);
  } else if (item.kind === 'market') {
    rect(ctx, px + 1, py + 7, 14, 7, P.amberDark);
    rect(ctx, px + 2, py + 5, 12, 3, P.amber);
    rect(ctx, px + 4, py + 1, 8, 5, P.steelDark);
    rect(ctx, px + 5, py + 2, 6, 3, P.amberLight);
    rect(ctx, px + 5, py + 10, 6, 2, P.cream);
  } else {
    rect(ctx, px + 2, py + 5, 12, 9, P.steelDark);
    rect(ctx, px + 5, py + 1, 6, 8, P.blue);
    rect(ctx, px + 6, py + 2, 4, 4, P.cyanLight);
    rect(ctx, px + 1, py + 11, 14, 2, P.blue);
  }
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  viewWidth: number,
  viewHeight: number,
  reducedMotion: boolean,
  toolUntil: number,
  fade: number,
  npcFacing?: { id: string; direction: Direction },
  objective?: Objective,
) {
  ctx.imageSmoothingEnabled = false;
  const camera = cameraFor(world, viewWidth, viewHeight);
  rect(ctx, 0, 0, viewWidth, viewHeight, areaForX(world.x) === 'mine' ? P.rockDark : P.void);
  for (let y = Math.floor(camera.y / TILE); y <= Math.floor((camera.y + viewHeight) / TILE); y++)
    for (let x = Math.floor(camera.x / TILE); x <= Math.floor((camera.x + viewWidth) / TILE); x++)
      drawTile(ctx, x, y, x * TILE - camera.x, y * TILE - camera.y, reducedMotion ? 0 : world.clock);
  for (const item of SCENERY) {
    const px = item.x * TILE - camera.x,
      py = item.y * TILE - camera.y;
    if (px > -TILE && py > -TILE && px < viewWidth && py < viewHeight) drawScenery(ctx, item.kind, px, py);
  }
  for (const item of OBJECTS) {
    const px = item.x * TILE - camera.x,
      py = item.y * TILE - camera.y;
    if (px > -TILE && py > -TILE && px < viewWidth && py < viewHeight)
      drawObject(ctx, item, px, py, reducedMotion ? 0 : world.clock, npcFacing, objective);
  }
  drawMiner(
    ctx,
    world.x * TILE - camera.x,
    world.y * TILE - camera.y,
    world.facing,
    walkFrame(world.moving && !reducedMotion, world.clock),
    toolFrame(world.clock, toolUntil),
    !reducedMotion && Math.floor(world.clock * 1.2) % 3 === 0,
  );
  if (fade > 0) rect(ctx, 0, 0, viewWidth, viewHeight, `rgba(7,18,29,${fade.toFixed(3)})`);
}
