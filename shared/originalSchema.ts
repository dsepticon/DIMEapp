import { z } from 'zod';
import { ORIGINAL_CONTENT } from './originalCatalog';

const ids = (records: readonly { id: string }[]) =>
  z.enum(records.map((item) => item.id) as [string, ...string[]]);
export const originalMineralId = ids(ORIGINAL_CONTENT.minerals);
export const originalProcessedId = z.enum(
  ORIGINAL_CONTENT.minerals.flatMap((item) => ('processedId' in item ? [item.processedId] : [])) as [
    string,
    ...string[],
  ],
);
export const originalShipId = ids(ORIGINAL_CONTENT.shipsAndVehicles);
export const originalGearId = ids(ORIGINAL_CONTENT.equipment);
export const originalProcessId = ids(ORIGINAL_CONTENT.refineryMethods);
export const originalLocationId = ids(ORIGINAL_CONTENT.locations);
export const originalZoneId = ids(ORIGINAL_CONTENT.zones);
export const originalExtractionId = z.enum(['extract.x001', 'extract.x002', 'extract.x003', 'extract.x004']);
const handOrGround = z.enum(['extract.x001', 'extract.x002']);
const nonnegativeQuantity = z.number().int().min(0).max(1_000_000_000);
const positiveQuantity = nonnegativeQuantity.positive();
const rawInventory = z.partialRecord(originalMineralId, nonnegativeQuantity);
const processedInventory = z.partialRecord(originalProcessedId, nonnegativeQuantity);
const fragment = z
  .object({
    id: z.string().min(1).max(80),
    units: positiveQuantity,
    x: z.number().int(),
    y: z.number().int(),
    collected: z.boolean(),
  })
  .strict();
const node = z
  .object({
    id: z.string().min(1).max(80),
    ore: originalMineralId,
    source: handOrGround,
    x: z.number().int(),
    y: z.number().int(),
    size: z.number().int().min(1).max(5),
    resistance: z.number().min(0).max(1),
    instability: z.number().min(0).max(1),
    yieldUnits: positiveQuantity,
    status: z.enum(['INTACT', 'FRACTURED', 'DEPLETED', 'DESTROYED']),
    fragments: z.array(fragment).max(8),
    respawnAt: z.number().int().nullable(),
  })
  .strict();
const world = z
  .object({
    zone: originalZoneId,
    entry: z.string().max(40),
    nodes: z.record(z.string().max(80), node).refine((nodes) => Object.keys(nodes).length <= 120),
    scanner: z
      .object({
        pings: nonnegativeQuantity,
        analyses: nonnegativeQuantity,
        analyzed: z.array(z.string().max(80)).max(120),
        scannedZones: z.array(originalZoneId).max(43).optional(),
      })
      .strict(),
    miningSession: z
      .object({
        nodeId: z.string().max(80),
        startedAt: z.number().int(),
        source: handOrGround,
        zone: originalZoneId.optional(),
      })
      .strict()
      .nullable(),
    extractionSession: z
      .object({
        nodeId: z.string().max(80),
        pieceId: z.string().max(80),
        startedAt: z.number().int(),
        zone: originalZoneId,
        origin: z.object({ x: z.number(), y: z.number() }).strict(),
      })
      .strict()
      .nullable()
      .optional(),
    groundVehicle: z
      .object({ zone: originalZoneId, active: z.boolean(), occupied: z.boolean() })
      .strict()
      .nullable(),
    departure: z
      .object({
        ship: originalShipId,
        destination: originalLocationId,
        loadGroundVehicle: z.boolean(),
      })
      .strict()
      .nullable(),
    minorRemainders: z.partialRecord(handOrGround, rawInventory).optional(),
  })
  .strict();
const objective = z.enum([
  'SPEAK_TO_FOREMAN',
  'CHECK_EQUIPMENT',
  'ENTER_MINE',
  'MINE_ASSIGNED_ORE',
  'SCAN_ASSIGNED_NODE',
  'ANALYZE_ASSIGNED_NODE',
  'FRACTURE_ASSIGNED_NODE',
  'COLLECT_ASSIGNED_GEMS',
  'RETURN_TO_OUTPOST',
  'START_REFINERY_ORDER',
  'COLLECT_REFINED_MATERIAL',
  'SELL_REFINED_MATERIAL',
  'SELL_MINED_GEM',
  'RETURN_TO_FOREMAN',
  'COMPLETE',
]);
const quest = z
  .object({
    id: z.literal('quest.q001'),
    version: z.number().int().positive().optional(),
    reconciliation: z
      .enum(['NONE', 'CORRECTED', 'LEGACY_SOLD', 'LEGACY_COMPLETE', 'SUPPORT_REQUIRED'])
      .optional(),
    status: z.enum(['NOT_STARTED', 'ACTIVE', 'COMPLETE']),
    objective,
    counters: z
      .object({ mined: nonnegativeQuantity, refined: nonnegativeQuantity, sold: nonnegativeQuantity })
      .strict(),
    acceptedAt: z.number().int().nullable(),
    completedAt: z.number().int().nullable(),
    rewardClaimed: z.boolean(),
    toolRecovered: z.boolean(),
    dialogueFlags: z.array(z.enum(['foremanIntro', 'technicianIntro', 'officerIntro'])).max(3),
    unlockedQuests: z.array(z.literal('quest.q002')).max(1),
    tutorialOrderId: z.string().nullable(),
  })
  .strict();

export const originalStateSchema = z
  .object({
    schemaVersion: z.literal(3),
    saveFormatVersion: z.literal(3),
    contentVersion: z.literal(4),
    quantityVersion: z.literal(2),
    walletRemainder: z.number().int().min(-5000).max(4999).optional(),
    saveGeneration: z.uuid(),
    revision: z.number().int().nonnegative(),
    wallet: z.number().int().min(0).max(1_000_000_000_000),
    location: originalLocationId,
    currentShip: originalShipId,
    ships: z.partialRecord(originalShipId, z.number().int().min(0).max(100)),
    equipment: z.partialRecord(originalGearId, z.number().int().min(0).max(100)),
    positions: z.partialRecord(originalShipId, originalLocationId),
    mining: z.record(originalExtractionId, rawInventory),
    cargo: z.partialRecord(
      originalShipId,
      z.object({ raw: rawInventory, refined: processedInventory }).strict(),
    ),
    orders: z
      .array(
        z
          .object({
            id: z.string(),
            source: originalExtractionId,
            ore: originalMineralId,
            method: originalProcessId,
            rawUnits: positiveQuantity,
            refinedUnits: positiveQuantity,
            cost: z.number().int().nonnegative(),
            createdAt: z.number().int(),
            readyAt: z.number().int(),
          })
          .strict(),
      )
      .max(100),
    refineryRates: z.record(
      originalProcessId,
      z.object({ yield: z.number(), cost: z.number(), time: z.number() }).strict(),
    ),
    pending: z
      .discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('travel'),
            destination: originalLocationId,
            ship: originalShipId,
            loadGroundVehicle: z.boolean(),
            readyAt: z.number().int(),
          })
          .strict(),
        z
          .object({
            kind: z.literal('mine'),
            source: originalExtractionId,
            rewards: rawInventory,
            readyAt: z.number().int(),
          })
          .strict(),
      ])
      .nullable(),
    quest: quest.optional(),
    world,
    conversionReceipt: z
      .object({
        version: z.literal(1),
        requestId: z.uuid(),
        sourceRevision: z.number().int().nonnegative(),
        sourceGeneration: z.uuid(),
        sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
export type OriginalPlayerState = z.infer<typeof originalStateSchema>;
