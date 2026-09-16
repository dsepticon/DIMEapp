import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { WebAuthError, type IdentityProvider, type Tokens } from './webAuth';
const issuer = 'https://id.twitch.tv/oauth2';
const tokenSchema = z.object({
  access_token: z.string().min(1).max(8192),
  refresh_token: z.string().min(1).max(8192),
  expires_in: z.number().int().positive(),
  id_token: z.string().optional(),
});
const validationSchema = z.object({
  client_id: z.string(),
  user_id: z.string().regex(/^\d+$/),
  expires_in: z.number().int().nonnegative(),
  scopes: z.array(z.string()),
});
export class TwitchOAuth implements IdentityProvider {
  private keys: JWTVerifyGetKey;
  constructor(
    private clientId: string,
    private clientSecret: string,
    private redirect: string,
    private request: typeof fetch = fetch,
    private clock: () => number = Date.now,
    keys?: JWTVerifyGetKey,
  ) {
    const url = new URL(redirect);
    if (
      !clientId ||
      clientId === 'znaovl2j45idub9k81om1dkatwxnu2' ||
      !clientSecret ||
      url.protocol !== 'https:' ||
      url.search ||
      url.hash ||
      url.pathname !== '/auth/callback'
    )
      throw new Error('Invalid OAuth configuration.');
    this.keys = keys ?? createRemoteJWKSet(new URL(issuer + '/keys'));
  }
  authorize(state: string, nonce: string) {
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirect,
      response_type: 'code',
      scope: 'openid',
      state,
      nonce,
    });
    return issuer + '/authorize?' + query;
  }
  private async post(path: string, body: Record<string, string>) {
    const response = await this.request(issuer + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new WebAuthError();
    return response;
  }
  private tokens(value: z.infer<typeof tokenSchema>): Tokens {
    return {
      access: value.access_token,
      refresh: value.refresh_token,
      expiresAt: this.clock() + value.expires_in * 1000,
    };
  }
  async exchange(code: string, nonce: string) {
    try {
      const response = await this.post('/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirect,
        grant_type: 'authorization_code',
        code,
      });
      const value = tokenSchema.parse(await response.json());
      if (!value.id_token) throw new WebAuthError();
      const { payload } = await jwtVerify(value.id_token, this.keys, {
        algorithms: ['RS256'],
        issuer,
        audience: this.clientId,
        requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
        currentDate: new Date(this.clock()),
        maxTokenAge: '10m',
      });
      if (
        payload.nonce !== nonce ||
        typeof payload.sub !== 'string' ||
        !/^\d+$/.test(payload.sub) ||
        (payload.azp && payload.azp !== this.clientId)
      )
        throw new WebAuthError();
      if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== this.clientId)
        throw new WebAuthError();
      if (
        payload.at_hash !== undefined &&
        payload.at_hash !==
          createHash('sha256').update(value.access_token).digest().subarray(0, 16).toString('base64url')
      )
        throw new WebAuthError();
      const checked = await this.validate(this.tokens(value));
      if (checked.subject !== payload.sub) throw new WebAuthError();
      return checked;
    } catch {
      throw new WebAuthError();
    }
  }
  async validate(tokens: Tokens) {
    try {
      let current = tokens;
      // Refresh only an expired token; a revoked, unexpired token must terminate sessions.
      if (current.expiresAt <= this.clock() + 30000) {
        const response = await this.post('/token', {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: current.refresh,
        });
        current = this.tokens(tokenSchema.parse(await response.json()));
      }
      const response = await this.request(issuer + '/validate', {
        headers: { Authorization: 'OAuth ' + current.access },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) throw new WebAuthError();
      const value = validationSchema.parse(await response.json());
      if (
        value.client_id !== this.clientId ||
        value.expires_in <= 0 ||
        value.scopes.some((s) => s !== 'openid')
      )
        throw new WebAuthError();
      return {
        subject: value.user_id,
        tokens: { ...current, expiresAt: this.clock() + value.expires_in * 1000 },
      };
    } catch {
      throw new WebAuthError();
    }
  }
  async revoke(tokens: Tokens) {
    const response = await this.request(issuer + '/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, token: tokens.access }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (response.ok) return;
    // A retry after successful revocation can return the documented already-invalid token response.
    if (response.status === 400) {
      const value: unknown = await response.json();
      if (
        typeof value === 'object' &&
        value !== null &&
        'message' in value &&
        value.message === 'Invalid token'
      )
        return;
    }
    throw new WebAuthError();
  }
}
