import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../server/store';
import { RESET_CONFIRMATION } from '../shared/schema';

const testState = vi.hoisted(() => ({ store: null as MemoryStore | null }));
vi.mock('../server/dynamo', () => ({ createDynamoStore: () => testState.store }));

const signingKey = Buffer.alloc(32, 7);
const origin = 'https://test.ext-twitch.tv';

async function token(opaqueId = 'Utest123') {
  return (
    'Bearer ' +
    (await new SignJWT({ opaque_user_id: opaqueId, channel_id: '123', role: 'viewer' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('5m')
      .sign(signingKey))
  );
}

function request(method: string, rawPath: string, authorization: string, stage?: string, from = origin) {
  return {
    rawPath,
    rawQueryString: 'ignored=synthetic',
    requestContext: { http: { method }, stage, requestId: 'synthetic-request' },
    headers: { authorization, origin: from },
  };
}

beforeEach(() => {
  vi.resetModules();
  testState.store = new MemoryStore();
  vi.stubEnv('DIME_ENV', 'staging');
  vi.stubEnv('DIME_STATE_TABLE', 'dime-v2-staging-test-table');
  vi.stubEnv('DIME_CONFIG_REVISION', 'named-stage-path-fix-20260913-1');
  vi.stubEnv('DIME_CONVERSION_MODE', 'DISABLED');
  vi.stubEnv('DIME_ALLOWED_ORIGINS', origin);
  vi.stubEnv('TWITCH_EXTENSION_SECRET_B64', signingKey.toString('base64'));
  vi.stubEnv('DIME_PLAYER_ID_KEY_B64', Buffer.alloc(32, 8).toString('base64'));
  vi.stubEnv('AWS_REGION', 'us-east-2');
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  testState.store = null;
});

describe('HTTP API v2 named-stage routing', () => {
  it('never converts saves through legacy state, action, or reset endpoints', async () => {
    vi.stubEnv('DIME_CONVERSION_MODE', 'ENABLED');
    vi.resetModules();
    const { handler } = await import('../server/handler');
    const authorization = await token();
    const initial = JSON.parse((await handler(request('GET', '/state', authorization))).body).state;
    expect(initial.schemaVersion).toBe(2);
    const action = {
      requestId: randomUUID(),
      expectedRevision: initial.revision,
      action: { type: 'enterZone', zone: 'ARC_L1_CONCOURSE' },
    };
    const acted = JSON.parse(
      (
        await handler({
          ...request('POST', '/actions', authorization),
          body: JSON.stringify(action),
        })
      ).body,
    ).state;
    expect(acted.schemaVersion).toBe(2);
    const reset = JSON.parse(
      (
        await handler({
          ...request('POST', '/profile/reset', authorization),
          body: JSON.stringify({
            requestId: randomUUID(),
            expectedRevision: acted.revision,
            expectedGeneration: acted.saveGeneration,
            confirmation: RESET_CONFIRMATION,
          }),
        })
      ).body,
    ).state;
    expect(reset.schemaVersion).toBe(2);
    expect(testState.store?.receipts.size).toBe(2);
  });

  it.each([
    ['/staging/state', 'staging', '/state'],
    ['/staging/actions', 'staging', '/actions'],
    ['/staging/profile/reset', 'staging', '/profile/reset'],
    ['/staging', 'staging', '/'],
    ['/staging-other/state', 'staging', '/staging-other/state'],
    ['/other/state', 'staging', '/other/state'],
    ['/state', 'staging', '/state'],
    ['/state', '$default', '/state'],
    ['/state', undefined, '/state'],
    ['/$default/state', '$default', '/$default/state'],
  ])('normalizes only the exact stage segment: %s (%s)', async (path, stage, expected) => {
    const { routePath } = await import('../server/handler');
    expect(routePath(path, stage)).toBe(expected);
  });

  it.each([
    ['/staging/state', 'staging'],
    ['/state', 'staging'],
    ['/state', '$default'],
    ['/state', undefined],
  ])('routes authenticated GET %s with stage %s to in-memory state', async (path, stage) => {
    const { handler } = await import('../server/handler');
    const response = await handler(request('GET', path, await token(), stage));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).state.revision).toBe(0);
    expect(testState.store?.states.size).toBe(1);
  });

  it.each(['/staging/actions', '/actions'])('routes POST %s and retains idempotency', async (path) => {
    const { handler } = await import('../server/handler');
    const authorization = await token();
    const action = {
      requestId: randomUUID(),
      expectedRevision: 0,
      action: { type: 'enterZone', zone: 'ARC_L1_CONCOURSE' },
    };
    const event = { ...request('POST', path, authorization, 'staging'), body: JSON.stringify(action) };
    const first = await handler(event);
    const retry = await handler(event);
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body).state.revision).toBe(1);
    expect(retry.statusCode).toBe(200);
    expect(JSON.parse(retry.body)).toMatchObject({ replayed: true, state: { revision: 1 } });
    expect(testState.store?.receipts.size).toBe(1);
  });

  it('routes authenticated POST /profile/reset through the named stage', async () => {
    const { handler } = await import('../server/handler');
    const authorization = await token();
    const initial = JSON.parse(
      (await handler(request('GET', '/staging/state', authorization, 'staging'))).body,
    ).state;
    const body = {
      requestId: randomUUID(),
      expectedRevision: initial.revision,
      expectedGeneration: initial.saveGeneration,
      confirmation: RESET_CONFIRMATION,
    };
    const event = {
      ...request('POST', '/staging/profile/reset', authorization, 'staging'),
      body: JSON.stringify(body),
    };
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).state).toMatchObject({ revision: 1, wallet: 0, location: 'ARC-L1' });
    expect((await handler(event)).statusCode).toBe(200);
    expect(testState.store?.receipts.size).toBe(1);
  });

  it.each(['/staging', '/staging-other/state', '/other/state'])(
    'rejects route miss %s before any store operation',
    async (path) => {
      const store = testState.store!;
      const read = vi.spyOn(store, 'read');
      const commit = vi.spyOn(store, 'commit');
      const { handler } = await import('../server/handler');
      const response = await handler(request('GET', path, await token(), 'staging'));
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ code: 'NOT_FOUND', message: 'Endpoint not found.' });
      expect(read).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    },
  );

  it.each(['Atest123', 'invalid'])(
    'rejects anonymous or invalid identity before routing',
    async (identity) => {
      const store = testState.store!;
      const read = vi.spyOn(store, 'read');
      const { handler } = await import('../server/handler');
      const authorization = identity === 'invalid' ? 'Bearer invalid' : await token(identity);
      const response = await handler(request('GET', '/staging/other', authorization, 'staging'));
      expect(response.statusCode).toBe(401);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('retains exact-origin CORS and does not log query values', async () => {
    const { handler } = await import('../server/handler');
    const authorization = await token();
    const accepted = await handler(request('GET', '/staging/state', authorization, 'staging'));
    const denied = await handler(
      request('GET', '/staging/state', authorization, 'staging', 'https://other.ext-twitch.tv'),
    );
    expect(accepted.statusCode).toBe(200);
    expect(accepted.headers['Access-Control-Allow-Origin']).toBe(origin);
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('ignored=synthetic');
  });
});
