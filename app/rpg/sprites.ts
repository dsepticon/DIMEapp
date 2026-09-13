import { ART_GRID, P } from './palette';
import { Direction } from './world';

export function walkFrame(moving: boolean, clock: number): 0 | 1 | 2 {
  if (!moving) return 0;
  return (Math.floor(clock * 9) % 3) as 0 | 1 | 2;
}

export function toolFrame(now: number, until: number): 0 | 1 | 2 {
  if (now >= until) return 0;
  return Math.max(1, Math.min(2, Math.ceil((until - now) / 160))) as 1 | 2;
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Draws a 16×22 sprite around its foot point; never uses external image data. */
export function drawMiner(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number,
  facing: Direction,
  frame: 0 | 1 | 2,
  tool: 0 | 1 | 2,
  idlePulse: boolean,
) {
  const x = Math.round(footX - ART_GRID.spriteWidth / 2);
  const y = Math.round(footY - ART_GRID.spriteHeight + 2);
  const step = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  block(ctx, x + 1, y + 20, 14, 2, P.shadow);
  // Distinct life-support pack on the rear or side.
  if (facing === 'left') block(ctx, x + 10, y + 9, 5, 9, P.amberDark);
  else if (facing === 'right') block(ctx, x + 1, y + 9, 5, 9, P.amberDark);
  else block(ctx, x + 5, y + 10, 6, 8, facing === 'up' ? P.amber : P.steelDark);
  block(ctx, x + 4, y + 10, 8, 9, P.suitDark);
  block(ctx, x + 5, y + 11, 6, 7, P.suit);
  block(ctx, x + 3, y + 11 + (frame === 2 ? 1 : 0), 3, 7, P.suit);
  block(ctx, x + 10, y + 11 + (frame === 1 ? 1 : 0), 3, 7, P.suit);
  block(ctx, x + 3, y + 16, 3, 2, P.steel);
  block(ctx, x + 10, y + 16, 3, 2, P.steel);
  block(ctx, x + 4, y + 18 + step, 4, 3 - step, P.steelDark);
  block(ctx, x + 9, y + 18 - step, 4, 3 + step, P.steelDark);
  // Hard hat, lamp and face shield read in all four directions.
  block(ctx, x + 3, y + 2, 10, 9, P.steelDark);
  block(ctx, x + 4, y + 1, 8, 3, P.amber);
  block(ctx, x + 2, y + 4, 12, 2, P.suit);
  if (facing === 'up') {
    block(ctx, x + 5, y + 5, 6, 4, P.steel);
    block(ctx, x + 6, y + 6, 4, 2, P.cyanDark);
  } else if (facing === 'left') {
    block(ctx, x + 2, y + 6, 8, 4, P.visor);
    block(ctx, x + 2, y + 7, 5, 2, P.cyan);
    block(ctx, x + 9, y + 7, 3, 2, P.face);
  } else if (facing === 'right') {
    block(ctx, x + 6, y + 6, 8, 4, P.visor);
    block(ctx, x + 9, y + 7, 5, 2, P.cyan);
    block(ctx, x + 4, y + 7, 3, 2, P.face);
  } else {
    block(ctx, x + 4, y + 6, 8, 4, P.visor);
    block(ctx, x + 5, y + 7, 6, 2, P.cyan);
    block(ctx, x + 7, y + 10, 2, 1, P.face);
  }
  block(ctx, x + 7, y + 2, 2, 2, idlePulse ? P.amberLight : P.amberDark);
  const handX = facing === 'left' ? x + 1 : x + 12;
  const handY = y + 13 - (tool ? tool * 2 : 0);
  block(ctx, handX, handY, 3, 3, P.face);
  block(ctx, facing === 'left' ? handX - 4 : handX + 2, handY - (tool ? 3 : 1), 5, 2, P.steelLight);
  if (tool) block(ctx, facing === 'left' ? handX - 7 : handX + 6, handY - 6, 3, 3, P.cyanLight);
}

export function drawWorker(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number,
  clock: number,
  coat: string = P.violet,
  facing: Direction = 'down',
) {
  const x = Math.round(footX - 7),
    y = Math.round(footY - 21);
  block(ctx, x + 2, y + 19, 12, 2, P.shadow);
  block(ctx, x + 4, y + 11, 8, 8, coat);
  block(ctx, x + 3, y + 11, 2, 7, P.suitDark);
  block(ctx, x + 11, y + 11, 2, 7, P.suitDark);
  block(ctx, x + 5, y + 18, 3, 3, P.steelDark);
  block(ctx, x + 9, y + 18, 3, 3, P.steelDark);
  block(ctx, x + 4, y + 3, 8, 8, P.face);
  block(ctx, x + 3, y + 1, 10, 4, P.steel);
  block(
    ctx,
    facing === 'left' ? x + 3 : facing === 'right' ? x + 7 : x + 5,
    y + 6,
    facing === 'up' ? 4 : 6,
    2,
    Math.floor(clock * 1.3) % 5 === 0 ? P.visor : P.cyan,
  );
  block(ctx, x + 6, y + 12, 4, 2, P.amber);
}
