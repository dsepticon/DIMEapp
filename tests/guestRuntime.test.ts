import { afterEach, expect, it, vi } from 'vitest';
import { createGuestRuntime } from '../app/original/guestRuntime';
import { guestCapability } from '../app/guestCapability';
import { originalZoneMap } from '../shared/originalWorld';
import { servicePoint, zoneRoute } from '../shared/originalNavigation';
import { originalNodeSpec } from '../shared/originalMining';
import { initialState, parameters, tickMining } from '../shared/continuousMining';
import { nodeInteractionTiles } from '../shared/originalNodePlacement';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
import { authenticate } from '../server/auth';
afterEach(() => vi.restoreAllMocks());
function journey() {
  let now = 100000;
  const demo = createGuestRuntime(() => now);
  const go = (destination: string) => {
    for (const next of zoneRoute(demo.snapshot().world.zone, destination).slice(1)) {
      const exit = originalZoneMap(demo.snapshot().world.zone).exits.find((e) => e.to === next)!;
      demo.mutate({ type: 'moveZone', destination: next, player: { x: exit.x + 0.5, y: exit.y + 0.5 } });
    }
  };
  const at = (kind: string) => {
    const p = servicePoint(demo.snapshot().world.zone, kind)!;
    return { x: p.x + 0.5, y: p.y + 0.5 };
  };
  return {
    demo,
    go,
    at,
    tick: (n: number) => {
      now += n;
    },
  };
}
it('deterministic memory-only worlds are independent and have no transport or identity', () => {
  const a = createGuestRuntime(),
    b = createGuestRuntime();
  expect(a.snapshot()).toEqual(b.snapshot());
  const copy = a.snapshot();
  copy.wallet = 999;
  expect(a.snapshot().wallet).toBe(5000);
  expect(Object.keys(a).sort()).toEqual(['mutate', 'snapshot']);
  const exit = originalZoneMap(a.snapshot().world.zone).exits[0]!;
  a.mutate({ type: 'moveZone', destination: exit.to, player: { x: exit.x + 0.5, y: exit.y + 0.5 } });
  expect(a.snapshot()).not.toEqual(b.snapshot());
  expect(createGuestRuntime().snapshot()).toEqual(b.snapshot());
  for (const type of ['reset', 'link', 'callback', 'delete', 'convert', 'session'])
    expect(() => a.mutate({ type })).toThrow();
  expect(a.snapshot().pending).toBeNull();
});
it('complete local journey preserves physical travel, analysis, fracture quantity, vacuum, processing and sale', () => {
  const f = journey(),
    { demo, go, at } = f;
  expect(() => demo.mutate({ type: 'completeDeparture', player: { x: 0, y: 0 } })).toThrow();
  go('zone.z008');
  demo.mutate({
    type: 'assignDeparture',
    player: at('travel'),
    ship: 'fleet.v001',
    destination: 'loc.l002',
    loadGroundVehicle: false,
  });
  go('zone.z009');
  demo.mutate({ type: 'completeDeparture', player: at('travel') });
  expect(demo.snapshot().location).toBe('loc.l002');
  go('zone.z012');
  demo.mutate({ type: 'acceptFirstContract' });
  demo.mutate({ type: 'confirmFirstContractTool' });
  go('zone.z014');
  demo.mutate({ type: 'scan' });
  const node = demo.snapshot().world.nodes['assignment.q001.node']!;
  const tile = nodeInteractionTiles('zone.z014', node)[0]!;
  const player = { x: tile.x + 0.5, y: tile.y + 0.5 };
  demo.mutate({ type: 'analyzeNearby', nodeId: node.id, player });
  demo.mutate({ type: 'startLaser', nodeId: node.id, player });
  let model = initialState();
  const spec = originalNodeSpec(node),
    p = parameters(spec),
    runs: Array<{ held: boolean; ticks: number }> = [];
  for (let i = 0; i < 1000 && model.phase !== 'fractured'; i++) {
    const held = model.charge < p.upper - p.gain,
      last = runs.at(-1);
    if (last?.held === held) last.ticks++;
    else runs.push({ held, ticks: 1 });
    model = tickMining(model, spec, held);
  }
  expect(model.phase).toBe('fractured');
  f.tick(model.tick * 50);
  demo.mutate({ type: 'resolveLaser', runs });
  const pieces = demo.snapshot().world.nodes[node.id]!.fragments;
  expect(pieces.length).toBeGreaterThanOrEqual(3);
  expect(pieces.length).toBeLessThanOrEqual(8);
  for (const piece of pieces) {
    const player = { x: piece.x + 0.5, y: piece.y + 0.5 };
    demo.mutate({ type: 'startVacuum', nodeId: node.id, pieceId: piece.id, player });
    f.tick(5000);
    demo.mutate({ type: 'finishVacuum', nodeId: node.id, pieceId: piece.id, player });
  }
  expect(demo.snapshot().mining['extract.x001']['mat.m001']).toBe(400);
  go('zone.z012');
  demo.mutate({ type: 'sellFirstContractMaterial' });
  demo.mutate({ type: 'completeFirstContract' });
  expect(demo.snapshot().quest?.status).toBe('COMPLETE');
  go('zone.z012');
  demo.mutate({
    type: 'assignDeparture',
    player: at('travel'),
    ship: 'fleet.v001',
    destination: 'loc.l001',
    loadGroundVehicle: false,
  });
  go('zone.z019');
  demo.mutate({ type: 'completeDeparture', player: at('travel') });
  const refinery = ORIGINAL_CONTENT.zones.find(
    (z) => z.location === 'loc.l001' && (z.objectKinds as readonly string[]).includes('refinery'),
  )!;
  go(refinery.id);
  demo.mutate({
    type: 'startProcessing',
    source: 'extract.x003',
    material: 'mat.m010',
    process: 'process.p001',
    units: 200,
  });
  const order = demo.snapshot().orders[0]!;
  f.tick(86400000);
  demo.mutate({ type: 'collectOrder', orderId: order.id, ship: 'fleet.v001' });
  const market = ORIGINAL_CONTENT.zones.find(
    (z) => z.location === 'loc.l001' && (z.objectKinds as readonly string[]).includes('market'),
  )!;
  go(market.id);
  const units = demo.snapshot().cargo['fleet.v001']!.refined['mat.m010.processed']!;
  demo.mutate({ type: 'sell', ship: 'fleet.v001', material: 'mat.m010', category: 'refined', units });
  expect(demo.snapshot().cargo['fleet.v001']!.refined['mat.m010.processed']).toBe(0);
  expect(demo.snapshot().pending).toBeNull();
});
it('guest admission fails closed unless the server explicitly advertises the memory-only, disabled-online contract', async () => {
  for (const value of [
    {},
    { guestDemoAvailable: true },
    { guestDemoAvailable: true, guestStorage: 'memory', signInAvailable: true, linkingAvailable: false },
    { guestDemoAvailable: true, guestStorage: 'memory', signInAvailable: false, linkingAvailable: false },
  ]) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(value), { status: 200 }));
    expect(await guestCapability()).toBe('signInAvailable' in value && value.signInAvailable === false);
    expect(fetch).toHaveBeenLastCalledWith('/game/status', { credentials: 'omit', cache: 'no-store' });
  }
});
it('anonymous and forged guest markers cannot authenticate to persistent gameplay', async () => {
  for (const header of [undefined, 'guest', 'Bearer guest-demo'])
    await expect(
      authenticate(header, [new Uint8Array(32).fill(1)], new Uint8Array(32).fill(2)),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
