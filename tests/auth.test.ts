import { SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { authenticate } from '../server/auth';
import { twitchConnection, TwitchExtension } from '../app/twitch';
import { clientConfig } from '../app/config';
const key = randomBytes(32); // Synthetic per-run key, never a production credential.
const claims = { opaque_user_id: 'Utest123', channel_id: '123', role: 'viewer' };
const sign = (payload = claims, expires: string | number = '1h', algorithm = 'HS256') =>
  new SignJWT(payload).setProtectedHeader({ alg: algorithm }).setExpirationTime(expires).sign(key);
afterEach(() => vi.useRealTimers());
it('validates signed Twitch identity independently of browser-supplied user IDs', async () => {
  expect(await authenticate('Bearer ' + (await sign()), [key])).toBe('CHANNEL#123#VIEWER#Utest123');
});
it('supports configured key rotation', async () => {
  expect(await authenticate('Bearer ' + (await sign()), [randomBytes(32), key])).toContain('Utest123');
});
it.each(['external', 'admin', ''])('rejects invalid role %s', async (role) => {
  await expect(authenticate('Bearer ' + (await sign({ ...claims, role })), [key])).rejects.toMatchObject({
    status: 401,
  });
});
it('rejects anonymous, expired, unsigned, wrong-key and wrong-algorithm tokens', async () => {
  await expect(
    authenticate('Bearer ' + (await sign({ ...claims, opaque_user_id: 'Atest' })), [key]),
  ).rejects.toMatchObject({ status: 401 });
  await expect(authenticate('Bearer ' + (await sign(claims, 1)), [key])).rejects.toMatchObject({
    status: 401,
  });
  await expect(authenticate('Bearer unsigned', [key])).rejects.toMatchObject({ status: 401 });
  await expect(authenticate('Bearer ' + (await sign()), [randomBytes(32)])).rejects.toMatchObject({
    status: 401,
  });
  await expect(authenticate('Bearer ' + (await sign(claims, '1h', 'HS384')), [key])).rejects.toMatchObject({
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
it('allows local mode only in development on loopback and only with a local API', () => {
  expect(clientConfig({ dev: true, mode: 'local', hostname: 'localhost' }).local).toBe(true);
  expect(() => clientConfig({ dev: false, mode: 'local', hostname: 'localhost' })).toThrow();
  expect(() => clientConfig({ dev: true, mode: 'local', hostname: 'example.test' })).toThrow();
  expect(() =>
    clientConfig({ dev: true, mode: 'local', hostname: 'localhost', api: 'https://production.test' }),
  ).toThrow();
  expect(() => clientConfig({ dev: false, hostname: 'example.test', api: 'http://localhost' })).toThrow();
});
