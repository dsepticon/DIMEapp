import { expect, it } from 'vitest';
import { GetCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoAuthRecords, TokenEnvelope, RecordConflict } from '../server/authRecords';
function fixture() {
  const items = new Map<string, Record<string, unknown>>();
  const key = (v: Record<string, unknown>) => String(v.pk) + '|' + String(v.sk);
  const send = async (command: GetCommand | TransactWriteCommand) => {
    if (command instanceof GetCommand) return { Item: structuredClone(items.get(key(command.input.Key!))) };
    const transactions = command.input.TransactItems!;
    for (const op of transactions) {
      const p = op.Put ?? op.Delete ?? op.ConditionCheck!,
        current = items.get(key('Item' in p ? p.Item! : p.Key!));
      const condition = p.ConditionExpression;
      const valid = condition?.startsWith('attribute_not_exists(pk)')
        ? !current
        : condition?.includes('attribute_not_exists(revision)')
          ? current && !('revision' in current)
          : current?.revision === p.ExpressionAttributeValues?.[':version'];
      const generationValid =
        !condition?.includes('#state.#generation') ||
        (condition.includes('attribute_not_exists(#state.#generation)')
          ? !(current?.state as { saveGeneration?: string } | undefined)?.saveGeneration
          : (current?.state as { saveGeneration?: string } | undefined)?.saveGeneration ===
            p.ExpressionAttributeValues?.[':generation']);
      if (!valid || !generationValid) {
        const error = new Error();
        error.name = 'TransactionCanceledException';
        throw error;
      }
    }
    for (const op of transactions) {
      if (op.Put) items.set(key(op.Put.Item!), structuredClone(op.Put.Item!));
      if (op.Delete) items.delete(key(op.Delete.Key!));
    }
    return {};
  };
  const envelope = new TokenEnvelope(new Map([['v1', new Uint8Array(32).fill(8)]]), 'v1');
  const repo = () =>
    new DynamoAuthRecords(
      { send } as unknown as Pick<DynamoDBDocumentClient, 'send'>,
      'dime-v2-staging-synthetic',
      envelope,
    );
  return { repo, items, envelope, send };
}
it('encrypts auth values and binds ciphertext to its exact record context', async () => {
  const f = fixture(),
    r = f.repo();
  await r.transaction((tx) =>
    tx.put('grant:synthetic', { access: 'synthetic-private-token' }, 1800000000000),
  );
  expect(JSON.stringify([...f.items.values()])).not.toContain('synthetic-private-token');
  expect(await r.transaction((tx) => tx.get('grant:synthetic'))).toEqual({
    access: 'synthetic-private-token',
  });
  const encrypted = f.envelope.seal({ secret: 'synthetic' }, 'grant:a');
  expect(() => f.envelope.open(encrypted, 'grant:b')).toThrow();
  expect([...f.items.values()][0]?.expiresAt).toBe(1800000000);
});
it('rejects a stale concurrent transaction atomically across independent adapters', async () => {
  const f = fixture();
  await f.repo().transaction((tx) => tx.put('account:synthetic', { counter: 0 }));
  let release!: () => void, ready!: () => void;
  const wait = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      ready = resolve;
    });
  const stale = f.repo().transaction(async (tx) => {
    await tx.get('account:synthetic');
    ready();
    await wait;
    await tx.put('account:synthetic', { counter: 1 });
    await tx.put('link:should-not-exist', { x: 1 });
  });
  await started;
  await f.repo().transaction((tx) => tx.put('account:synthetic', { counter: 2 }));
  release();
  await expect(stale).rejects.toBeInstanceOf(RecordConflict);
  expect(await f.repo().transaction((tx) => tx.get('account:synthetic'))).toEqual({ counter: 2 });
  expect(await f.repo().transaction((tx) => tx.get('link:should-not-exist'))).toBeUndefined();
});
it('preserves the existing gameplay state and receipt physical formats', async () => {
  const f = fixture(),
    r = f.repo(),
    player = 'ACCOUNT#v1#synthetic';
  await r.transaction(async (tx) => {
    await tx.put('state:' + player, { revision: 3 });
    await tx.put(
      'receipt:request:' + player,
      { fingerprint: 'synthetic', expiresAt: 1800000000 },
      1800000000000,
    );
  });
  expect(f.items.get(player + '|STATE')).toMatchObject({ revision: 3, state: { revision: 3 } });
  expect(f.items.get(player + '|REQUEST#request')).toMatchObject({
    fingerprint: 'synthetic',
    expiresAt: 1800000000,
  });
});
it('blocks revision ABA across reset generation, including read-only transactions', async () => {
  const f = fixture();
  await f
    .repo()
    .transaction((tx) => tx.put('state:PLAYER#v1#synthetic', { revision: 0, saveGeneration: 'old' }));
  let release!: () => void, ready!: () => void;
  const wait = new Promise<void>((r) => {
      release = r;
    }),
    started = new Promise<void>((r) => {
      ready = r;
    });
  const read = f.repo().transaction(async (tx) => {
    const state = await tx.get('state:PLAYER#v1#synthetic');
    ready();
    await wait;
    return state;
  });
  await started;
  await f
    .repo()
    .transaction((tx) => tx.put('state:PLAYER#v1#synthetic', { revision: 0, saveGeneration: 'new' }));
  release();
  await expect(read).rejects.toBeInstanceOf(RecordConflict);
});
it('gameplay reads non-secret binding without any encryption key and cannot decrypt auth records', async () => {
  const f = fixture(),
    identity = 'PLAYER#v1#' + 'a'.repeat(64);
  await f.repo().transaction(async (tx) => {
    await tx.put('binding:' + identity, { player: identity, epoch: 'synthetic', status: 'ACTIVE' });
    await tx.put('account:synthetic', { token: 'synthetic-only' });
  });
  const repo = new DynamoAuthRecords(
    { send: f.send } as unknown as Pick<DynamoDBDocumentClient, 'send'>,
    'dime-v2-staging-synthetic',
  );
  expect(await repo.transaction((tx) => tx.get('binding:' + identity))).toMatchObject({ player: identity });
  await expect(repo.transaction((tx) => tx.get('account:synthetic'))).rejects.toThrow(
    'inaccessible to gameplay',
  );
  const record = f.items.get('BINDING#v1#' + identity + '|RECORD')!;
  expect(record).not.toHaveProperty('envelope');
  expect(record).not.toHaveProperty('expiresAt');
});
