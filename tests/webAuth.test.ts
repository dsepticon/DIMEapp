import { describe, expect, it } from 'vitest';
import {
  MemoryAuthRepository,
  WebAuth,
  WebAuthError,
  type IdentityProvider,
  type Tokens,
  type Account,
  digest,
} from '../server/webAuth';
import { createWebApi } from '../server/webHttp';
const origin = 'https://destroyaindustriesminingextension.com';
function fixture() {
  let now = 1_800_000_000_000,
    revoked = false,
    subject = '12345',
    calls = 0;
  const repo = new MemoryAuthRepository();
  const tokens: Tokens = {
    access: 'synthetic-access',
    refresh: 'synthetic-refresh',
    expiresAt: now + 3600000,
  };
  const provider: IdentityProvider = {
    authorize: (state, nonce) =>
      'https://id.twitch.tv/oauth2/authorize?' + new URLSearchParams({ state, nonce }),
    exchange: async () => ({ subject, tokens }),
    validate: async () => {
      calls++;
      if (revoked) throw new WebAuthError();
      return { subject, tokens };
    },
    revoke: async () => {
      revoked = true;
    },
  };
  const auth = new WebAuth(repo, provider, new Uint8Array(32).fill(7), origin, () => now);
  const login = async () => {
    const begin = await auth.begin(),
      url = new URL(begin.location);
    const browser = begin.cookie.split(';')[0]!.split('=')[1]!;
    const state = url.searchParams.get('state')!;
    const callback = await auth.callback('synthetic-code', state, browser);
    const sid = callback.cookie.split(';')[0]!.split('=')[1]!;
    const session = await auth.authorize(sid);
    return { sid, session, begin, browser, state, callback };
  };
  return {
    auth,
    repo,
    provider,
    login,
    tick: (ms: number) => {
      now += ms;
    },
    revoke: () => {
      revoked = true;
    },
    subject: (v: string) => {
      subject = v;
    },
    calls: () => calls,
  };
}
describe('web authentication security', () => {
  it('binds one-use state to the browser, expires it and never returns provider tokens', async () => {
    const f = fixture(),
      begin = await f.auth.begin(),
      state = new URL(begin.location).searchParams.get('state')!;
    await expect(f.auth.callback('code', state, 'x'.repeat(43))).rejects.toThrow(WebAuthError);
    const browser = begin.cookie.split(';')[0]!.split('=')[1]!;
    const response = await f.auth.callback('code', state, browser);
    expect(response.cookie).toContain('Secure; HttpOnly; SameSite=Lax');
    expect(JSON.stringify(response)).not.toContain('synthetic-access');
    expect(response.location).toBe(origin + '/');
    await expect(f.auth.callback('code', state, browser)).rejects.toThrow(WebAuthError);
    const expired = await f.auth.begin();
    f.tick(300001);
    await expect(
      f.auth.callback(
        'code',
        new URL(expired.location).searchParams.get('state')!,
        expired.cookie.split(';')[0]!.split('=')[1]!,
      ),
    ).rejects.toThrow(WebAuthError);
  });
  it('rejects missing or wrong CSRF and exact-origin mismatch', async () => {
    const f = fixture(),
      { sid, session } = await f.login();
    for (const mutation of [
      { origin },
      { origin, csrf: 'wrong' },
      { origin: origin + '.evil.test', csrf: session.csrf },
    ])
      await expect(f.auth.authorize(sid, mutation)).rejects.toThrow(WebAuthError);
    await expect(f.auth.authorize(sid, { origin, csrf: session.csrf })).resolves.toMatchObject({
      account: session.account,
    });
  });
  it('uses random account IDs, separate subject namespace and isolates two players', async () => {
    const f = fixture(),
      a = await f.login();
    f.subject('67890');
    const b = await f.login();
    expect(a.session.account).not.toBe(b.session.account);
    expect(a.session.player).not.toContain('12345');
    expect(a.session.account).toMatch(/^[0-9a-f-]{36}$/);
    await expect(f.auth.authorize(a.sid)).rejects.toThrow(WebAuthError); // mismatched provider subject
  });
  it('rotates sessions on callback and expires idle sessions', async () => {
    const f = fixture(),
      a = await f.login(),
      next = await f.auth.begin();
    await f.auth.callback(
      'code',
      new URL(next.location).searchParams.get('state')!,
      next.cookie.split(';')[0]!.split('=')[1]!,
      a.sid,
    );
    await expect(f.auth.authorize(a.sid)).rejects.toThrow(WebAuthError);
    const b = await f.login();
    f.tick(30 * 60000 + 1);
    await expect(f.auth.authorize(b.sid)).rejects.toThrow(WebAuthError);
  });
  it('revocation terminates every session for the credential', async () => {
    const f = fixture(),
      a = await f.login(),
      b = await f.login();
    f.revoke();
    await expect(f.auth.authorize(a.sid)).rejects.toThrow(WebAuthError);
    await expect(f.auth.authorize(b.sid)).rejects.toThrow(WebAuthError);
  });
  it('logout invalidates all credential sessions and clears the cookie', async () => {
    const f = fixture(),
      a = await f.login(),
      b = await f.login();
    expect(await f.auth.logout(b.sid, { origin, csrf: b.session.csrf })).toContain('Max-Age=0');
    await expect(f.auth.authorize(a.sid)).rejects.toThrow(WebAuthError);
    await expect(f.auth.authorize(b.sid)).rejects.toThrow(WebAuthError);
  });
});
describe('synthetic link transactions', () => {
  const extension = 'PLAYER#v1#' + 'a'.repeat(64);
  it('consumes link once and retains established extension save without copying fields', async () => {
    const f = fixture(),
      a = await f.login();
    const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
    await f.repo.transaction((d) => d.put('state:' + extension, { revision: 1 }));
    const results = await Promise.allSettled([
      f.auth.acceptLink(intent, extension),
      f.auth.acceptLink(intent, extension),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(
      await f.repo.transaction(async (d) => (await d.get<Account>('account:' + a.session.account))?.player),
    ).toBe(extension);
    await expect(f.auth.authorize(a.sid)).rejects.toThrow(WebAuthError);
  });
  it('never overwrites two established saves and consumes the conflicting intent', async () => {
    const f = fixture(),
      a = await f.login();
    await f.repo.transaction(async (d) => {
      const key = 'account:' + a.session.account;
      const account = (await d.get<Account>(key))!;
      account.established = true;
      await d.put(key, account);
      await d.put('state:' + extension, { revision: 1 });
    });
    const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
    await expect(f.auth.acceptLink(intent, extension)).rejects.toMatchObject({ status: 409 });
    expect(
      await f.repo.transaction(async (d) => (await d.get<Account>('account:' + a.session.account))?.player),
    ).toBe(a.session.player);
    expect(await f.repo.transaction((d) => d.get('extension:' + extension))).toBeUndefined();
    await expect(f.auth.acceptLink(intent, extension)).rejects.toThrow(WebAuthError);
  });
  it('expired or logged-out intents cannot link and credentials cannot be reassigned', async () => {
    const f = fixture(),
      a = await f.login();
    const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
    f.tick(300001);
    await expect(f.auth.acceptLink(intent, extension)).rejects.toThrow(WebAuthError);
    const newer = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
    await f.repo.transaction((d) => d.delete('session:' + digest(a.sid)));
    await expect(f.auth.acceptLink(newer, extension)).rejects.toThrow(WebAuthError);
  });
});
it('web HTTP keeps callback tokens out of final URLs, enforces CSRF and isolates game requests', async () => {
  const f = fixture(),
    a = await f.login();
  const api = createWebApi(
    f.auth,
    {
      linkingEnabled: true,
      origins: [],
      authorize: async () => {
        throw Error('Unused');
      },
    },
    undefined,
    () => 'ENABLED',
  );
  const headers = { cookie: '__Host-dime-session=' + a.sid };
  const response = await api({ method: 'GET', path: '/api/v4/state', headers });
  expect(response.statusCode).toBe(200);
  expect(await f.repo.transaction((d) => d.get('state:' + a.session.player))).toBeDefined();
  const blocked = await api({ method: 'POST', path: '/api/v4/actions', headers, body: '{}' });
  expect(blocked.statusCode).toBe(403);
  const unauth = await api({ method: 'GET', path: '/api/v4/state', headers: {} });
  expect(unauth.statusCode).toBe(401);
  expect(await f.repo.transaction((d) => d.get('state:' + a.session.player))).toBeDefined();
  const callback = await api({
    method: 'GET',
    path: '/auth/callback?code=secret&state=invalid',
    headers: {},
  });
  expect(callback.statusCode).toBe(303);
  expect(callback.headers.Location).toBe(origin + '/game/?auth=failed');
  expect(callback.body).not.toContain('secret');
});

it('serializes provider validation with a durable credential lease', async () => {
  const f = fixture(),
    a = await f.login();
  let release!: () => void, ready!: () => void;
  const wait = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      ready = resolve;
    });
  const validate = f.provider.validate;
  f.provider.validate = async (tokens) => {
    ready();
    await wait;
    return validate(tokens);
  };
  const pending = f.auth.authorize(a.sid);
  await started;
  await expect(f.auth.authorize(a.sid)).rejects.toMatchObject({ status: 409 });
  release();
  await expect(pending).resolves.toMatchObject({ account: a.session.account });
});
it('gameplay updates mark established progress atomically and block conflicting linking', async () => {
  const f = fixture(),
    a = await f.login(),
    store = f.auth.gameStore(a.session);
  const { originalInitialState } = await import('../shared/originalGame');
  const state = originalInitialState(crypto.randomUUID(), () => 0.5);
  expect(await store.commit(a.session.player, null, state)).toBe(true);
  const next = { ...state, revision: state.revision + 1 };
  expect(await store.commit(a.session.player, state.revision, next)).toBe(true);
  const ext = 'PLAYER#v1#' + 'b'.repeat(64);
  await f.repo.transaction((tx) => tx.put('state:' + ext, state));
  const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
  await expect(f.auth.acceptLink(intent, ext)).rejects.toMatchObject({ status: 409 });
  expect((await store.read(a.session.player))?.revision).toBe(next.revision);
});
it('a link invalidates stale Extension and web store bindings without copying saves', async () => {
  const f = fixture(),
    a = await f.login(),
    ext = 'PLAYER#v1#' + 'c'.repeat(64);
  const stale = await f.auth.extensionStore(ext),
    web = f.auth.gameStore(a.session);
  const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
  await f.auth.acceptLink(intent, ext);
  const { originalInitialState } = await import('../shared/originalGame');
  const state = originalInitialState(crypto.randomUUID(), () => 0.5);
  await expect(stale.store.commit(stale.player, null, state)).rejects.toThrow();
  await expect(web.commit(a.session.player, null, state)).rejects.toThrow();
  const current = await f.auth.extensionStore(ext);
  expect(current.player).toBe(a.session.player);
  expect(await current.store.commit(current.player, null, state)).toBe(true);
});
it('account mapping survives token and session expiration', async () => {
  const f = fixture(),
    a = await f.login();
  f.tick(8 * 3600000 + 1);
  await expect(f.auth.authorize(a.sid)).rejects.toThrow();
  const b = await f.login();
  expect(b.session.account).toBe(a.session.account);
});

