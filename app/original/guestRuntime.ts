import { analysisStatus } from '../../shared/originalScanner';
import { z } from 'zod';
import { originalStateSchema, type OriginalPlayerState } from '../../shared/originalSchema';
import {
  transferOriginalMineral,
  startOriginalRefinery,
  collectOriginalOrder,
  sellOriginalMineral,
} from '../../shared/originalEconomy';
import { assignOriginalDeparture, completeOriginalDeparture } from '../../shared/originalTravel';
import {
  acceptFirstContract,
  confirmFirstContractTool,
  sellFirstContractMaterial,
  completeFirstContract,
  ensureFirstContractNode,
} from '../../shared/originalQuest';
import { requirePhysicalInteraction } from '../../shared/originalNavigation';
import { transitionOriginalZone } from '../../shared/originalWorld';
import { analyzeOriginalNode, populateOriginalZone, scanOriginalZone } from '../../shared/originalDiscovery';
import {
  retrieveOriginalGroundRig,
  setOriginalGroundRigOccupied,
  stowOriginalGroundRig,
} from '../../shared/originalVehicle';

import {
  beginOriginalMining,
  beginOriginalVacuum,
  cancelOriginalVacuum,
  collectOriginalPiece,
  resolveOriginalMining,
} from '../../shared/originalMining';
import { updateFirstContractCollection } from '../../shared/originalQuest';

import { originalInitialState } from '../../shared/originalGame';
import { originalSpatial } from '../../shared/originalSpatial';
const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const demoAction = z.discriminatedUnion('type', [
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
  z
    .object({ type: z.literal('analyzeNearby'), nodeId: z.string().min(1).max(80), player: position })
    .strict(),
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
const demoMining = z.discriminatedUnion('type', [
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
  z.object({ type: z.literal('cancelLaser') }).strict(),
]);

/** Browser-only simulator. No identity, transport, store, pending record or receipt exists here. */
export const GUEST_GENERATION = 'deadc0de-0000-4000-8000-000000000001';
export function createGuestRuntime(clock: () => number = Date.now) {
  let current = originalInitialState(GUEST_GENERATION, () => 0.5);
  // Labelled demo stipend and refinery sample stock; standard mineral balance is unchanged.
  current.wallet = 5000;
  current.ships['fleet.v003'] = 1;
  current.positions['fleet.v003'] = 'loc.l001';
  current.mining['extract.x003']['mat.m010'] = 400;
  let orderSequence = 0;
  return {
    snapshot: () => structuredClone(current),
    mutate(input: unknown): OriginalPlayerState {
      const a = z.union([demoAction, demoMining]).parse(input);
      const state = structuredClone(current),
        now = clock();
      const orderId = 'demo-order-' + ++orderSequence;
      let next: OriginalPlayerState;
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
          next = scanOriginalZone(state, clock());
          break;
        case 'analyzeNearby': {
          const status = analysisStatus(state, a.nodeId, a.player);
          if (status !== 'Ready' && status !== 'Already analyzed') throw Error('ANALYSIS_UNAVAILABLE');
          const scanned = structuredClone(state);
          scanned.world.scanner.scannedZones ??= [];
          if (!scanned.world.scanner.scannedZones.includes(scanned.world.zone))
            scanned.world.scanner.scannedZones.push(scanned.world.zone);
          next = analyzeOriginalNode(scanned, a.nodeId);
          break;
        }
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
            orderId,
            clock(),
          );
          break;
        case 'collectOrder':
          next = collectOriginalOrder(state, a.orderId, a.ship as never, clock());
          break;
        case 'sell':
          next = sellOriginalMineral(state, a.ship as never, a.material as never, a.category, a.units);
          break;
        case 'acceptFirstContract':
          next = acceptFirstContract(state, clock());
          break;
        case 'confirmFirstContractTool':
          next = confirmFirstContractTool(state);
          break;
        case 'sellFirstContractMaterial':
          next = sellFirstContractMaterial(state);
          break;
        case 'completeFirstContract':
          next = completeFirstContract(state, clock());
          break;

        case 'startLaser':
          next = beginOriginalMining(state, a.nodeId, a.player, now, originalSpatial);
          break;
        case 'resolveLaser':
          next = resolveOriginalMining(state, a.runs, now, originalSpatial);
          break;
        case 'startVacuum':
          next = beginOriginalVacuum(state, a.nodeId, a.pieceId, a.player, now, originalSpatial);
          break;
        case 'finishVacuum':
          next = collectOriginalPiece(state, a.nodeId, a.pieceId, a.player, now, originalSpatial);
          next = updateFirstContractCollection(next, a.nodeId);
          break;
        case 'cancelLaser':
          if (!state.world.miningSession) throw new Error('MINING_SESSION_MISSING');
          next = originalStateSchema.parse(structuredClone(state));
          next.world.miningSession = null;
          next.revision++;
          break;
        case 'cancelVacuum':
          next = cancelOriginalVacuum(state);
          break;
      }
      current = originalStateSchema.parse(next);
      return structuredClone(current);
    },
  };
}
