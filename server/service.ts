import { createHash } from 'node:crypto';
import { applyAction, initialState } from '../shared/game';
import { GameError, Mutation, mutationSchema, Snapshot } from '../shared/schema';
import { Store } from './store';
export class GameService {
  constructor(
    private store: Store,
    private clock: () => number = Date.now,
    private random: () => number = Math.random,
  ) {}
  async snapshot(player: string): Promise<Snapshot> {
    let state = await this.store.read(player);
    if (!state) {
      const initial = initialState(this.random);
      if (await this.store.commit(player, null, initial)) state = initial;
      else state = await this.store.read(player);
    }
    if (!state) throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
    return { state, serverTime: this.clock() };
  }
  async mutate(player: string, input: unknown): Promise<Snapshot> {
    const parsed = mutationSchema.safeParse(input);
    if (!parsed.success) throw new GameError('INVALID_REQUEST', 'Invalid action or quantity.');
    const request: Mutation = parsed.data;
    // Include the revision: reusing an ID for a different intent is always rejected.
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const replay = async () => {
      const receipt = await this.store.receipt(player, request.requestId);
      if (!receipt) return undefined;
      if (receipt.fingerprint !== fingerprint)
        throw new GameError(
          'IDEMPOTENCY_CONFLICT',
          'Request ID was already used for a different action.',
          409,
        );
      return { ...(await this.snapshot(player)), replayed: true };
    };
    const previous = await replay();
    if (previous) return previous;
    const { state, serverTime } = await this.snapshot(player);
    if (state.revision !== request.expectedRevision) {
      const completed = await replay();
      if (completed) return completed;
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh and review the action.', 409);
    }
    const next = applyAction(state, request.action, serverTime, request.requestId, this.random);
    const success = await this.store.commit(player, state.revision, next, {
      id: request.requestId,
      receipt: { fingerprint, expiresAt: Math.floor(serverTime / 1000) + 30 * 86400 },
    });
    if (!success) {
      const retried = await replay();
      if (retried) return retried;
      throw new GameError(
        'REVISION_CONFLICT',
        'Another request changed your state. Refresh and review.',
        409,
      );
    }
    return { state: next, serverTime: this.clock() };
  }
}