it('the combined API requires independent Extension auth and preserves shared save selection', async () => {
  const f = fixture(),
    a = await f.login();
  const { createAccountApi } = await import('../server/accountApi');
  const extension = 'PLAYER#v1#' + 'd'.repeat(64),
    extensionOrigin = 'https://synthetic.ext-twitch.tv';
  const api = createAccountApi(
    f.auth,
    {
      linkingEnabled: true,
      origins: [extensionOrigin],
      authorize: async (header) => {
        if (header !== 'Bearer synthetic-extension') throw new WebAuthError();
        return extension;
      },
    },
    undefined,
    () => 'ENABLED',
  );
  const created = await api({
    method: 'POST',
    path: '/auth/link/intent',
    headers: {
      cookie: '__Host-dime-session=' + a.sid,
      origin,
      'x-dime-csrf': a.session.csrf,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  expect(created.statusCode).toBe(200);
  const { intent } = JSON.parse(created.body);
  const request = {
    method: 'POST',
    path: '/auth/link/accept',
    headers: { origin: extensionOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ intent }),
  };
  expect((await api(request)).statusCode).toBe(401);
  const accepted = await api({
    ...request,
    headers: { ...request.headers, authorization: 'Bearer synthetic-extension' },
  });
  expect(accepted.statusCode).toBe(200);
  expect(accepted.headers['Access-Control-Allow-Origin']).toBe(extensionOrigin);
  const ext = await f.auth.extensionStore(extension);
  expect(ext.player).toBe(a.session.player);
  await expect(f.auth.authorize(a.sid)).rejects.toThrow();
});

it('integrated web and Extension adapters with linking enabled preserve ENABLED conversion and canonical fresh saves', async () => {
  const f = fixture(),
    a = await f.login();
  const { createAccountApi } = await import('../server/accountApi');
  const api = createAccountApi(
    f.auth,
    {
      linkingEnabled: true,
      origins: ['https://synthetic.ext-twitch.tv'],
      authorize: async () => 'PLAYER#v1#' + 'e'.repeat(64),
    },
    { mode: 'ENABLED', testerCount: 0, permits: () => true },
    () => 'ENABLED',
  );
  for (const request of [
    { method: 'GET', path: '/api/v4/state', headers: { cookie: '__Host-dime-session=' + a.sid } },
    { method: 'GET', path: '/v4/state', headers: { origin: 'https://synthetic.ext-twitch.tv' } },
  ]) {
    const response = await api(request);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.state.schemaVersion).toBe(3);
    expect(body.state.contentVersion).toBe(4);
    expect(body.state.saveGeneration).toEqual(expect.any(String));
  }
});

it('both integrated adapters expose the configured conversion gate for synthetic legacy saves', async () => {
  const f = fixture(),
    a = await f.login();
  const { initialState } = await import('../shared/game');
  const { createAccountApi } = await import('../server/accountApi');
  const extension = 'PLAYER#v1#' + 'f'.repeat(64);
  await f.repo.transaction(async (tx) => {
    await tx.put(
      'state:' + a.session.player,
      initialState(() => 0.5),
    );
    await tx.put(
      'state:' + extension,
      initialState(() => 0.5),
    );
  });
  for (const enabled of [false, true]) {
    const api = createAccountApi(
      f.auth,
      {
        linkingEnabled: true,
        origins: ['https://synthetic.ext-twitch.tv'],
        authorize: async () => extension,
      },
      { mode: enabled ? 'ENABLED' : 'DISABLED', testerCount: 0, permits: () => enabled },
      () => 'ENABLED',
    );
    for (const request of [
      { method: 'GET', path: '/api/v4/state', headers: { cookie: '__Host-dime-session=' + a.sid } },
      { method: 'GET', path: '/v4/state', headers: { origin: 'https://synthetic.ext-twitch.tv' } },
    ]) {
      const response = await api(request);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).conversionAvailable).toBe(enabled);
    }
  }
});

