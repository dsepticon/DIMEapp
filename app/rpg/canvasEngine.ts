import { areaForX, areaName } from './mapData';
import { drawWorld } from './renderWorld';
import {
  advance,
  Direction,
  initialWorld,
  InputState,
  nearestObject,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WorldObject,
} from './world';

type Callbacks = {
  prompt: (object: WorldObject | undefined) => void;
  interact: (object: WorldObject) => void;
  escape: () => void;
  backpack?: () => void;
  area?: (name: string) => void;
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
export const FADE_MS = 560;
export function transitionOpacity(elapsed: number): number {
  if (elapsed < 0 || elapsed >= FADE_MS) return 0;
  return 1 - Math.abs(elapsed - FADE_MS / 2) / (FADE_MS / 2);
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
  private resizeObserver: ResizeObserver;
  private toolUntil = 0;
  private transitionStart: number | null = null;
  private area = areaForX(this.world.x);
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
    this.resizeObserver.observe(this.canvas);
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
    this.resizeObserver.disconnect();
    this.clearInput();
  }
  setOverlay(open: boolean) {
    this.overlay = open;
    this.clearInput();
  }
  setDirection(direction: Direction, pressed: boolean) {
    if (!this.overlay && this.transitionStart === null) this.input[direction] = pressed;
    else if (!pressed) this.input[direction] = false;
  }
  interact() {
    if (!this.focused || document.hidden || this.overlay || this.transitionStart !== null) return;
    const object = nearestObject(this.world);
    if (object) {
      this.toolUntil = this.world.clock + 0.36;
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
      if (this.transitionStart === null) this.input[direction] = true;
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
    if (this.transitionStart !== null && time - this.transitionStart >= FADE_MS) this.transitionStart = null;
    const canMove = this.focused && !document.hidden && !this.overlay && this.transitionStart === null;
    if (canMove) {
      this.world = advance(this.world, this.input, elapsed);
      const nextArea = areaForX(this.world.x);
      if (nextArea !== this.area) {
        this.area = nextArea;
        this.transitionStart = time;
        this.world.moving = false;
        this.callbacks.area?.(areaName(nextArea));
      }
    }
    const object = nearestObject(this.world);
    if (object?.id !== this.prompted) {
      this.prompted = object?.id;
      this.callbacks.prompt(object);
    }
    const ctx = this.canvas.getContext('2d');
    if (ctx)
      drawWorld(
        ctx,
        this.world,
        this.canvas.width,
        this.canvas.height,
        this.reducedMotion,
        this.toolUntil,
        this.transitionStart === null ? 0 : transitionOpacity(time - this.transitionStart),
      );
    this.frame = requestAnimationFrame(this.tick);
  };
}
