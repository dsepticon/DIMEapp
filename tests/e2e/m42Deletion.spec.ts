import { test, expect } from '@playwright/test';
import { WebAuth, MemoryAuthRepository, opaque, type IdentityProvider } from '../../server/webAuth';
import { createWebApi } from '../../server/webHttp';
const origin = 'https://destroyaindustriesminingextension.com';
for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
  ['desktop', 1280, 800],
] as const) {
  test(`${layout}: browser cookie/CSRF deletion protocol resumes after session revocation`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height });
    const tokens = {
      access: 'synthetic-access',
      refresh: 'synthetic-refresh',
      expiresAt: Date.now() + 3600000,
    };
    const provider: IdentityProvider = {
      authorize: (state, nonce) => origin + '/?' + new URLSearchParams({ state, nonce }),
      exchange: async () => ({ subject: 'synthetic', tokens }),
      validate: async () => ({ subject: 'synthetic', tokens }),
      revoke: async () => {},
    };
    const auth = new WebAuth(new MemoryAuthRepository(), provider, new Uint8Array(32).fill(8), origin);
    const login = await auth.begin();
    const callback = await auth.callback(
      'synthetic',
      new URL(login.location).searchParams.get('state')!,
      login.cookie.split(';')[0]!.split('=')[1]!,
    );
    await context.addCookies([
      {
        name: '__Host-dime-session',
        value: callback.cookie.split(';')[0]!.split('=')[1]!,
        url: origin,
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const api = createWebApi(auth, {
      authorize: async () => {
        throw Error('unused');
      },
      origins: [],
      linkingEnabled: true,
    });
    await page.route(origin + '/**', async (route) => {
      if (new URL(route.request().url()).pathname === '/')
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Synthetic same-origin account protocol</title><main>Account verification</main>',
        });
      const r = await api({
        method: route.request().method(),
        path: new URL(route.request().url()).pathname,
        headers: await route.request().allHeaders(),
        body: route.request().postData() ?? undefined,
      });
      await route.fulfill({
        status: r.statusCode,
        headers: { ...r.headers, ...(r.cookies?.[0] ? { 'set-cookie': r.cookies[0] } : {}) },
        body: r.body,
      });
    });
    await page.goto(origin);
    expect(await page.evaluate(() => document.cookie)).not.toContain('dime-session');
    const cap = opaque();
    const result = await page.evaluate(async (capability) => {
      const session = (await (await fetch('/auth/session')).json()) as { identity: string; csrf: string };
      const post = async (path: string, body: unknown, csrf = session.csrf) =>
        fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-dime-csrf': csrf },
          body: JSON.stringify(body),
        });
      const denied = await post(
        '/auth/delete/intent',
        { confirmation: 'DELETE_ACCOUNT', capability },
        'wrong',
      );
      const started = await post('/auth/delete/intent', { confirmation: 'DELETE_ACCOUNT', capability });
      const blocked = await fetch('/auth/session');
      return {
        denied: denied.status,
        started: started.status,
        blocked: blocked.status,
        account: session.identity,
      };
    }, cap);
    expect(await page.evaluate(() => document.cookie)).not.toContain('dime-deletion');
    await page.reload();
    const statuses = await page.evaluate(
      async ({ account, capability }) => {
        const values: string[] = [];
        for (let i = 0; i < 4; i++) {
          const r = await fetch('/auth/delete/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(i < 3 ? {} : { account, capability }),
          });
          values.push((await r.json()).status);
        }
        return values;
      },
      { account: result.account, capability: cap },
    );
    expect(result.denied).toBe(403);
    expect(result.started).toBe(200);
    expect(result.blocked).not.toBe(200);
    expect(statuses).toEqual(['REVOKED', 'PURGED', 'COMPLETE', 'COMPLETE']);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
}
