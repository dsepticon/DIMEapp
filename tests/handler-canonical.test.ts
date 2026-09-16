import { afterEach, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { createHmac, randomUUID } from 'node:crypto';
import { MemoryRecords } from '../server/authRecords';
import { originalInitialState } from '../shared/originalGame';
const shared = vi.hoisted(() => ({ repo: null as MemoryRecords | null }));
vi.mock('../server/authRecords', async (original) => {
  const actual = await original<typeof import('../server/authRecords')>();
  return {
    ...actual,
    DynamoAuthRecords: class {
      constructor() {
        return shared.repo!;
      }
    },
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});
it.each([false, true])(
  'hosted-client v4 contract, generation and replay survive canonical routing: linked=%s',
  async (linked) => {
    shared.repo = new MemoryRecords();
    const signing = Buffer.alloc(32, 7),
      identity = Buffer.alloc(32, 8),
      origin = 'https://test.ext-twitch.tv';
    const player =
      'PLAYER#v1#' +
      createHmac('sha256', identity).update('twitch-extension-opaque-player:v1\0Usynthetic').digest('hex');
    const canonical = linked ? 'ACCOUNT#v1#00000000-0000-4000-8000-000000000001' : player;
    const state = originalInitialState(randomUUID(), () => 0.5);
    state.location = 'loc.l002';
    state.world.zone = 'zone.z014';
    await shared.repo.transaction(async (tx) => {
      await tx.put('state:' + canonical, state);
      if (linked)
        await tx.put('binding:' + player, { player: canonical, epoch: randomUUID(), status: 'ACTIVE' });
    });
    for (const [key, value] of Object.entries({
      AWS_REGION: 'us-east-2',
      DIME_ENV: 'staging',
      DIME_STATE_TABLE: 'dime-v2-staging-synthetic',
      DIME_CONFIG_REVISION: 'canonical-review',
      DIME_CONVERSION_MODE: 'ENABLED',
      DIME_CONVERSION_TESTER_TAGS: '',
      DIME_ALLOWED_ORIGINS: origin,
      TWITCH_EXTENSION_SECRET_B64: signing.toString('base64'),
      DIME_PLAYER_ID_KEY_B64: identity.toString('base64'),
    }))
      vi.stubEnv(key, value);
    const token = await new SignJWT({ opaque_user_id: 'Usynthetic', channel_id: '123', role: 'viewer' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(signing);
    const { handler } = await import('../server/handler');
    const request = (method: string, path: string, body?: unknown) =>
      handler({
        rawPath: '/staging' + path,
        requestContext: { stage: 'staging', http: { method } },
        headers: { origin, authorization: 'Bearer ' + token },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const initial = await request('GET', '/v4/state');
    expect(initial.statusCode).toBe(200);
    expect(JSON.parse(initial.body).state).toEqual(state);
    const action = {
      requestId: randomUUID(),
      expectedRevision: state.revision,
      expectedGeneration: state.saveGeneration,
      action: { type: 'scan' },
    };
    const first = await request('POST', '/v4/actions', action),
      replay = await request('POST', '/v4/actions', action);
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(JSON.parse(replay.body).state).toEqual(JSON.parse(first.body).state);
    expect(JSON.parse((await request('GET', '/v4/state')).body).state).toEqual(JSON.parse(first.body).state);
    expect(first.headers['Access-Control-Allow-Origin']).toBe(origin);
    if (linked) expect(await shared.repo.transaction((tx) => tx.get('state:' + player))).toBeUndefined();
    const denied = await handler({
      rawPath: '/v4/state',
      requestContext: { http: { method: 'GET' } },
      headers: { origin },
    });
    expect(denied.statusCode).toBe(401);
  },
);
