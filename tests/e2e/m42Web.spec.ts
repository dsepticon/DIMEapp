import { openOperations } from './m4Harness';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { originalInitialState } from '../../shared/originalGame';
test.beforeEach(async ({ page }) => {
  await page.route('**/auth/status', (route) =>
    route.fulfill({ json: { signInAvailable: true, linkingAvailable: true } }),
  );
});
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`standalone cookie session gameplay ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/auth/session', (route) =>
      route.fulfill({ json: { identity: 'synthetic-account', csrf: 'synthetic-csrf' } }),
    );
    const state = originalInitialState(randomUUID(), () => 0.5);
    await page.route('**/api/v4/state', (route) =>
      route.fulfill({ json: { state, serverTime: Date.now() } }),
    );
    await page.goto('/web-review.html');
    await openOperations(page);
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByText('Crew Ring Arrival', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width > 800) {
      await page.getByRole('button', { name: 'Hide touch controls (keyboard)' }).click();
      await page.getByRole('button', { name: 'Resume game' }).click();
      await expect(page.getByRole('button', { name: 'Walk right', exact: true })).toBeHidden();
      await page.locator('canvas').focus();
      const x = Number(await page.locator('canvas').getAttribute('data-player-x'));
      await page.keyboard.down('d');
      await page.waitForTimeout(150);
      await page.keyboard.up('d');
      expect(Number(await page.locator('canvas').getAttribute('data-player-x'))).toBeGreaterThan(x);
      await openOperations(page);
    }
    let checked = false;
    await page.route('**/auth/logout', (route) => {
      expect(route.request().headers()['x-dime-csrf']).toBe('synthetic-csrf');
      expect(route.request().headers().authorization).toBeUndefined();
      checked = true;
      return route.fulfill({ json: { signedOut: true } });
    });
    await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/web-${viewport.width}.png` });
    await openOperations(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in with Twitch' })).toBeVisible();
    expect(checked).toBe(true);
    const storage = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    );
    expect(storage).not.toContain('synthetic-csrf');
  });
}
test('standalone unauthenticated view shows sign-in and privacy links', async ({ page }) => {
  await page.route('**/auth/session', (route) =>
    route.fulfill({ status: 401, json: { message: 'Authentication could not be completed.' } }),
  );
  await page.goto('/web-review.html');
  await expect(page.getByRole('link', { name: 'Sign in with Twitch' })).toHaveAttribute(
    'href',
    '/auth/login',
  );
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    'https://destroyaindustriesminingextension.com/privacy',
  );
});

test('account-link capability stays in memory and requires explicit confirmation', async ({ page }) => {
  await page.route('**/auth/session', (route) =>
    route.fulfill({
      json: { identity: 'synthetic-account', csrf: 'synthetic-csrf', linkingAvailable: true },
    }),
  );
  await page.route('**/api/v4/state', (route) =>
    route.fulfill({ json: { state: originalInitialState(randomUUID(), () => 0.5), serverTime: Date.now() } }),
  );
  await page.route('**/auth/link/intent', (route) => {
    expect(route.request().headers()['x-dime-csrf']).toBe('synthetic-csrf');
    return route.fulfill({ json: { intent: 's'.repeat(43), expiresIn: 300 } });
  });
  await page.goto('/web-review.html');
  await openOperations(page);
  await page.getByRole('button', { name: 'PROFILE' }).click();
  await page.getByRole('button', { name: 'Create link code' }).click();
  await expect(page.getByLabel('One-use link code')).toHaveValue('s'.repeat(43));
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain(
    's'.repeat(43),
  );
});

for (const width of [360, 1280])
  test(`first login offers linking before creating any save ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 900 });
    let stateRequests = 0;
    await page.route('**/auth/session', (route) =>
      route.fulfill({
        json: {
          identity: 'synthetic-account',
          csrf: 'synthetic-csrf',
          linkingAvailable: true,
          profileExists: false,
        },
      }),
    );
    await page.route('**/api/v4/state', (route) => {
      stateRequests++;
      return route.fulfill({
        json: { state: originalInitialState(randomUUID(), () => 0.5), serverTime: Date.now() },
      });
    });
    await page.route('**/auth/link/intent', (route) =>
      route.fulfill({ json: { intent: 's'.repeat(43), expiresIn: 300 } }),
    );
    await page.goto('/web-review.html');
    await expect(page.getByRole('region', { name: 'Choose your DIME profile' })).toBeVisible();
    await page.getByRole('button', { name: 'Create link code' }).click();
    await expect(page.getByLabel('One-use link code')).toHaveValue('s'.repeat(43));
    expect(stateRequests).toBe(0);
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Start a new web profile instead' }).click();
    await expect(page.locator('canvas')).toBeVisible();
    expect(stateRequests).toBe(1);
  });

for (const width of [318, 360, 1280]) {
  test(`disabled sign-in is explicit and creates no session or save ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 318 ? 500 : 640 });
    await page.route('**/auth/status', (route) =>
      route.fulfill({ json: { signInAvailable: false, linkingAvailable: false } }),
    );
    const requests: string[] = [];
    page.on('request', (request) => {
      if (/\/(auth\/(session|login)|api\/v4\/)/.test(request.url())) requests.push(request.url());
    });
    await page.goto('/web-review.html');
    await expect(page.getByText('Web sign-in is not available yet', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Twitch' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/dime-m42-signin-review/disabled-${width}.png` });
  });
}
test('capability failure never infers sign-in availability', async ({ page }) => {
  await page.route('**/auth/status', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/web-review.html');
  await expect(page.getByText('Web sign-in is not available yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with Twitch' })).toHaveCount(0);
});
