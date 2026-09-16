import { expect, it } from 'vitest';
import { WebAuth, MemoryAuthRepository, opaque, type IdentityProvider } from '../server/webAuth';
import {
  AUTH_TTL,
  TEMPORARY_CLASSES,
  manifestKey,
  controlKey,
  reservationKey,
  persistentReferences,
  validateManifest,
  type AccountManifest,
} from '../server/accountManifest';
import { originalInitialState } from '../shared/originalGame';
import { randomUUID } from 'node:crypto';
const origin = 'https://destroyaindustriesminingextension.com';
const extension = 'PLAYER#v1#' + 'a'.repeat(64);
function fixture() {
  let now = 1800000000000,
    subject = '1234',
    failRevocation = false,
    revoked = 0;
  const repo = new MemoryAuthRepository();
  const tokens = { access: 'synthetic', refresh: 'synthetic-refresh', expiresAt: now + 3600000 };
  const provider: IdentityProvider = {
    authorize: (state, nonce) => 'https://id.twitch.tv/?' + new URLSearchParams({ state, nonce }),
    exchange: async () => ({ subject, tokens }),
    validate: async () => ({ subject, tokens }),
    revoke: async () => {
      if (failRevocation) throw Error('Synthetic outage');
      revoked++;
    },
  };
  const auth = new WebAuth(repo, provider, new Uint8Array(32).fill(4), origin, () => now);
  const login = async () => {
    const start = await auth.begin();
    const r = await auth.callback(
      'synthetic-code',
      new URL(start.location).searchParams.get('state')!,
      start.cookie.split(';')[0]!.split('=')[1]!,
    );
    const sid = r.cookie.split(';')[0]!.split('=')[1]!;
    const session = await auth.authorize(sid);
    return { sid, session, mutation: { origin, csrf: session.csrf } };
  };
  const get = <T>(key: string) => repo.transaction((tx) => tx.get<T>(key));
  return {
    repo,
    auth,
    login,
    get,
    tick: (ms: number) => {
      now += ms;
    },
    subject: (s: string) => {
      subject = s;
    },
    fail: (b: boolean) => {
      failRevocation = b;
    },
    revoked: () => revoked,
  };
}
it('creates a bounded web-only manifest atomically without a gameplay snapshot', async () => {
  const f = fixture(),
    a = await f.login();
  const m = await f.get<AccountManifest>(manifestKey(a.session.account));
  expect(m).toEqual({
    version: 1,
    temporary: [...TEMPORARY_CLASSES],
    account: a.session.account,
    player: a.session.player,
    oauth: a.session.subject,
    status: 'ACTIVE',
  });
  expect(persistentReferences(m!)).toHaveLength(7);
  expect(JSON.stringify(m)).not.toMatch(/synthetic|tokens|wallet|inventory/);
  expect(await f.get('state:' + a.session.player)).toBeUndefined();
});
it('preserves an Extension save and writes one complete manifest on link and replay', async () => {
  const f = fixture(),
    a = await f.login(),
    state = originalInitialState(randomUUID(), () => 0.5);
  await f.repo.transaction((tx) => tx.put('state:' + extension, state));
  const intent = await f.auth.createLink(a.sid, a.mutation);
  await f.auth.acceptLink(intent, extension);
  const m = await f.get<AccountManifest>(manifestKey(a.session.account));
  expect(m?.extension).toBe(extension);
  expect(m?.player).toBe(extension);
  expect(persistentReferences(m!)).toHaveLength(9);
  expect(await f.get('state:' + extension)).toEqual(state);
  expect(await f.get(controlKey(a.session.player))).toBeUndefined();
  await f.auth.acceptLink(intent, extension);
  expect(await f.get(manifestKey(a.session.account))).toEqual(m);
});
it('conflicting populated saves leave manifest and ownership unchanged', async () => {
  const f = fixture(),
    a = await f.login();
  await f.repo.transaction(async (tx) => {
    await tx.put(
      'state:' + extension,
      originalInitialState(randomUUID(), () => 0.5),
    );
    await tx.put(
      'state:' + a.session.player,
      originalInitialState(randomUUID(), () => 0.5),
    );
  });
  const before = await f.get(manifestKey(a.session.account)),
    intent = await f.auth.createLink(a.sid, a.mutation);
  await expect(f.auth.acceptLink(intent, extension)).rejects.toMatchObject({ code: 'LINK_CONFLICT' });
  await expect(f.auth.acceptLink(intent, extension)).rejects.toMatchObject({ code: 'LINK_CONFLICT' });
  expect(await f.get(manifestKey(a.session.account))).toEqual(before);
  expect(await f.get('binding:' + extension)).toBeUndefined();
});
it('unlink removes live mappings, preserves the save and permits only verified same-identity relink', async () => {
  const f = fixture(),
    a = await f.login();
  await f.auth.acceptLink(await f.auth.createLink(a.sid, a.mutation), extension);
  const b = await f.login(),
    state = originalInitialState(randomUUID(), () => 0.5);
  await f.repo.transaction((tx) => tx.put('state:' + b.session.player, state));
  await f.auth.unlink(b.sid, b.mutation, 'UNLINK_EXTENSION');
  expect(await f.get('binding:' + extension)).toBeUndefined();
  expect(await f.get('extension:' + extension)).toBeUndefined();
  const m = await f.get<AccountManifest>(manifestKey(b.session.account));
  expect(m?.extension).toBeUndefined();
  expect(m?.detached).toBe(extension);
  await expect(f.auth.extensionStore(extension)).rejects.toThrow();
  expect(await f.get('state:' + b.session.player)).toEqual(state);
  const c = await f.login();
  await expect(
    f.auth.acceptLink(await f.auth.createLink(c.sid, c.mutation), 'PLAYER#v1#' + 'b'.repeat(64)),
  ).rejects.toThrow();
  await f.auth.acceptLink(await f.auth.createLink(c.sid, c.mutation), extension);
  expect(await f.get(reservationKey(extension))).toBeUndefined();
  expect((await f.get<AccountManifest>(manifestKey(c.session.account)))?.extension).toBe(extension);
});
for (const stop of [0, 1, 2, 3])
  it(`deletion resumes after interruption at step ${stop}, blocks both clients and deletes manifest last`, async () => {
    const f = fixture(),
      a = await f.login();
    await f.auth.acceptLink(await f.auth.createLink(a.sid, a.mutation), extension);
    const b = await f.login(),
      ext = await f.auth.extensionStore(extension),
      cap = opaque();
    const state = originalInitialState(randomUUID(), () => 0.5);
    await f.repo.transaction((tx) => tx.put('state:' + b.session.player, state));
    const m = (await f.get<AccountManifest>(manifestKey(b.session.account)))!;
    await f.auth.beginDeletion(b.sid, b.mutation, 'DELETE_ACCOUNT', cap);
    await expect(f.auth.authorize(b.sid)).rejects.toThrow();
    await expect(f.login()).rejects.toThrow();
    await expect(ext.store.read(ext.player)).rejects.toThrow();
    await expect(ext.store.receipt(ext.player, randomUUID())).rejects.toThrow();
    await expect(ext.store.commit(ext.player, state.revision, state)).rejects.toThrow();
    const statuses = ['REVOKED', 'PURGED', 'COMPLETE'];
    for (let i = 0; i < stop; i++)
      expect((await f.auth.resumeDeletion(b.session.account, cap)).status).toBe(statuses[i]);
    if (stop < 3) expect(await f.get(manifestKey(b.session.account))).toBeDefined();
    for (let i = stop; i < 3; i++)
      expect((await f.auth.resumeDeletion(b.session.account, cap)).status).toBe(statuses[i]);
    expect(await f.auth.resumeDeletion(b.session.account, cap)).toEqual({ status: 'COMPLETE' });
    for (const key of [
      'account:' + m.account,
      'state:' + m.player,
      'grant:' + m.oauth,
      'extension:' + extension,
      'binding:' + extension,
      manifestKey(m.account),
      'deletion:' + m.account,
    ])
      expect(await f.get(key)).toBeUndefined();
    for (const key of ['oauth:' + m.oauth, controlKey(m.player), reservationKey(extension)]) {
      const tomb = await f.get<Record<string, unknown>>(key);
      expect(Object.keys(tomb!).sort()).toEqual(['deleted', 'expiresAt']);
    }
  });
