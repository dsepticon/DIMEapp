import { controlKey, reservationKey, type AccountControl } from './accountManifest';
/** Non-secret canonical routing only. OAuth/session credentials never enter this boundary. */
import { randomUUID } from 'node:crypto';
import type { RecordRepository } from './authRecords';
import { parseVersionedContent, type VersionedContentState } from './contentConversion';
import { GameError } from '../shared/schema';
import type { Store, Receipt } from './store';
export type PlayerBinding = { player: string; epoch: string; status: 'ACTIVE' | 'DETACHED' };
export const newBinding = (player: string): PlayerBinding => ({
  player,
  epoch: randomUUID(),
  status: 'ACTIVE',
});
export async function canonicalExtensionStore(repo: RecordRepository, identity: string) {
  if (!/^PLAYER#v1#[a-f0-9]{64}$/.test(identity))
    throw new GameError('UNAUTHORIZED', 'Authorization unavailable.', 401);
  const key = 'binding:' + identity;
  const available = async (tx: import('./authRecords').RecordTransaction, player: string) => {
    if (await tx.get(reservationKey(identity)))
      throw new GameError('UNAUTHORIZED', 'Account unavailable.', 401);
    const control = await tx.get<AccountControl>(controlKey(player));
    if (control && control.status !== 'ACTIVE')
      throw new GameError('UNAUTHORIZED', 'Account unavailable.', 401);
  };
  const binding = await repo.transaction(async (tx) => {
    const b = await tx.get<PlayerBinding>(key);
    await available(tx, b?.player ?? identity);
    return b;
  });
  if (
    binding &&
    (!/^(PLAYER#v1#[a-f0-9]{64}|ACCOUNT#v1#[a-f0-9-]{36})$/.test(binding.player) ||
      !binding.epoch ||
      !['ACTIVE', 'DETACHED'].includes(binding.status))
  )
    throw new GameError('CONFIGURATION_ERROR', 'Profile routing unavailable.', 503);
  const player = binding?.player ?? identity;
  const checked = async <T>(run: (tx: import('./authRecords').RecordTransaction) => Promise<T>) =>
    repo.transaction(async (tx) => {
      const current = await tx.get<PlayerBinding>(key);
      if (
        current?.epoch !== binding?.epoch ||
        current?.player !== binding?.player ||
        current?.status !== binding?.status
      )
        throw new GameError('STALE_REVISION', 'Profile link changed. Refresh and retry.', 409);
      await available(tx, player);
      return run(tx);
    });
  const assertPlayer = (requested: string) => {
    if (requested !== player) throw new GameError('UNAUTHORIZED', 'Authorization unavailable.', 401);
  };
  const store: Store<VersionedContentState> = {
    read: async (requested) => {
      assertPlayer(requested);
      return checked(async (tx) => {
        const state = await tx.get('state:' + player);
        return state ? parseVersionedContent(state) : undefined;
      });
    },
    receipt: async (requested, id) => {
      assertPlayer(requested);
      return checked((tx) => tx.get<Receipt>('receipt:' + id + ':' + player));
    },
    commit: async (requested, expected, state, request, generation) => {
      assertPlayer(requested);
      return checked(async (tx) => {
        const current = await tx.get<VersionedContentState>('state:' + player);
        if (
          (expected === null ? current !== undefined : current?.revision !== expected) ||
          (generation !== undefined && (current?.saveGeneration ?? null) !== generation) ||
          (request && (await tx.get('receipt:' + request.id + ':' + player)))
        )
          return false;
        await tx.put('state:' + player, parseVersionedContent(state));
        if (request)
          await tx.put(
            'receipt:' + request.id + ':' + player,
            request.receipt,
            request.receipt.expiresAt * 1000,
          );
        return true;
      });
    },
  };
  return { player, store };
}
