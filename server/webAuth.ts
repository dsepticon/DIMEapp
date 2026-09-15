/** Server-only OAuth/session boundary. Never import this module into the frontend. */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { MemoryRecords, type RecordRepository, type RecordTransaction } from './authRecords';
import { parseVersionedContent, type VersionedContentState } from './contentConversion';
import type { Store, Receipt } from './store';
export class WebAuthError extends Error {
  constructor(readonly status = 401) {
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
  link?: string;
  account: string;
  subject: string;
  csrf: string;
  epoch: string;
  expiresAt: number;
  idleUntil: number;
};
export type Account = { id: string; player: string; established: boolean; extension?: string; oauth: string };
type Link = { account: string; session: string; epoch: string; expiresAt: number };
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
  cookie(name: 'session' | 'login', value: string, seconds: number) {
    return `__Host-dime-${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
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
    await this.repo.transaction(async (tx) => {
      const key = 'oauth:' + subject,
        old = await tx.get<Credential>(key),
        account = old?.account ?? randomUUID();
      if (!old)
        await tx.put<Account>('account:' + account, {
          id: account,
          player: 'ACCOUNT#v1#' + account,
          established: false,
          oauth: subject,
        });
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
        { account, subject, csrf, epoch, expiresAt: now + 8 * 3600000, idleUntil: now + 30 * 60000 },
        now + 8 * 3600000,
      );
    });
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
    const c = await tx.get<Credential>('oauth:' + s.subject);
    const grant = await tx.get<{ tokens: Tokens; epoch: string; expiresAt: number }>('grant:' + s.subject);
    if (!c || c.epoch !== s.epoch || !grant || grant.epoch !== s.epoch || grant.expiresAt <= now)
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
      if (!account) throw new WebAuthError();
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
    const a = await this.authorize(sid, mutation);
    const tokens = await this.repo.transaction(async (tx) => {
      const { c, tokens } = await this.checked(tx, a.session, mutation);
      await tx.put('oauth:' + a.subject, { account: c.account, epoch: randomUUID() });
      await tx.delete('session:' + a.session);
      await tx.delete('grant:' + a.subject);
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
      await tx.put<Link>(
        'link:' + digest(intent),
        { account: a.account, session: a.session, epoch: a.epoch, expiresAt },
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
      const key = 'link:' + digest(intent),
        link = await tx.get<Link>(key);
      if (!link || link.expiresAt <= this.clock()) throw new WebAuthError();
      const { s, c } = await this.checked(tx, link.session);
      if (s.epoch !== link.epoch || s.account !== link.account) throw new WebAuthError();
      const web = await tx.get<Account>('account:' + link.account);
      if (!web) throw new WebAuthError();
      const existing = await tx.get<string>('extension:' + extensionPlayer);
      const extensionState = await tx.get<VersionedContentState>('state:' + extensionPlayer);
      await tx.delete(key); // Conflicts consume the one-use intent without modifying saves.
      if (
        (web.extension && web.extension !== extensionPlayer) ||
        (existing && existing !== web.id) ||
        (web.established && extensionState && web.player !== extensionPlayer)
      )
        return false;
      if (extensionState && !web.established) {
        web.player = extensionPlayer;
        web.established = true;
      }
      web.extension = extensionPlayer;
      await tx.put('account:' + web.id, web);
      await tx.put('extension:' + extensionPlayer, web.id);
      await tx.put('oauth:' + s.subject, { account: c.account, epoch: randomUUID() });
      await tx.delete('grant:' + s.subject);
      return true;
    });
    if (!result) throw new WebAuthError(409);
    return { linked: true };
  }
  /** Atomic binding+progress guard. Both Extension and web handlers must use this store before enabling links. */
  gameStore(authorization: Authorized): Store<VersionedContentState> {
    const guard = async (tx: RecordTransaction) => {
      const { s } = await this.checked(tx, authorization.session);
      const account = await tx.get<Account>('account:' + authorization.account);
      if (s.epoch !== authorization.epoch || !account || account.player !== authorization.player)
        throw new WebAuthError();
      return account;
    };
    return this.boundStore(authorization.player, guard);
  }
  async extensionStore(extensionPlayer: string) {
    if (!/^PLAYER#v1#[a-f0-9]{64}$/.test(extensionPlayer)) throw new WebAuthError();
    const binding = await this.repo.transaction(async (tx) => {
      const id = await tx.get<string>('extension:' + extensionPlayer);
      const account = id ? await tx.get<Account>('account:' + id) : undefined;
      if (id && !account) throw new WebAuthError();
      return { id, player: account?.player ?? extensionPlayer };
    });
    const guard = async (tx: RecordTransaction) => {
      const id = await tx.get<string>('extension:' + extensionPlayer);
      if (id !== binding.id) throw new WebAuthError(409);
      const account = id ? await tx.get<Account>('account:' + id) : undefined;
      if (id && (!account || account.player !== binding.player)) throw new WebAuthError(409);
      return account;
    };
    return { player: binding.player, store: this.boundStore(binding.player, guard) };
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
