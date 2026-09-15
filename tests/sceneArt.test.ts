import { settledFragmentPosition } from '../app/original/sceneArt';
import { attractedPosition } from '../app/original/VacuumConsole';
import { describe, expect, it } from 'vitest';
import { ART_LIMITS, SCENE_PALETTES, sceneCamera, artHash } from '../app/original/sceneArt';
import { originalZoneMap } from '../shared/originalWorld';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
import { emitGameAudio, onGameAudio } from '../app/original/audioEvents';
describe('original visual system boundaries', () => {
  it('keeps every viewport inside authoritative geometry, with integer pixel scaling', () => {
    for (const zone of ORIGINAL_CONTENT.zones) {
      const map = originalZoneMap(zone.id);
      for (const [width, height] of [
        [306, 180],
        [348, 350],
        [1400, 800],
      ]) {
        for (const player of [map.spawn, { x: 0, y: 0 }, { x: map.width, y: map.height }]) {
          const c = sceneCamera(map, width!, height!, player);
          expect(c.scale % ART_LIMITS.tile).toBe(0);
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.x + width! / c.scale).toBeLessThanOrEqual(map.width + 0.001);
          expect(c.y + height! / c.scale).toBeLessThanOrEqual(map.height + 0.001);
        }
      }
    }
  });
  it('has five distinct environment families and bounded nonessential effects', () => {
    expect(new Set(Object.values(SCENE_PALETTES).map((p) => p.ground)).size).toBe(5);
    expect(ART_LIMITS.workers).toBeLessThanOrEqual(4);
    expect(ART_LIMITS.particles).toBeLessThanOrEqual(32);
    expect(artHash('formation')).toBe(artHash('formation'));
  });
  it('audio hooks work silently and unsubscribe without retaining events', () => {
    const heard: string[] = [];
    const off = onGameAudio((e) => heard.push(e));
    emitGameAudio('vacuum');
    off();
    emitGameAudio('laser');
    expect(heard).toEqual(['vacuum']);
  });
});

it('settled pieces agree with vacuum ground coordinates with no half-tile jump', () => {
  for (const tile of [
    { x: 3, y: 4 },
    { x: 0, y: 0 },
    { x: 19, y: 27 },
  ]) {
    const source = { x: 8.5, y: 9.5 },
      player = { x: 7.5, y: 8.5 };
    expect(settledFragmentPosition(tile, undefined, 1)).toEqual(attractedPosition(tile, player, 0));
    expect(settledFragmentPosition(tile, source, 1)).toEqual(attractedPosition(tile, player, 0));
    expect(settledFragmentPosition(tile, source, 0)).toEqual(source);
    expect(settledFragmentPosition(tile, source, 2)).toEqual(attractedPosition(tile, player, 0));
  }
});
