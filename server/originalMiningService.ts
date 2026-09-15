import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GameError } from '../shared/schema';
import { originalStateSchema, type OriginalPlayerState } from '../shared/originalSchema';
import {
  beginOriginalMining,
  beginOriginalVacuum,
  cancelOriginalVacuum,
  collectOriginalPiece,
  resolveOriginalMining,
  type MiningSpatialCheck,
} from '../shared/originalMining';
import type { Store } from './store';
import { updateFirstContractCollection } from '../shared/originalQuest';

const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('startLaser'), nodeId: z.string().min(1).max(80), player: position }).strict(),
  z
    .object({
      type: z.literal('resolveLaser'),
      runs: z
        .array(z.object({ held: z.boolean(), ticks: z.number().int().min(1).max(1200) }).strict())
        .min(1)
        .max(256),
    })
    .strict(),
  z
    .object({
      type: z.literal('startVacuum'),
      nodeId: z.string().min(1).max(80),
      pieceId: z.string().min(1).max(80),
      player: position,
    })
    .strict(),
  z
    .object({
      type: z.literal('finishVacuum'),
      nodeId: z.string().min(1).max(80),
      pieceId: z.string().min(1).max(80),
      player: position,
    })
    .strict(),
  z.object({ type: z.literal('cancelVacuum') }).strict(),
]);
const requestSchema = z
  .object({
    requestId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    expectedGeneration: z.uuid(),
    action,
  })
  .strict();

/** Opt-in original-content service. The current deployed route still uses the legacy M3 engine. */
export class OriginalMiningService {
  constructor(
    private readonly store: Store<OriginalPlayerState>,
    private readonly spatial: MiningSpatialCheck,
    private readonly clock: () => number = Date.now,
  ) {}

  async mutate(player: string, input: unknown): Promise<{ state: OriginalPlayerState; replayed: boolean }> {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) throw new GameError('INVALID_REQUEST', 'Invalid mining request.');
    const request = parsed.data;
    const fingerprint = createHash('sha256')
      .update('original-mining-v1\0' + JSON.stringify(request))
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
    const previous = await replay();
    if (previous) return previous;
    const current = await this.store.read(player);
    if (!current) throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
    const state = originalStateSchema.parse(current);
    if (state.revision !== request.expectedRevision)
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh and review.', 409);
    if (state.saveGeneration !== request.expectedGeneration)
      throw new GameError('GENERATION_CONFLICT', 'This save changed. Refresh and review.', 409);
    const now = this.clock();
    let next: OriginalPlayerState;
    try {
      switch (request.action.type) {
        case 'startLaser':
          next = beginOriginalMining(state, request.action.nodeId, request.action.player, now, this.spatial);
          break;
        case 'resolveLaser':
          next = resolveOriginalMining(state, request.action.runs, now, this.spatial);
          break;
        case 'startVacuum':
          next = beginOriginalVacuum(
            state,
            request.action.nodeId,
            request.action.pieceId,
            request.action.player,
            now,
            this.spatial,
          );
          break;
        case 'finishVacuum':
          next = collectOriginalPiece(
            state,
            request.action.nodeId,
            request.action.pieceId,
            request.action.player,
            now,
            this.spatial,
          );
          next = updateFirstContractCollection(next, request.action.nodeId);
          break;
        case 'cancelVacuum':
          next = cancelOriginalVacuum(state);
          break;
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'MINING_HOLD_FULL')
        throw new GameError('CARGO_FULL', 'Mining hold is full. Free capacity, then retry collection.', 409);
      throw new GameError(
        'MINING_REJECTED',
        'Mining action could not be completed. Refresh and review.',
        409,
      );
    }
    const saved = await this.store.commit(
      player,
      state.revision,
      next,
      {
        id: request.requestId,
        receipt: { fingerprint, expiresAt: Math.floor(now / 1000) + 30 * 86400 },
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
