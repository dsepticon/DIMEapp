import { afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  mintTesterInvitation,
  verifyTesterInvitation,
  invitationUseKey,
  testerIdentifier,
} from '../server/testerInvitation';
import { WebAuth, MemoryAuthRepository, type IdentityProvider } from '../server/webAuth';
import { createWebApi } from '../server/webHttp';
import type { RecordTransaction } from '../server/authRecords';
const origin = 'https://destroyaindustriesminingextension.com',
  key = new Uint8Array(32).fill(73);
const value = (cookie: string) => cookie.split(';')[0]!.split('=')[1]!;
function fixture() {
  let now = Date.now(),
    subject = '123456',
    linkMode = 'DISABLED',
    signMode = 'TESTERS';
  const repo = new MemoryAuthRepository(),
    writes: string[] = [];
  const transaction = repo.transaction.bind(repo);
  repo.transaction = (run) =>
    transaction(async (tx) =>
      run({
        ...tx,
        put: async (...args: Parameters<RecordTransaction['put']>) => {
          writes.push(args[0]);
          await tx.put(...args);
        },
      }),
    );
  const tokens = { access: 'synthetic-access', refresh: 'synthetic-refresh', expiresAt: now + 3600000 };
  const provider: IdentityProvider = {
    authorize: vi.fn(
      (state, nonce) => 'https://id.twitch.tv/oauth2/authorize?' + new URLSearchParams({ state, nonce }),
    ),
    exchange: vi.fn(async () => ({ subject, tokens })),
    validate: vi.fn(async () => ({ subject, tokens })),
    revoke: vi.fn(async () => {}),
  };
  const auth = new WebAuth(repo, provider, key, origin, () => now);
  const api = createWebApi(
    auth,
    {
      linkingEnabled: false,
      linkingMode: () => linkMode,
      origins: ['https://synthetic.ext-twitch.tv'],
      authorize: async () => 'PLAYER#v1#' + 'a'.repeat(64),
    },
    undefined,
    () => signMode,
  );
  const invite = () => mintTesterInvitation(key, '123456', now).invitation;
  const start = async (invitation = invite()) => {
    const response = await api({ method: 'GET', path: '/auth/login?invitation=' + invitation, headers: {} });
    expect(response.statusCode).toBe(303);
    return {
      state: new URL(response.headers.Location!).searchParams.get('state')!,
      cookie: response.cookies![0]!.split(';')[0]!,
      invitation,
    };
  };
  const finish = (s: Awaited<ReturnType<typeof start>>, query = 'code=synthetic-code&state=' + s.state) =>
    api({ method: 'GET', path: '/auth/callback?' + query, headers: { cookie: s.cookie } });
  return {
    repo,
    writes,
    auth,
    api,
    provider,
    invite,
    start,
    finish,
    tick: (ms: number) => {
      now += ms;
    },
    subject: (s: string) => {
      subject = s;
    },
    linking: (s: string) => {
      linkMode = s;
    },
    mode: (s: string) => {
      signMode = s;
    },
  };
}
afterEach(() => vi.restoreAllMocks());
it('invitation contains only bounded signed fields, uses domain separation and hides raw numeric subject', () => {
  const a = mintTesterInvitation(key, '123456', 1800000000000),
    p = verifyTesterInvitation(key, a.invitation, 1800000000000);
  expect(Object.keys(p)).toEqual(['v', 'exp', 'nonce', 'tester']);
  expect(a.expiresAt).toBe(1800000900000);
  expect(Buffer.from(a.invitation.split('.')[0]!, 'base64url').toString()).not.toContain('123456');
  expect(p.tester).not.toBe(
    createHmac('sha256', key)
      .update('dime:oauth-subject:v1\0' + '123456')
      .digest('hex'),
  );
  expect(testerIdentifier(key, '123457')).not.toBe(p.tester);
  for (const bad of ['', '0', '-1', '00123', 'abc', '1'.repeat(21)])
    expect(() => mintTesterInvitation(key, bad)).toThrow();
});
it.each(['expired', 'modified', 'wrong-key', 'empty', 'malformed'])(
  'rejects %s invitation before provider redirect or writes',
  async (reason) => {
    const f = fixture();
    let i = f.invite();
    if (reason === 'expired') f.tick(900001);
    if (reason === 'modified') i = i.slice(0, -2) + (i.at(-2) === 'A' ? 'B' : 'A') + i.at(-1);
    if (reason === 'wrong-key') i = mintTesterInvitation(new Uint8Array(32).fill(42), '123456').invitation;
    if (reason === 'empty') i = '';
    if (reason === 'malformed') i = 'invalid';
    const r = await f.api({ method: 'GET', path: '/auth/login?invitation=' + i, headers: {} });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.headers.Location).toBeUndefined();
    expect(f.provider.authorize).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  },
);
it('consumes once atomically; stores only nonce digest and expiry in the admission ledger', async () => {
  const f = fixture(),
    invitation = f.invite(),
    p = verifyTesterInvitation(key, invitation),
    s = await f.start(invitation);
  expect(await f.repo.transaction((tx) => tx.get(invitationUseKey(p.nonce)))).toEqual({
    expiresAt: p.exp * 1000,
  });
  expect(f.writes).toHaveLength(2);
  expect(f.writes.some((k) => k.includes(p.nonce))).toBe(false);
  const replay = await f.api({ method: 'GET', path: '/auth/login?invitation=' + invitation, headers: {} });
  expect(replay.statusCode).toBe(401);
  expect(f.provider.authorize).toHaveBeenCalledOnce();
  await f.finish(s);
  const again = await f.finish(s);
  expect(again.headers.Location).toBe(origin + '/game/?auth=failed');
  expect(f.provider.exchange).toHaveBeenCalledOnce();
});
it.each([false, true])(
  'wrong Twitch account rejects before identities; revocation failure=%s remains fail closed',
  async (failRevoke) => {
    const f = fixture(),
      s = await f.start();
    f.writes.length = 0;
    f.subject('987654');
    if (failRevoke) vi.mocked(f.provider.revoke).mockRejectedValue(Error('Unavailable'));
    const r = await f.finish(s);
    expect(r.headers.Location).toBe(origin + '/game/?auth=failed');
    expect(f.provider.revoke).toHaveBeenCalledOnce();
    expect(f.writes).toEqual([]);
    expect(r.cookies).toHaveLength(2);
    expect(r.cookies!.every((c) => c.includes('Max-Age=0'))).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/987654|synthetic-access|synthetic-refresh/);
  },
);
it.each(['denial', 'state-mismatch', 'exchange-failure', 'expiry'])(
  'callback %s cannot create local identity/session/save',
  async (kind) => {
    const f = fixture(),
      s = await f.start();
    f.writes.length = 0;
    if (kind === 'exchange-failure')
      vi.mocked(f.provider.exchange).mockRejectedValue(Error('Provider rejected'));
    if (kind === 'expiry') f.tick(300001);
    const query =
      kind === 'denial'
        ? 'error=access_denied&state=' + s.state
        : kind === 'state-mismatch'
          ? 'code=synthetic&state=' + 'x'.repeat(43)
          : undefined;
    const r = await f.finish(s, query);
    expect(r.headers.Location).toBe(origin + '/game/?auth=failed');
    expect(f.writes).toEqual([]);
    if (kind !== 'exchange-failure') expect(f.provider.exchange).not.toHaveBeenCalled();
    expect(r.cookies!.every((c) => c.includes('Max-Age=0'))).toBe(true);
  },
);
it('tester session rotates, expires, logs out; disabled linking blocks every gameplay route without any record access', async () => {
  const f = fixture(),
    first = await f.finish(await f.start()),
    sid = value(first.cookies![0]!);
  expect(first.headers.Location).toBe(origin + '/auth/session?view=tester');
  expect(first.cookies![0]).toContain('Secure; HttpOnly; SameSite=Lax');
  const a = await f.auth.authorize(sid);
  expect(a.testerUntil).toBeGreaterThan(Date.now());
  expect(await f.repo.transaction((tx) => tx.get('state:' + a.player))).toBeUndefined();
  const transaction = vi.spyOn(f.repo, 'transaction');
  transaction.mockClear();
  for (const [method, path] of [
    ['GET', '/api/v4/state'],
    ['POST', '/api/v4/actions'],
    ['POST', '/api/v4/profile/reset'],
    ['POST', '/api/v4/content/convert'],
  ]) {
    const r = await f.api({
      method: method!,
      path: path!,
      headers: { cookie: '__Host-dime-session=' + sid, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(r.statusCode).toBe(403);
  }
  expect(transaction).not.toHaveBeenCalled();
  const view = await f.api({
    method: 'GET',
    path: '/auth/session?view=tester',
    headers: { cookie: '__Host-dime-session=' + sid },
  });
  expect(view.body).toContain('Shared-save linking is not enabled');
  expect(view.body).not.toContain(a.account);
  for (const mode of ['DISABLED', 'TESTERS', 'ENABLED']) {
    f.mode(mode);
    const r = await f.api({
      method: 'POST',
      path: '/auth/link/intent',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
  }
  f.mode('TESTERS');
  const second = await f.finish(await f.start()),
    sid2 = value(second.cookies![0]!);
  expect(sid2).not.toBe(sid);
  await expect(f.auth.authorize(sid)).rejects.toThrow();
  const b = await f.auth.authorize(sid2);
  const out = await f.api({
    method: 'POST',
    path: '/auth/logout',
    headers: { cookie: '__Host-dime-session=' + sid2, origin, 'x-dime-csrf': b.csrf },
  });
  expect(out.statusCode).toBe(200);
  expect(out.cookies![0]).toContain('Max-Age=0');
  await expect(f.auth.authorize(sid2)).rejects.toThrow();
  const third = await f.finish(await f.start());
  f.tick(1800001);
  await expect(f.auth.authorize(value(third.cookies![0]!))).rejects.toThrow();
  expect(f.writes.some((k) => k.startsWith('state:') || k.startsWith('receipt:'))).toBe(false);
});
it('future TESTERS linking requires explicit confirmation and authenticated eligibility; leaves canonical Extension state untouched', async () => {
  const f = fixture();
  f.linking('TESTERS');
  const r = await f.finish(await f.start()),
    sid = value(r.cookies![0]!),
    a = await f.auth.authorize(sid);
  const h = {
    cookie: '__Host-dime-session=' + sid,
    origin,
    'x-dime-csrf': a.csrf,
    'content-type': 'application/json',
  };
  expect(
    (await f.api({ method: 'POST', path: '/auth/link/intent', headers: h, body: '{}' })).statusCode,
  ).toBeGreaterThanOrEqual(400);
  const intent = await f.api({
    method: 'POST',
    path: '/auth/link/intent',
    headers: h,
    body: JSON.stringify({ confirmation: 'LINK_EXTENSION' }),
  });
  expect(intent.statusCode).toBe(200);
  const publicStart = await f.auth.begin(),
    pub = await f.auth.callback(
      'synthetic',
      new URL(publicStart.location).searchParams.get('state')!,
      value(publicStart.cookie),
    );
  const pubSid = value(pub.cookie),
    b = await f.auth.authorize(pubSid);
  await expect(f.auth.createLink(pubSid, { origin, csrf: b.csrf }, true)).rejects.toThrow();
  expect(await f.repo.transaction((tx) => tx.get('state:' + a.player))).toBeUndefined();
});
it('disabled/malformed mode prevents valid invitations from writing or redirecting and public capability stays unavailable', async () => {
  for (const mode of ['DISABLED', '', 'unknown', 'testers']) {
    const f = fixture();
    f.mode(mode);
    const r = await f.api({ method: 'GET', path: '/auth/login?invitation=' + f.invite(), headers: {} });
    expect(r.statusCode).toBe(503);
    expect(f.writes).toEqual([]);
  }
  const f = fixture();
  const r = await f.api({ method: 'GET', path: '/auth/status', headers: {} });
  expect(JSON.parse(r.body)).toEqual({ signInAvailable: false, linkingAvailable: false });
});
it('authentication paths emit no console data including rejected provider messages', async () => {
  const spies = ['log', 'error', 'warn', 'info', 'debug'].map((k) =>
    vi.spyOn(console, k as 'log').mockImplementation(() => {}),
  );
  const f = fixture(),
    s = await f.start();
  vi.mocked(f.provider.exchange).mockRejectedValue(Error('synthetic-provider-secret'));
  const r = await f.finish(s);
  expect(JSON.stringify(r)).not.toContain('synthetic-provider-secret');
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
});
it('simultaneous use admits exactly one browser and cannot split invitation consumption from login state', async () => {
  const f = fixture(),
    invitation = f.invite();
  const responses = await Promise.all(
    [1, 2].map(() => f.api({ method: 'GET', path: '/auth/login?invitation=' + invitation, headers: {} })),
  );
  expect(responses.filter((r) => r.statusCode === 303)).toHaveLength(1);
  expect(f.writes).toHaveLength(2);
});
it('valid tester can begin verified deletion while linking remains disabled without ever creating a save', async () => {
  const f = fixture(),
    r = await f.finish(await f.start()),
    sid = value(r.cookies![0]!),
    a = await f.auth.authorize(sid);
  const result = await f.api({
    method: 'POST',
    path: '/auth/delete/intent',
    headers: {
      cookie: '__Host-dime-session=' + sid,
      origin,
      'x-dime-csrf': a.csrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ confirmation: 'DELETE_ACCOUNT', capability: 'c'.repeat(43) }),
  });
  expect(result.statusCode).toBe(200);
  await expect(f.auth.authorize(sid)).rejects.toThrow();
  expect(f.writes.some((k) => k.startsWith('state:') || k.startsWith('receipt:'))).toBe(false);
});
it('eligible link and replay keep the existing Extension save, generation and manifest canonical without merging', async () => {
  const { originalInitialState } = await import('../shared/originalGame');
  const f = fixture(),
    response = await f.finish(await f.start()),
    sid = value(response.cookies![0]!),
    session = await f.auth.authorize(sid);
  const player = 'PLAYER#v1#' + 'b'.repeat(64),
    save = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5);
  await f.repo.transaction((tx) => tx.put('state:' + player, save));
  const intent = await f.auth.createLink(sid, { origin, csrf: session.csrf }, true);
  expect(await f.auth.acceptLink(intent, player, true)).toEqual({ linked: true });
  expect(await f.auth.acceptLink(intent, player, true)).toEqual({ linked: true });
  await expect(f.auth.acceptLink(intent, 'PLAYER#v1#' + 'c'.repeat(64), true)).rejects.toThrow();
  expect(await f.repo.transaction((tx) => tx.get('state:' + player))).toEqual(save);
  expect(await f.repo.transaction((tx) => tx.get('state:' + session.player))).toBeUndefined();
  const manifest = await f.repo.transaction((tx) =>
    tx.get<{ player: string; extension: string }>('manifest:' + session.account),
  );
  expect(manifest?.player).toBe(player);
  expect(manifest?.extension).toBe(player);
});
it('normalized-path aliases and malformed mode combinations cannot bypass admission or create saves', async () => {
  const f = fixture();
  f.mode('DISABLED');
  for (const path of [
    '/auth/../auth/login',
    '/auth/login#ignored',
    '/auth/../auth/callback',
    '/auth/link/../link/intent',
  ]) {
    const r = await f.api({ method: 'GET', path, headers: {} });
    expect(r.statusCode).toBe(503);
  }
  expect(f.writes).toEqual([]);
  expect(f.provider.authorize).not.toHaveBeenCalled();
  f.linking('ENABLED');
  f.mode('unknown');
  expect((await f.api({ method: 'GET', path: '/api/v4/state', headers: {} })).statusCode).toBe(403);
  expect(f.writes).toEqual([]);
});
