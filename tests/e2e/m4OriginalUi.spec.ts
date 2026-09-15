import { openOperations } from './m4Harness';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { originalInitialState } from '../../shared/originalGame';
import { populateOriginalZone, scanOriginalZone, analyzeOriginalNode } from '../../shared/originalDiscovery';
for (const layout of [
  { name: 'panel', width: 318, height: 500 },
  { name: 'mobile', width: 360, height: 640 },
  { name: 'desktop', width: 1024, height: 768 },
])
  test(`original production presentation: ${layout.name}`, async ({ page }) => {
    await page.setViewportSize(layout);
    await page.addInitScript(() => {
      const target = window as Window & {
        Twitch?: {
          ext: {
            onAuthorized(cb: (auth: { token: string; userId: string; channelId: string }) => void): void;
            onError(): void;
          };
        };
      };
      target.Twitch = {
        ext: {
          onAuthorized(cb) {
            queueMicrotask(() => cb({ token: 'synthetic', userId: 'U-original-ui', channelId: 'synthetic' }));
          },
          onError() {},
        },
      };
    });
    let state = originalInitialState(randomUUID(), () => 0.5);
    state.location = 'loc.l002';
    state.world.zone = 'zone.z014';
    state = populateOriginalZone(state);
    state = scanOriginalZone(state);
    state = analyzeOriginalNode(state, Object.keys(state.world.nodes)[0]!);
    await page.route('http://127.0.0.1:8787/v4/state', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state, serverTime: Date.now() }),
      }),
    );
    await page.goto('/original-review.html');
    await expect(page.getByText('Loam Survey Terrace')).toBeVisible();
    await openOperations(page);
    await expect(page.getByText('MODE: LASER')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(layout.height);
    await openOperations(page);
    await page.getByRole('button', { name: 'PROFILE' }).click();
    await expect(page.getByText('About DIME')).toBeVisible();
    const input = page.getByRole('textbox');
    await input.fill('RESET MY DIME PROFILE');
    await input.press('Enter');
    await expect(page.getByRole('button', { name: 'Reset All My Game Progress' })).toBeVisible();
    await page.screenshot({ path: `/tmp/dime-m4-original-review/m4-original-${layout.name}.png` });
  });
