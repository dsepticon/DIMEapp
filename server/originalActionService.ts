import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GameError } from '../shared/schema';
import { originalStateSchema, type OriginalPlayerState } from '../shared/originalSchema';
import {
  transferOriginalMineral,
  startOriginalRefinery,
  collectOriginalOrder,
  sellOriginalMineral,
} from '../shared/originalEconomy';
import { assignOriginalDeparture, completeOriginalDeparture } from '../shared/originalTravel';
import {
  acceptFirstContract,
  confirmFirstContractTool,
  sellFirstContractMaterial,
  completeFirstContract,
  ensureFirstContractNode,
} from '../shared/originalQuest';
import type { Store } from './store';
import { requirePhysicalInteraction } from '../shared/originalNavigation';
import { transitionOriginalZone } from '../shared/originalWorld';
import { analyzeOriginalNode, populateOriginalZone, scanOriginalZone } from '../shared/originalDiscovery';
import {
  retrieveOriginalGroundRig,
  setOriginalGroundRigOccupied,
  stowOriginalGroundRig,
} from '../shared/originalVehicle';

const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const action = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('assignDeparture'),
      player: position,
      ship: z.string(),
      destination: z.string(),
      loadGroundVehicle: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('completeDeparture'), player: position }).strict(),
  z.object({ type: z.literal('moveZone'), player: position, destination: z.string() }).strict(),
  z.object({ type: z.literal('scan') }).strict(),
  z.object({ type: z.literal('analyze'), nodeId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('retrieveGroundRig'), player: position }).strict(),
  z.object({ type: z.literal('setGroundRigOccupied'), occupied: z.boolean() }).strict(),
  z.object({ type: z.literal('stowGroundRig'), player: position }).strict(),
  z
    .object({
      type: z.literal('transfer'),
      source: z.string(),
      material: z.string(),
      ship: z.string(),
      units: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('startProcessing'),
      source: z.string(),
      material: z.string(),
      process: z.string(),
      units: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal('collectOrder'), orderId: z.string(), ship: z.string() }).strict(),
  z
    .object({
      type: z.literal('sell'),
      ship: z.string(),
      material: z.string(),
      category: z.enum(['raw', 'refined']),
      units: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal('acceptFirstContract') }).strict(),
  z.object({ type: z.literal('confirmFirstContractTool') }).strict(),
  z.object({ type: z.literal('sellFirstContractMaterial') }).strict(),
  z.object({ type: z.literal('completeFirstContract') }).strict(),
]);
const requestSchema = z
  .object({
    requestId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    expectedGeneration: z.uuid(),
    action,
  })
  .strict();

export class OriginalActionService {
  constructor(
    private readonly store: Store<OriginalPlayerState>,
    private readonly clock: () => number = Date.now,
  ) {}
  async mutate(player: string, input: unknown) {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) throw new GameError('INVALID_REQUEST', 'Invalid action request.');
    const request = parsed.data;
    const fingerprint = createHash('sha256')
      .update('original-action-v1\0' + JSON.stringify(request))
      .digest('hex');
    const replay = async () => {
      const receipt = await this.store.receipt(player, request.requestId);
      if (!receipt) return;
      if (receipt.fingerprint !== fingerprint)
        throw new GameError('IDEMPOTENCY_CONFLICT', 'Request ID was already used.', 409);
      const value = await this.store.read(player);
      if (!value) throw new GameError('UNAVAILABLE', 'State unavailable.', 503);
      return { state: originalStateSchema.parse(value), replayed: true };
    };
    const prior = await replay();
    if (prior) return prior;
    const current = await this.store.read(player);
    if (!current) throw new GameError('UNAVAILABLE', 'State unavailable.', 503);
    const state = originalStateSchema.parse(current);
    if (state.revision !== request.expectedRevision)
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh and review.', 409);
    if (state.saveGeneration !== request.expectedGeneration)
      throw new GameError('GENERATION_CONFLICT', 'This save changed. Refresh and review.', 409);
    const a = request.action;
    let next: OriginalPlayerState;
    try {
      switch (a.type) {
        case 'assignDeparture':
          requirePhysicalInteraction(state, a.player, { service: 'travel' });
          next = assignOriginalDeparture(state, a.ship as never, a.destination as never, a.loadGroundVehicle);
          break;
        case 'completeDeparture':
          requirePhysicalInteraction(state, a.player, { service: 'travel' });
          next = completeOriginalDeparture(state);
          break;
        case 'moveZone':
          requirePhysicalInteraction(state, a.player, { exit: a.destination });
          next = ensureFirstContractNode(populateOriginalZone(transitionOriginalZone(state, a.destination)));
          break;
        case 'scan':
          next = scanOriginalZone(state, this.clock());
          break;
        case 'analyze':
          next = analyzeOriginalNode(state, a.nodeId);
          break;
        case 'retrieveGroundRig':
          requirePhysicalInteraction(state, a.player, { service: 'vehicle_terminal' });
          next = retrieveOriginalGroundRig(state);
          break;
        case 'setGroundRigOccupied':
          next = setOriginalGroundRigOccupied(state, a.occupied);
          break;
        case 'stowGroundRig':
          requirePhysicalInteraction(state, a.player, { service: 'vehicle_terminal' });
          next = stowOriginalGroundRig(state);
          break;
        case 'transfer':
          next = transferOriginalMineral(
            state,
            a.source as never,
            a.material as never,
            a.ship as never,
            a.units,
          );
          break;
        case 'startProcessing':
          next = startOriginalRefinery(
            state,
            a.source as never,
            a.material as never,
            a.process as never,
            a.units,
            request.requestId,
            this.clock(),
          );
          break;
        case 'collectOrder':
          next = collectOriginalOrder(state, a.orderId, a.ship as never, this.clock());
          break;
        case 'sell':
          next = sellOriginalMineral(state, a.ship as never, a.material as never, a.category, a.units);
          break;
        case 'acceptFirstContract':
          next = acceptFirstContract(state, this.clock());
          break;
        case 'confirmFirstContractTool':
          next = confirmFirstContractTool(state);
          break;
        case 'sellFirstContractMaterial':
          next = sellFirstContractMaterial(state);
          break;
        case 'completeFirstContract':
          next = completeFirstContract(state, this.clock());
          break;
      }
    } catch {
      throw new GameError('ACTION_REJECTED', 'Action could not be completed. Refresh and review.', 409);
    }
    const ok = await this.store.commit(
      player,
      state.revision,
      next,
      {
        id: request.requestId,
        receipt: { fingerprint, expiresAt: Math.floor(this.clock() / 1000) + 30 * 86400 },
      },
      state.saveGeneration,
    );
    if (!ok) {
      const done = await replay();
      if (done) return done;
      throw new GameError('REVISION_CONFLICT', 'State changed. Refresh and review.', 409);
    }
    return { state: next, replayed: false };
  }
}
