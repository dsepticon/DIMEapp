import { SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { authenticate } from '../server/auth';
import { twitchConnection, TwitchExtension } from '../app/twitch';
import { clientConfig } from '../app/config';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { createApi } from '../server/http';
const key = randomBytes(32); // Synthetic per-run key, never a production credential.
const identityKey = randomBytes(32);
const claims = { opaque_user_id: 'Utest123', channel_id: '123', role: 'viewer' };
const sign = (payload = claims, expires: string | number = '1h', algorithm = 'HS256') =>
  new SignJWT(payload).setProtectedHeader({ alg: algorithm }).setExpirationTime(expires).sign(key);
afterEach(() => vi.useRealTimers());
it('validates signed Twitch identity independently of browser-supplied user IDs', async () => {
  const player = await authenticate('Bearer ' + (await sign()), [key], identityKey);
  expect(player).toMatch(/^PLAYER#v1#[a-f0-9]{64}$/);
  expect(player).not.toContain('Utest123');
  expect(
    await authenticate('Bearer ' + (await sign({ ...claims, channel_id: '456' })), [key], identityKey),
  ).toBe(player);
});
it('supports configured key rotation', async () => {
  expect(await authenticate('Bearer ' + (await sign()), [randomBytes(32), key], identityKey)).toMatch(
    /^PLAYER#v1#/,
  );
});
it('isolates different players in one channel and ignores a forged frontend identity', async () => {
  const first = await authenticate('Bearer ' + (await sign()), [key], identityKey);
  const second = await authenticate(
    'Bearer ' + (await sign({ ...claims, opaque_user_id: 'Uanother' })),
    [key],
    identityKey,
  );
  expect(second).not.toBe(first);
  const forged = { ...claims, user_id: 'Uanother', playerId: 'Uanother' };
  expect(await authenticate('Bearer ' + (await sign(forged)), [key], identityKey)).toBe(first);
});
it('uses one authoritative save across channels while other players stay isolated', async () => {
  const store = new MemoryStore();
  const api = createApi(new GameService(store), (header) => authenticate(header, [key], identityKey), []);
  const token = async (id: string, channel: string) =>
    'Bearer ' + (await sign({ opaque_user_id: id, channel_id: channel, role: 'viewer' }));
  const first = await token('Utest123', '123');
  const secondChannel = await token('Utest123', '456');
  const other = await token('Uother', '123');
  const read = async (authorization: string) =>
    api({ method: 'GET', path: '/state', headers: { authorization } });
  await read(first);
  const state = JSON.parse((await read(secondChannel)).body).state;
  const action = {
    requestId: crypto.randomUUID(),
    expectedRevision: state.revision,
    action: { type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false },
  };
  const changed = await api({
    method: 'POST',
    path: '/actions',
    headers: { authorization: first },
    body: JSON.stringify(action),
  });
  expect(changed.statusCode).toBe(200);
  expect(JSON.parse((await read(secondChannel)).body).state.revision).toBe(1);
  expect(JSON.parse((await read(other)).body).state.revision).toBe(0);
  expect(store.states.size).toBe(2);
  expect(
    (
      await api({
        method: 'POST',
        path: '/actions',
        headers: { authorization: secondChannel },
        body: JSON.stringify({ ...action, playerId: 'Uother' }),
      })
    ).statusCode,
  ).toBe(400);
});
it.each(['external', 'admin', ''])('rejects invalid role %s', async (role) => {
  await expect(
    authenticate('Bearer ' + (await sign({ ...claims, role })), [key], identityKey),
  ).rejects.toMatchObject({
    status: 401,
  });
});
it('rejects anonymous, expired, unsigned, wrong-key and wrong-algorithm tokens', async () => {
  await expect(
    authenticate('Bearer ' + (await sign({ ...claims, opaque_user_id: 'Atest' })), [key], identityKey),
  ).rejects.toMatchObject({ status: 401 });
  await expect(authenticate('Bearer ' + (await sign(claims, 1)), [key], identityKey)).rejects.toMatchObject({
    status: 401,
  });
  await expect(authenticate('Bearer unsigned', [key], identityKey)).rejects.toMatchObject({ status: 401 });
  await expect(
    authenticate('Bearer ' + (await sign()), [randomBytes(32)], identityKey),
  ).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    authenticate('Bearer ' + (await sign(claims, '1h', 'HS384')), [key], identityKey),
  ).rejects.toMatchObject({
    status: 401,
  });
});
it('waits for delayed Twitch initialization and keeps the latest token only in memory', () => {
  vi.useFakeTimers();
  const holder: { helper?: TwitchExtension } = {};
  let callback: Parameters<TwitchExtension['onAuthorized']>[0] | undefined;
  const updates = vi.fn();
  const connection = twitchConnection(updates, () => holder.helper);
  vi.advanceTimersByTime(10000);
  expect(updates).not.toHaveBeenCalled();
  holder.helper = {
    onAuthorized: (fn) => {
      callback = fn;
    },
  };
  vi.advanceTimersByTime(100);
  callback?.({ userId: 'U1', channelId: '1', token: 'synthetic-first' });
  expect(connection.token()).toBe('synthetic-first');
  callback?.({ userId: 'U1', channelId: '1', token: 'synthetic-second' });
  expect(connection.token()).toBe('synthetic-second');
  connection.expired('synthetic-first');
  expect(connection.token()).toBe('synthetic-second');
  connection.stop();
  callback?.({ userId: 'U1', channelId: '1', token: 'late' });
  expect(connection.token()).toBeUndefined();
});
it('does not fall back to development on helper errors', () => {
  let error: (() => void) | undefined;
  const update = vi.fn();
  const connection = twitchConnection(update, () => ({
    onAuthorized: () => {},
    onError: (cb) => {
      error = cb;
    },
  }));
  error?.();
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
  connection.stop();
});
it('requires Twitch sign-in before retaining an identity or token', () => {
  let callback: Parameters<TwitchExtension['onAuthorized']>[0] | undefined;
  const update = vi.fn();
  const connection = twitchConnection(update, () => ({
    onAuthorized: (fn) => {
      callback = fn;
    },
  }));
  callback?.({ userId: 'Aanonymous', channelId: '1', token: 'synthetic' });
  expect(connection.token()).toBeUndefined();
  expect(connection.identity()).toBeUndefined();
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'error', message: expect.stringContaining('Sign in') }),
  );
  connection.stop();
});
it('keeps browser retry storage keyed by a stable digest without raw Twitch identity', async () => {
  let callback: Parameters<TwitchExtension['onAuthorized']>[0] | undefined;
  const connection = twitchConnection(
    () => {},
    () => ({
      onAuthorized: (fn) => {
        callback = fn;
      },
    }),
  );
  callback?.({ userId: 'Uprivate', channelId: '1', token: 'synthetic' });
  await vi.waitFor(() => expect(connection.identity()).toMatch(/^[a-f0-9]{64}$/));
  expect(connection.identity()).not.toContain('Uprivate');
  callback?.({ userId: 'Uother', channelId: '2', token: 'new-token' });
  expect(connection.identity()).toBeUndefined();
  await vi.waitFor(() => expect(connection.identity()).toMatch(/^[a-f0-9]{64}$/));
  connection.stop();
});
it('allows local mode only in development on loopback and only with a local API', () => {
  expect(clientConfig({ dev: true, mode: 'local', hostname: 'localhost' }).local).toBe(true);
  expect(() => clientConfig({ dev: false, mode: 'local', hostname: 'localhost' })).toThrow();
  expect(() => clientConfig({ dev: true, mode: 'local', hostname: 'example.test' })).toThrow();
  expect(() =>
    clientConfig({ dev: true, mode: 'local', hostname: 'localhost', api: 'https://production.test' }),
  ).toThrow();
  expect(() => clientConfig({ dev: false, hostname: 'example.test', api: 'http://localhost' })).toThrow();
});
