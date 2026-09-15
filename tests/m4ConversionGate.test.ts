import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  constantTimeTagMatch,
  createConversionGate,
  conversionTesterTag,
  MAX_CONVERSION_TESTER_ENV_LENGTH,
  MAX_CONVERSION_TESTER_TAGS,
  type ConversionGate,
} from '../server/conversionGate';
import { createOriginalApi } from '../server/originalApi';
import { MemoryStore } from '../server/store';
import type { VersionedContentState } from '../server/contentConversion';
import { initialState } from '../shared/game';
import { originalInitialState } from '../shared/originalGame';
import { stateSchema } from '../shared/schema';
import { upgradeWholeCscuSave } from '../shared/quantityUpgrade';

const identityKey = Buffer.alloc(32, 19);
const origin = 'https://synthetic.invalid';

function fixture(gate: ConversionGate, player = 'derived-synthetic-a') {
  const legacy = upgradeWholeCscuSave(initialState(() => 0.5));
  legacy.saveGeneration = randomUUID();
  const store = new MemoryStore<VersionedContentState>();
  store.states.set(player, legacy);
  const api = createOriginalApi(
    store,
    async () => player,
    [origin],
    () => 1_000,
    gate,
  );
  const request = {
    requestId: randomUUID(),
    expectedRevision: legacy.revision,
    expectedGeneration: legacy.saveGeneration,
  };
  const call = (path: string, body?: unknown) =>
    api({
      method: body ? 'POST' : 'GET',
      path,
      headers: { authorization: 'Bearer synthetic', origin },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { store, legacy, request, call, player };
}

describe('server-controlled content conversion rollout gate', () => {
  it('defaults closed: state and preview work while apply returns a generic code without mutation', async () => {
    const { store, legacy, request, call } = fixture(createConversionGate('DISABLED', '', identityKey));
    const before = structuredClone(legacy);
    expect(JSON.parse((await call('/v4/state')).body)).toMatchObject({
      conversionRequired: true,
      conversionAvailable: false,
    });
    expect((await call('/v4/content/preview', request)).statusCode).toBe(200);
    const blocked = await call('/v4/content/convert', request);
    expect(blocked.statusCode).toBe(409);
    expect(JSON.parse(blocked.body)).toEqual({
      code: 'CONVERSION_NOT_ENABLED',
      message: 'Save conversion is not available.',
    });
    expect(await store.read('derived-synthetic-a')).toEqual(before);
    expect(store.receipts.size).toBe(0);
  });

  it('uses keyed non-disclosing tester tags and never logs identity material', async () => {
    const player = 'derived-synthetic-eligible';
    const tag = conversionTesterTag(player, identityKey);
    expect(tag).toHaveLength(64);
    expect(tag).not.toContain(player);
    const gate = createConversionGate('TESTERS', tag, identityKey);
    const eligible = fixture(gate, player);
    const ineligible = fixture(gate, 'derived-synthetic-other');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await ineligible.call('/v4/content/convert', ineligible.request)).statusCode).toBe(409);
    expect((await eligible.call('/v4/content/convert', eligible.request)).statusCode).toBe(200);
    const logs = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
    expect(logs).not.toContain('derived-synthetic');
    expect(logs).not.toContain(tag);
  });

  it('uses the exact domain-separated message and a validated constant-time comparison path', () => {
    const player = 'derived-synthetic-domain';
    const expected = createHmac('sha256', identityKey)
      .update(`dime:v4:conversion-tester:${player}`)
      .digest('hex');
    const oldUndifferentiated = createHmac('sha256', identityKey).update(player).digest('hex');
    expect(conversionTesterTag(player, identityKey)).toBe(expected);
    expect(expected).not.toBe(oldUndifferentiated);
    expect(constantTimeTagMatch(expected, expected)).toBe(true);
    expect(constantTimeTagMatch(expected, createHash('sha256').update('other').digest('hex'))).toBe(false);
    expect(constantTimeTagMatch(expected.toUpperCase(), expected)).toBe(false);
  });

  it('normalizes empty and duplicate entries while an empty TESTERS list permits nobody', () => {
    const player = 'derived-synthetic-normalized';
    const tag = conversionTesterTag(player, identityKey);
    const normalized = createConversionGate('TESTERS', `,${tag},,${tag},`, identityKey);
    expect(normalized.testerCount).toBe(1);
    expect(normalized.permits(player)).toBe(true);
    const empty = createConversionGate('TESTERS', ',,,', identityKey);
    expect(empty.testerCount).toBe(0);
    expect(empty.permits(player)).toBe(false);
  });

  it('rejects uppercase, short, long, nonhex, excessive count and excessive environment length', () => {
    const tag = conversionTesterTag('derived-synthetic-limits', identityKey);
    for (const invalid of [tag.toUpperCase(), tag.slice(1), tag + '0', 'g'.repeat(64)])
      expect(() => createConversionGate('TESTERS', invalid, identityKey)).toThrow(
        'invalid_conversion_testers',
      );
    const tooMany = Array.from({ length: MAX_CONVERSION_TESTER_TAGS + 1 }, (_, index) =>
      createHash('sha256').update(String(index)).digest('hex'),
    ).join(',');
    expect(() => createConversionGate('TESTERS', tooMany, identityKey)).toThrow('invalid_conversion_testers');
    expect(() =>
      createConversionGate('DISABLED', 'a'.repeat(MAX_CONVERSION_TESTER_ENV_LENGTH + 1), identityKey),
    ).toThrow('invalid_conversion_testers');
  });

  it('permits all persistent users only in ENABLED mode and retains idempotent concurrency', async () => {
    const { store, request, call } = fixture(createConversionGate('ENABLED', '', identityKey));
    const [a, b] = await Promise.all([
      call('/v4/content/convert', request),
      call('/v4/content/convert', request),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect([JSON.parse(a.body).replayed, JSON.parse(b.body).replayed].sort()).toEqual([false, true]);
    expect(store.receipts.size).toBe(1);
  });

  it('keeps converted saves readable and resettable after the gate is disabled', async () => {
    const enabled = fixture(createConversionGate('ENABLED', '', identityKey));
    const converted = JSON.parse((await enabled.call('/v4/content/convert', enabled.request)).body).state;
    const disabledApi = createOriginalApi(
      enabled.store,
      async () => enabled.player,
      [origin],
      () => 2_000,
      createConversionGate('DISABLED', '', identityKey),
    );
    const state = await disabledApi({ method: 'GET', path: '/v4/state', headers: { origin } });
    expect(JSON.parse(state.body).state).toEqual(converted);
    const reset = await disabledApi({
      method: 'POST',
      path: '/v4/profile/reset',
      headers: { origin },
      body: JSON.stringify({
        requestId: randomUUID(),
        expectedRevision: converted.revision,
        expectedGeneration: converted.saveGeneration,
        confirmation: 'RESET MY DIME PROFILE',
      }),
    });
    expect(JSON.parse(reset.body).state).toMatchObject({
      schemaVersion: 3,
      revision: converted.revision + 1,
    });
  });

  it('documents the Milestone 3 parsing boundary and keeps rollout config out of client source', () => {
    const converted = originalInitialState(randomUUID());
    expect(stateSchema.safeParse(converted).success).toBe(false);
    const client = [
      readFileSync('app/original/Main.tsx', 'utf8'),
      readFileSync('vite.config.ts', 'utf8'),
    ].join('\n');
    expect(client).not.toMatch(/DIME_CONVERSION_MODE|DIME_CONVERSION_TESTER_TAGS/);
    expect(createHash('sha256').update(client).digest('hex')).toHaveLength(64);
  });

  it('fails closed for invalid modes and malformed tester eligibility', () => {
    expect(() => createConversionGate('OPEN', '', identityKey)).toThrow('invalid_conversion_mode');
    expect(() => createConversionGate('TESTERS', 'legacy-player-id', identityKey)).toThrow(
      'invalid_conversion_testers',
    );
  });
});
