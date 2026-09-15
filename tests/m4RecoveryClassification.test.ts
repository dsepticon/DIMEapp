import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { originalInitialState } from '../shared/originalGame';
import {
  classifyOriginalRecovery as classify,
  readOriginalPending,
  OriginalApiError,
  recoverySnapshot,
  freshCanonicalV4,
} from '../app/original/recovery';
const state = originalInitialState(randomUUID(), () => 0.5),
  snapshot = recoverySnapshot({ state });
const record = () =>
  readOriginalPending(
    JSON.stringify({
      version: 4,
      path: '/v4/actions',
      request: {
        requestId: randomUUID(),
        expectedGeneration: state.saveGeneration,
        expectedRevision: state.revision,
        action: { type: 'scan' },
      },
    }),
  )!;
describe('one original recovery policy', () => {
  it('never sends an action from a different save generation', () => {
    expect(classify({ ...record(), generation: randomUUID() }, snapshot)).toBe('obsolete');
  });
  it('proves explicitly older generationless envelopes obsolete only for direct canonical v4 creation', () => {
    const old = readOriginalPending(
      JSON.stringify({
        version: 1,
        request: { requestId: randomUUID(), expectedRevision: 0, action: { type: 'mine' } },
      }),
    )!;
    expect(freshCanonicalV4(state)).toBe(true);
    expect(classify(old, snapshot)).toBe('obsolete');
    expect(classify(old, { ...snapshot, state: { ...state, revision: 1 }, revision: 1 })).toBe('ambiguous');
  });
  it('does not infer that a same-version generationless record is obsolete', () => {
    expect(classify({ ...record(), generation: undefined }, snapshot)).toBe('ambiguous');
  });
  it('replays valid never-sent and uncertain same-generation requests with their original body', () => {
    const p = record();
    expect(classify(p, snapshot)).toBe('replay');
    expect(classify(p, snapshot, { success: true })).toBe('confirmed');
    expect(p.request.expectedGeneration).toBe(state.saveGeneration);
  });
  it.each([
    'MINING_REJECTED',
    'REVISION_CONFLICT',
    'GENERATION_CONFLICT',
    'CARGO_FULL',
    'INVALID_REQUEST',
    'ACTION_REJECTED',
    'INVALID_RESET',
    'CONTENT_ALREADY_CONVERTED',
  ])('classifies definitive %s without an endless retry', (code) => {
    expect(classify(record(), snapshot, { error: new OriginalApiError(code, 409) })).toBe('rejected');
  });
  it.each([
    new Error('timeout'),
    new OriginalApiError('UNAVAILABLE', 503),
    new OriginalApiError('IDEMPOTENCY_CONFLICT', 409),
    new OriginalApiError('UNKNOWN', 400),
  ])('keeps ambiguous outcomes', (error) => {
    expect(classify(record(), snapshot, { error })).toBe('ambiguous');
  });
  it('recognizes generation-bound conversion and reset records too', () => {
    for (const path of ['/v4/content/convert', '/v4/profile/reset']) {
      const p = record();
      p.path = path;
      expect(classify(p, snapshot)).toBe('replay');
    }
  });
  it('does not accept arbitrary destinations or malformed stored requests', () => {
    expect(readOriginalPending('{')).toBeNull();
    expect(
      readOriginalPending(
        JSON.stringify({
          version: 4,
          path: 'https://outside.invalid',
          request: { requestId: randomUUID(), expectedRevision: 0 },
        }),
      ),
    ).toBeNull();
  });
});
