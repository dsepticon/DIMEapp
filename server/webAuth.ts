import { AccountDeletion } from './accountDeletion';
import {
  AUTH_TTL,
  activeManifest,
  controlKey,
  reservationKey,
  writeManifest,
  type AccountControl,
} from './accountManifest';
import { canonicalExtensionStore, newBinding, type PlayerBinding } from './canonicalPlayer';
/** Server-only OAuth/session boundary. Never import this module into the frontend. */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { MemoryRecords, type RecordRepository, type RecordTransaction } from './authRecords';
import { parseVersionedContent, type VersionedContentState } from './contentConversion';
import type { Store, Receipt } from './store';
export class WebAuthError extends Error {
  constructor(
    readonly status = 401,
    readonly code?: 'LINK_CONFLICT' | 'LINK_STALE' | 'ACCOUNT_SUSPENDED',
  ) {
    super('Authentication could not be completed.');
  }
}
export const opaque = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export type Tokens = { access: string; refresh: string; expiresAt: number };
export interface IdentityProvider {
  authorize(state: string, nonce: string): string;
  exchange(code: string, nonce: string): Promise<{ subject: string; tokens: Tokens }>;
  validate(tokens: Tokens): Promise<{ subject: string; tokens: Tokens }>;
  revoke(tokens: Tokens): Promise<void>;
}
type Login = { browser: string; nonce: string; expiresAt: number };
type Credential = { account: string; epoch: string; lease?: { id: string; until: number } };
type Session = {
  createdAt: number;
  link?: string;
  account: string;
  subject: string;
  csrf: string;
  epoch: string;
  expiresAt: number;
  idleUntil: number;
};
export type Account = {
  id: string;
  player: string;
  established: boolean;
  extension?: string;
  oauth: string;
  suspended?: boolean;
};
type Link = {
  account: string;
  session: string;
  epoch: string;
  expiresAt: number;
  player: string;
  revision: number | null;
  generation: string | null;
};
type LinkResult = {
  expiresAt: number;
  account: string;
  extension: string;
  player: string;
  outcome: 'LINKED' | 'CONFLICT';
  bindingEpoch?: string;
  webRevision?: number | null;
  webGeneration?: string | null;
  extensionRevision?: number | null;
  extensionGeneration?: string | null;
};
export type Authorized = {
  account: string;
  player: string;
  csrf: string;
  session: string;
  subject: string;
  epoch: string;
};
export class MemoryAuthRepository extends MemoryRecords {}
export class WebAuth {
  constructor(
    private repo: RecordRepository,
    private provider: IdentityProvider,
    private identityKey: Uint8Array,
    readonly origin: string,
    private clock: () => number = Date.now,
  ) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || identityKey.length < 32)
      throw Error('Invalid web authentication configuration.');
  }
  private subject(raw: string) {
    return createHmac('sha256', this.identityKey)
      .update('dime:oauth-subject:v1\0' + raw)
      .digest('hex');
  }
  cookie(name: 'session' | 'login' | 'deletion', value: string, seconds: number) {
    return `__Host-dime-${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${name === 'deletion' ? 'Strict' : 'Lax'}; Max-Age=${seconds}`;
  }
  async begin() {
    const state = opaque(),
      browser = opaque(),
      nonce = opaque(),
      expiresAt = this.clock() + 300000;
    await this.repo.transaction(async (tx) => {
      await tx.put('login:' + digest(state), { browser: digest(browser), nonce, expiresAt }, expiresAt);
    });
    return { location: this.provider.authorize(state, nonce), cookie: this.cookie('login', browser, 300) };
  }
  async callback(code: string, state: string, browser: string, previous?: string) {
    if (!code || code.length > 4096 || !/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(browser))
      throw new WebAuthError();
    const login = await this.repo.transaction(async (tx) => {
      const key = 'login:' + digest(state),
        value = await tx.get<Login>(key);
      if (!value || value.expiresAt <= this.clock() || !equal(value.browser, digest(browser)))
        throw new WebAuthError();
      await tx.delete(key);
      return value;
    });
    let identity;
    try {
      identity = await this.provider.exchange(code, login.nonce);
    } catch {
      throw new WebAuthError();
    }
    const subject = this.subject(identity.subject),
      sid = opaque(),
      csrf = opaque(),
      now = this.clock(),
      epoch = randomUUID();
    try {
      const previousCredential = await this.repo.transaction(async (tx) => {
        const c = await tx.get<Credential & { deleted?: boolean }>('oauth:' + subject);
        if (c?.deleted) throw new WebAuthError();
        if (c) {
          await activeManifest(tx, c.account);
          if (c.lease && c.lease.until > this.clock()) throw new WebAuthError(409);
          c.lease = { id: epoch, until: this.clock() + 60000 };
          await tx.put('oauth:' + subject, c);
        }
        return { c, grant: await tx.get<{ tokens: Tokens }>('grant:' + subject) };
      });
      if (previousCredential.grant && previousCredential.grant.tokens.access !== identity.tokens.access)
        await this.provider.revoke(previousCredential.grant.tokens);
      await this.repo.transaction(async (tx) => {
        const key = 'oauth:' + subject,
          old = await tx.get<Credential & { deleted?: boolean }>(key),
          account = old?.account ?? randomUUID();
        if (
          old?.deleted ||
          old?.epoch !== previousCredential.c?.epoch ||
          (old && (old.lease?.id !== epoch || old.lease.until <= this.clock()))
        )
          throw new WebAuthError();
        if (!old) {
          await tx.put<Account>('account:' + account, {
            id: account,
            player: 'ACCOUNT#v1#' + account,
            established: false,
            oauth: subject,
          });
          await writeManifest(tx, {
            version: 1,
            account,
            player: 'ACCOUNT#v1#' + account,
            oauth: subject,
            status: 'ACTIVE',
          });
          await tx.put(controlKey('ACCOUNT#v1#' + account), { account, status: 'ACTIVE' });
        } else {
          const m = await activeManifest(tx, account);
          if (m.oauth !== subject) throw new WebAuthError();
        }
        if (old && (await tx.get<Account>('account:' + old.account))?.suspended)
          throw new WebAuthError(403, 'ACCOUNT_SUSPENDED');
        // A new login rotates the credential epoch, ending older sessions and refresh leases.
        await tx.put<Credential>(key, { account, epoch });
        await tx.put(
          'grant:' + subject,
          { tokens: identity.tokens, epoch, expiresAt: now + 8 * 3600000 },
          now + 8 * 3600000,
        );
        if (previous) await tx.delete('session:' + digest(previous));
        await tx.put<Session>(
          'session:' + digest(sid),
          {
            createdAt: now,
            account,
            subject,
            csrf,
            epoch,
            expiresAt: now + 8 * 3600000,
            idleUntil: now + 30 * 60000,
          },
          now + 8 * 3600000,
        );
      });
    } catch (error) {
      try {
        await this.provider.revoke(identity.tokens);
      } catch {
        /* No local session was issued. */
      }
      throw error;
    }
    return {
      cookie: this.cookie('session', sid, 8 * 3600),
      clearLogin: this.cookie('login', '', 0),
      location: this.origin + '/',
    };
  }
  private async checked(tx: RecordTransaction, key: string, mutation?: { origin?: string; csrf?: string }) {
    const s = await tx.get<Session>('session:' + key),
      now = this.clock();
    if (!s || s.expiresAt <= now || s.idleUntil <= now) throw new WebAuthError();
    const m = await activeManifest(tx, s.account);
    if (m.oauth !== s.subject) throw new WebAuthError();
    const c = await tx.get<Credential>('oauth:' + s.subject);
    const grant = await tx.get<{ tokens: Tokens; epoch: string; expiresAt: number }>('grant:' + s.subject);
    if (
      !c ||
      c.account !== s.account ||
      c.epoch !== s.epoch ||
      !grant ||
      grant.epoch !== s.epoch ||
      grant.expiresAt <= now
    )
      throw new WebAuthError();
    if (mutation && (mutation.origin !== this.origin || !mutation.csrf || !equal(mutation.csrf, s.csrf)))
      throw new WebAuthError(403);
    return { s, c, tokens: grant.tokens };
  }
  async authorize(sid: string, mutation?: { origin?: string; csrf?: string }): Promise<Authorized> {
    if (!/^[\w-]{43}$/.test(sid)) throw new WebAuthError();
    const key = digest(sid),
      lease = randomUUID();
    const before = await this.repo.transaction(async (tx) => {
      const { s, c, tokens } = await this.checked(tx, key, mutation);
      if (c.lease && c.lease.until > this.clock()) throw new WebAuthError(409);
      c.lease = { id: lease, until: this.clock() + 60000 };
      await tx.put('oauth:' + s.subject, c);
      return { s, c, tokens };
    });
    let checked;
    try {
      checked = await this.provider.validate(before.tokens);
      if (this.subject(checked.subject) !== before.s.subject) throw new WebAuthError();
    } catch {
      await this.repo.transaction(async (tx) => {
        const c = await tx.get<Credential>('oauth:' + before.s.subject);
        if (c?.epoch === before.c.epoch && c.lease?.id === lease) {
          await tx.put('oauth:' + before.s.subject, { account: c.account, epoch: randomUUID() });
          await tx.delete('grant:' + before.s.subject);
        }
      });
      throw new WebAuthError();
    }
    return this.repo.transaction(async (tx) => {
      const { s, c } = await this.checked(tx, key, mutation);
      if (c.lease?.id !== lease || c.lease.until <= this.clock()) throw new WebAuthError(409);
      const account = await tx.get<Account>('account:' + s.account);
      if (!account || account.suspended) throw new WebAuthError();
      delete c.lease;
      s.idleUntil = Math.min(s.expiresAt, this.clock() + 30 * 60000);
      await tx.put('oauth:' + s.subject, c);
      await tx.put(
        'grant:' + s.subject,
        { tokens: checked.tokens, epoch: s.epoch, expiresAt: s.expiresAt },
        s.expiresAt,
      );
      await tx.put('session:' + key, s, s.expiresAt);
      return {
        account: account.id,
        player: account.player,
        csrf: s.csrf,
        session: key,
        subject: s.subject,
        epoch: s.epoch,
      };
    });
  }
  async logout(sid: string, mutation: { origin?: string; csrf?: string }) {
    if (!/^[\w-]{43}$/.test(sid)) throw new WebAuthError();
    const key = digest(sid);
    // Logout must not refresh tokens or extend a session during emergency shutdown.
    const tokens = await this.repo.transaction(async (tx) => {
      const { s, c, tokens } = await this.checked(tx, key, mutation);
      await tx.put('oauth:' + s.subject, { account: c.account, epoch: randomUUID() });
      await tx.delete('session:' + key);
      await tx.delete('grant:' + s.subject);
      return tokens;
    });
    try {
      await this.provider.revoke(tokens);
    } catch {
      /* Local credential epoch already invalidated. */
    }
    return this.cookie('session', '', 0);
  }
  async createLink(sid: string, mutation: { origin?: string; csrf?: string }) {
    const a = await this.authorize(sid, mutation),
      intent = opaque(),
      expiresAt = this.clock() + 300000;
    await this.repo.transaction(async (tx) => {
      const { s } = await this.checked(tx, a.session, mutation);
      if (s.link) await tx.delete('link:' + s.link);
      s.link = digest(intent);
      await tx.put('session:' + a.session, s, s.expiresAt);
      const account = await tx.get<Account>('account:' + a.account);
      if (!account || account.suspended) throw new WebAuthError();
      const save = await tx.get<VersionedContentState>('state:' + account.player);
      await tx.put<Link>(
        'link:' + digest(intent),
        {
          account: a.account,
          session: a.session,
          epoch: a.epoch,
          expiresAt,
          player: account.player,
          revision: save?.revision ?? null,
          generation: save?.saveGeneration ?? null,
        },
        expiresAt,
      );
    });
    return intent;
  }
  /** Caller must independently verify the Extension JWT; progress is read only from authoritative records. */
  async acceptLink(intent: string, extensionPlayer: string) {
    if (!/^[\w-]{43}$/.test(intent) || !/^PLAYER#v1#[a-f0-9]{64}$/.test(extensionPlayer))
      throw new WebAuthError();
    const result = await this.repo.transaction(async (tx) => {
      const resultKey = 'link-result:' + digest(intent);
      const prior = await tx.get<LinkResult>(resultKey);
      if (prior) {
        if (prior.expiresAt <= this.clock()) throw new WebAuthError();
        await activeManifest(tx, prior.account);
        if (prior.extension !== extensionPlayer) throw new WebAuthError();
        if (prior.outcome === 'CONFLICT') return false;
        const binding = await tx.get<PlayerBinding>('binding:' + extensionPlayer);
        const account = await tx.get<Account>('account:' + prior.account);
        if (
          !account ||
          account.suspended ||
          account.extension !== extensionPlayer ||
          account.player !== prior.player ||
          binding?.epoch !== prior.bindingEpoch ||
          binding?.status !== 'ACTIVE'
        )
          throw new WebAuthError(409, 'LINK_STALE');
        return true;
      }
      const key = 'link:' + digest(intent),
        link = await tx.get<Link>(key);
      if (!link || link.expiresAt <= this.clock()) throw new WebAuthError();
      const { s, c } = await this.checked(tx, link.session);
      if (s.epoch !== link.epoch || s.account !== link.account) throw new WebAuthError();
      const web = await tx.get<Account>('account:' + link.account);
      if (!web || web.suspended) throw new WebAuthError();
      const manifest = await activeManifest(tx, web.id);
      const webState = await tx.get<VersionedContentState>('state:' + web.player);
      if (
        web.player !== link.player ||
        (webState?.revision ?? null) !== link.revision ||
        (webState?.saveGeneration ?? null) !== link.generation
      )
        throw new WebAuthError(409, 'LINK_STALE');
      const existing = await tx.get<string>('extension:' + extensionPlayer);
      const binding = await tx.get<PlayerBinding>('binding:' + extensionPlayer);
      const extensionCanonical = binding?.player ?? extensionPlayer;
      const extensionState =
        extensionCanonical === web.player
          ? webState
          : await tx.get<VersionedContentState>('state:' + extensionCanonical);
      const expiresAt = this.clock() + AUTH_TTL.outcome;
      const observed = {
        expiresAt,
        webRevision: webState?.revision ?? null,
        webGeneration: webState?.saveGeneration ?? null,
        extensionRevision: extensionState?.revision ?? null,
        extensionGeneration: extensionState?.saveGeneration ?? null,
      };
      const reservation = await tx.get<AccountControl>(reservationKey(extensionPlayer));
      const owner = await tx.get<AccountControl>(controlKey(extensionCanonical));
      await tx.delete(key);
      if (
        (web.extension && web.extension !== extensionPlayer) ||
        (existing && existing !== web.id) ||
        binding?.status === 'DETACHED' ||
        (manifest.detached && manifest.detached !== extensionPlayer) ||
        (reservation &&
          (reservation.account !== web.id || (reservation as { status: string }).status !== 'DETACHED')) ||
        (owner && (owner.account !== web.id || owner.status !== 'ACTIVE')) ||
        ((webState || web.established) && extensionState && web.player !== extensionCanonical)
      ) {
        await tx.put<LinkResult>(
          resultKey,
          {
            account: web.id,
            extension: extensionPlayer,
            player: web.player,
            outcome: 'CONFLICT',
            ...observed,
          },
          expiresAt,
        );
        return false;
      }
      // Never copy or rewrite either save. An existing Extension save always keeps its physical key.
      if (extensionState) web.player = extensionCanonical;
      web.extension = extensionPlayer;
      web.established = !!(webState || extensionState);
      const next =
        binding?.status === 'ACTIVE' && binding.player === web.player ? binding : newBinding(web.player);
      if (manifest.player !== web.player) await tx.delete(controlKey(manifest.player));
      await tx.put(controlKey(web.player), { account: web.id, status: 'ACTIVE' });
      await tx.delete(reservationKey(extensionPlayer));
      await writeManifest(tx, {
        version: 1,
        account: web.id,
        player: web.player,
        oauth: web.oauth,
        extension: extensionPlayer,
        status: 'ACTIVE',
      });
      await tx.put('account:' + web.id, web);
      await tx.put('extension:' + extensionPlayer, web.id);
      await tx.put('binding:' + extensionPlayer, next);
      await tx.put<LinkResult>(
        resultKey,
        {
          account: web.id,
          extension: extensionPlayer,
          player: web.player,
          outcome: 'LINKED',
          bindingEpoch: next.epoch,
          ...observed,
        },
        expiresAt,
      );
      await tx.put('oauth:' + s.subject, { account: c.account, epoch: randomUUID() });
      await tx.delete('grant:' + s.subject);
      return true;
    });
    if (!result) throw new WebAuthError(409, 'LINK_CONFLICT');
    return { linked: true };
  }
  async unlink(sid: string, mutation: { origin?: string; csrf?: string }, confirmation: string) {
    const a = await this.authorize(sid, mutation);
    return this.repo.transaction(async (tx) => {
      const { s, c } = await this.checked(tx, a.session, mutation);
      if (
        confirmation !== 'UNLINK_EXTENSION' ||
        !Number.isSafeInteger(s.createdAt) ||
        this.clock() - s.createdAt < 0 ||
        this.clock() - s.createdAt > AUTH_TTL.verification
      )
        throw new WebAuthError(403);
      const m = await activeManifest(tx, a.account);
      if (!m.extension) return { unlinked: true };
      const account = await tx.get<Account>('account:' + a.account);
      if (!account || c.lease) throw new WebAuthError(409);
      await tx.delete('extension:' + m.extension);
      await tx.delete('binding:' + m.extension);
      await tx.put(reservationKey(m.extension), { account: a.account, status: 'DETACHED' });
      const { extension, ...rest } = m;
      await writeManifest(tx, { ...rest, detached: extension });
      delete account.extension;
      await tx.put('account:' + a.account, account);
      if (s.link) await tx.delete('link:' + s.link);
      await tx.put('oauth:' + s.subject, { account: a.account, epoch: randomUUID() });
      return { unlinked: true };
    });
  }
  async beginDeletion(
    sid: string,
    mutation: { origin?: string; csrf?: string },
    confirmation: string,
    capability: string,
  ) {
    const a = await this.authorize(sid, mutation);
    return this.repo.transaction(async (tx) => {
      const { s, c } = await this.checked(tx, a.session, mutation);
      if (
        confirmation !== 'DELETE_ACCOUNT' ||
        !Number.isSafeInteger(s.createdAt) ||
        this.clock() - s.createdAt < 0 ||
        this.clock() - s.createdAt > AUTH_TTL.verification ||
        c.lease
      )
        throw new WebAuthError(403);
      const result = await new AccountDeletion(this.repo, this.provider, this.clock).begin(
        tx,
        a.account,
        capability,
      );
      return { ...result, account: a.account };
    });
  }
  resumeDeletion(account: string, capability: string) {
    return new AccountDeletion(this.repo, this.provider, this.clock).resume(account, capability);
  }
  /** Atomic binding+progress guard. Both Extension and web handlers must use this store before enabling links. */
  gameStore(authorization: Authorized): Store<VersionedContentState> {
    const guard = async (tx: RecordTransaction) => {
      const { s } = await this.checked(tx, authorization.session);
      const account = await tx.get<Account>('account:' + authorization.account);
      if (
        s.epoch !== authorization.epoch ||
        !account ||
        account.suspended ||
        account.player !== authorization.player
      )
        throw new WebAuthError();
      return account;
    };
    return this.boundStore(authorization.player, guard);
  }
  async extensionStore(extensionPlayer: string) {
    return canonicalExtensionStore(this.repo, extensionPlayer);
  }
  private boundStore(
    player: string,
    guard: (tx: RecordTransaction) => Promise<Account | undefined>,
  ): Store<VersionedContentState> {
    return {
      read: async (requested) => {
        if (requested !== player) throw new WebAuthError();
        return this.repo.transaction(async (tx) => {
          await guard(tx);
          const v = await tx.get<unknown>('state:' + player);
          return v ? parseVersionedContent(v) : undefined;
        });
      },
      receipt: async (requested, id) => {
        if (requested !== player) throw new WebAuthError();
        return this.repo.transaction(async (tx) => {
          await guard(tx);
          return tx.get<Receipt>('receipt:' + id + ':' + player);
        });
      },
      commit: async (requested, expected, state, request, generation) => {
        if (requested !== player) throw new WebAuthError();
        return this.repo.transaction(async (tx) => {
          const account = await guard(tx),
            current = await tx.get<VersionedContentState>('state:' + player);
          if (
            (expected === null ? current !== undefined : current?.revision !== expected) ||
            (generation !== undefined && (current?.saveGeneration ?? null) !== generation)
          )
            return false;
          if (request && (await tx.get('receipt:' + request.id + ':' + player))) return false;
          await tx.put('state:' + player, parseVersionedContent(state));
          if (expected !== null && account) {
            account.established = true;
            await tx.put('account:' + account.id, account);
          }
          if (request)
            await tx.put(
              'receipt:' + request.id + ':' + player,
              request.receipt,
              request.receipt.expiresAt * 1000,
            );
          return true;
        });
      },
    };
  }
}
