import { expect, it } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { TwitchOAuth } from '../server/twitchOAuth';
const client = 'synthetic-oauth-client',
  now = 1_800_000_000_000,
  redirect = 'https://destroyaindustriesminingextension.com/auth/callback';
async function fixture(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const id = await new SignJWT({ nonce: 'nonce', ...overrides })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://id.twitch.tv/oauth2')
    .setAudience(client)
    .setSubject('12345')
    .setIssuedAt(now / 1000)
    .setExpirationTime(now / 1000 + 300)
    .sign(privateKey);
  const calls: { url: string; body: string }[] = [];
  let revoked = false;
  const request: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body ?? '') });
    if (url.endsWith('/token'))
      return Response.json({
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        expires_in: 3600,
        id_token: id,
      });
    if (url.endsWith('/validate'))
      return revoked
        ? new Response('', { status: 401 })
        : Response.json({ client_id: client, user_id: '12345', expires_in: 3600, scopes: ['openid'] });
    return new Response('');
  };
  return {
    provider: new TwitchOAuth(
      client,
      'synthetic-secret',
      redirect,
      request,
      () => now,
      async () => publicKey,
    ),
    calls,
    revoke: () => {
      revoked = true;
    },
  };
}
it('requests only openid and verifies the signed ID token plus access-token subject', async () => {
  const f = await fixture(),
    url = new URL(f.provider.authorize('state', 'nonce'));
  expect(url.searchParams.get('scope')).toBe('openid');
  expect(url.searchParams.get('response_type')).toBe('code');
  const value = await f.provider.exchange('synthetic-code', 'nonce');
  expect(value.subject).toBe('12345');
  expect(f.calls.every((c) => !c.url.includes('synthetic-secret') && !c.url.includes('synthetic-code'))).toBe(
    true,
  );
  expect(f.calls[0]!.body).toContain('grant_type=authorization_code');
});
it('rejects nonce mismatch without exposing the upstream response', async () => {
  const f = await fixture({ nonce: 'wrong' });
  await expect(f.provider.exchange('code', 'nonce')).rejects.toThrow(
    'Authentication could not be completed.',
  );
});
it('refreshes expired tokens server-side and validates the result', async () => {
  const f = await fixture();
  await f.provider.validate({ access: 'expired', refresh: 'synthetic-refresh', expiresAt: now - 1 });
  expect(f.calls[0]!.body).toContain('grant_type=refresh_token');
  expect(f.calls[1]!.url).toContain('/validate');
});
it('rejects revocation without refreshing a still-valid token', async () => {
  const f = await fixture();
  f.revoke();
  await expect(
    f.provider.validate({ access: 'revoked', refresh: 'synthetic-refresh', expiresAt: now + 3600000 }),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]!.url).toContain('/validate');
});
it('rejects Extension client credentials and unsafe callback URLs', () => {
  expect(() => new TwitchOAuth('znaovl2j45idub9k81om1dkatwxnu2', 'synthetic', redirect)).toThrow();
  expect(() => new TwitchOAuth(client, 'synthetic', 'http://example.com/auth/callback')).toThrow();
});
it('revocation retry accepts only the documented invalid-token response', async () => {
  const tokens = { access: 'synthetic', refresh: 'synthetic', expiresAt: now };
  for (const [status, message, accepted] of [
    [400, 'Invalid token', true],
    [400, 'Other failure', false],
    [404, 'client does not exist', false],
    [503, 'Unavailable', false],
  ] as const) {
    const provider = new TwitchOAuth(client, 'synthetic-secret', redirect, async () =>
      Response.json({ message }, { status }),
    );
    if (accepted) await expect(provider.revoke(tokens)).resolves.toBeUndefined();
    else await expect(provider.revoke(tokens)).rejects.toThrow();
  }
});
it('revokes an issued provider token if subsequent validation fails, without issuing local credentials', async () => {
  const f = await fixture();
  f.revoke();
  await expect(f.provider.exchange('synthetic-code', 'nonce')).rejects.toThrow(
    'Authentication could not be completed.',
  );
  expect(f.calls.some((c) => c.url.endsWith('/revoke'))).toBe(true);
});
