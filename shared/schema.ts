import { z } from 'zod';
import { ORE_NAMES, SHIP_NAMES, MINING_TYPES, LOCATIONS, METHOD_NAMES } from './catalog';
export const units = z.number().int().min(0).max(10_000_000);
const amount = units.positive();
export const oreSchema = z.enum(ORE_NAMES);
export const shipSchema = z.enum(SHIP_NAMES);
export const miningSchema = z.enum(MINING_TYPES);
export const locationSchema = z.enum(LOCATIONS);
export const methodSchema = z.enum(METHOD_NAMES);
export const firstShiftObjectiveSchema = z.enum([
  'SPEAK_TO_FOREMAN',
  'CHECK_EQUIPMENT',
  'ENTER_MINE',
  'MINE_ASSIGNED_ORE',
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
export const inventorySchema = z.partialRecord(oreSchema, units);
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
export const stateSchema = z.object({
  schemaVersion: z.literal(2),
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
        rawUnits: amount,
        refinedUnits: amount,
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
});
export type PlayerState = z.infer<typeof stateSchema>;
export const actionSchema = z.discriminatedUnion('type', [
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
      type: z.literal('refine'),
      source: miningSchema,
      ore: oreSchema,
      units: amount,
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
