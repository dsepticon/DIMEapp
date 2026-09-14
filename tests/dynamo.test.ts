import { expect, it, vi } from 'vitest';
import { DynamoStore, DocumentSender } from '../server/dynamo';
import { initialState } from '../shared/game';
import { commitMigration } from '../server/migration-dynamo';
function client(send: ReturnType<typeof vi.fn>) {
  return { send } as unknown as DocumentSender;
}
it('uses consistent reads and schema validation', async () => {
  const send = vi.fn().mockResolvedValue({ Item: { state: initialState() } });
  const store = new DynamoStore(client(send), 'test');
  await store.read('p');
  expect(send.mock.calls[0][0].input).toMatchObject({ ConsistentRead: true, Key: { pk: 'p', sk: 'STATE' } });
});
it('puts the versioned state and unique receipt in one transaction', async () => {
  const send = vi.fn().mockResolvedValue({});
  await new DynamoStore(client(send), 'test').commit('p', 2, initialState(), {
    id: 'id',
    receipt: { fingerprint: 'hash', expiresAt: 1000 },
  });
  const input = send.mock.calls[0][0].input;
  expect(input.TransactItems).toHaveLength(2);
  expect(input.TransactItems[0].Put.ConditionExpression).toBe('revision = :expected');
  expect(input.TransactItems[1].Put.ConditionExpression).toBe('attribute_not_exists(pk)');
});
it('guards reset replacement by both revision and the existing save generation', async () => {
  const send = vi.fn().mockResolvedValue({});
  const state = initialState();
  state.saveGeneration = crypto.randomUUID();
  state.revision = 9;
  const oldGeneration = crypto.randomUUID();
  await new DynamoStore(client(send), 'test').commit(
    'synthetic-player',
    8,
    state,
    { id: crypto.randomUUID(), receipt: { fingerprint: 'synthetic-hash', expiresAt: 1000 } },
    oldGeneration,
  );
  const writes = send.mock.calls[0][0].input.TransactItems;
  expect(writes).toHaveLength(2);
  expect(writes[0].Put.ConditionExpression).toBe('revision = :expected AND #state.#generation = :generation');
  expect(writes[0].Put.ExpressionAttributeValues).toEqual({ ':expected': 8, ':generation': oldGeneration });
  expect(writes[0].Put.ExpressionAttributeNames).toEqual({
    '#state': 'state',
    '#generation': 'saveGeneration',
  });
  expect(writes[1].Put.ConditionExpression).toBe('attribute_not_exists(pk)');
});
it('backfills old save generation only while that field remains absent', async () => {
  const send = vi.fn().mockResolvedValue({});
  await new DynamoStore(client(send), 'test').commit('synthetic-player', 8, initialState(), undefined, null);
  const put = send.mock.calls[0][0].input.TransactItems[0].Put;
  expect(put.ConditionExpression).toBe('revision = :expected AND attribute_not_exists(#state.#generation)');
});
it('reports conditional transaction conflicts for retry reconciliation', async () => {
  const error = Object.assign(new Error('conflict'), {
    name: 'TransactionCanceledException',
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
  });
  const store = new DynamoStore(client(vi.fn().mockRejectedValue(error)), 'test');
  expect(await store.commit('p', 0, initialState())).toBe(false);
});
it('does not misclassify throttling, permissions or infrastructure failures as conflicts', async () => {
  for (const name of [
    'AccessDeniedException',
    'ProvisionedThroughputExceededException',
    'TransactionCanceledException',
  ]) {
    const error = Object.assign(new Error('test'), { name });
    await expect(
      new DynamoStore(client(vi.fn().mockRejectedValue(error)), 'test').commit('p', 0, initialState()),
    ).rejects.toBe(error);
  }
});
it('reserves a legacy source globally with state and a permanent migration receipt atomically', async () => {
  const send = vi.fn().mockResolvedValue({});
  const player = 'PLAYER#v1#' + 'a'.repeat(64);
  const digest = 'b'.repeat(64);
  expect(await commitMigration(client(send), 'test', player, digest, 1, initialState())).toBe(true);
  const writes = send.mock.calls[0][0].input.TransactItems;
  expect(writes).toHaveLength(3);
  expect(writes.map((write: { Put: { Item: { pk: string; sk: string } } }) => write.Put.Item)).toMatchObject([
    { pk: player, sk: 'STATE' },
    { pk: player, sk: 'MIGRATION#v1#' + digest },
    { pk: 'LEGACY#v1#' + digest, sk: 'MIGRATION#v1' },
  ]);
  expect(
    writes.every(
      (write: { Put: { ConditionExpression: string } }) =>
        write.Put.ConditionExpression === 'attribute_not_exists(pk)',
    ),
  ).toBe(true);
  expect(writes[1].Put.Item.expiresAt).toBeUndefined();
});
it('treats duplicate migration transactions as conflicts without retrying any credit', async () => {
  const error = Object.assign(new Error('conflict'), {
    name: 'TransactionCanceledException',
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
  });
  const send = vi.fn().mockRejectedValue(error);
  expect(
    await commitMigration(
      client(send),
      'test',
      'PLAYER#v1#' + 'a'.repeat(64),
      'b'.repeat(64),
      1,
      initialState(),
    ),
  ).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
});
