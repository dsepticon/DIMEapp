import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { initialState } from '../shared/game';
import { upgradeWholeCscuSave } from '../shared/quantityUpgrade';
import { createOriginalApi } from '../server/originalApi';
import type { VersionedContentState } from '../server/contentConversion';
import { MemoryStore } from '../server/store';
import { type ConversionGate } from '../server/conversionGate';

const enabledGate: ConversionGate = { mode: 'ENABLED', testerCount: 0, permits: () => true };

describe('proposed authenticated v4 API boundary', () => {
  it('previews and converts a synthetic legacy save without trusting a player key in the body', async () => {
    const legacy = upgradeWholeCscuSave(initialState(() => 0.5));
    legacy.saveGeneration = randomUUID();
    const store = new MemoryStore<VersionedContentState>();
    store.states.set('derived-a', legacy);
    const api = createOriginalApi(
      store,
      async (header) => {
        if (header !== 'Bearer synthetic') throw new Error('unauthorized');
        return 'derived-a';
      },
      ['https://synthetic.invalid'],
      () => 1000,
      enabledGate,
    );
    const request = {
      requestId: randomUUID(),
      expectedRevision: 0,
      expectedGeneration: legacy.saveGeneration,
      player: 'attacker-supplied',
    };
    const preview = await api({
      method: 'POST',
      path: '/v4/content/preview',
      headers: { authorization: 'Bearer synthetic', origin: 'https://synthetic.invalid' },
      body: JSON.stringify(request),
    });
    // Strict request parsing rejects all client-supplied identity/state fields.
    expect(preview.statusCode).toBe(400);
    delete (request as { player?: string }).player;
    expect(
      (
        await api({
          method: 'POST',
          path: '/v4/content/preview',
          headers: { authorization: 'Bearer synthetic', origin: 'https://synthetic.invalid' },
          body: JSON.stringify(request),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await api({
          method: 'POST',
          path: '/v4/content/convert',
          headers: { authorization: 'Bearer synthetic', origin: 'https://synthetic.invalid' },
          body: JSON.stringify(request),
        })
      ).statusCode,
    ).toBe(200);
    const state = await api({
      method: 'GET',
      path: '/v4/state',
      headers: { authorization: 'Bearer synthetic', origin: 'https://synthetic.invalid' },
    });
    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body).state).toMatchObject({ schemaVersion: 3, location: 'loc.l001' });
  });

  it('keeps exact-origin CORS and generic failures', async () => {
    const api = createOriginalApi(new MemoryStore(), async () => 'derived-a', ['https://good.invalid']);
    expect(
      (await api({ method: 'OPTIONS', path: '/v4/state', headers: { origin: 'https://good.invalid' } }))
        .statusCode,
    ).toBe(204);
    expect(
      (await api({ method: 'GET', path: '/v4/state', headers: { origin: 'https://evil.invalid' } }))
        .statusCode,
    ).toBe(403);
    const missing = await api({ method: 'GET', path: '/v4/state', headers: {} });
    expect(missing.statusCode).toBe(200);
    expect(missing.body).not.toContain('derived-a');
  });
});
