import { expect, it, vi } from 'vitest';
import { DynamoStore, DocumentSender } from '../server/dynamo';
import { initialState } from '../shared/game';
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
