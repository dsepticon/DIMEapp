import {
  advance,
  Direction,
  initialWorld,
  InputState,
  nearestObject,
  OBJECTS,
  tileAt,
  TILE,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WIDTH,
  HEIGHT,
  WorldObject,
} from './world';

type Callbacks = {
  prompt: (object: WorldObject | undefined) => void;
  interact: (object: WorldObject) => void;
  escape: () => void;
};
const KEY_DIRECTION: Record<string, Direction | undefined> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};
export function directionForKey(code: string): Direction | undefined {
  return KEY_DIRECTION[code];
}

export class CanvasEngine {
  world = initialWorld();
  private input: InputState = { up: false, down: false, left: false, right: false };
  private frame = 0;
  private lastTime = 0;
  private active = false;
  private focused = true;
  private prompted: string | undefined;
  private reducedMotion = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: Callbacks,
  ) {
    this.canvas.width = VIEW_WIDTH;
    this.canvas.height = VIEW_HEIGHT;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  start() {
    if (this.active) return;
    this.active = true;
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.pause);
    window.addEventListener('focus', this.resume);
    document.addEventListener('visibilitychange', this.visibility);
    this.frame = requestAnimationFrame(this.tick);
  }
  destroy() {
    this.active = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.pause);
    window.removeEventListener('focus', this.resume);
    document.removeEventListener('visibilitychange', this.visibility);
    this.clearInput();
  }
  setDirection(direction: Direction, pressed: boolean) {
    this.input[direction] = pressed;
  }
  interact() {
    if (!this.focused || document.hidden) return;
    const object = nearestObject(this.world);
    if (object) this.callbacks.interact(object);
  }
  private clearInput() {
    this.input = { up: false, down: false, left: false, right: false };
    this.world.moving = false;
  }
  private pause = () => {
    this.focused = false;
    this.clearInput();
  };
  private resume = () => {
    this.focused = true;
    this.lastTime = 0;
  };
  private visibility = () => {
    if (document.hidden) this.pause();
    else this.resume();
  };
  private keyDown = (event: KeyboardEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
    )
      return;
    const direction = directionForKey(event.code);
    if (direction) {
      event.preventDefault();
      this.input[direction] = true;
    } else if (event.code === 'KeyE' || event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) this.interact();
    } else if (event.code === 'Escape') this.callbacks.escape();
  };
  private keyUp = (event: KeyboardEvent) => {
    const direction = directionForKey(event.code);
    if (direction) {
      event.preventDefault();
      this.input[direction] = false;
    }
  };
  private tick = (time: number) => {
    if (!this.active) return;
    const elapsed = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    this.lastTime = time;
    if (this.focused && !document.hidden) this.world = advance(this.world, this.input, elapsed);
    const object = nearestObject(this.world);
    if (object?.id !== this.prompted) {
      this.prompted = object?.id;
      this.callbacks.prompt(object);
    }
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };
  private draw() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const cameraX = Math.max(
      0,
      Math.min(WIDTH * TILE - VIEW_WIDTH, Math.round(this.world.x * TILE - VIEW_WIDTH / 2)),
    );
    const cameraY = Math.max(
      0,
      Math.min(HEIGHT * TILE - VIEW_HEIGHT, Math.round(this.world.y * TILE - VIEW_HEIGHT / 2)),
    );
    ctx.fillStyle = '#08111e';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    const firstX = Math.floor(cameraX / TILE),
      firstY = Math.floor(cameraY / TILE);
    for (let y = firstY; y <= firstY + VIEW_HEIGHT / TILE + 1; y++)
      for (let x = firstX; x <= firstX + VIEW_WIDTH / TILE + 1; x++) {
        const kind = tileAt(x, y),
          px = x * TILE - cameraX,
          py = y * TILE - cameraY;
        const grain = (x * 17 + y * 29) % 7;
        ctx.fillStyle =
          kind === 'wall'
            ? '#263947'
            : kind === 'mine'
              ? '#413847'
              : kind === 'entrance'
                ? '#ad8158'
                : '#304e59';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = kind === 'wall' ? '#455a63' : kind === 'mine' ? '#574a55' : '#497078';
        if (kind === 'wall') {
          ctx.fillRect(px + 1, py + 1, 14, 3);
          ctx.fillRect(px + 3, py + 5, 2, 8);
        } else {
          ctx.fillRect(px + 2 + grain, py + 4, 2, 2);
          ctx.fillRect(px + 11 - grain / 2, py + 12, 2, 1);
        }
        if (kind === 'entrance') {
          ctx.fillStyle = '#f2d08a';
          ctx.fillRect(px + 1, py + 7, 14, 2);
        }
      }
    for (const item of OBJECTS) {
      const px = item.x * TILE - cameraX,
        py = item.y * TILE - cameraY;
      if (px < -TILE || py < -TILE || px > VIEW_WIDTH || py > VIEW_HEIGHT) continue;
      ctx.fillStyle = '#151b2a';
      ctx.fillRect(px + 2, py + 12, 13, 3);
      ctx.fillStyle = item.color;
      if (item.kind === 'deposit') {
        ctx.fillRect(px + 5, py + 2, 6, 11);
        ctx.fillRect(px + 3, py + 7, 10, 5);
        ctx.fillStyle = '#e5f5f3';
        ctx.fillRect(px + 7, py + 3, 2, 4);
      } else {
        ctx.fillRect(px + 2, py + 2, 12, 11);
        ctx.fillStyle = '#10212e';
        ctx.fillRect(px + 4, py + 4, 8, 5);
        ctx.fillStyle = '#eaf8d5';
        ctx.fillRect(px + 6, py + 5, 4, 2);
      }
    }
    const px = Math.round(this.world.x * TILE - cameraX),
      py = Math.round(this.world.y * TILE - cameraY);
    const stride = this.world.moving && !this.reducedMotion ? Math.floor(this.world.clock * 8) % 2 : 0;
    ctx.fillStyle = '#101c2a';
    ctx.fillRect(px - 6, py + 5, 12, 3);
    ctx.fillStyle = '#dfe8df';
    ctx.fillRect(px - 5, py - 7, 10, 11);
    ctx.fillStyle = '#53c9d4';
    ctx.fillRect(px - 4, py - 5, 8, 4);
    ctx.fillStyle = '#f5c579';
    ctx.fillRect(px - 6, py - 1, 2, 5);
    ctx.fillRect(px + 4, py - 1, 2, 5);
    ctx.fillStyle = '#26384a';
    ctx.fillRect(px - 4, py + 4, 3, 3 + stride);
    ctx.fillRect(px + 1, py + 4, 3, 4 - stride);
    ctx.fillStyle = '#e8f6dd';
    if (this.world.facing === 'up') ctx.fillRect(px - 2, py - 6, 4, 1);
    if (this.world.facing === 'left') ctx.fillRect(px - 5, py - 4, 1, 2);
    if (this.world.facing === 'right') ctx.fillRect(px + 4, py - 4, 1, 2);
    if (!this.world.moving && !this.reducedMotion && Math.floor(this.world.clock * 1.5) % 2 === 0) {
      ctx.fillStyle = '#ffd889';
      ctx.fillRect(px - 1, py, 2, 1);
    }
    ctx.fillStyle = '#0b1722';
    ctx.fillRect(5, 5, 108, 15);
    ctx.fillStyle = '#e0e9d8';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(this.world.x < 16 ? 'LYRIA OUTPOST' : 'LYRIA MINE', 10, 15);
  }
}
