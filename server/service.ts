import { createHash, randomUUID } from 'node:crypto';
import { applyAction, initialState } from '../shared/game';
import {
  GameError,
  Mutation,
  mutationSchema,
  ResetRequest,
  resetRequestSchema,
  Snapshot,
} from '../shared/schema';
import { Store } from './store';
import { LEGACY_ZONE } from '../shared/world';
import { upgradeWholeCscuSave } from '../shared/quantityUpgrade';
export class GameService {
  constructor(
    private store: Store,
    private clock: () => number = Date.now,
    private random: () => number = Math.random,
  ) {}
  private freshState() {
    const state = initialState(this.random);
    state.saveGeneration = randomUUID();
    return state;
  }
  async snapshot(player: string): Promise<Snapshot> {
    let state = await this.store.read(player);
    if (!state) {
      const initial = this.freshState();
      if (await this.store.commit(player, null, initial)) state = initial;
      else state = await this.store.read(player);
    }
    if (!state) throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
    // Existing v2 saves acquire a generation without changing their revision or gameplay fields.
    if (!state.saveGeneration) {
      const upgraded = { ...state, saveGeneration: randomUUID() };
      if (await this.store.commit(player, state.revision, upgraded, undefined, null)) state = upgraded;
      else state = await this.store.read(player);
      if (!state?.saveGeneration)
        throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
    }
    if (!state.world) {
      const zone = LEGACY_ZONE[state.location];
      if (zone) {
        const upgraded = {
          ...state,
          world: {
            zone,
            entry: 'arrival',
            nodes: {},
            scanner: { pings: 0, analyses: 0, analyzed: [] },
            miningSession: null,
            roc: null,
          },
        };
        if (await this.store.commit(player, state.revision, upgraded, undefined, state.saveGeneration))
          state = upgraded;
        else state = await this.store.read(player);
        if (!state?.world) throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
      }
    }
    for (let attempt = 0; state.quantityVersion !== 2 && attempt < 3; attempt++) {
      const upgraded = upgradeWholeCscuSave(state);
      if (await this.store.commit(player, state.revision, upgraded, undefined, state.saveGeneration))
        state = upgraded;
      else state = await this.store.read(player);
      if (!state) throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
    }
    if (state.quantityVersion !== 2)
      throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
    return { state, serverTime: this.clock() };
  }
  async reset(player: string, input: unknown): Promise<Snapshot> {
    const parsed = resetRequestSchema.safeParse(input);
    if (!parsed.success) throw new GameError('INVALID_RESET', 'Invalid reset request.');
    const request: ResetRequest = parsed.data;
    const fingerprint = createHash('sha256')
      .update('profile-reset\0' + JSON.stringify(request))
      .digest('hex');
    const replay = async () => {
      const receipt = await this.store.receipt(player, request.requestId);
      if (!receipt) return undefined;
      if (receipt.fingerprint !== fingerprint)
        throw new GameError(
          'IDEMPOTENCY_CONFLICT',
          'Request ID was already used for a different action.',
          409,
        );
      // Receipts deliberately return the latest canonical state, never an old saved snapshot.
      return { ...(await this.snapshot(player)), replayed: true };
    };
    const previous = await replay();
    if (previous) return previous;
    const { state, serverTime } = await this.snapshot(player);
    if (state.revision !== request.expectedRevision)
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh before resetting.', 409);
    if (state.saveGeneration !== request.expectedGeneration)
      throw new GameError('GENERATION_CONFLICT', 'This save has changed. Refresh before resetting.', 409);
    const next = this.freshState();
    next.revision = state.revision + 1;
    const success = await this.store.commit(
      player,
      state.revision,
      next,
      {
        id: request.requestId,
        receipt: { fingerprint, expiresAt: Math.floor(serverTime / 1000) + 30 * 86400 },
      },
      state.saveGeneration,
    );
    if (!success) {
      const retried = await replay();
      if (retried) return retried;
      throw new GameError('REVISION_CONFLICT', 'Another request changed your save. Refresh and review.', 409);
    }
    return { state: next, serverTime: this.clock() };
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
