import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GameError, RESET_CONFIRMATION } from '../shared/schema';
import { originalInitialState } from '../shared/originalGame';
import { originalStateSchema, type OriginalPlayerState } from '../shared/originalSchema';
import type { Store } from './store';

const requestSchema = z
  .object({
    requestId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    expectedGeneration: z.uuid(),
    confirmation: z.literal(RESET_CONFIRMATION),
  })
  .strict();

/** Original-universe reset uses the same guarded STATE + REQUEST transaction as M2.3. */
export class OriginalResetService {
  constructor(
    private readonly store: Store<OriginalPlayerState>,
    private readonly clock: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {}

  async reset(player: string, input: unknown): Promise<{ state: OriginalPlayerState; replayed: boolean }> {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) throw new GameError('INVALID_RESET', 'Invalid reset request.');
    const request = parsed.data;
    const fingerprint = createHash('sha256')
      .update('original-reset-v1\0' + JSON.stringify(request))
      .digest('hex');
    const replay = async () => {
      const receipt = await this.store.receipt(player, request.requestId);
      if (!receipt) return undefined;
      if (receipt.fingerprint !== fingerprint)
        throw new GameError('IDEMPOTENCY_CONFLICT', 'Request ID was already used.', 409);
      const current = await this.store.read(player);
      if (!current) throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
      return { state: originalStateSchema.parse(current), replayed: true };
    };
    const earlier = await replay();
    if (earlier) return earlier;
    const current = await this.store.read(player);
    if (!current) throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
    const state = originalStateSchema.parse(current);
    if (state.revision !== request.expectedRevision)
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh and review.', 409);
    if (state.saveGeneration !== request.expectedGeneration)
      throw new GameError('GENERATION_CONFLICT', 'This save changed. Refresh and review.', 409);
    const next = originalInitialState(randomUUID(), this.random);
    next.revision = state.revision + 1;
    const saved = await this.store.commit(
      player,
      state.revision,
      next,
      {
        id: request.requestId,
        receipt: { fingerprint, expiresAt: Math.floor(this.clock() / 1000) + 30 * 86400 },
      },
      state.saveGeneration,
    );
    if (!saved) {
      const retried = await replay();
      if (retried) return retried;
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh and review.', 409);
    }
    return { state: next, replayed: false };
  }
}
