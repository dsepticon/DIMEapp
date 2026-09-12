import { expect, it } from 'vitest';
import { assessLegacySources, LegacyCandidate } from '../server/migration-gate';
import { initialState } from '../shared/game';

const player = 'PLAYER#v1#' + 'a'.repeat(64);
const source = (key: string): LegacyCandidate => ({
  sourceKey: key,
  sourceVersion: null,
  linkedPlayer: player,
  original: { wallet: 100, miningInventories: { Hand: { Dolivine: 5 } } },
});

it('never remigrates an existing v2 state', () => {
  const state = initialState();
  expect(assessLegacySources(player, state, [source('old')])).toEqual({ status: 'current', state });
});
it('requires verified player linking rather than channel ownership', () => {
  expect(assessLegacySources(player, undefined, [{ ...source('channel-1'), linkedPlayer: null }])).toEqual({
    status: 'review-required',
    reason: 'identity',
  });
});
it('stops conflicting channel records without combining or changing sources', () => {
  const candidates = [source('channel-1'), source('channel-2')];
  const original = structuredClone(candidates);
  expect(assessLegacySources(player, undefined, candidates)).toEqual({
    status: 'reconciliation',
    sources: ['channel-1', 'channel-2'],
  });
  expect(candidates).toEqual(original);
});
it('retries assessment deterministically without applying a legacy balance', () => {
  const candidate = source('channel-1');
  const first = assessLegacySources(player, undefined, [candidate]);
  expect(first).toEqual({ status: 'review-required', reason: 'mapping' });
  expect(assessLegacySources(player, undefined, [candidate])).toEqual(first);
  expect(candidate.original).toEqual(source('channel-1').original);
});
