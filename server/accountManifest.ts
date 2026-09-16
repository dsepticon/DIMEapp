/** Fixed identity cardinality and exact-key deletion inventory. No profile fields or credentials. */
import { z } from 'zod';
import type { RecordTransaction } from './authRecords';
export const AUTH_TTL = {
  login: 300000,
  session: 28800000,
  idle: 1800000,
  link: 300000,
  outcome: 86400000,
  receipt: 2592000000,
  tombstone: 3024000000,
  verification: 300000,
} as const;
const extension = z.string().regex(/^PLAYER#v1#[a-f0-9]{64}$/);
const player = z.string().regex(/^(PLAYER#v1#[a-f0-9]{64}|ACCOUNT#v1#[a-f0-9-]{36})$/);
export const TEMPORARY_CLASSES = [
  'SESSION',
  'LINK_INTENT',
  'LINK_OUTCOME',
  'REQUEST_RECEIPT',
  'DELETION_RECEIPT',
] as const;
const schema = z
  .object({
    version: z.literal(1),
    temporary: z
      .tuple([
        z.literal('SESSION'),
        z.literal('LINK_INTENT'),
        z.literal('LINK_OUTCOME'),
        z.literal('REQUEST_RECEIPT'),
        z.literal('DELETION_RECEIPT'),
      ])
      .default([...TEMPORARY_CLASSES]),
    account: z.uuid(),
    player,
    oauth: z.string().regex(/^[a-f0-9]{64}$/),
    extension: extension.optional(),
    detached: extension.optional(),
    status: z.enum(['ACTIVE', 'DELETION_PENDING', 'PURGED']),
  })
  .strict()
  .refine((v) => !(v.extension && v.detached));
export type AccountManifest = z.infer<typeof schema>;
export type AccountControl = { account: string; status: 'ACTIVE' | 'DELETION_PENDING' };
export type Suppression = { deleted: true; expiresAt: number };
export const manifestKey = (account: string) => 'manifest:' + account;
export const controlKey = (player: string) => 'control:player:' + player;
export const reservationKey = (identity: string) => 'control:reservation:' + identity;
export function validateManifest(value: unknown): AccountManifest {
  const m = schema.parse(value);
  if (Buffer.byteLength(JSON.stringify(m)) > 1024) throw Error('Manifest bound exceeded.');
  return m;
}
export function persistentReferences(value: AccountManifest) {
  const m = validateManifest(value);
  return [
    manifestKey(m.account),
    'account:' + m.account,
    'oauth:' + m.oauth,
    'grant:' + m.oauth,
    'state:' + m.player,
    controlKey(m.player),
    'deletion:' + m.account,
    ...(m.extension ? ['extension:' + m.extension, 'binding:' + m.extension] : []),
    ...(m.detached ? [reservationKey(m.detached)] : []),
  ];
}
export async function writeManifest(tx: RecordTransaction, value: z.input<typeof schema>) {
  const m = validateManifest(value);
  await tx.put(manifestKey(m.account), m);
}
export async function activeManifest(tx: RecordTransaction, account: string) {
  const m = validateManifest(await tx.get(manifestKey(account)));
  if (m.account !== account || m.status !== 'ACTIVE') throw Error('Account unavailable.');
  const control = await tx.get<AccountControl>(controlKey(m.player));
  if (control?.account !== account || control.status !== 'ACTIVE') throw Error('Account unavailable.');
  return m;
}
