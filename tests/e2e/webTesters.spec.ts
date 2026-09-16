import { test, expect } from '@playwright/test';
import { WebAuth, MemoryAuthRepository } from '../../server/webAuth';
import { mintTesterInvitation } from '../../server/testerInvitation';
import { createWebApi } from '../../server/webHttp';
const origin = 'https://destroyaindustriesminingextension.com';
for (const width of [318, 360, 1280]) {
  test(`invited tester isolated session and logout ${width}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: width === 318 ? 500 : 720 },
      hasTouch: width < 500,
    });
    const repo = new MemoryAuthRepository(),
      key = new Uint8Array(32).fill(81);
    const tokens = {
      access: 'synthetic-provider-access',
      refresh: 'synthetic-provider-refresh',
      expiresAt: Date.now() + 3600000,
    };
    const auth = new WebAuth(
      repo,
      {
        authorize: (state) => 'https://synthetic-provider.invalid/authorize?state=' + state,
        exchange: async () => ({ subject: '123456', tokens }),
        validate: async () => ({ subject: '123456', tokens }),
        revoke: async () => {},
      },
      key,
      origin,
    );
    const api = createWebApi(
      auth,
      {
        linkingEnabled: false,
        origins: [],
        authorize: async () => {
          throw Error('Forbidden');
        },
      },
      undefined,
      () => 'TESTERS',
    );
    await context.route(origin + '/**', async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      const response = await api({
        method: req.method(),
        path: u.pathname + u.search,
        headers: await req.allHeaders(),
        body: req.postData() ?? undefined,
      });
      await route.fulfill({
        // Playwright routes do not intercept subsequent HTTP redirect hops.
        // Follow each synthetic redirect as a fresh browser navigation; real 303 semantics are unit-tested.
        status: response.statusCode === 303 ? 200 : response.statusCode,
        headers: {
          ...response.headers,
          ...(response.statusCode === 303 ? { 'Content-Type': 'text/html' } : {}),
          ...(response.cookies ? { 'set-cookie': response.cookies.join('\n') } : {}),
        },
        body:
          response.statusCode === 303
            ? `<script>location.replace(${JSON.stringify(response.headers.Location)})</script>`
            : response.body,
      });
    });
    await context.route('https://synthetic-provider.invalid/**', async (route) => {
      const state = new URL(route.request().url()).searchParams.get('state')!;
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<script>location.replace(${JSON.stringify(origin + '/auth/callback?code=synthetic-code&state=' + state)})</script>`,
      });
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', () => errors.push('page error'));
    const invitation = mintTesterInvitation(key, '123456').invitation;
    await page.goto(origin + '/auth/login?invitation=' + invitation);
    await expect(page.getByRole('heading', { name: 'Tester signed in' })).toBeVisible();
    expect(page.url()).toBe(origin + '/auth/session?view=tester');
    await expect(page.getByText(/Shared-save linking is not enabled/)).toBeVisible();
    expect(
      await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
    ).toEqual({ local: 0, session: 0 });
    const sessionCookie = (await context.cookies()).find((c) => c.name === '__Host-dime-session')!;
    expect(sessionCookie.httpOnly && sessionCookie.secure).toBe(true);
    expect((await context.cookies()).some((c) => c.name === '__Host-dime-login')).toBe(false);
    const session = await auth.authorize(sessionCookie.value);
    expect(await repo.transaction((tx) => tx.get('state:' + session.player))).toBeUndefined();
    const blocked = await page.evaluate(async () => (await fetch('/api/v4/state')).status);
    expect(blocked).toBe(403);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('status')).toHaveText('Signed out.');
    expect((await context.cookies()).some((c) => c.name === '__Host-dime-session')).toBe(false);
    await expect(auth.authorize(sessionCookie.value)).rejects.toThrow();
    expect(errors).toEqual([]);
    await context.close();
  });
}