it('revocation failure is durable, blocks writes and permits retry without losing the provider grant', async () => {
  const f = fixture(),
    a = await f.login(),
    cap = opaque();
  await f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', cap);
  f.fail(true);
  await expect(f.auth.resumeDeletion(a.session.account, cap)).rejects.toThrow();
  expect(await f.get('grant:' + a.session.subject)).toBeDefined();
  expect((await f.get<AccountManifest>(manifestKey(a.session.account)))?.status).toBe('DELETION_PENDING');
  f.fail(false);
  expect((await f.auth.resumeDeletion(a.session.account, cap)).status).toBe('REVOKED');
});
it('reset leaves manifest unchanged and deletion removes the replacement generation', async () => {
  const f = fixture(),
    a = await f.login(),
    store = f.auth.gameStore(a.session);
  const before = await f.get(manifestKey(a.session.account));
  const first = originalInitialState(randomUUID(), () => 0.5),
    second = originalInitialState(randomUUID(), () => 0.5);
  await store.commit(a.session.player, null, first);
  await store.commit(a.session.player, first.revision, second, undefined, first.saveGeneration);
  expect(await f.get(manifestKey(a.session.account))).toEqual(before);
  const cap = opaque();
  await f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', cap);
  for (let i = 0; i < 3; i++) await f.auth.resumeDeletion(a.session.account, cap);
  expect(await f.get('state:' + a.session.player)).toBeUndefined();
});
it('cross-account capabilities and stale verification cannot delete another account', async () => {
  const f = fixture(),
    a = await f.login();
  f.subject('5678');
  const b = await f.login(),
    cap = opaque();
  await f.auth.beginDeletion(b.sid, b.mutation, 'DELETE_ACCOUNT', cap);
  await expect(f.auth.resumeDeletion(a.session.account, cap)).rejects.toThrow();
  expect((await f.get<AccountManifest>(manifestKey(a.session.account)))?.status).toBe('ACTIVE');
  f.subject('1234');
  f.tick(AUTH_TTL.verification + 1);
  await expect(f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', opaque())).rejects.toThrow();
});
it('manifest rejects extra identity slots, unknown fields, malformed keys and oversized references', () => {
  const base = {
    version: 1,
    account: randomUUID(),
    player: extension,
    oauth: 'b'.repeat(64),
    status: 'ACTIVE',
  };
  expect(() => validateManifest({ ...base, extension, detached: extension })).toThrow();
  expect(() => validateManifest({ ...base, oauths: ['x', 'y'] })).toThrow();
  expect(() => validateManifest({ ...base, player: 'x'.repeat(2000) })).toThrow();
  expect(() => validateManifest({ ...base, snapshot: {} })).toThrow();
});
it('expired session and link outcome cannot authorize deletion or replay linking', async () => {
  const f = fixture(),
    a = await f.login(),
    intent = await f.auth.createLink(a.sid, a.mutation);
  await f.auth.acceptLink(intent, extension);
  f.tick(AUTH_TTL.outcome + 1);
  await expect(f.auth.acceptLink(intent, extension)).rejects.toThrow();
  await expect(f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', opaque())).rejects.toThrow();
});

it('a failed final deletion commit preserves manifest/job and resumes without resurrection', async () => {
  const f = fixture(),
    a = await f.login(),
    cap = opaque();
  await f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', cap);
  await f.auth.resumeDeletion(a.session.account, cap);
  await f.auth.resumeDeletion(a.session.account, cap);
  const original = f.repo.transaction.bind(f.repo);
  let interrupt = true;
  f.repo.transaction = (run) =>
    original(async (tx) => {
      const result = await run(tx);
      if (
        interrupt &&
        (await tx.get(
          'deletion-result:' +
            (await import('node:crypto'))
              .createHash('sha256')
              .update(a.session.account + '\0' + cap)
              .digest('hex'),
        ))
      ) {
        interrupt = false;
        throw Error('Synthetic pre-commit interruption');
      }
      return result;
    });
  await expect(f.auth.resumeDeletion(a.session.account, cap)).rejects.toThrow('Synthetic');
  expect((await f.get<AccountManifest>(manifestKey(a.session.account)))?.status).toBe('PURGED');
  expect(await f.get('deletion:' + a.session.account)).toBeDefined();
  expect(await f.auth.resumeDeletion(a.session.account, cap)).toEqual({ status: 'COMPLETE' });
});
it('an interrupted purge rolls back every persistent deletion and can be resumed', async () => {
  const f = fixture(),
    a = await f.login(),
    cap = opaque();
  await f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', cap);
  await f.auth.resumeDeletion(a.session.account, cap);
  const original = f.repo.transaction.bind(f.repo);
  let interrupt = true;
  f.repo.transaction = (run) =>
    original((tx) =>
      run({
        ...tx,
        delete: async (key) => {
          await tx.delete(key);
          if (interrupt && key === 'state:' + a.session.player) {
            interrupt = false;
            throw Error('Synthetic mid-purge interruption');
          }
        },
      }),
    );
  await expect(f.auth.resumeDeletion(a.session.account, cap)).rejects.toThrow('Synthetic');
  expect(await f.get('account:' + a.session.account)).toBeDefined();
  expect((await f.get<AccountManifest>(manifestKey(a.session.account)))?.status).toBe('DELETION_PENDING');
  expect((await f.auth.resumeDeletion(a.session.account, cap)).status).toBe('PURGED');
});
it('manifest tampering cannot redirect deletion to another account save', async () => {
  const f = fixture(),
    a = await f.login(),
    cap = opaque();
  f.subject('different');
  const b = await f.login();
  await f.repo.transaction((tx) =>
    tx.put(
      'state:' + b.session.player,
      originalInitialState(randomUUID(), () => 0.5),
    ),
  );
  f.subject('1234');
  await f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', cap);
  await f.repo.transaction(async (tx) => {
    const m = await tx.get<AccountManifest>(manifestKey(a.session.account));
    await tx.put(manifestKey(a.session.account), { ...m, player: b.session.player });
  });
  await expect(f.auth.resumeDeletion(a.session.account, cap)).rejects.toThrow('ownership');
  expect(await f.get('state:' + b.session.player)).toBeDefined();
});
it('expired action receipts remain non-authorizing throughout and after deletion', async () => {
  const f = fixture(),
    a = await f.login(),
    cap = opaque(),
    request = randomUUID();
  const store = f.auth.gameStore(a.session);
  await f.repo.transaction((tx) =>
    tx.put('receipt:' + request + ':' + a.session.player, { fingerprint: 'synthetic', expiresAt: 1 }, 1000),
  );
  await f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', cap);
  await expect(store.receipt(a.session.player, request)).rejects.toThrow();
  for (let i = 0; i < 3; i++) await f.auth.resumeDeletion(a.session.account, cap);
  await expect(store.receipt(a.session.player, request)).rejects.toThrow();
});
it('turning off new linking cannot strand a verified deletion job', async () => {
  const f = fixture(),
    a = await f.login(),
    cap = opaque();
  await f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', cap);
  const { createWebApi } = await import('../server/webHttp');
  const api = createWebApi(f.auth);
  const response = await api({
    method: 'POST',
    path: '/auth/delete/resume',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ account: a.session.account, capability: cap }),
  });
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ status: 'REVOKED' });
});

