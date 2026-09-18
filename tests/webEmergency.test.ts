import { afterEach, expect, it, vi } from 'vitest';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { handler } from '../server/webHandler';
import { emergencyRoute, expiredAuthCookies, webOrigin as origin } from '../server/webEmergency';
import { WebAuth, MemoryAuthRepository, opaque, type IdentityProvider } from '../server/webAuth';
import { AUTH_TTL } from '../server/accountManifest';
import { createWebApi } from '../server/webHttp';
import { revokeTwitchToken } from '../server/twitchOAuth';
import { DynamoAuthRecords } from '../server/authRecords';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function fixture() {
  let now = Date.parse('2026-09-16T16:00:00Z');
  const repo = new MemoryAuthRepository();
  const tokens = { access: 'synthetic', refresh: 'synthetic', expiresAt: now + 3600000 };
  const provider: IdentityProvider = {
    authorize: (state) => origin + '/?' + new URLSearchParams({ state }),
    exchange: async () => ({ subject: 'synthetic', tokens }),
    validate: async () => ({ subject: 'synthetic', tokens }),
    revoke: vi.fn(async () => {}),
  };
  const auth = new WebAuth(repo, provider, new Uint8Array(32).fill(1), origin, () => now);
  const begin = await auth.begin();
  const cb = await auth.callback(
    'synthetic',
    new URL(begin.location).searchParams.get('state')!,
    begin.cookie.split(';')[0]!.split('=')[1]!,
  );
  const sid = cb.cookie.split(';')[0]!.split('=')[1]!;
  const session = await auth.authorize(sid);
  const mutation = { origin, csrf: session.csrf };
  const headers = { origin, cookie: '__Host-dime-session=' + sid, 'x-dime-csrf': session.csrf };
  return {
    repo,
    provider,
    auth,
    sid,
    session,
    mutation,
    headers,
    tick: (n: number) => {
      now += n;
    },
  };
}
it('logout without a session succeeds in every mode without any configured credentials or storage', async () => {
  const send = vi.spyOn(DynamoDBDocumentClient.prototype, 'send');
  const network = vi.spyOn(globalThis, 'fetch');
  for (const mode of ['DISABLED', 'TESTERS', 'ENABLED', 'malformed']) {
    vi.stubEnv('DIME_WEB_SIGN_IN_MODE', mode);
    vi.stubEnv('DIME_OAUTH_CLIENT_SECRET', undefined);
    vi.stubEnv('DIME_AUTH_ENCRYPTION_KEY_B64', undefined);
    for (let i = 0; i < 2; i++) {
      const r = await handler({ rawPath: '/auth/logout', requestContext: { http: { method: 'POST' } } });
      expect(r.statusCode).toBe(200);
      expect(JSON.parse(r.body)).toEqual({ signedOut: true });
      expect('cookies' in r && r.cookies).toEqual(expiredAuthCookies);
    }
  }
  expect(send).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});
