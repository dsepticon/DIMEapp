/** Verified, exact-key deletion. Each resume performs one bounded, durable step. */
import { createHash } from 'node:crypto';
import type { RecordRepository, RecordTransaction } from './authRecords';
import type { IdentityProvider, Tokens } from './webAuth';
import {
  AUTH_TTL,
  activeManifest,
  controlKey,
  manifestKey,
  reservationKey,
  validateManifest,
  writeManifest,
  type AccountManifest,
} from './accountManifest';
type Job = { proof: string; phase: 'DELETION_PENDING' | 'REVOKED' | 'PURGED' };
const proof = (account: string, capability: string) =>
  createHash('sha256')
    .update(account + '\0' + capability)
    .digest('hex');
function validate(account: string, capability: string) {
  if (!/^[a-f0-9-]{36}$/.test(account) || !/^[\w-]{43}$/.test(capability))
    throw Error('Deletion unavailable.');
}
export class AccountDeletion {
  constructor(
    private repo: RecordRepository,
    private provider: IdentityProvider,
    private clock: () => number,
  ) {}
  async begin(tx: RecordTransaction, account: string, capability: string) {
    validate(account, capability);
    const m = await activeManifest(tx, account);
    const old = await tx.get('deletion:' + account);
    if (old) throw Error('Deletion already pending.');
    const a = await tx.get<Record<string, unknown>>('account:' + account);
    if (!a) throw Error('Account unavailable.');
    await tx.put('account:' + account, { ...a, suspended: true, status: 'DELETION_PENDING' });
    await writeManifest(tx, { ...m, status: 'DELETION_PENDING' });
    await tx.put(controlKey(m.player), { account, status: 'DELETION_PENDING' });
    // Preserve the one encrypted provider grant until revocation succeeds, even past session TTL.
    const grant = await tx.get('grant:' + m.oauth);
    if (grant) await tx.put('grant:' + m.oauth, grant);
    await tx.put<Job>('deletion:' + account, {
      proof: proof(account, capability),
      phase: 'DELETION_PENDING',
    });
    return { status: 'DELETION_PENDING' };
  }
  async resume(account: string, capability: string) {
    validate(account, capability);
    const hash = proof(account, capability),
      key = 'deletion:' + account;
    const initial = await this.repo.transaction(async (tx) => {
      const done = await tx.get<{ expiresAt: number }>('deletion-result:' + hash);
      if (done && done.expiresAt > this.clock()) return { complete: true } as const;
      const job = await tx.get<Job>(key);
      if (!job || job.proof !== hash) throw Error('Deletion unavailable.');
      const m = validateManifest(await tx.get(manifestKey(account)));
      if (m.account !== account || m.status === 'ACTIVE') throw Error('Deletion unavailable.');
      if (job.phase !== 'PURGED') {
        const owner = await tx.get<{ account: string; status: string }>(controlKey(m.player));
        const credential = await tx.get<{ account: string }>('oauth:' + m.oauth);
        if (
          owner?.account !== account ||
          owner.status !== 'DELETION_PENDING' ||
          credential?.account !== account
        )
          throw Error('Deletion ownership mismatch.');
      }
      const grant =
        job.phase === 'DELETION_PENDING' ? await tx.get<{ tokens: Tokens }>('grant:' + m.oauth) : undefined;
      return { job, m, grant };
    });
    if ('complete' in initial) return { status: 'COMPLETE' };
    if (initial.job.phase === 'DELETION_PENDING' && initial.grant)
      await this.provider.revoke(initial.grant.tokens);
    return this.repo.transaction(async (tx) => {
      const job = await tx.get<Job>(key);
      if (!job || job.proof !== hash) {
        const done = await tx.get<{ expiresAt: number }>('deletion-result:' + hash);
        if (done && done.expiresAt > this.clock()) return { status: 'COMPLETE' };
        throw Error('Deletion unavailable.');
      }
      if (job.phase !== initial.job.phase) return { status: job.phase };
      const m = validateManifest(await tx.get(manifestKey(account)));
      if (m.account !== account || m.status === 'ACTIVE') throw Error('Deletion unavailable.');
      if (job.phase === 'DELETION_PENDING') {
        await tx.delete('grant:' + m.oauth);
        await tx.put(key, { ...job, phase: 'REVOKED' });
        return { status: 'REVOKED' };
      }
      if (job.phase === 'REVOKED') {
        await this.purge(tx, m);
        await writeManifest(tx, { ...m, status: 'PURGED' });
        await tx.put(key, { ...job, phase: 'PURGED' });
        return { status: 'PURGED' };
      }
      // Manifest survives all destructive steps; remove it only after the durable PURGED checkpoint.
      await tx.delete(manifestKey(account));
      await tx.delete(key);
      const expiresAt = this.clock() + AUTH_TTL.outcome;
      await tx.put('deletion-result:' + hash, { complete: true, expiresAt }, expiresAt);
      return { status: 'COMPLETE' };
    });
  }
  private async purge(tx: RecordTransaction, m: AccountManifest) {
    const owner = await tx.get<{ account: string; status: string }>(controlKey(m.player));
    const a = await tx.get<{ id: string; player: string; oauth: string }>('account:' + m.account);
    const credential = await tx.get<{ account: string }>('oauth:' + m.oauth);
    if (
      owner?.account !== m.account ||
      owner.status !== 'DELETION_PENDING' ||
      a?.id !== m.account ||
      a.player !== m.player ||
      a.oauth !== m.oauth ||
      credential?.account !== m.account
    )
      throw Error('Deletion ownership mismatch.');
    if (m.extension) {
      const mapped = await tx.get<string>('extension:' + m.extension);
      const binding = await tx.get<{ player: string }>('binding:' + m.extension);
      if (mapped !== m.account || binding?.player !== m.player) throw Error('Deletion ownership mismatch.');
    }
    if (m.detached && (await tx.get<{ account: string }>(reservationKey(m.detached)))?.account !== m.account)
      throw Error('Deletion ownership mismatch.');
    const expiresAt = this.clock() + AUTH_TTL.tombstone;
    const tombstone = { deleted: true, expiresAt };
    await tx.delete('account:' + m.account);
    await tx.delete('state:' + m.player);
    await tx.delete('grant:' + m.oauth);
    // Identity-indexed suppression contains no account pointer, profile, credential or raw identity.
    await tx.put('oauth:' + m.oauth, tombstone, expiresAt);
    await tx.put(controlKey(m.player), tombstone, expiresAt);
    const extension = m.extension ?? m.detached;
    if (extension) {
      await tx.delete('extension:' + extension);
      await tx.delete('binding:' + extension);
      await tx.put(reservationKey(extension), tombstone, expiresAt);
    }
  }
}
