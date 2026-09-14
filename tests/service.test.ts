import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { createApi } from '../server/http';
import { GameError, Mutation } from '../shared/schema';
const request = (): Mutation => ({
  requestId: randomUUID(),
  expectedRevision: 0,
  action: { type: 'enterZone', zone: 'ARC_L1_CONCOURSE' },
});
it('atomically replays identical concurrent requests once', async () => {
  const store = new MemoryStore(),
    service = new GameService(store);
  const command = request();
  const results = await Promise.all(Array.from({ length: 10 }, () => service.mutate('p', command)));
  expect(results.every((r) => r.state.revision === 1)).toBe(true);
  expect(store.receipts.size).toBe(1);
});
it('allows only one concurrent mutation at the same revision', async () => {
  const service = new GameService(new MemoryStore());
  await service.snapshot('p');
  const results = await Promise.allSettled([service.mutate('p', request()), service.mutate('p', request())]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
});
it('rejects a reused request ID with a different payload', async () => {
  const service = new GameService(new MemoryStore()),
    command = request();
  await service.mutate('p', command);
  await expect(
    service.mutate('p', { ...command, action: { ...command.action, zone: 'ARC_L1_TRANSIT' } }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
it('old receipts return current state, never regress a later revision', async () => {
  let now = Date.now();
  const service = new GameService(new MemoryStore(), () => now);
  const command = request();
  await service.mutate('p', command);
  now += 100000;
  await service.mutate('p', {
    requestId: randomUUID(),
    expectedRevision: 1,
    action: { type: 'enterZone', zone: 'ARC_L1_TRANSIT' },
  });
  expect((await service.mutate('p', command)).state.revision).toBe(2);
});
it('stale revisions prevent replay even after receipt TTL cleanup', async () => {
  const store = new MemoryStore(),
    service = new GameService(store),
    command = request();
  await service.mutate('p', command);
  store.receipts.clear();
  await expect(service.mutate('p', command)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
});
it('isolates players and survives a new service instance', async () => {
  const store = new MemoryStore();
  await new GameService(store).mutate('player1', request());
  expect((await new GameService(store).snapshot('player1')).state.revision).toBe(1);
  expect((await new GameService(store).snapshot('player2')).state.revision).toBe(0);
});
it('maps auth, invalid JSON, origin and route errors to safe responses', async () => {
  const service = new GameService(new MemoryStore());
  const api = createApi(
    service,
    async (token) => {
      if (token !== 'test') throw new GameError('UNAUTHORIZED', 'Unauthorized', 401);
      return 'p';
    },
    ['https://example.test'],
  );
  const base = {
    method: 'POST',
    path: '/actions',
    headers: { authorization: 'test', origin: 'https://example.test' },
  };
  expect((await api({ ...base, body: '{' })).statusCode).toBe(400);
  expect((await api({ ...base, headers: {} })).statusCode).toBe(401);
  expect((await api({ ...base, headers: { origin: 'https://evil.test' } })).statusCode).toBe(403);
  expect((await api({ ...base, path: '/absent' })).statusCode).toBe(404);
  const response = await api({ ...base, method: 'OPTIONS' });
  expect(response.statusCode).toBe(204);
  expect(response.headers['Access-Control-Allow-Origin']).toBe('https://example.test');
});
it('does not expose DynamoDB exceptions, tokens or request bodies', async () => {
  const store = new MemoryStore();
  store.read = async () => {
    throw new Error('private internal failure');
  };
  const api = createApi(new GameService(store), async () => 'p', []);
  const response = await api({ method: 'GET', path: '/state', headers: {} });
  expect(response.statusCode).toBe(503);
  expect(response.body).not.toContain('private');
});
