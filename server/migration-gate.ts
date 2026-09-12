import { PlayerState } from '../shared/schema';

// Read-only gate for future lazy migration. The current Lambda never imports this module.
// Source discovery and identity linking must be performed by a trusted backend reader.
export interface LegacyCandidate {
  sourceKey: string;
  sourceVersion: number | null;
  linkedPlayer: string | null;
  original: unknown;
}

export type MigrationAssessment =
  | { status: 'current'; state: PlayerState }
  | { status: 'new' }
  | { status: 'review-required'; reason: 'identity' | 'mapping' }
  | { status: 'reconciliation'; sources: string[] };

export function assessLegacySources(
  verifiedPlayer: string,
  current: PlayerState | undefined,
  candidates: readonly LegacyCandidate[],
): MigrationAssessment {
  if (!/^PLAYER#v1#[a-f0-9]{64}$/.test(verifiedPlayer))
    return { status: 'review-required', reason: 'identity' };
  if (current) return { status: 'current', state: current };
  if (candidates.length > 1)
    return { status: 'reconciliation', sources: candidates.map((candidate) => candidate.sourceKey) };
  if (candidates.length === 0) return { status: 'new' };
  const [candidate] = candidates;
  if (candidate.linkedPlayer !== verifiedPlayer) return { status: 'review-required', reason: 'identity' };
  // No legacy field mapper can yet prove balances, orders, claims, and inventory.
  // Preserve the source; never invent an initial or partially converted save.
  return { status: 'review-required', reason: 'mapping' };
}
