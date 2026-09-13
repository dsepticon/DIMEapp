import { describe, expect, it } from 'vitest';
import { initialState } from '../shared/game';
import { MiningActionAdapter } from '../app/rpg/actionAdapter';
import { directionForKey } from '../app/rpg/canvasEngine';
import { advance, canStand, initialWorld, nearestObject, OBJECTS, tileAt } from '../app/rpg/world';

const none = { up: false, down: false, left: false, right: false };

describe('Lyria local scene', () => {
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
    ).toEqual(['market', 'refinery', 'travel']);
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