it('a stale session cookie needs only recovery keys, never OAuth or Extension credentials', async () => {
  vi.stubEnv('AWS_REGION', 'us-east-2');
  vi.stubEnv('DIME_WEB_ORIGIN', origin);
  vi.stubEnv('DIME_STATE_TABLE', 'dime-v2-staging-review01-dime-v2-review-20260912-player-state');
  vi.stubEnv('DIME_AUTH_ENCRYPTION_KEY_B64', Buffer.alloc(32, 1).toString('base64'));
  vi.stubEnv('DIME_WEB_ID_KEY_B64', Buffer.alloc(32, 2).toString('base64'));
  for (const key of [
    'DIME_OAUTH_CLIENT_SECRET',
    'DIME_OAUTH_CLIENT_ID',
    'TWITCH_EXTENSION_SECRET_B64',
    'DIME_PLAYER_ID_KEY_B64',
  ])
    vi.stubEnv(key, undefined);
  vi.stubEnv('DIME_WEB_SIGN_IN_MODE', 'DISABLED');
  const send = vi.spyOn(DynamoDBDocumentClient.prototype, 'send').mockResolvedValue({} as never);
  const network = vi.spyOn(globalThis, 'fetch');
  const r = await handler({
    rawPath: '/auth/logout',
    cookies: ['__Host-dime-session=' + 'a'.repeat(43)],
    requestContext: { http: { method: 'POST' } },
  });
  expect(r.statusCode).toBe(200);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]?.[0].input).toMatchObject({
    TransactItems: [{ ConditionCheck: expect.any(Object) }],
  });
  expect(network).not.toHaveBeenCalled();
});
it('valid disabled logout revokes the session, expires cookies and repeats successfully without writes or provider validation', async () => {
  const f = await fixture();
  const validate = vi.spyOn(f.provider, 'validate');
  const api = createWebApi(f.auth, undefined, undefined, () => 'DISABLED');
  const out = await api({ method: 'POST', path: '/auth/logout', headers: f.headers });
  expect(out.statusCode).toBe(200);
  expect(out.cookies).toEqual(expiredAuthCookies);
  expect(validate).not.toHaveBeenCalled();
  await expect(f.auth.authorize(f.sid)).rejects.toThrow();
  expect(
    (await api({ method: 'POST', path: '/auth/logout', headers: { cookie: f.headers.cookie } })).statusCode,
  ).toBe(200);
  expect(f.provider.revoke).toHaveBeenCalledOnce();
});
it('CSRF failure cannot revoke a valid session, but still expires browser authentication cookies', async () => {
  const f = await fixture();
  const r = await emergencyRoute(
    { method: 'POST', path: '/auth/logout', headers: { ...f.headers, origin: 'https://untrusted.example' } },
    () => f.auth,
  );
  expect(r?.statusCode).toBe(403);
  expect(r?.cookies).toEqual(expiredAuthCookies);
  expect(await f.auth.authorize(f.sid)).toBeDefined();
  expect(f.provider.revoke).not.toHaveBeenCalled();
});
it('missing, malformed and cross-origin deletion proof fails before initializing credentials', async () => {
  const configure = vi.fn(() => {
    throw Error('must not initialize');
  });
  for (const body of ['{}', 'null', '[]', 'invalid', '{"account":"invalid","capability":"invalid"}']) {
    const r = await emergencyRoute(
      { method: 'POST', path: '/auth/delete/resume', headers: { origin }, body },
      configure,
    );
    expect(r?.statusCode).toBe(401);
  }
  expect(
    (
      await emergencyRoute(
        { method: 'POST', path: '/auth/delete/resume', headers: {}, body: '{}' },
        configure,
      )
    )?.statusCode,
  ).toBe(403);
  expect(configure).not.toHaveBeenCalled();
});
it('disabled deletion preserves progress across provider failure, retries, completion replay and receipt expiry', async () => {
  const f = await fixture(),
    cap = opaque();
  await f.auth.beginDeletion(f.sid, f.mutation, 'DELETE_ACCOUNT', cap);
  const api = createWebApi(f.auth, undefined, undefined, () => 'DISABLED');
  const request = {
    method: 'POST',
    path: '/auth/delete/resume',
    headers: { origin },
    body: JSON.stringify({ account: f.session.account, capability: cap }),
  };
  vi.mocked(f.provider.revoke).mockRejectedValueOnce(Error('synthetic outage'));
  const paused = await api(request);
  expect(paused.statusCode).toBe(202);
  expect(JSON.parse(paused.body)).toEqual({
    status: 'DELETION_PENDING',
    retryable: true,
    code: 'PROVIDER_REVOCATION_PENDING',
  });
  for (const status of ['REVOKED', 'PURGED', 'COMPLETE', 'COMPLETE'])
    expect(JSON.parse((await api(request)).body).status).toBe(status);
  f.tick(AUTH_TTL.outcome + 1);
  expect((await api(request)).statusCode).toBe(403);
});
it('wrong, cross-account and expired deletion proof cannot advance a job', async () => {
  const f = await fixture(),
    cap = opaque();
  await f.auth.beginDeletion(f.sid, f.mutation, 'DELETE_ACCOUNT', cap);
  const resume = (account: string, capability: string) =>
    emergencyRoute(
      {
        method: 'POST',
        path: '/auth/delete/resume',
        headers: { origin },
        body: JSON.stringify({ account, capability }),
      },
      () => f.auth,
    );
  expect((await resume(f.session.account, opaque()))?.statusCode).toBe(403);
  expect((await resume('11111111-1111-4111-8111-111111111111', cap))?.statusCode).toBe(403);
  f.tick(AUTH_TTL.tombstone + 1);
  expect((await resume(f.session.account, cap))?.statusCode).toBe(403);
  expect(f.provider.revoke).not.toHaveBeenCalled();
});
it('revocation adapter uses the public client ID and existing token only, without login initialization', async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const form = init?.body as URLSearchParams;
    expect([...form.keys()].sort()).toEqual(['client_id', 'token']);
    return new Response('', { status: 200 });
  });
  await revokeTwitchToken(
    'synthetic-public-id',
    { access: 'synthetic', refresh: 'synthetic', expiresAt: 1 },
    request,
  );
  expect(request).toHaveBeenCalledOnce();
});

