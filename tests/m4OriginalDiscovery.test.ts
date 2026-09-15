import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import { analyzeOriginalNode, populateOriginalZone, scanOriginalZone } from '../shared/originalDiscovery';
import { originalWalkable, originalZoneMap } from '../shared/originalWorld';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
describe('original deterministic discovery', () => {
  it('provides safe deterministic node regions in every mining zone', () => {
    for (const zone of ORIGINAL_CONTENT.zones.filter((item) => item.regionCount > 0)) {
      const state = originalInitialState(randomUUID(), () => 0.5);
      state.location = zone.location;
      state.world.zone = zone.id;
      expect(() => populateOriginalZone(state)).not.toThrow();
    }
  });
  it('generates stable separated server-owned nodes and requires scan before analysis', () => {
    const state = originalInitialState(randomUUID(), () => 0.5);
    state.location = 'loc.l002';
    state.world.zone = 'zone.z014';
    const a = populateOriginalZone(state),
      b = populateOriginalZone(state);
    expect(a.world.nodes).toEqual(b.world.nodes);
    const nodes = Object.values(a.world.nodes);
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    for (const node of nodes)
      expect(originalWalkable(originalZoneMap(a.world.zone), node.x, node.y)).toBe(true);
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++)
        expect(Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y)).toBeGreaterThanOrEqual(3);
    expect(() => analyzeOriginalNode(a, nodes[0]!.id)).toThrow('ANALYSIS_UNAVAILABLE');
    const scanned = scanOriginalZone(a);
    expect(analyzeOriginalNode(scanned, nodes[0]!.id).world.scanner.analyzed).toContain(nodes[0]!.id);
  });
});
