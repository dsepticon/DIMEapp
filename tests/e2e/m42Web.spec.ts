import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { originalInitialState } from '../../shared/originalGame';
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
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByText('Crew Ring Arrival', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    let checked = false;
    await page.route('**/auth/logout', (route) => {
      expect(route.request().headers()['x-dime-csrf']).toBe('synthetic-csrf');
      expect(route.request().headers().authorization).toBeUndefined();
      checked = true;
      return route.fulfill({ json: { signedOut: true } });
    });
    await page.screenshot({ path: `/tmp/dime-m41-release/web-${viewport.width}.png` });
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
  await page.getByRole('button', { name: 'PROFILE' }).click();
  await page.getByRole('button', { name: 'Create link code' }).click();
  await expect(page.getByLabel('One-use link code')).toHaveValue('s'.repeat(43));
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain(
    's'.repeat(43),
  );
});
