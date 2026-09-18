import { syntheticWebSecrets } from './webSecretsFixture';
syntheticWebSecrets();
import { afterEach, expect, it, vi } from 'vitest';
import { webSignInPreflight, webCapabilities } from '../server/webSignIn';
import { createWebApi } from '../server/webHttp';
import { MemoryAuthRepository, WebAuth, type IdentityProvider } from '../server/webAuth';
import { handler } from '../server/webHandler';
import * as credentials from '../server/auth';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
const origin = 'https://destroyaindustriesminingextension.com';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
for (const mode of [undefined, '', 'DISABLED', 'TESTERS', 'enabled', ' ENABLED ', 'UNKNOWN', true]) {
  it(`fails closed before credentials, network or storage for mode ${String(mode)}`, async () => {
    vi.stubEnv('DIME_WEB_SIGN_IN_MODE', typeof mode === 'string' ? mode : undefined);
    vi.stubEnv('DIME_ACCOUNT_LINKING', 'ENABLED');
    vi.stubEnv('AWS_REGION', 'us-east-2');
    vi.stubEnv('DIME_WEB_ORIGIN', origin);
    vi.stubEnv('DIME_AUTH_ENCRYPTION_KEY_B64', 'synthetic-unused');
    const decode = vi.spyOn(credentials, 'decodeSecret').mockImplementation(() => {
      throw Error('Must not initialize');
    });
    const send = vi.spyOn(DynamoDBDocumentClient.prototype, 'send');
    const network = vi.spyOn(globalThis, 'fetch');
    for (const path of ['/auth/login', '/auth/callback', '/auth/link/accept']) {
      const response = await handler({
        rawPath: path,
        rawQueryString: 'code=synthetic&state=synthetic',
        requestContext: { http: { method: 'GET' } },
      });
      expect(response.statusCode).toBe(mode === 'TESTERS' && path === '/auth/login' ? 401 : 503);
      expect(response.headers).not.toHaveProperty('Location');
      expect(response.body).not.toContain('synthetic');
    }
    expect(decode).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(webCapabilities(mode, true)).toEqual({ signInAvailable: false, linkingAvailable: false });
  });
}
it('status is public, non-identifying, non-cached and needs no configured credentials', async () => {
  for (const mode of ['DISABLED', 'TESTERS', 'ENABLED']) {
    vi.stubEnv('DIME_WEB_SIGN_IN_MODE', mode);
    vi.stubEnv('DIME_ACCOUNT_LINKING', 'DISABLED');
    const response = await handler({ rawPath: '/auth/status', requestContext: { http: { method: 'GET' } } });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      signInAvailable: mode === 'ENABLED',
      linkingAvailable: false,
    });
    expect(response.headers['Cache-Control']).toBe('no-store');
  }
});
it('HTTP gate prevents every repository and provider call, including invalid callbacks and mutation bodies', async () => {
  const repo = new MemoryAuthRepository();
  const transaction = vi.spyOn(repo, 'transaction');
  const forbidden = vi.fn(() => {
    throw Error('Forbidden provider access');
  });
  const provider: IdentityProvider = {
    authorize: forbidden,
    exchange: forbidden,
    validate: forbidden,
    revoke: forbidden,
  };
  const auth = new WebAuth(repo, provider, new Uint8Array(32).fill(1), origin);
  const api = createWebApi(auth, { authorize: forbidden, origins: [], linkingEnabled: true });
  for (const method of ['GET', 'POST'])
    for (const path of [
      '/auth/login',
      '/auth/callback?code=synthetic',
      '/auth/link/intent',
      '/auth/link/accept',
    ]) {
      expect((await api({ method, path, headers: {}, body: 'invalid JSON' })).statusCode).toBe(503);
    }
  expect(transaction).not.toHaveBeenCalled();
  expect(forbidden).not.toHaveBeenCalled();
});
it('enabled sign-in does not enable linking', async () => {
  const repo = new MemoryAuthRepository();
  const transaction = vi.spyOn(repo, 'transaction');
  const forbidden = vi.fn(() => {
    throw Error('Forbidden');
  });
  const auth = new WebAuth(
    repo,
    { authorize: forbidden, exchange: forbidden, validate: forbidden, revoke: forbidden },
    new Uint8Array(32).fill(1),
    origin,
  );
  for (const mode of ['DISABLED', 'TESTERS', 'ENABLED']) {
    const api = createWebApi(
      auth,
      { authorize: forbidden, origins: [], linkingEnabled: false },
      undefined,
      () => mode,
    );
    for (const path of ['/auth/link/intent', '/auth/link/accept'])
      expect(
        (await api({ method: 'POST', path, headers: { 'content-type': 'application/json' }, body: '{}' }))
          .statusCode,
      ).toBe(mode === 'ENABLED' ? 404 : 503);
  }
  expect(transaction).not.toHaveBeenCalled();
});
it('shutdown preserves existing accounts and allows CSRF-protected logout without token refresh', async () => {
  const repo = new MemoryAuthRepository();
  const tokens = { access: 'synthetic', refresh: 'synthetic', expiresAt: Date.now() + 3600000 };
  const provider: IdentityProvider = {
    authorize: (state, nonce) => origin + '/?' + new URLSearchParams({ state, nonce }),
    exchange: async () => ({ subject: 'synthetic', tokens }),
    validate: async () => ({ subject: 'synthetic', tokens }),
    revoke: vi.fn(async () => {}),
  };
  const auth = new WebAuth(repo, provider, new Uint8Array(32).fill(1), origin);
  const start = await auth.begin();
  const callback = await auth.callback(
    'synthetic',
    new URL(start.location).searchParams.get('state')!,
    start.cookie.split(';')[0]!.split('=')[1]!,
  );
  const sid = callback.cookie.split(';')[0]!.split('=')[1]!;
  const session = await auth.authorize(sid);
  const before = await repo.transaction((tx) => tx.get('account:' + session.account));
  let mode = 'ENABLED';
  const api = createWebApi(auth, undefined, undefined, () => mode);
  const validate = vi.spyOn(provider, 'validate').mockRejectedValue(Error('Provider unavailable'));
  mode = 'DISABLED';
  const headers = {
    cookie: '__Host-dime-session=' + sid,
    origin,
    'content-type': 'application/json',
    'x-dime-csrf': session.csrf,
  };
  expect(
    (await api({ method: 'POST', path: '/auth/logout', headers: { ...headers, 'x-dime-csrf': 'wrong' } }))
      .statusCode,
  ).toBe(403);
  const out = await api({ method: 'POST', path: '/auth/logout', headers });
  expect(out.statusCode).toBe(200);
  expect(out.cookies?.[0]).toContain('Max-Age=0');
  expect(validate).not.toHaveBeenCalled();
  expect(provider.revoke).toHaveBeenCalledOnce();
  expect(await repo.transaction((tx) => tx.get('account:' + session.account))).toEqual(before);
  await expect(auth.authorize(sid)).rejects.toThrow();
});
it('only safe continuation methods bypass a disabled gate', () => {
  for (const path of ['/auth/logout', '/auth/delete/resume']) {
    expect(webSignInPreflight({ method: 'POST', path }, 'DISABLED', false)).toBeUndefined();
    expect(webSignInPreflight({ method: 'GET', path }, 'DISABLED', false)).toBeUndefined();
  }
});
