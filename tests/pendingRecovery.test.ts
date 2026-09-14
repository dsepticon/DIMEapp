import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { readPendingRecord, recoveryEvidence, writePendingRecord } from '../app/pendingRecovery';
import { GameService } from '../server/service';
import { MemoryStore } from '../server/store';
import { initialState } from '../shared/game';
import type { Mutation } from '../shared/schema';

const request = (): Mutation => ({
  requestId: randomUUID(),
  expectedRevision: 2,
  action: { type: 'firstShift', step: 'complete' },
});

it('preserves the exact request through the new and old storage formats', () => {
  const action = request();
  const generation = randomUUID();
  expect(readPendingRecord(writePendingRecord({ request: action, saveGeneration: generation }))).toEqual({
    request: action,
    saveGeneration: generation,
  });
  expect(readPendingRecord(JSON.stringify(action))).toEqual({ request: action });
});

it('uses only verified generation or monotonic revision evidence', () => {
  const action = request();
  const oldGeneration = randomUUID();
  const current = initialState();
  current.saveGeneration = randomUUID();
  expect(recoveryEvidence({ request: action, saveGeneration: oldGeneration }, current)).toBe('obsolete');
  expect(recoveryEvidence({ request: action }, current)).toBe('obsolete');
  current.revision = 2;
  expect(recoveryEvidence({ request: action }, current)).toBe('unverified');
  expect(recoveryEvidence({ request: action, saveGeneration: current.saveGeneration }, current)).toBe('safe');
  current.revision = 3;
  expect(recoveryEvidence({ request: action }, current)).toBe('safe');
  current.saveGeneration = undefined;
  expect(recoveryEvidence({ request: action, saveGeneration: oldGeneration }, current)).toBe('unverified');
});

it('assigns a generation to new saves and backfills old saves without changing gameplay', async () => {
  const store = new MemoryStore();
  const service = new GameService(store);
  const first = (await service.snapshot('synthetic-new')).state;
  expect(first.saveGeneration).toMatch(/^[0-9a-f-]{36}$/);
  expect((await service.snapshot('synthetic-new')).state.saveGeneration).toBe(first.saveGeneration);
  const old = initialState();
  store.states.set('synthetic-old', old);
  const upgraded = (await service.snapshot('synthetic-old')).state;
  expect(upgraded.saveGeneration).toMatch(/^[0-9a-f-]{36}$/);
  expect({ ...upgraded, saveGeneration: undefined }).toEqual({ ...old, saveGeneration: undefined });
});
