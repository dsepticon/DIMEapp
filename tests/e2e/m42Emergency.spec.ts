import { test, expect } from '@playwright/test';
import { WebAuth, MemoryAuthRepository, type IdentityProvider } from '../../server/webAuth';
import { createWebApi } from '../../server/webHttp';
const origin = 'https://destroyaindustriesminingextension.com';
for (const [width, height] of [
  [318, 500],
  [360, 640],
  [1280, 800],
]) {
  test(`disabled logout and rejected deletion proof at ${width}x${height}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    const tokens = { access: 'synthetic', refresh: 'synthetic', expiresAt: Date.now() + 3600000 };
    const provider: IdentityProvider = {
      authorize: (state) => origin + '/?' + new URLSearchParams({ state }),
      exchange: async () => ({ subject: 'synthetic', tokens }),
      validate: async () => ({ subject: 'synthetic', tokens }),
      revoke: async () => {},
    };
    const auth = new WebAuth(new MemoryAuthRepository(), provider, new Uint8Array(32).fill(7), origin);
    const start = await auth.begin();
    const cb = await auth.callback(
      'synthetic',
      new URL(start.location).searchParams.get('state')!,
      start.cookie.split(';')[0]!.split('=')[1]!,
    );
    const sid = cb.cookie.split(';')[0]!.split('=')[1]!;
    const session = await auth.authorize(sid);
    await context.addCookies([
      { name: '__Host-dime-session', value: sid, url: origin, secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    const api = createWebApi(auth, undefined, undefined, () => 'DISABLED');
    await page.route(origin + '/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/')
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><main>Emergency protocol test</main>',
        });
      const r = await api({
        method: route.request().method(),
        path,
        headers: await route.request().allHeaders(),
        body: route.request().postData() ?? undefined,
      });
      await route.fulfill({
        status: r.statusCode,
        body: r.body,
        headers: { ...r.headers, ...(r.cookies?.length ? { 'set-cookie': r.cookies.join('\n') } : {}) },
      });
    });
    await page.goto(origin);
    const result = await page.evaluate(async (csrf) => {
      const post = (path: string) =>
        fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-dime-csrf': csrf },
          body: '{}',
        });
      const first = await post('/auth/logout');
      const repeated = await post('/auth/logout');
      const deletion = await post('/auth/delete/resume');
      return {
        first: first.status,
        repeated: repeated.status,
        deletion: deletion.status,
        body: await first.json(),
        login: (await fetch('/auth/login')).status,
        callback: (await fetch('/auth/callback')).status,
      };
    }, session.csrf);
    expect(result).toEqual({
      first: 200,
      repeated: 200,
      deletion: 401,
      body: { signedOut: true },
      login: 503,
      callback: 503,
    });
    expect((await context.cookies()).filter((c) => c.name.startsWith('__Host-dime-'))).toEqual([]);
    await page.reload();
    expect(await page.evaluate(async () => (await fetch('/auth/logout', { method: 'POST' })).status)).toBe(
      200,
    );
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
}
