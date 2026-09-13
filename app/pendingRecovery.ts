import { z } from 'zod';
import { Mutation, PlayerState, mutationSchema } from '../shared/schema';

const storedPendingSchema = z
  .object({
    version: z.literal(1),
    request: mutationSchema,
    saveGeneration: z.uuid().optional(),
  })
  .strict();

export type PendingRecord = { request: Mutation; saveGeneration?: string };
export type RecoveryEvidence = 'safe' | 'obsolete' | 'unverified' | 'revision-regressed';

export function readPendingRecord(raw: string): PendingRecord {
  const parsed: unknown = JSON.parse(raw);
  if (parsed && typeof parsed === 'object' && 'version' in parsed) {
    const record = storedPendingSchema.parse(parsed);
    return { request: record.request, saveGeneration: record.saveGeneration };
  }
  // Twitch 0.6.0 stored the mutation itself. Its request ID and payload stay intact.
  return { request: mutationSchema.parse(parsed) };
}

export function writePendingRecord(record: PendingRecord): string {
  return JSON.stringify(storedPendingSchema.parse({ version: 1, ...record }));
}

export function recoveryEvidence(record: PendingRecord, state: PlayerState): RecoveryEvidence {
  if (record.saveGeneration) {
    if (!state.saveGeneration) return 'unverified';
    if (record.saveGeneration !== state.saveGeneration) return 'obsolete';
    if (state.revision < record.request.expectedRevision) return 'revision-regressed';
    return 'safe';
  }
  // Revisions are monotonic within one save. A lower revision proves replacement.
  if (state.revision < record.request.expectedRevision) return 'obsolete';
  // A later revision makes an exact replay read-only: it can return its receipt
  // or a revision conflict, but cannot apply to a new save.
  if (state.revision > record.request.expectedRevision) return 'safe';
  // A matching revision cannot prove that a wipe did not create a new save.
  return 'unverified';
}
