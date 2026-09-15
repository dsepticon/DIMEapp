import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createOriginalApi } from '../server/originalApi';
import { MemoryStore } from '../server/store';
import type { VersionedContentState } from '../server/contentConversion';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
it('creates and refreshes a directly canonical v4 profile without a conversion receipt, then resets canonically', async () => {
  const store = new MemoryStore<VersionedContentState>();
  const api = createOriginalApi(
    store,
    async () => 'synthetic-fresh',
    [],
    () => 1000,
    { mode: 'ENABLED', testerCount: 0, permits: () => true },
  );
  const get = () => api({ method: 'GET', path: '/v4/state', headers: {} });
  const first = JSON.parse((await get()).body);
  expect(first.conversionRequired).toBeUndefined();
  expect(first.state).toMatchObject({
    schemaVersion: 3,
    saveFormatVersion: 3,
    contentVersion: 4,
    location: 'loc.l001',
    currentShip: 'fleet.v001',
    equipment: { 'gear.e001': 1 },
    world: { zone: 'zone.z001' },
  });
  expect(ORIGINAL_CONTENT.locations.find((x) => x.id === first.state.location)?.name).toBe('Tessick Station');
  expect(ORIGINAL_CONTENT.zones.find((x) => x.id === first.state.world.zone)?.name).toBe('Crew Ring Arrival');
  expect(JSON.parse((await get()).body).state).toEqual(first.state);
  expect(store.receipts.size).toBe(0);
  const reset = await api({
    method: 'POST',
    path: '/v4/profile/reset',
    headers: {},
    body: JSON.stringify({
      requestId: randomUUID(),
      expectedRevision: first.state.revision,
      expectedGeneration: first.state.saveGeneration,
      confirmation: 'RESET MY DIME PROFILE',
    }),
  });
  expect(reset.statusCode).toBe(200);
  const fresh = JSON.parse(reset.body).state;
  expect(fresh).toMatchObject({
    contentVersion: 4,
    saveFormatVersion: 3,
    location: 'loc.l001',
    world: { zone: 'zone.z001' },
  });
  expect(fresh.saveGeneration).not.toBe(first.state.saveGeneration);
  expect(JSON.parse((await get()).body).state).toEqual(fresh);
});
