import { test, expect } from '@playwright/test';
import { handler } from '../../server/webHandler';

for (const width of [318, 360, 1280]) {
  test(`invalid invitation never redirects or initializes dependencies ${width}`, async ({ browser }) => {
    const old = process.env.DIME_WEB_SIGN_IN_MODE;
    process.env.DIME_WEB_SIGN_IN_MODE = 'TESTERS';
    const context = await browser.newContext({
      viewport: { width, height: width === 318 ? 500 : 720 },
      hasTouch: width < 500,
    });
    try {
      const origin = 'https://synthetic-dime.invalid';
      const paths: string[] = [];
      await context.route(origin + '/**', async (route) => {
        const url = new URL(route.request().url());
        paths.push(url.pathname);
        const response = await handler({
          rawPath: url.pathname,
          rawQueryString: url.search.slice(1),
          requestContext: { http: { method: 'GET' } },
        });
        await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
      });
      const page = await context.newPage();
      for (const query of ['', '?invitation=', '?invitation=' + 'A'.repeat(200) + '.' + 'A'.repeat(43)]) {
        const response = await page.goto(origin + '/auth/login' + query);
        expect(response?.status()).toBe(401);
        expect(await page.textContent('body')).toContain('Authentication could not be completed.');
        expect(page.url()).toBe(origin + '/auth/login' + query);
      }
      expect(paths).toEqual(['/auth/login', '/auth/login', '/auth/login']);
      expect(await context.cookies()).toEqual([]);
      expect(
        await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
      ).toEqual({ local: 0, session: 0 });
    } finally {
      await context.close();
      if (old === undefined) delete process.env.DIME_WEB_SIGN_IN_MODE;
      else process.env.DIME_WEB_SIGN_IN_MODE = old;
    }
  });
}
