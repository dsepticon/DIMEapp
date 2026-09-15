import { originalStateSchema, type OriginalPlayerState } from '../../shared/originalSchema';
export type PendingAction = {
  version: number;
  path: string;
  request: Record<string, unknown>;
  generation?: string;
  legacy: boolean;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const paths = ['/v4/actions', '/v4/content/convert', '/v4/profile/reset'];
export function readOriginalPending(raw: string): PendingAction | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value)) return null;
    const wrapped = object(value.request),
      request = wrapped ? (value.request as Record<string, unknown>) : value;
    if (
      !uuid(request.requestId) ||
      !Number.isSafeInteger(request.expectedRevision) ||
      Number(request.expectedRevision) < 0
    )
      return null;
    const legacyRaw =
      !wrapped &&
      !('version' in value) &&
      object(request.action) &&
      [
        'enterZone',
        'scanZone',
        'analyzeNode',
        'beginFracture',
        'completeFracture',
        'cancelFracture',
        'collectPiece',
        'travel',
        'mine',
        'finish',
        'firstShift',
        'transferMinor',
        'refineMinor',
        'sellMinor',
      ].includes(String(request.action.type));
    const legacy = value.version === 1 || legacyRaw;
    if (!legacy && (value.version !== 4 || !paths.includes(String(value.path)))) return null;
    const generation = request.expectedGeneration ?? value.saveGeneration;
    if (generation !== undefined && !uuid(generation)) return null;
    return {
      version: legacy ? 1 : 4,
      path: legacy ? '/actions' : String(value.path),
      request,
      generation: generation as string | undefined,
      legacy,
    };
  } catch {
    return null;
  }
}
export type RecoverySnapshot = {
  state?: OriginalPlayerState;
  revision: number;
  generation: string;
  legacy: boolean;
};
export function recoverySnapshot(value: Record<string, unknown>): RecoverySnapshot {
  if (value.conversionRequired === true && uuid(value.saveGeneration) && Number.isSafeInteger(value.revision))
    return { revision: Number(value.revision), generation: value.saveGeneration, legacy: true };
  const state = originalStateSchema.parse(value.state);
  return { state, revision: state.revision, generation: state.saveGeneration, legacy: false };
}
/** A converted or reset save has revision >= 1. Revision-zero v4 without provenance is direct creation.
 * An explicitly older-format request cannot target this format. No wall-clock or storage timestamp is trusted.
 */
export function freshCanonicalV4(state: OriginalPlayerState | undefined) {
  return (
    !!state &&
    state.schemaVersion === 3 &&
    state.contentVersion === 4 &&
    state.saveFormatVersion === 3 &&
    state.revision === 0 &&
    !state.conversionReceipt &&
    state.location === 'loc.l001' &&
    state.world.zone === 'zone.z001' &&
    state.wallet === 0 &&
    !state.pending &&
    !state.quest &&
    !state.world.miningSession &&
    !state.world.extractionSession &&
    state.currentShip === 'fleet.v001' &&
    Object.keys(state.ships).length === 1 &&
    state.ships['fleet.v001'] === 1 &&
    Object.keys(state.equipment).length === 1 &&
    state.equipment['gear.e001'] === 1 &&
    state.orders.length === 0 &&
    Object.values(state.mining).every((hold) => Object.keys(hold).length === 0) &&
    Object.keys(state.world.nodes).length === 0 &&
    Object.values(state.cargo).every(
      (hold) => !hold || Object.keys(hold.raw).length + Object.keys(hold.refined).length === 0,
    )
  );
}
export class OriginalApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
const definitive = new Set([
  'INVALID_REQUEST',
  'INVALID_RESET',
  'MINING_REJECTED',
  'CARGO_FULL',
  'ACTION_REJECTED',
  'REVISION_CONFLICT',
  'GENERATION_CONFLICT',
  'CONTENT_ALREADY_CONVERTED',
  'CONTENT_REVIEW_REQUIRED',
  'CONVERSION_NOT_ENABLED',
]);
export type RecoveryDecision = 'replay' | 'obsolete' | 'rejected' | 'confirmed' | 'ambiguous';
/** One policy for startup, refresh and every mutation, including conversion and reset. */
export function classifyOriginalRecovery(
  record: PendingAction | null,
  snapshot: RecoverySnapshot,
  outcome?: { success?: boolean; error?: unknown },
): RecoveryDecision {
  if (outcome?.success) return 'confirmed';
  if (!record) return 'ambiguous';
  if (record.generation && record.generation !== snapshot.generation) return 'obsolete';
  if (record.legacy && !record.generation && freshCanonicalV4(snapshot.state)) return 'obsolete';
  if (outcome?.error) {
    if (
      outcome.error instanceof OriginalApiError &&
      definitive.has(outcome.error.code) &&
      outcome.error.status >= 400 &&
      outcome.error.status < 500
    )
      return 'rejected';
    return 'ambiguous';
  }
  if (record.legacy !== snapshot.legacy && !(record.path === '/v4/content/convert' && snapshot.legacy))
    return 'ambiguous';
  if (!record.generation || snapshot.revision < Number(record.request.expectedRevision)) return 'ambiguous';
  return 'replay';
}
export function recoveryMessage(error: unknown) {
  const code = error instanceof OriginalApiError ? error.code : '';
  return code === 'MINING_REJECTED'
    ? 'Mining not started. Move within tool range and analyze a suitable node.'
    : code === 'CARGO_FULL'
      ? 'Mining hold is full. Free capacity before collecting.'
      : code === 'REVISION_CONFLICT' || code === 'GENERATION_CONFLICT'
        ? 'Save refreshed. Review your operation and try again.'
        : 'Action was rejected. Your save has been refreshed.';
}
