import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { initialState } from '../shared/game';
import { upgradeWholeCscuSave } from '../shared/quantityUpgrade';
import { ContentConversionService, type VersionedContentState } from '../server/contentConversion';
import { DynamoStore, type DocumentSender } from '../server/dynamo';
import { MemoryStore } from '../server/store';

function fixture() {
  const old = initialState(() => 0.5);
  old.saveGeneration = randomUUID();
  old.revision = 7;
  old.wallet = 5700;
  delete old.quantityVersion;
  old.mining.Hand.Dolivine = 4;
  const state = upgradeWholeCscuSave(old);
  const store = new MemoryStore<VersionedContentState>();
  store.states.set('synthetic-a', state);
  const service = new ContentConversionService(store, () => 1_000_000);
  const request = {
    requestId: randomUUID(),
    expectedRevision: state.revision,
    expectedGeneration: state.saveGeneration!,
  };
  return { store, service, state, request };
}

describe('revision-controlled original-content conversion', () => {
  it('previews without mutation then atomically preserves old whole-cSCU quantities and wallet', async () => {
    const { store, service, state, request } = fixture();
    const before = structuredClone(state);
    const preview = await service.preview('synthetic-a', request);
    expect(await store.read('synthetic-a')).toEqual(before);
    expect(preview).toMatchObject({
      schemaVersion: 3,
      revision: 8,
      saveGeneration: state.saveGeneration,
      wallet: 5700,
      mining: { 'extract.x001': { 'mat.m001': 400 } },
    });
    const applied = await service.apply('synthetic-a', request);
    expect(applied).toEqual({ state: preview, replayed: false });
    expect(store.receipts.size).toBe(1);
    expect((await service.apply('synthetic-a', request)).replayed).toBe(true);
    expect(await store.read('synthetic-a')).toEqual(preview);
    expect(store.receipts.size).toBe(1);
  });

  it('rejects stale guards, conflicting request reuse and a second conversion', async () => {
    const { store, service, request } = fixture();
    await expect(service.apply('synthetic-a', { ...request, expectedRevision: 6 })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    await expect(
      service.apply('synthetic-a', { ...request, expectedGeneration: randomUUID() }),
    ).rejects.toMatchObject({
      code: 'GENERATION_CONFLICT',
    });
    expect(store.receipts.size).toBe(0);
    await service.apply('synthetic-a', request);
    await expect(service.apply('synthetic-a', { ...request, expectedRevision: 8 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      service.apply('synthetic-a', { ...request, requestId: randomUUID(), expectedRevision: 8 }),
    ).rejects.toMatchObject({ code: 'CONTENT_ALREADY_CONVERTED' });
    expect(store.receipts.size).toBe(1);
  });

  it('serializes concurrent attempts and does not touch another player', async () => {
    const { store, service, state, request } = fixture();
    const other = structuredClone(state);
    other.wallet = 81;
    store.states.set('synthetic-b', other);
    const outcomes = await Promise.all([
      service.apply('synthetic-a', request),
      service.apply('synthetic-a', request),
    ]);
    expect(outcomes.filter((outcome) => !outcome.replayed)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.replayed)).toHaveLength(1);
    expect(store.states.get('synthetic-b')).toEqual(other);
  });

  it('leaves an unrecognized source field unchanged with no receipt', async () => {
    const { store, service, request } = fixture();
    const state = store.states.get('synthetic-a') as VersionedContentState & { futureField?: unknown };
    state.futureField = { cargo: 5 };
    const before = structuredClone(state);
    await expect(service.apply('synthetic-a', request)).rejects.toMatchObject({
      code: 'CONTENT_REVIEW_REQUIRED',
    });
    expect(store.states.get('synthetic-a')).toEqual(before);
    expect(store.receipts.size).toBe(0);
  });

  it('uses the existing DynamoDB revision/generation and unique-receipt transaction shape', async () => {
    const { service, request } = fixture();
    const preview = await service.preview('synthetic-a', request);
    const send = vi.fn().mockResolvedValue({});
    const store = new DynamoStore<VersionedContentState>(
      { send } as unknown as DocumentSender,
      'synthetic-table',
    );
    expect(
      await store.commit(
        'synthetic-a',
        request.expectedRevision,
        preview,
        { id: request.requestId, receipt: { fingerprint: 'synthetic', expiresAt: 1000 } },
        request.expectedGeneration,
      ),
    ).toBe(true);
    const writes = send.mock.calls[0][0].input.TransactItems;
    expect(writes).toHaveLength(2);
    expect(writes[0].Put.ConditionExpression).toBe(
      'revision = :expected AND #state.#generation = :generation',
    );
    expect(writes[0].Put.Item.state).toEqual(preview);
    expect(writes[1].Put.ConditionExpression).toBe('attribute_not_exists(pk)');
  });
});
