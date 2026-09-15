import { test, expect } from '@playwright/test';
import { setup } from './m4Harness';
import { originalInitialState } from '../../shared/originalGame';
import { populateOriginalZone } from '../../shared/originalDiscovery';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import { originalZoneMap } from '../../shared/originalWorld';
for (const layout of [
  { name: 'panel', width: 318, height: 500, file: 'panel.html' },
  { name: 'mobile', width: 360, height: 640, file: 'mobile.html' },
  { name: 'desktop', width: 1280, height: 900, file: 'index.html' },
]) {
  test(`visual atlas: all playable zones, ${layout.name}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize(layout);
    const f = await setup(page);
    for (const zone of ORIGINAL_CONTENT.zones) {
      let state = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5);
      state.location = zone.location;
      state.world.zone = zone.id;
      state = populateOriginalZone(state);
      f.store.states.set('synthetic-walking', state);
      await page.goto('/' + layout.file);
      const canvas = page.locator('canvas');
      await expect(canvas).toHaveAttribute('data-art-system', 'destroya-16bit-v1');
      const geometry = await canvas.evaluate((c) => ({
        x: Number(c.dataset.cameraX),
        y: Number(c.dataset.cameraY),
        scale: Number(c.dataset.cameraScale),
        width: c.getBoundingClientRect().width,
        height: c.getBoundingClientRect().height,
      }));
      const map = originalZoneMap(zone.id);
      expect(geometry.x + geometry.width / geometry.scale).toBeLessThanOrEqual(map.width + 0.01);
      expect(geometry.y + geometry.height / geometry.scale).toBeLessThanOrEqual(map.height + 0.01);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight <= innerHeight &&
            document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/${layout.name}-${zone.id}.png` });
    }
    expect(f.errors).toEqual([]);
    expect(f.posts).toHaveLength(0);
  });
  test(`accessible render and four-direction controls, ${layout.name}`, async ({ page }) => {
    await page.setViewportSize(layout);
    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    const f = await setup(page);
    await page.goto('/' + layout.file);
    const c = page.locator('canvas');
    await expect(c).toHaveAttribute('data-art-system', 'destroya-16bit-v1');
    for (const [key, facing] of [
      ['w', 'N'],
      ['s', 'S'],
      ['a', 'W'],
      ['d', 'E'],
    ]) {
      await page.keyboard.down(key!);
      await page.waitForTimeout(180);
      await page.keyboard.up(key!);
      await expect(c).toHaveAttribute('data-facing', facing!);
      await page.screenshot({
        path: `/tmp/dime-m43-release/screenshots/${layout.name}-direction-${facing}.png`,
      });
    }
    expect(f.posts).toHaveLength(0);
    expect(f.errors).toEqual([]);
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await page.screenshot({
      path: `/tmp/dime-m43-release/screenshots/${layout.name}-profile-high-contrast.png`,
    });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  });
}
