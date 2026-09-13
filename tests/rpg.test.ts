import { describe, expect, it } from 'vitest';
import { initialState } from '../shared/game';
import { MiningActionAdapter } from '../app/rpg/actionAdapter';
import { directionForKey } from '../app/rpg/canvasEngine';
import { FADE_MS, transitionOpacity } from '../app/rpg/canvasEngine';
import { areaForX, areaName } from '../app/rpg/mapData';
import { drawMiner, toolFrame, walkFrame } from '../app/rpg/sprites';
import { questMarkerFor } from '../app/rpg/renderWorld';
import { drawSurveyIcon } from '../app/rpg/ui/SurveyIcon';
import { advance, canStand, initialWorld, nearestObject, OBJECTS, tileAt } from '../app/rpg/world';

const none = { up: false, down: false, left: false, right: false };

describe('Lyria local scene', () => {
  it('distinguishes available, active and completion-ready quest markers', () => {
    expect(questMarkerFor('foreman')).toBe('available');
    expect(questMarkerFor('foreman', 'RETURN_TO_FOREMAN')).toBe('ready');
    expect(questMarkerFor('officer', 'CHECK_EQUIPMENT')).toBe('active');
    expect(questMarkerFor('officer', 'SELL_MINED_GEM')).toBe('active');
    expect(questMarkerFor('technician', 'START_REFINERY_ORDER')).toBeNull();
    expect(questMarkerFor('foreman', 'COMPLETE')).toBeNull();
    expect(questMarkerFor('dolivine', 'MINE_ASSIGNED_ORE')).toBeNull();
  });
  it('contains three catalog mineral seams and all three service terminals', () => {
    expect(OBJECTS.filter((item) => item.kind === 'deposit').map((item) => item.id)).toEqual([
      'dolivine',
      'aphorite',
      'hadanite',
    ]);
    expect(
      OBJECTS.filter((item) => item.kind !== 'deposit')
        .map((item) => item.kind)
        .sort(),
    ).toEqual(['market', 'npc', 'npc', 'npc', 'refinery', 'travel']);
  });
  it('moves in four directions without writing to any API', () => {
    let world = initialWorld();
    const start = { ...world };
    for (const direction of ['right', 'down', 'left', 'up'] as const) {
      const before = world;
      world = advance(world, { ...none, [direction]: true }, 0.05);
      expect(world.moving).toBe(true);
      expect(world.x !== before.x || world.y !== before.y).toBe(true);
    }
    expect(world.x).toBeCloseTo(start.x);
    expect(world.y).toBeCloseTo(start.y);
  });
  it('blocks walls and terminal/deposit tiles but permits the exact mine entrance', () => {
    expect(tileAt(16, 9)).toBe('wall');
    expect(tileAt(16, 10)).toBe('entrance');
    expect(canStand(16.5, 9.5)).toBe(false);
    expect(canStand(16.5, 10.5)).toBe(true);
    expect(canStand(22.5, 5.5)).toBe(false);
    const blocked = advance({ ...initialWorld(), x: 15.7, y: 9.5 }, { ...none, right: true }, 0.05);
    expect(blocked.x).toBe(15.7);
  });
  it('interacts only within a short distance', () => {
    expect(nearestObject({ ...initialWorld(), x: 21.5, y: 5.5 })?.id).toBe('dolivine');
    expect(nearestObject({ ...initialWorld(), x: 19.5, y: 5.5 })).toBeUndefined();
    expect(nearestObject(initialWorld())).toBeUndefined();
  });
  it('maps WASD and arrows, leaving other keys to their own handlers', () => {
    expect(directionForKey('KeyW')).toBe('up');
    expect(directionForKey('ArrowDown')).toBe('down');
    expect(directionForKey('KeyA')).toBe('left');
    expect(directionForKey('ArrowRight')).toBe('right');
    expect(directionForKey('KeyE')).toBeUndefined();
  });
});

