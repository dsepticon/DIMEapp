import { test, expect } from '@playwright/test';
import { originalInitialState } from '../../shared/originalGame';
import { originalZoneMap } from '../../shared/originalWorld';
import { populateOriginalZone } from '../../shared/originalDiscovery';
import { nodeInteractionTiles } from '../../shared/originalNodePlacement';
import { setup, walkTo } from './m4Harness';
import { mkdirSync, writeFileSync } from 'node:fs';
for (const layout of [
  { name: 'panel', width: 318, height: 500, file: 'panel.html' },
  { name: 'mobile', width: 360, height: 640, file: 'mobile.html' },
  { name: 'desktop', width: 1280, height: 900, file: 'index.html' },
]) {
  test(`${layout.name}: world viewport, hit areas, paused menu and idle recovery`, async ({ page }) => {
    await page.setViewportSize(layout);
    const fixture = await setup(page);
    if (layout.name === 'panel')
      await page.route('**/panel.html', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), 'Permissions-Policy': 'gamepad=()' },
        });
      });
    await page.goto('/' + layout.file);
    await expect(page.locator('canvas')).toHaveAttribute('data-player-x', /\d/);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const rects = Array.from(
        document.querySelectorAll(
          'button, .place, .objective, .nodeTargetStatus, .charge, .fragmentPrompt, .miningConsole > small, .miningOutcome, .vacuumFeedback',
        ),
      )
        .filter((el) => el.getClientRects().length)
        .map((el) => el.getBoundingClientRect());
      let covered = 0;
      for (let y = 0; y < innerHeight; y++)
        for (let x = 0; x < innerWidth; x++) {
          if (rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) covered++;
        }
      return {
        width: canvas.width,
        height: canvas.height,
        unobstructed: 100 * (1 - covered / (innerWidth * innerHeight)),
        coveredPixels: covered,
      };
    });
    expect(result.width).toBe(layout.width);
    expect(result.height).toBe(layout.height);
    expect(result.unobstructed).toBeGreaterThanOrEqual(80);
    for (const direction of ['up', 'down', 'left', 'right']) {
      const box = await page.getByRole('button', { name: 'Walk ' + direction, exact: true }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    mkdirSync('/tmp/dime-m43-world-ui/screenshots', { recursive: true });
    await page.screenshot({ path: `/tmp/dime-m43-world-ui/screenshots/after-${layout.name}.png` });
    writeFileSync(`/tmp/dime-m43-world-ui/visibility-${layout.name}.json`, JSON.stringify(result, null, 2));
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-paused', 'true');
    await page.locator('.gameSheet footer').scrollIntoViewIfNeeded();
    const closeMenu = page.getByRole('button', { name: 'Menu', exact: true });
    const closeBox = (await closeMenu.boundingBox())!;
    expect(closeBox.y).toBeGreaterThanOrEqual(0);
    expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(layout.height);
    await closeMenu.click();
    await expect(page.locator('canvas')).toHaveAttribute('data-paused', 'false');
    await closeMenu.click();
    await page.keyboard.press('Escape');
    await expect(page.locator('canvas')).toHaveAttribute('data-paused', 'false');
    await page.waitForTimeout(4800);
    await expect(page.locator('main')).toHaveAttribute('data-idle', 'true');
    if (layout.name === 'mobile') {
      await page.evaluate(() =>
        Object.defineProperty(navigator, 'getGamepads', {
          configurable: true,
          value: () => [{ buttons: [{ pressed: true }], axes: [0, 0] }],
        }),
      );
      await expect(page.locator('main')).toHaveAttribute('data-idle', 'false');
      expect(await page.locator('.walkingControls').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      await page.evaluate(() => {
        delete (navigator as unknown as Record<string, unknown>).getGamepads;
      });
      await page.waitForTimeout(4800);
      await expect(page.locator('main')).toHaveAttribute('data-idle', 'true');
    }
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('main')).toHaveAttribute('data-idle', 'false');
    expect(await page.locator('.walkingControls').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    await page.locator('main').evaluate((el) => {
      el.style.setProperty('--safe-top', '24px');
      el.style.setProperty('--safe-bottom', '20px');
      el.style.setProperty('--safe-left', '12px');
      el.style.setProperty('--safe-right', '12px');
    });
    const down = await page.getByRole('button', { name: 'Walk down', exact: true }).boundingBox();
    expect(down!.y + down!.height).toBeLessThanOrEqual(layout.height - 20);
    const menu = await page.getByRole('button', { name: 'Menu', exact: true }).boundingBox();
    expect(menu!.y).toBeGreaterThanOrEqual(24);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(layout.width - 12);
    expect(fixture.posts).toHaveLength(0);
    expect(fixture.errors).toEqual([]);
  });
}

for (const layout of [
  { name: 'panel', width: 318, height: 500, file: 'panel.html' },
  { name: 'mobile', width: 360, height: 640, file: 'mobile.html' },
]) {
  test(`${layout.name}: contextual mining uses separate simultaneous touch targets`, async ({ page }) => {
    await page.setViewportSize(layout);
    const f = await setup(page),
      s = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5),
      map = originalZoneMap('zone.z014');
    s.location = 'loc.l002';
    s.world.zone = map.id;
    const generated = populateOriginalZone(s);
    const node = Object.values(generated.world.nodes)[0]!;
    f.store.states.set('synthetic-walking', generated);
    await page.goto('/' + layout.file);
    await page.locator('canvas[data-player-x]').waitFor();
    const tile = nodeInteractionTiles(map.id, node)[0]!;
    await walkTo(page, map, tile);
    const key = node.x < tile.x ? 'a' : node.x > tile.x ? 'd' : node.y < tile.y ? 'w' : 's';
    await page.keyboard.down(key);
    await page.waitForTimeout(100);
    await page.keyboard.up(key);
    await page.getByRole('button', { name: 'Hold Analyze (F)', exact: true }).focus();
    await page.keyboard.down('f');
    await expect(page.getByRole('button', { name: 'Target node', exact: true })).toBeVisible();
    await page.keyboard.up('f');
    await page.getByRole('button', { name: 'Target node', exact: true }).click();
    const laser = page.getByRole('button', { name: 'Hold laser · release to cool', exact: true });
    await expect(laser).toBeVisible();
    const a = (await laser.boundingBox())!,
      b = (await page.getByRole('button', { name: 'Walk left', exact: true }).boundingBox())!;
    expect(a.x).toBeGreaterThan(b.x + b.width);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: a.x + a.width / 2, y: a.y + a.height / 2 },
        { id: 2, x: b.x + b.width / 2, y: b.y + b.height / 2 },
      ],
    });
    await expect
      .poll(async () =>
        Number(await page.getByRole('meter', { name: 'Node charge' }).getAttribute('aria-valuenow')),
      )
      .toBeGreaterThan(0);
    await page.screenshot({ path: `/tmp/dime-m43-world-ui/screenshots/after-${layout.name}-laser.png` });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const charge = Number(
      await page.getByRole('meter', { name: 'Node charge' }).getAttribute('aria-valuenow'),
    );
    await expect
      .poll(async () =>
        Number(await page.getByRole('meter', { name: 'Node charge' }).getAttribute('aria-valuenow')),
      )
      .toBeLessThan(charge);
    await cdp.detach();
    expect(f.errors).toEqual([]);
  });
}