it('preserves every Extension save field, generation and receipt when linking and replaying', async () => {
  const f = fixture(),
    a = await f.login(),
    ext = 'PLAYER#v1#' + 'e'.repeat(64);
  const { originalInitialState } = await import('../shared/originalGame');
  const state = originalInitialState(crypto.randomUUID(), () => 0.5);
  state.revision = 19;
  const receipt = { fingerprint: 'synthetic-preserved-receipt', expiresAt: 1900000000 };
  await f.repo.transaction(async (tx) => {
    await tx.put('state:' + ext, state);
    await tx.put('receipt:old:' + ext, receipt);
  });
  const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
  await f.auth.acceptLink(intent, ext);
  await expect(f.auth.acceptLink(intent, ext)).resolves.toEqual({ linked: true });
  const b = await f.login(),
    bound = await f.auth.extensionStore(ext);
  expect(b.session.player).toBe(ext);
  expect(await f.auth.gameStore(b.session).read(ext)).toEqual(state);
  expect(await bound.store.read(ext)).toEqual(state);
  expect(await bound.store.receipt(ext, 'old')).toEqual(receipt);
  expect(await f.repo.transaction((tx) => tx.get('state:' + a.session.player))).toBeUndefined();
});
it('even two pristine existing saves conflict; replay returns explicit conflict without changing either', async () => {
  const f = fixture(),
    a = await f.login(),
    ext = 'PLAYER#v1#' + 'e'.repeat(64);
  const { originalInitialState } = await import('../shared/originalGame');
  const web = originalInitialState(crypto.randomUUID(), () => 0.5),
    extension = originalInitialState(crypto.randomUUID(), () => 0.5);
  await f.repo.transaction(async (tx) => {
    await tx.put('state:' + a.session.player, web);
    await tx.put('state:' + ext, extension);
  });
  const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
  for (let i = 0; i < 2; i++)
    await expect(f.auth.acceptLink(intent, ext)).rejects.toMatchObject({
      status: 409,
      code: 'LINK_CONFLICT',
    });
  expect(await f.repo.transaction((tx) => tx.get('state:' + a.session.player))).toEqual(web);
  expect(await f.repo.transaction((tx) => tx.get('state:' + ext))).toEqual(extension);
  expect(await f.repo.transaction((tx) => tx.get('binding:' + ext))).toBeUndefined();
});
it('an intent cannot cross a web revision or reset generation change', async () => {
  for (const field of ['revision', 'saveGeneration'] as const) {
    const f = fixture(),
      a = await f.login(),
      ext = 'PLAYER#v1#' + 'e'.repeat(64);
    const { originalInitialState } = await import('../shared/originalGame');
    const state = originalInitialState(crypto.randomUUID(), () => 0.5);
    await f.repo.transaction((tx) => tx.put('state:' + a.session.player, state));
    const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
    if (field === 'revision') state.revision++;
    else state.saveGeneration = crypto.randomUUID();
    await f.repo.transaction((tx) => tx.put('state:' + a.session.player, state));
    await expect(f.auth.acceptLink(intent, ext)).rejects.toMatchObject({ code: 'LINK_STALE' });
    expect(await f.repo.transaction((tx) => tx.get('binding:' + ext))).toBeUndefined();
  }
});
it('a web-only save becomes canonical for an Extension with no save, without copy or reward', async () => {
  const f = fixture(),
    a = await f.login(),
    ext = 'PLAYER#v1#' + 'f'.repeat(64);
  const { originalInitialState } = await import('../shared/originalGame');
  const state = originalInitialState(crypto.randomUUID(), () => 0.5);
  await f.repo.transaction((tx) => tx.put('state:' + a.session.player, state));
  const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
  await f.auth.acceptLink(intent, ext);
  const bound = await f.auth.extensionStore(ext);
  expect(bound.player).toBe(a.session.player);
  expect(await bound.store.read(bound.player)).toEqual(state);
  expect(await f.repo.transaction((tx) => tx.get('state:' + ext))).toBeUndefined();
});
it('replay cannot relink after detachment, and detached routing never creates a replacement profile', async () => {
  const f = fixture(),
    a = await f.login(),
    ext = 'PLAYER#v1#' + 'f'.repeat(64);
  const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
  await f.auth.acceptLink(intent, ext);
  const { originalInitialState } = await import('../shared/originalGame');
  const state = originalInitialState(crypto.randomUUID(), () => 0.5);
  await f.repo.transaction(async (tx) => {
    await tx.put('state:' + a.session.player, state);
    const binding = (await tx.get<import('../server/canonicalPlayer').PlayerBinding>('binding:' + ext))!;
    await tx.put('binding:' + ext, { ...binding, epoch: crypto.randomUUID(), status: 'DETACHED' });
  });
  const bound = await f.auth.extensionStore(ext);
  expect(bound.player).toBe(a.session.player);
  expect(await bound.store.read(bound.player)).toEqual(state);
  await expect(f.auth.acceptLink(intent, ext)).rejects.toMatchObject({ code: 'LINK_STALE' });
});
it('old-generation actions cannot commit after reset on the shared canonical save', async () => {
  const f = fixture(),
    a = await f.login(),
    ext = 'PLAYER#v1#' + 'f'.repeat(64);
  const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
  await f.auth.acceptLink(intent, ext);
  const bound = await f.auth.extensionStore(ext);
  const { originalInitialState } = await import('../shared/originalGame');
  const old = originalInitialState(crypto.randomUUID(), () => 0.5),
    fresh = originalInitialState(crypto.randomUUID(), () => 0.5);
  await f.repo.transaction((tx) => tx.put('state:' + bound.player, fresh));
  expect(await bound.store.commit(bound.player, fresh.revision, old, undefined, old.saveGeneration)).toBe(
    false,
  );
  expect(await bound.store.read(bound.player)).toEqual(fresh);
});
it('link receipts reject another Extension identity and new login does not duplicate the account', async () => {
  const f = fixture(),
    a = await f.login(),
    ext = 'PLAYER#v1#' + 'f'.repeat(64);
  const intent = await f.auth.createLink(a.sid, { origin, csrf: a.session.csrf });
  await f.auth.acceptLink(intent, ext);
  await expect(f.auth.acceptLink(intent, 'PLAYER#v1#' + 'e'.repeat(64))).rejects.toThrow();
  const b = await f.login(),
    c = await f.login();
  expect(b.session.account).toBe(a.session.account);
  expect(c.session.account).toBe(a.session.account);
});
