/** Exact-key, optimistic transactions shared by auth bindings and gameplay. No scans. */
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { GetCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
export class RecordConflict extends Error {
  constructor() {
    super('Concurrent update; retry authentication.');
  }
}
export interface RecordTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T, expiresAt?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
export interface RecordRepository {
  transaction<T>(run: (tx: RecordTransaction) => Promise<T>): Promise<T>;
}
type Cell = { version: string | number; value: unknown; expiresAt?: number; generation?: string | null };
export class MemoryRecords implements RecordRepository {
  private records = new Map<string, Cell>();
  private tail: Promise<unknown> = Promise.resolve();
  transaction<T>(run: (tx: RecordTransaction) => Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      const data = structuredClone(this.records);
      const tx: RecordTransaction = {
        get: async <T>(key: string) => structuredClone(data.get(key)?.value) as T | undefined,
        put: async (key, value, expiresAt) => {
          data.set(key, { value: structuredClone(value), version: randomUUID(), expiresAt });
        },
        delete: async (key) => {
          data.delete(key);
        },
      };
      const result = await run(tx);
      this.records = data;
      return result;
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
}
function physical(key: string) {
  if (key.startsWith('binding:')) return { pk: 'BINDING#v1#' + key.slice(8), sk: 'RECORD' };
  if (key.startsWith('state:')) return { pk: key.slice(6), sk: 'STATE' };
  if (key.startsWith('receipt:')) {
    const [id, ...player] = key.slice(8).split(':');
    return { pk: player.join(':'), sk: 'REQUEST#' + id };
  }
  return { pk: 'AUTH#v1#' + key, sk: 'RECORD' };
}
/** Runtime key reference only; never export plaintext tokens. Key version enables staged rotation. */
export class TokenEnvelope {
  constructor(
    private keys: ReadonlyMap<string, Uint8Array>,
    private current: string,
  ) {
    if (!keys.has(current) || [...keys.values()].some((k) => k.length !== 32))
      throw Error('Invalid auth encryption configuration.');
  }
  seal(value: unknown, context: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.keys.get(this.current)!, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return {
      version: this.current,
      iv: iv.toString('base64'),
      data: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }
  open(value: { version: string; iv: string; data: string; tag: string }, context: string): unknown {
    const key = this.keys.get(value.version);
    if (!key) throw Error('Authentication unavailable.');
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return JSON.parse(
      Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString('utf8'),
    );
  }
}
export class DynamoAuthRecords implements RecordRepository {
  constructor(
    private client: Pick<DynamoDBDocumentClient, 'send'>,
    private table: string,
    private envelope?: TokenEnvelope,
  ) {
    if (!table.startsWith('dime-v2-staging-'))
      throw Error('Only reviewed staging auth storage is supported.');
  }
  private openAuth(value: Parameters<TokenEnvelope['open']>[0], key: string) {
    if (!this.envelope) throw Error('Authentication records are inaccessible to gameplay.');
    return this.envelope.open(value, key);
  }
  private sealAuth(value: unknown, key: string) {
    if (!this.envelope) throw Error('Authentication records are inaccessible to gameplay.');
    return this.envelope.seal(value, key);
  }
  async transaction<T>(run: (tx: RecordTransaction) => Promise<T>): Promise<T> {
    const reads = new Map<string, Cell | undefined>(),
      writes = new Map<string, { value: unknown; expiresAt?: number } | null>();
    const read = async (key: string) => {
      if (!reads.has(key)) {
        if (reads.size >= 90) throw Error('Authentication transaction too large.');
        const { Item } = await this.client.send(
          new GetCommand({ TableName: this.table, Key: physical(key), ConsistentRead: true }),
        );
        let value: unknown;
        if (Item)
          value = key.startsWith('state:')
            ? Item.state
            : key.startsWith('binding:')
              ? Item.binding
              : key.startsWith('receipt:')
                ? { fingerprint: Item.fingerprint, expiresAt: Item.expiresAt }
                : this.openAuth(Item.envelope, key);
        reads.set(
          key,
          Item
            ? {
                version: Item.revision ?? 'legacy',
                value,
                expiresAt: Item.expiresAt,
                ...(key.startsWith('state:') ? { generation: Item.state?.saveGeneration ?? null } : {}),
              }
            : undefined,
        );
      }
      return reads.get(key);
    };
    const tx: RecordTransaction = {
      get: async <T>(key: string) => {
        if (writes.has(key)) return structuredClone(writes.get(key)?.value) as T | undefined;
        return structuredClone((await read(key))?.value) as T | undefined;
      },
      put: async (key, value, expiresAt) => {
        await read(key);
        writes.set(key, { value, expiresAt });
      },
      delete: async (key) => {
        await read(key);
        writes.set(key, null);
      },
    };
    const result = await run(tx);
    if (!reads.size) return result;
    const items = [];
    for (const [key, old] of reads) {
      const Key = physical(key),
        condition = old
          ? old.version === 'legacy'
            ? 'attribute_exists(pk) AND attribute_not_exists(revision)'
            : 'revision = :version'
          : 'attribute_not_exists(pk)';
      const generationCondition =
        old?.generation === undefined
          ? ''
          : old.generation === null
            ? ' AND attribute_not_exists(#state.#generation)'
            : ' AND #state.#generation = :generation';
      const attributes =
        old && old.version !== 'legacy' ? { ExpressionAttributeValues: { ':version': old.version } } : {};
      const common = {
        TableName: this.table,
        ConditionExpression: condition + generationCondition,
        ...attributes,
        ...(old?.generation === undefined
          ? {}
          : {
              ExpressionAttributeNames: { '#state': 'state', '#generation': 'saveGeneration' },
              ExpressionAttributeValues: {
                ...attributes.ExpressionAttributeValues,
                ...(old.generation === null ? {} : { ':generation': old.generation }),
              },
            }),
      };
      if (!writes.has(key)) {
        items.push({ ConditionCheck: { ...common, Key } });
        continue;
      }
      const value = writes.get(key);
      if (!value) {
        items.push({ Delete: { ...common, Key } });
        continue;
      }
      const state = value.value as { revision?: number };
      const data = key.startsWith('state:')
        ? { state: value.value, revision: state.revision }
        : key.startsWith('binding:')
          ? { binding: value.value, revision: randomUUID() }
          : key.startsWith('receipt:')
            ? { ...(value.value as object), revision: randomUUID() }
            : { envelope: this.sealAuth(value.value, key), revision: randomUUID() };
      items.push({
        Put: {
          ...common,
          Item: {
            ...Key,
            ...data,
            ...(value.expiresAt === undefined ? {} : { expiresAt: Math.floor(value.expiresAt / 1000) }),
          },
        },
      });
    }
    try {
      await this.client.send(
        new TransactWriteCommand({ TransactItems: items, ClientRequestToken: randomUUID() }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException') throw new RecordConflict();
      throw error;
    }
    return result;
  }
}
