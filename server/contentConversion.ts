/** Authenticated caller supplies only the derived global player key. This service never logs state. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GameError, stateSchema, type PlayerState } from '../shared/schema';
import { originalStateSchema, type OriginalPlayerState } from '../shared/originalSchema';
import { previewOriginalConversion } from './legacyContentConversion';
import type { Store } from './store';

export type VersionedContentState = PlayerState | OriginalPlayerState;
export const parseVersionedContent = (value: unknown): VersionedContentState => {
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value && value.schemaVersion === 3)
    return originalStateSchema.parse(value);
  // Retain unknown top-level legacy fields so preview can reject rather than erase them.
  return stateSchema.passthrough().parse(value);
};

const requestSchema = z
  .object({
    requestId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    expectedGeneration: z.uuid(),
  })
  .strict();
export type ContentConversionRequest = z.infer<typeof requestSchema>;

/** Uses the same revision/generation-guarded STATE + REQUEST transaction as actions and reset. */
export class ContentConversionService {
  constructor(
    private readonly store: Store<VersionedContentState>,
    private readonly clock: () => number = Date.now,
  ) {}

  async preview(player: string, input: unknown): Promise<OriginalPlayerState> {
    const request = requestSchema.safeParse(input);
    if (!request.success) throw new GameError('INVALID_REQUEST', 'Invalid conversion request.');
    const current = await this.store.read(player);
    if (!current) throw new GameError('NOT_FOUND', 'No save is available.', 404);
    if (current.schemaVersion === 3)
      throw new GameError('CONTENT_ALREADY_CONVERTED', 'Content is already current.', 409);
    if (current.revision !== request.data.expectedRevision)
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh and review.', 409);
    if (current.saveGeneration !== request.data.expectedGeneration)
      throw new GameError('GENERATION_CONFLICT', 'This save changed. Refresh and review.', 409);
    try {
      return originalStateSchema.parse(previewOriginalConversion(current, request.data.requestId));
    } catch {
      throw new GameError('CONTENT_REVIEW_REQUIRED', 'This save needs a content review.', 409);
    }
  }

  async apply(player: string, input: unknown): Promise<{ state: OriginalPlayerState; replayed: boolean }> {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) throw new GameError('INVALID_REQUEST', 'Invalid conversion request.');
    const request = parsed.data;
    const fingerprint = createHash('sha256')
      .update('original-content-v1\0' + JSON.stringify(request))
      .digest('hex');
    const replay = async () => {
      const receipt = await this.store.receipt(player, request.requestId);
      if (!receipt) return undefined;
      if (receipt.fingerprint !== fingerprint)
        throw new GameError('IDEMPOTENCY_CONFLICT', 'Request ID was already used.', 409);
      const current = await this.store.read(player);
      if (!current || current.schemaVersion !== 3)
        throw new GameError('CONTENT_REVIEW_REQUIRED', 'This save needs a content review.', 409);
      return { state: originalStateSchema.parse(current), replayed: true };
    };
    const previous = await replay();
    if (previous) return previous;
    const next = await this.preview(player, request);
    const saved = await this.store.commit(
      player,
      request.expectedRevision,
      next,
      {
        id: request.requestId,
        receipt: {
          fingerprint,
          expiresAt: Math.floor(this.clock() / 1000) + 30 * 86400,
        },
      },
      request.expectedGeneration,
    );
    if (!saved) {
      const retried = await replay();
      if (retried) return retried;
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh and review.', 409);
    }
    return { state: next, replayed: false };
  }
}