it('deletion after unlink removes the persistent reservation and never restores an Extension mapping', async () => {
  const f = fixture(),
    a = await f.login();
  await f.auth.acceptLink(await f.auth.createLink(a.sid, a.mutation), extension);
  const b = await f.login();
  await f.auth.unlink(b.sid, b.mutation, 'UNLINK_EXTENSION');
  const c = await f.login(),
    cap = opaque();
  await f.auth.beginDeletion(c.sid, c.mutation, 'DELETE_ACCOUNT', cap);
  for (let i = 0; i < 3; i++) await f.auth.resumeDeletion(c.session.account, cap);
  const reservation = await f.get<Record<string, unknown>>(reservationKey(extension));
  expect(Object.keys(reservation!).sort()).toEqual(['deleted', 'expiresAt']);
  expect(await f.get('binding:' + extension)).toBeUndefined();
  expect(await f.get('extension:' + extension)).toBeUndefined();
  expect(await f.get(manifestKey(c.session.account))).toBeUndefined();
});
it('successful provider revocation followed by a failed checkpoint can be retried', async () => {
  const f = fixture(),
    a = await f.login(),
    cap = opaque();
  await f.auth.beginDeletion(a.sid, a.mutation, 'DELETE_ACCOUNT', cap);
  const original = f.repo.transaction.bind(f.repo);
  let interrupt = true;
  f.repo.transaction = (run) =>
    original((tx) =>
      run({
        ...tx,
        put: async (key, value, expiresAt) => {
          await tx.put(key, value, expiresAt);
          if (
            interrupt &&
            key === 'deletion:' + a.session.account &&
            (value as { phase?: string }).phase === 'REVOKED'
          ) {
            interrupt = false;
            throw Error('Synthetic checkpoint failure');
          }
        },
      }),
    );
  await expect(f.auth.resumeDeletion(a.session.account, cap)).rejects.toThrow('Synthetic');
  expect(await f.get('grant:' + a.session.subject)).toBeDefined();
  expect((await f.auth.resumeDeletion(a.session.account, cap)).status).toBe('REVOKED');
  expect(f.revoked()).toBe(2);
});
