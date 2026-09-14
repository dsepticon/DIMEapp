import { z } from 'zod';
import { ORE_NAMES, SHIP_NAMES, MINING_TYPES, LOCATIONS, METHOD_NAMES } from './catalog';
import { ZONE_IDS } from './world';
export const units = z.number().int().min(0).max(10_000_000);
const amount = units.positive();
const mineralUnits = z.number().int().min(0).max(1_000_000_000);
const mineralAmount = mineralUnits.positive();
export const oreSchema = z.enum(ORE_NAMES);
export const shipSchema = z.enum(SHIP_NAMES);
export const miningSchema = z.enum(MINING_TYPES);
export const locationSchema = z.enum(LOCATIONS);
export const zoneSchema = z.enum(ZONE_IDS);
export const methodSchema = z.enum(METHOD_NAMES);
export const firstShiftObjectiveSchema = z.enum([
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
export const firstShiftSchema = z.object({
  id: z.literal('first-shift'),
  // Missing version identifies the Milestone 2.1 refinery tutorial for server reconciliation.
  version: z.number().int().positive().optional(),
  reconciliation: z
    .enum(['NONE', 'CORRECTED', 'LEGACY_SOLD', 'LEGACY_COMPLETE', 'SUPPORT_REQUIRED'])
    .optional(),
  status: z.enum(['NOT_STARTED', 'ACTIVE', 'COMPLETE']),
  objective: firstShiftObjectiveSchema,
  counters: z.object({ mined: units, refined: units, sold: units }),
  acceptedAt: z.number().int().nullable(),
  completedAt: z.number().int().nullable(),
  rewardClaimed: z.boolean(),
  toolRecovered: z.boolean(),
  dialogueFlags: z.array(z.enum(['foremanIntro', 'technicianIntro', 'officerIntro'])).max(3),
  unlockedQuests: z.array(z.literal('lyria-next-shift')).max(1),
  tutorialOrderId: z.string().nullable(),
});
export const inventorySchema = z.partialRecord(oreSchema, mineralUnits);
export type Inventory = z.infer<typeof inventorySchema>;
export type Ore = z.infer<typeof oreSchema>;
export type Ship = z.infer<typeof shipSchema>;
export type MiningType = z.infer<typeof miningSchema>;
export type Location = z.infer<typeof locationSchema>;
export type Method = z.infer<typeof methodSchema>;
const pendingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('travel'),
    destination: locationSchema,
    ship: shipSchema,
    roc: z.boolean(),
    readyAt: z.number().int(),
  }),
  z.object({
    kind: z.literal('mine'),
    source: miningSchema,
    rewards: inventorySchema,
    readyAt: z.number().int(),
  }),
]);
const fragmentSchema = z.object({
  id: z.string().max(80),
  units: units.positive(),
  x: z.number().int(),
  y: z.number().int(),
  collected: z.boolean(),
});
const worldNodeSchema = z.object({
  id: z.string().max(80),
  ore: oreSchema,
  source: z.enum(['Hand', 'Roc']),
  x: z.number().int(),
  y: z.number().int(),
  size: z.number().int().min(1).max(5),
  resistance: z.number().min(0).max(1),
  instability: z.number().min(0).max(1),
  yieldUnits: units.positive(),
  status: z.enum(['INTACT', 'FRACTURED', 'DEPLETED']),
  fragments: z.array(fragmentSchema).max(12),
  respawnAt: z.number().int().nullable(),
});
export const worldProgressSchema = z.object({
  zone: zoneSchema,
  entry: z.string().max(40),
  nodes: z.record(z.string().max(80), worldNodeSchema).refine((nodes) => Object.keys(nodes).length <= 120),
  scanner: z.object({
    pings: units,
    analyses: units,
    analyzed: z.array(z.string().max(80)).max(120),
    scannedZones: z.array(z.string().max(80)).max(40).optional(),
  }),
  miningSession: z
    .object({ nodeId: z.string().max(80), startedAt: z.number().int(), source: z.enum(['Hand', 'Roc']) })
    .nullable(),
  roc: z.object({ zone: zoneSchema, active: z.boolean(), occupied: z.boolean() }).nullable(),
  departure: z
    .object({ ship: shipSchema, destination: locationSchema, loadRoc: z.boolean() })
    .strict()
    .nullable()
    .optional(),
  // Only sub-cSCU remainders live here; legacy inventory values remain whole cSCU.
  minorRemainders: z
    .partialRecord(z.enum(['Hand', 'Roc']), inventorySchema)
    .refine((holds) =>
      Object.values(holds).every((hold) => Object.values(hold ?? {}).every((quantity) => quantity < 100)),
    )
    .optional(),
});
export const stateSchema = z.object({
  schemaVersion: z.literal(2),
  // Missing means the legacy whole-cSCU save; 2 means every mineral value is 0.01 cSCU.
  quantityVersion: z.literal(2).optional(),
  // Signed exact-value carry in 1/10000 aUEC; only modern saves may use it.
  walletRemainder: z.number().int().min(-5000).max(4999).optional(),
  // New saves carry an opaque generation so pending actions cannot cross a table reset.
  saveGeneration: z.uuid().optional(),
  revision: z.number().int().nonnegative(),
  wallet: z.number().int().min(0).max(1_000_000_000_000),
  location: locationSchema,
  currentShip: shipSchema,
  ships: z.partialRecord(shipSchema, z.number().int().min(0).max(100)),
  equipment: z.record(z.string(), z.number().int().min(0).max(100)),
  positions: z.partialRecord(shipSchema, locationSchema),
  mining: z.record(miningSchema, inventorySchema),
  cargo: z.partialRecord(shipSchema, z.object({ raw: inventorySchema, refined: inventorySchema })),
  orders: z
    .array(
      z.object({
        id: z.string(),
        source: miningSchema,
        ore: oreSchema,
        method: methodSchema,
        rawUnits: mineralAmount,
        refinedUnits: mineralAmount,
        cost: z.number().int().nonnegative(),
        createdAt: z.number().int(),
        readyAt: z.number().int(),
      }),
    )
    .max(100),
  refineryRates: z.record(methodSchema, z.object({ yield: z.number(), cost: z.number(), time: z.number() })),
  pending: pendingSchema.nullable(),
  // Optional for all existing v2 saves; absence is interpreted as NOT_STARTED.
  firstShift: firstShiftSchema.optional(),
  // Existing v2 saves omit world; a location-specific compatibility mapping is used.
  world: worldProgressSchema.optional(),
});
export type PlayerState = z.infer<typeof stateSchema>;
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enterZone'), zone: zoneSchema }).strict(),
  z.object({ type: z.literal('scanZone') }).strict(),
  z.object({ type: z.literal('analyzeNode'), nodeId: z.string().min(1).max(80) }).strict(),
  z
    .object({
      type: z.literal('beginFracture'),
      nodeId: z.string().min(1).max(80),
      source: z.enum(['Hand', 'Roc']),
    })
    .strict(),
  z.object({ type: z.literal('completeFracture'), nodeId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('cancelFracture'), nodeId: z.string().min(1).max(80) }).strict(),
  z
    .object({
      type: z.literal('collectPiece'),
      nodeId: z.string().min(1).max(80),
      pieceId: z.string().min(1).max(80),
    })
    .strict(),
  z.object({ type: z.literal('retrieveRoc') }).strict(),
  z.object({ type: z.literal('enterRoc'), occupied: z.boolean() }).strict(),
  z.object({ type: z.literal('stowRoc') }).strict(),
  z
    .object({
      type: z.literal('assignDeparture'),
      ship: shipSchema,
      destination: locationSchema,
      loadRoc: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('cancelDeparture') }).strict(),
  z
    .object({
      type: z.literal('travel'),
      ship: shipSchema,
      destination: locationSchema,
      loadRoc: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mine'),
      source: miningSchema,
      head: z.string().max(40),
      crew: z.string().max(40),
      extraStations: z
        .array(z.object({ head: z.string().max(40), crew: z.string().max(40) }).strict())
        .max(2)
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal('finish') }).strict(),
  z
    .object({
      type: z.literal('firstShift'),
      step: z.enum([
        'accept',
        'checkTool',
        'recoverTool',
        'enterMine',
        'mineDolivine',
        'returnOutpost',
        'startRefinery',
        'collect',
        'sell',
        'complete',
        'reconcile',
      ]),
      depositId: z.literal('dolivine').optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('transfer'),
      source: miningSchema,
      ship: shipSchema,
      ore: oreSchema,
      units: amount,
    })
    .strict(),
  z
    .object({
      type: z.literal('transferMinor'),
      source: miningSchema,
      ship: shipSchema,
      ore: oreSchema,
      unitsMinor: mineralAmount,
    })
    .strict(),
  z
    .object({
      type: z.literal('refine'),
      source: miningSchema,
      ore: oreSchema,
      units: amount,
      method: methodSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('refineMinor'),
      source: miningSchema,
      ore: oreSchema,
      unitsMinor: mineralAmount,
      method: methodSchema,
    })
    .strict(),
  z.object({ type: z.literal('collect'), orderId: z.string().max(80), ship: shipSchema }).strict(),
  z
    .object({
      type: z.literal('sell'),
      ship: shipSchema,
      ore: oreSchema,
      category: z.enum(['raw', 'refined']),
      units: amount,
    })
    .strict(),
  z
    .object({
      type: z.literal('sellMinor'),
      ship: shipSchema,
      ore: oreSchema,
      category: z.enum(['raw', 'refined']),
      unitsMinor: mineralAmount,
    })
    .strict(),
  z
    .object({
      type: z.literal('sellItem'),
      item: z.string().max(40),
      quantity: z.number().int().min(1).max(10),
    })
    .strict(),
  z
    .object({
      type: z.literal('purchase'),
      item: z.string().max(40),
      quantity: z.number().int().min(1).max(10),
    })
    .strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export const mutationSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    action: actionSchema,
  })
  .strict();
export type Mutation = z.infer<typeof mutationSchema>;
export const RESET_CONFIRMATION = 'RESET MY DIME PROFILE' as const;
export const resetRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    expectedGeneration: z.uuid(),
    confirmation: z.literal(RESET_CONFIRMATION),
  })
  .strict();
export type ResetRequest = z.infer<typeof resetRequestSchema>;
export const snapshotSchema = z.object({
  state: stateSchema,
  serverTime: z.number().int(),
  replayed: z.boolean().optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