describe('Milestone 1.2 authored art and scene rules', () => {
  it('draws four distinct original 16-pixel survey icons without external assets', () => {
    const icons = new Set<string>();
    for (const source of ['Hand', 'Roc', 'Prospector', 'Mole'] as const) {
      const marks: string[] = [];
      const context = {
        fillStyle: '',
        clearRect(x: number, y: number, width: number, height: number) {
          expect([x, y, width, height]).toEqual([0, 0, 16, 16]);
        },
        fillRect(x: number, y: number, width: number, height: number) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + width).toBeLessThanOrEqual(16);
          expect(y + height).toBeLessThanOrEqual(16);
          marks.push(`${x},${y},${width},${height},${this.fillStyle}`);
        },
      } as CanvasRenderingContext2D;
      drawSurveyIcon(context, source);
      icons.add(marks.join('|'));
    }
    expect(icons.size).toBe(4);
  });
  it('uses three walking frames and settles to idle for every facing direction', () => {
    const poses = new Set<string>();
    for (const facing of ['up', 'down', 'left', 'right']) {
      const pixels: string[] = [];
      const ctx = {
        fillStyle: '',
        fillRect(x: number, y: number, w: number, h: number) {
          pixels.push(`${x},${y},${w},${h},${this.fillStyle}`);
        },
      } as CanvasRenderingContext2D;
      drawMiner(ctx, 8, 22, facing as 'up' | 'down' | 'left' | 'right', 0, 0, false);
      poses.add(pixels.join('|'));
      expect([walkFrame(true, 0), walkFrame(true, 0.12), walkFrame(true, 0.23)]).toEqual([0, 1, 2]);
      expect(walkFrame(false, 0.23)).toBe(0);
    }
    expect(poses.size).toBe(4);
  });
  it('finishes the short tool motion and fades a transition with locked midpoint', () => {
    expect(toolFrame(0, 320)).toBe(2);
    expect(toolFrame(200, 320)).toBe(1);
    expect(toolFrame(320, 320)).toBe(0);
    expect(transitionOpacity(0)).toBe(0);
    expect(transitionOpacity(FADE_MS / 2)).toBe(1);
    expect(transitionOpacity(FADE_MS)).toBe(0);
  });
  it('distinguishes outpost and mine, including entry and blocked side passage', () => {
    expect(areaForX(15.9)).toBe('outpost');
    expect(areaForX(16.5)).toBe('mine');
    expect(areaName('mine')).toBe('Lyria Mine Chamber');
    expect(tileAt(16, 10)).toBe('entrance');
    expect(tileAt(31, 7)).toBe('blocked');
    expect(canStand(31.5, 7.5)).toBe(false);
    expect(canStand(21.5, 10.5)).toBe(true);
  });
});

describe('authoritative mining interaction adapter', () => {
  it('submits at most once while pending and never changes inventory locally', async () => {
    const state = initialState(() => 0.1);
    state.location = 'Lyria';
    const before = structuredClone(state.mining);
    let calls = 0;
    let finish!: () => void;
    const deferred = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const submit = async () => {
      calls++;
      await deferred;
    };
    const adapter = new MiningActionAdapter();
    const first = adapter.requestDeposit(state, true, submit);
    expect(await adapter.requestDeposit(state, true, submit)).toBe('busy');
    expect(calls).toBe(1);
    expect(state.mining).toEqual(before);
    finish();
    expect(await first).toBe('submitted');
    expect(state.mining).toEqual(before);
  });
  it('refuses anonymous/unavailable, pending and off-claim actions', async () => {
    const state = initialState(() => 0.1);
    const adapter = new MiningActionAdapter();
    let calls = 0;
    const submit = async () => {
      calls++;
    };
    expect(await adapter.requestDeposit(state, false, submit)).toBe('travel-required');
    state.location = 'Lyria';
    expect(await adapter.requestDeposit(state, false, submit)).toBe('busy');
    state.pending = { kind: 'mine', source: 'Hand', rewards: {}, readyAt: 100 };
    expect(await adapter.requestDeposit(state, true, submit)).toBe('busy');
    expect(calls).toBe(0);
  });
  it('leaves inventory unchanged when the server action fails, then releases its lock', async () => {
    const state = initialState(() => 0.1);
    state.location = 'Lyria';
    const before = structuredClone(state.mining);
    const adapter = new MiningActionAdapter();
    await expect(
      adapter.requestDeposit(state, true, async () => {
        throw new Error('synthetic failure');
      }),
    ).rejects.toThrow();
    expect(state.mining).toEqual(before);
    expect(await adapter.requestDeposit(state, true, async () => {})).toBe('submitted');
  });
});
