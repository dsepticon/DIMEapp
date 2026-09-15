import { openOperations } from './m4Harness';
import { test, expect } from '@playwright/test';
import { setup, walkTo } from './m4Harness';
import { originalZoneMap } from '../../shared/originalWorld';
import { originalTravelService } from '../../shared/originalTravel';
import { zoneRoute, exitKind, servicePoint } from '../../shared/originalNavigation';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import type { OriginalPlayerState } from '../../shared/originalSchema';
for (const layout of [
  { name: 'Panel', width: 318, height: 500, file: 'panel.html' },
  { name: 'Mobile', width: 360, height: 640, file: 'mobile.html' },
]) {
  test(`${layout.name}: continuous physical journey through all five original worlds`, async ({ page }) => {
    test.setTimeout(600000);
    await page.setViewportSize(layout);
    const f = await setup(page);
    const current = () => f.store.states.get('synthetic-walking') as OriginalPlayerState;
    const go = async (destination: string) => {
      const path = zoneRoute(current().world.zone, destination);
      expect(path.length).toBeGreaterThan(0);
      for (const next of path.slice(1)) {
        const map = originalZoneMap(current().world.zone),
          exit = map.exits.find((e) => e.to === next)!;
        const before = f.posts.length;
        await walkTo(page, map, exit, layout.name === 'Mobile');
        expect(f.posts.length).toBe(before);
        await page
          .getByRole('button', {
            name: `Use ${exitKind(map.id, exit)} · ${originalZoneMap(next).name}`,
            exact: true,
          })
          .click();
        await expect(page.locator('canvas')).toHaveAttribute('data-zone', next);
      }
    };
    await page.goto('/' + layout.file);
    await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z001');
    for (const destination of ['loc.l002', 'loc.l003', 'loc.l004', 'loc.l005', 'loc.l001']) {
      const services = originalTravelService(current().location),
        name = ORIGINAL_CONTENT.locations.find((x) => x.id === destination)!.name;
      await openOperations(page);
      await page.getByRole('button', { name: 'NAV', exact: true }).click();
      const before = current().location;
      await page.getByRole('button', { name, exact: true }).click();
      expect(current().location).toBe(before);
      await page.getByRole('button', { name: 'Close map', exact: true }).click();
      await go(services.assign);
      await walkTo(
        page,
        originalZoneMap(services.assign),
        servicePoint(services.assign, 'travel')!,
        layout.name === 'Mobile',
      );
      await page.getByRole('button', { name: `Assign Lark Skiff · ${name}`, exact: true }).click();
      await expect.poll(() => !!current().world.departure).toBe(true);
      await go(services.depart);
      await walkTo(
        page,
        originalZoneMap(services.depart),
        servicePoint(services.depart, 'travel')!,
        layout.name === 'Mobile',
      );
      await page.getByRole('button', { name: 'Board assigned ship', exact: true }).click();
      await expect.poll(() => current().location).toBe(destination);
      await expect(page.locator('canvas')).toHaveAttribute('data-zone', current().world.zone);
      if (destination === 'loc.l004')
        await go(ORIGINAL_CONTENT.zones.filter((z) => z.location === destination).at(-1)!.id);
      await page.screenshot({
        path: `/tmp/dime-m43-release/screenshots/physical-${layout.name}-${destination}.png`,
      });
      const saved = structuredClone(current());
      await page.reload();
      await expect(page.locator('canvas')).toHaveAttribute('data-zone', saved.world.zone);
      expect(current()).toEqual(saved);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    }
    expect(f.errors).toEqual([]);
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
  });
}
