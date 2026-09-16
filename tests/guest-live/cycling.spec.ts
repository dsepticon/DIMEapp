import { test, expect } from '@playwright/test';
import { journey } from './journey';
for (const touch of [false, true]) {
  test(`public target cycling ${touch ? 'touch' : 'keyboard'}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: touch ? { width: 360, height: 640 } : { width: 1280, height: 900 },
      hasTouch: touch,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', () => errors.push('page error'));
    page.on('request', (request) => {
      if (request.method() !== 'GET' || request.headers().authorization) errors.push('unexpected request');
    });
    await page.goto('https://destroyaindustriesminingextension.com/game/');
    await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z001');
    await journey(page, touch, touch ? 360 : 1280, true);
    expect(errors).toEqual([]);
    await context.close();
  });
}
