import {
  advance,
  Direction,
  initialWorld,
  InputState,
  nearestObject,
  OBJECTS,
  SCENERY,
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
  backpack?: () => void;
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
  private overlay = false;
  private resizeObserver: ResizeObserver | undefined;
  private toolUntil = 0;
  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: Callbacks,
  ) {
    this.canvas.width = VIEW_WIDTH;
    this.canvas.height = VIEW_HEIGHT;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => {
      const bounds = this.canvas.getBoundingClientRect();
      if (bounds.width && bounds.height)
        this.canvas.height = Math.max(160, Math.round((VIEW_WIDTH * bounds.height) / bounds.width));
    });
  }
  start() {
    if (this.active) return;
    this.active = true;
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.pause);
    window.addEventListener('focus', this.resume);
    document.addEventListener('visibilitychange', this.visibility);
    this.resizeObserver?.observe(this.canvas);
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
    this.resizeObserver?.disconnect();
    this.clearInput();
  }
  setOverlay(open: boolean) {
    this.overlay = open;
    this.clearInput();
  }
  setDirection(direction: Direction, pressed: boolean) {
    this.input[direction] = pressed;
  }
  interact() {
    if (!this.focused || document.hidden || this.overlay) return;
    const object = nearestObject(this.world);
    if (object) {
      this.toolUntil = performance.now() + 320;
      this.callbacks.interact(object);
    }
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
    if (this.overlay && event.code !== 'Escape') return;
    if (direction) {
      event.preventDefault();
      this.input[direction] = true;
    } else if (event.code === 'KeyI') {
      event.preventDefault();
      if (!event.repeat) this.callbacks.backpack?.();
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
    if (this.focused && !document.hidden && !this.overlay)
      this.world = advance(this.world, this.input, elapsed);
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
    const viewHeight = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    const cameraX = Math.max(
      0,
      Math.min(WIDTH * TILE - VIEW_WIDTH, Math.round(this.world.x * TILE - VIEW_WIDTH / 2)),
    );
    const cameraY = Math.max(
      0,
      Math.min(HEIGHT * TILE - viewHeight, Math.round(this.world.y * TILE - viewHeight / 2)),
    );
    ctx.fillStyle = '#08111e';
    ctx.fillRect(0, 0, VIEW_WIDTH, viewHeight);
    const firstX = Math.floor(cameraX / TILE),
      firstY = Math.floor(cameraY / TILE);
    for (let y = firstY; y <= firstY + viewHeight / TILE + 1; y++)
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
          ctx.fillStyle = '#142936';
          ctx.fillRect(px + 1, py + 13, 14, 2);
          if (tileAt(x, y - 1) !== 'wall') {
            ctx.fillStyle = '#7e9590';
            ctx.fillRect(px + 1, py, 14, 2);
          }
        } else {
          ctx.fillRect(px + 2 + grain, py + 4, 2, 2);
          ctx.fillRect(px + 11 - grain / 2, py + 12, 2, 1);
          if ((x * 5 + y * 11) % 13 === 0) {
            ctx.fillStyle = kind === 'mine' ? '#7d7086' : '#8ca6a0';
            ctx.fillRect(px + 4, py + 8, 3, 1);
            ctx.fillRect(px + 6, py + 9, 2, 1);
          }
          if (kind === 'ground' && y % 6 === 0 && x % 5 === 0) {
            ctx.fillStyle = '#d1a75c';
            ctx.fillRect(px + 1, py + 1, 3, 1);
            ctx.fillRect(px + 1, py + 3, 1, 3);
          }
          if (kind === 'ground' && y === 9 && x >= 4 && x <= 14) {
            ctx.fillStyle = '#698482';
            ctx.fillRect(px, py + 13, 16, 2);
            ctx.fillStyle = '#b59b67';
            ctx.fillRect(px + 7, py + 13, 2, 2);
          }
          if (kind === 'ground' && y === 13 && x >= 6 && x <= 10) {
            ctx.fillStyle = '#b99b54';
            ctx.fillRect(px + 3, py + 9, 7, 1);
            ctx.fillRect(px + 9, py + 10, 3, 1);
          }
        }
        if (kind === 'entrance') {
          ctx.fillStyle = '#f2d08a';
          ctx.fillRect(px + 1, py + 7, 14, 2);
          ctx.fillStyle = '#f3b951';
          ctx.fillRect(px + 1, py + 1, 3, 3);
          ctx.fillRect(px + 12, py + 1, 3, 3);
        }
      }
    for (const item of SCENERY) {
      const px = item.x * TILE - cameraX,
        py = item.y * TILE - cameraY;
      if (px < -TILE || py < -TILE || px > VIEW_WIDTH || py > viewHeight) continue;
      ctx.fillStyle = '#142733';
      ctx.fillRect(px + 1, py + 12, 14, 3);
      if (item.kind === 'crate') {
        ctx.fillStyle = '#a58057';
        ctx.fillRect(px + 2, py + 3, 12, 10);
        ctx.fillStyle = '#d2b075';
        ctx.fillRect(px + 2, py + 3, 12, 2);
        ctx.fillRect(px + 7, py + 5, 2, 7);
      } else if (item.kind === 'machine') {
        ctx.fillStyle = '#4b7180';
        ctx.fillRect(px + 2, py + 1, 12, 12);
        ctx.fillStyle = '#a4ebcf';
        ctx.fillRect(px + 4, py + 3, 8, 4);
        ctx.fillStyle = '#eead60';
        ctx.fillRect(px + 5, py + 10, 2, 2);
      } else {
        ctx.fillStyle = '#dbbd85';
        ctx.fillRect(px + 5, py + 1, 6, 5);
        ctx.fillStyle = '#a786c0';
        ctx.fillRect(px + 4, py + 6, 8, 7);
        ctx.fillStyle = '#32475a';
        ctx.fillRect(px + 5, py + 13, 3, 2);
        ctx.fillRect(px + 9, py + 13, 3, 2);
      }
    }
    for (const item of OBJECTS) {
      const px = item.x * TILE - cameraX,
        py = item.y * TILE - cameraY;
      if (px < -TILE || py < -TILE || px > VIEW_WIDTH || py > viewHeight) continue;
      ctx.fillStyle = '#151b2a';
      ctx.fillRect(px + 2, py + 12, 13, 3);
      ctx.fillStyle = item.color;
      if (item.kind === 'deposit') {
        ctx.fillRect(px + 6, py + 1, 4, 10);
        ctx.fillRect(px + 3, py + 6, 10, 6);
        ctx.fillStyle = '#e5f5f3';
        ctx.fillRect(px + 7, py + 2, 2, 4);
        ctx.fillStyle = '#765d8e';
        ctx.fillRect(px + 3, py + 11, 10, 2);
      } else {
        ctx.fillRect(px + (item.kind === 'travel' ? 1 : 2), py + 2, item.kind === 'travel' ? 14 : 12, 11);
        ctx.fillStyle = '#10212e';
        ctx.fillRect(px + 4, py + 4, 8, 5);
        ctx.fillStyle = '#eaf8d5';
        ctx.fillRect(px + 6, py + 5, 4, 2);
        ctx.fillStyle = item.kind === 'refinery' ? '#ffc66d' : item.kind === 'market' ? '#7bf3df' : '#b1caff';
        ctx.fillRect(px + 3, py + 11, 10, 2);
        if (item.kind === 'travel') {
          ctx.fillRect(px + 7, py, 2, 3);
          ctx.fillRect(px + 6, py + 1, 4, 1);
        }
      }
    }
    const px = Math.round(this.world.x * TILE - cameraX),
      py = Math.round(this.world.y * TILE - cameraY);
    const stride = this.world.moving && !this.reducedMotion ? Math.floor(this.world.clock * 8) % 2 : 0;
    ctx.fillStyle = '#101c2a';
    ctx.fillRect(px - 7, py + 7, 14, 3);
    ctx.fillStyle = '#dfe8df';
    ctx.fillRect(px - 6, py - 6, 12, 12);
    ctx.fillStyle = '#53c9d4';
    ctx.fillRect(px - 5, py - 9, 10, 6);
    ctx.fillStyle = '#f4d19a';
    ctx.fillRect(px - 3, py - 3, 6, 3);
    ctx.fillStyle = '#f5c579';
    ctx.fillRect(px - 6, py - 1, 2, 5);
    ctx.fillRect(px + 4, py - 1, 2, 5);
    ctx.fillStyle = '#26384a';
    ctx.fillRect(px - 5, py + 5, 4, 3 + stride);
    ctx.fillRect(px + 1, py + 5, 4, 4 - stride);
    ctx.fillStyle = '#e8f6dd';
    if (this.world.facing === 'up') ctx.fillRect(px - 2, py - 6, 4, 1);
    if (this.world.facing === 'left') ctx.fillRect(px - 5, py - 4, 1, 2);
    if (this.world.facing === 'right') ctx.fillRect(px + 4, py - 4, 1, 2);
    if (!this.world.moving && !this.reducedMotion && Math.floor(this.world.clock * 1.5) % 2 === 0) {
      ctx.fillStyle = '#ffd889';
      ctx.fillRect(px - 1, py, 2, 1);
    }
    if (performance.now() < this.toolUntil) {
      ctx.fillStyle = '#f7c26c';
      ctx.fillRect(px + (this.world.facing === 'left' ? -12 : 7), py - 4, 5, 2);
    }
  }
}
