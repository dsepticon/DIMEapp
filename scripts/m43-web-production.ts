/** Production web verification with HTTPS and synthetic, server-held identity only. */
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { WebAuth, MemoryAuthRepository, type IdentityProvider } from '../server/webAuth';
import { createAccountApi } from '../server/accountApi';
const origin = 'https://destroyaindustriesminingextension.com';
const build = process.env.DIME_WEB_BUILD ?? '/tmp/dime-m43-release/web-build';
const output = process.env.DIME_WEB_REPORT ?? '/tmp/dime-m43-release/web-production.json';
const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of [
    { width: 318, height: 500 },
    { width: 360, height: 640 },
    { width: 1280, height: 900 },
  ]) {
    const repo = new MemoryAuthRepository();
    const provider: IdentityProvider = {
      authorize: (state, nonce) =>
        'https://id.twitch.tv/oauth2/authorize?' + new URLSearchParams({ state, nonce }),
      exchange: async () => ({
        subject: '123456',
        tokens: { access: 'synthetic-access', refresh: 'synthetic-refresh', expiresAt: Date.now() + 3600000 },
      }),
      validate: async (tokens) => ({ subject: '123456', tokens }),
      revoke: async () => {},
    };
    const auth = new WebAuth(repo, provider, new Uint8Array(32).fill(5), origin);
    const begin = await auth.begin();
    const result = await auth.callback(
      'synthetic-code',
      new URL(begin.location).searchParams.get('state')!,
      begin.cookie.split(';')[0]!.split('=')[1]!,
    );
    const sid = result.cookie.split(';')[0]!.split('=')[1]!;
    const api = createAccountApi(
      auth,
      {
        origins: ['https://synthetic.ext-twitch.tv'],
        authorize: async () => {
          throw Error('Unused');
        },
        linkingEnabled: true,
      },
      { mode: 'ENABLED', testerCount: 0, permits: () => true },
    );
    const context = await browser.newContext({ viewport });
    await context.addCookies([
      { name: '__Host-dime-session', value: sid, url: origin, secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    const page = await context.newPage();
    const errors: string[] = [];
    let mutations = 0;
    page.on('pageerror', () => errors.push('pageerror'));
    page.on('requestfailed', () => errors.push('requestfailed'));
    await page.route(origin + '/**', async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) {
        if (req.method() === 'POST') mutations++;
        const response = await api({
          method: req.method(),
          path: url.pathname + url.search,
          headers: await req.allHeaders(),
          body: req.postData() ?? undefined,
        });
        await route.fulfill({
          status: response.statusCode,
          headers: {
            ...response.headers,
            ...(response.cookies ? { 'set-cookie': response.cookies.join('\n') } : {}),
          },
          body: response.body,
        });
        return;
      }
      const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (path.includes('..') || !/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)) {
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      await route.fulfill({
        body: await readFile(join(build, path)),
        contentType: (
          { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' } as Record<
            string,
            string
          >
        )[extname(path)],
      });
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    const canvas = page.locator('canvas');
    await canvas.waitFor();
    const x = Number(await canvas.getAttribute('data-player-x'));
    await page.keyboard.down('d');
    await page.waitForTimeout(200);
    await page.keyboard.up('d');
    const moved = Number(await canvas.getAttribute('data-player-x')) > x;
    if (!moved || mutations !== 0) throw Error('Production web walking failed');
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await page.getByRole('button', { name: 'Create link code', exact: true }).click();
    if ((await page.getByLabel('One-use link code').inputValue()).length !== 43)
      throw Error('Link intent unavailable');
    await page.screenshot({
      path: `/tmp/dime-m43-release/screenshots/web-production-profile-${viewport.width}.png`,
      mask: [page.getByLabel('One-use link code')],
    });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.reload();
    await canvas.waitFor();
    await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/web-production-${viewport.width}.png` });
    const safety = await page.evaluate(() => ({
      dom: document.querySelectorAll('*').length,
      canvas: document.querySelectorAll('canvas').length,
      noScroll:
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
      noCredentialStorage: !/synthetic-access|synthetic-refresh|csrf/i.test(
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
      noReadableSessionCookie: !document.cookie.includes('__Host-dime-session'),
      cleanUrl: !location.search && !location.hash,
    }));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('link', { name: 'Sign in with Twitch', exact: true }).waitFor();
    if (
      !safety.noScroll ||
      !safety.noCredentialStorage ||
      !safety.noReadableSessionCookie ||
      !safety.cleanUrl ||
      errors.length ||
      safety.canvas !== 1
    )
      throw Error('Production web safety check failed');
    results.push({ viewport, moved, safety, linkIntentCreated: true, signedOut: true, errors });
    await context.close();
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        results,
        limitation:
          'Compiled production web UI and real in-memory auth/game services. Synthetic provider; actual Twitch OAuth and CloudFront remain unverified.',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