it('the exported handler logs out a synthetic valid session with OAuth secret and Extension configuration absent', async () => {
  const f = await fixture();
  vi.stubEnv('AWS_REGION', 'us-east-2');
  vi.stubEnv('DIME_WEB_ORIGIN', origin);
  vi.stubEnv('DIME_STATE_TABLE', 'dime-v2-staging-review01-dime-v2-review-20260912-player-state');
  vi.stubEnv('DIME_AUTH_ENCRYPTION_KEY_B64', Buffer.alloc(32, 1).toString('base64'));
  vi.stubEnv('DIME_WEB_ID_KEY_B64', Buffer.alloc(32, 2).toString('base64'));
  vi.stubEnv('DIME_WEB_SIGN_IN_MODE', 'DISABLED');
  vi.stubEnv('DIME_OAUTH_CLIENT_ID', '4228okut24ll35bisjmygbquaf6svm');
  for (const key of [
    'DIME_OAUTH_CLIENT_SECRET',
    'TWITCH_EXTENSION_SECRET_B64',
    'DIME_PLAYER_ID_KEY_B64',
    'DIME_ALLOWED_ORIGINS',
    'DIME_CONVERSION_MODE',
  ])
    vi.stubEnv(key, undefined);
  vi.spyOn(DynamoAuthRecords.prototype, 'transaction').mockImplementation((run) => f.repo.transaction(run));
  const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
  const r = await handler({
    rawPath: '/auth/logout',
    headers: f.headers,
    requestContext: { http: { method: 'POST' } },
  });
  expect(r.statusCode).toBe(200);
  expect(network).toHaveBeenCalledOnce();
  expect(network.mock.calls[0]?.[0]).toBe('https://id.twitch.tv/oauth2/revoke');
  await expect(f.auth.authorize(f.sid)).rejects.toThrow();
});

it('legacy proof compatibility has a fixed deadline that retries cannot renew', async () => {
  const f = await fixture(),
    cap = opaque();
  await f.auth.beginDeletion(f.sid, f.mutation, 'DELETE_ACCOUNT', cap);
  await f.repo.transaction(async (tx) => {
    const job = await tx.get<{ proof: string; phase: string }>('deletion:' + f.session.account);
    await tx.put('deletion:' + f.session.account, { proof: job!.proof, phase: job!.phase });
  });
  expect((await f.auth.resumeDeletion(f.session.account, cap)).status).toBe('REVOKED');
  f.tick(AUTH_TTL.tombstone);
  await expect(f.auth.resumeDeletion(f.session.account, cap)).rejects.toThrow('Deletion unavailable');
});
