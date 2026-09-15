import { openOperations, resumeGame } from './m4Harness';
import { test, expect } from '@playwright/test';
import { setup, walkTo } from './m4Harness';
import { originalInitialState } from '../../shared/originalGame';
import { populateOriginalZone } from '../../shared/originalDiscovery';
import { nodeInteractionTiles } from '../../shared/originalNodePlacement';
import { nodePixelWidth } from '../../shared/originalNodeTargeting';
import { originalZoneMap } from '../../shared/originalWorld';
import type { OriginalPlayerState } from '../../shared/originalSchema';
async function fixture(page: Parameters<typeof setup>[0], width: number, height: number, file: string) {
  await page.setViewportSize({ width, height });
  const f = await setup(page);
  let s = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5);
  s.location = 'loc.l003';
  s.world.zone = 'zone.z024';
  s = populateOriginalZone(s);
  f.store.states.set('synthetic-walking', s);
  await page.goto('/' + file);
  await expect(page.locator('canvas')).toHaveAttribute('data-node-art', 'pixel-formations');
  return { ...f, current: () => f.store.states.get('synthetic-walking') as OriginalPlayerState };
}
for (const [name, width, height, file] of [
  ['Panel', 318, 500, 'panel.html'],
  ['Mobile', 360, 640, 'mobile.html'],
  ['Desktop', 1024, 768, 'index.html'],
] as const) {
  test(
    name + ': three formations are reachable, auto-targeted, padded-hit selectable and stable after refresh',
    async ({ page }) => {
      test.setTimeout(180000);
      const f = await fixture(page, width, height, file),
        s = f.current(),
        map = originalZoneMap(s.world.zone);
      const nodes = Object.values(s.world.nodes);
      expect(nodes).toHaveLength(3);
      await openOperations(page);
      await page.getByRole('button', { name: 'Ping signatures' }).click();
      await resumeGame(page);
      for (const node of nodes) {
        const tile = nodeInteractionTiles(map.id, node)[0]!;
        const before = f.posts.length;
        await walkTo(page, map, tile, name === 'Mobile');
        expect(f.posts.length).toBe(before);
        // Face the nearby node with ordinary movement; no pointer target selection is required.
        const key = node.x < tile.x ? 'a' : node.x > tile.x ? 'd' : node.y < tile.y ? 'w' : 's';
        await page.keyboard.down(key);
        await page.waitForTimeout(100);
        await page.keyboard.up(key);
        await expect(page.locator('canvas')).toHaveAttribute('data-node-target', node.id);
        await expect(page.locator('.nodeTargetStatus')).toContainText('In range');
        // Tap/click outside the rock silhouette but inside its padded formation bounds.
        const c = page.locator('canvas'),
          rect = (await c.boundingBox())!,
          cam = await c.evaluate((c) => ({
            x: Number(c.dataset.cameraX),
            y: Number(c.dataset.cameraY),
            scale: Number(c.dataset.cameraScale ?? 24),
          }));
        const point = {
          x:
            rect.x +
            (node.x + 0.5 - cam.x) * cam.scale +
            ((nodePixelWidth(node.size) / 2 + 3) * cam.scale) / 24,
          y: rect.y + (node.y + 0.5 - cam.y) * cam.scale,
        };
        if (name === 'Mobile') {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.detach();
        } else await page.mouse.click(point.x, point.y);
        await expect(c).toHaveAttribute('data-node-target', node.id);
        await openOperations(page);
        await page.getByRole('button', { name: 'Analyze selected signature' }).click();
        await resumeGame(page);
        await resumeGame(page);
        await page.getByRole('button', { name: 'Target node', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Hold laser · release to cool' })).toBeVisible();
        await openOperations(page);
        await page.getByRole('button', { name: 'Stop laser without yield' }).click();
        await resumeGame(page);
      }
      await resumeGame(page);
      const control = await page.getByRole('button', { name: 'Target node', exact: true }).boundingBox();
      expect(control!.y).toBeGreaterThanOrEqual(0);
      expect(control!.y + control!.height).toBeLessThanOrEqual(height);
      await page.screenshot({ path: '/tmp/dime-m41-nodes/formations-' + name + '.png' });
      await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/formations-targeted-${name}.png` });
      const saved = structuredClone(f.current());
      await page.reload();
      await expect(page.locator('canvas')).toBeVisible();
      expect(f.current()).toEqual(saved);
      expect(f.errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(false);
    },
  );
  if (name === 'Desktop') continue;
  test(
    name + ': three-node mine, vacuum, overcharge and refresh journey preserves the remaining target',
    async ({ page }) => {
      test.setTimeout(180000);
      const f = await fixture(page, width, height, file),
        map = originalZoneMap(f.current().world.zone),
        nodes = Object.values(f.current().world.nodes);
      await openOperations(page);
      await page.getByRole('button', { name: 'Ping signatures' }).click();
      await resumeGame(page);
      for (const n of nodes) {
        await walkTo(page, map, nodeInteractionTiles(map.id, n)[0]!, name === 'Mobile');
        await openOperations(page);
        await page.getByLabel('Nearby signature').selectOption(n.id);
        await openOperations(page);
        await page.getByRole('button', { name: 'Analyze selected signature' }).click();
        await resumeGame(page);
      }
      await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/nodes-analyzed-${name}.png` });
      const n = nodes[0]!;
      await walkTo(page, map, nodeInteractionTiles(map.id, n)[0]!, name === 'Mobile');
      await openOperations(page);
      await page.getByLabel('Nearby signature').selectOption(n.id);
      await resumeGame(page);
      await page.getByRole('button', { name: 'Target node', exact: true }).click();
      const laser = page.getByRole('button', { name: 'Hold laser · release to cool' });
      await laser.focus();
      let held = false,
        capturedOptimal = false;
      for (let i = 0; i < 300; i++) {
        const charge = await page.locator('.charge').evaluateAll((es) => {
          const e = es[0];
          if (!e) return null;
          const i = e.querySelector('i')!,
            em = e.querySelector('em')!;
          return {
            value: parseFloat(i.style.width),
            low: parseFloat(em.style.left),
            high: parseFloat(em.style.left) + parseFloat(em.style.width),
          };
        });
        if (!charge) break;
        if (!held && charge.value < charge.low + (charge.high - charge.low) * 0.3) {
          await page.keyboard.down('Space');
          held = true;
        } else if (held && charge.value > charge.low + (charge.high - charge.low) * 0.65) {
          await page.keyboard.up('Space');
          held = false;
          if (!capturedOptimal) {
            await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/optimal-hud-${name}.png` });
            capturedOptimal = true;
          }
        }
        await page.waitForTimeout(60);
      }
      await page.keyboard.up('Space');
      await expect.poll(() => f.current().world.nodes[n.id]!.status).toBe('FRACTURED');
      await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/fracture-${name}.png` });
      const pieces = [...f.current().world.nodes[n.id]!.fragments];
      expect(pieces.length).toBeGreaterThanOrEqual(3);
      expect(pieces.length).toBeLessThanOrEqual(8);
      for (const piece of pieces) {
        if (f.current().world.nodes[n.id]!.fragments.find((p) => p.id === piece.id)!.collected) continue;
        await walkTo(page, map, piece, name === 'Mobile');
        const button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
        await expect(button).toBeVisible();
        await button.focus();
        await page.keyboard.down('Space');
        await expect
          .poll(() => f.current().world.nodes[n.id]!.fragments.find((p) => p.id === piece.id)!.collected)
          .toBe(true);
        await page.keyboard.up('Space');
        await expect(page.locator('.vacuumHold')).toHaveAttribute('data-phase', 'idle');
      }
      expect(f.current().mining[n.source][n.ore]).toBe(n.yieldUnits);
      await openOperations(page);
      await page.getByRole('button', { name: 'Laser mode', exact: true }).click();
      await resumeGame(page);
      const other = nodes[1]!;
      await walkTo(page, map, nodeInteractionTiles(map.id, other)[0]!, name === 'Mobile');
      await openOperations(page);
      await page.getByLabel('Nearby signature').selectOption(other.id);
      await resumeGame(page);
      await page.getByRole('button', { name: 'Target node', exact: true }).click();
      await laser.focus();
      await page.keyboard.down('Space');
      await expect
        .poll(() => f.current().world.nodes[other.id]!.status, { timeout: 15000 })
        .toBe('DESTROYED');
      await page.keyboard.up('Space');
      await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/overcharge-${name}.png` });
      const saved = structuredClone(f.current());
      await page.reload();
      await expect(page.locator('canvas')).toBeVisible();
      expect(f.current()).toEqual(saved);
      const remaining = nodes[2]!;
      await walkTo(page, map, nodeInteractionTiles(map.id, remaining)[0]!, name === 'Mobile');
      await openOperations(page);
      await page.getByLabel('Nearby signature').selectOption(remaining.id);
      await expect(page.locator('.nodeTargetStatus')).toContainText('In range');
      await resumeGame(page);
      await page.getByRole('button', { name: 'Target node', exact: true }).click();
      await expect(laser).toBeVisible();
      await openOperations(page);
      await page.getByRole('button', { name: 'Stop laser without yield' }).click();
      await resumeGame(page);
      expect(f.errors).toEqual([]);
      await expect(page.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
    },
  );
}
for (const file of ['panel.html', 'mobile.html'])
  test(file + ': tool modes separate intact targeting from fragment inspection', async ({ page }) => {
    const f = await fixture(page, file === 'panel.html' ? 318 : 360, file === 'panel.html' ? 500 : 640, file),
      map = originalZoneMap(f.current().world.zone),
      n = Object.values(f.current().world.nodes)[0]!;
    await walkTo(page, map, nodeInteractionTiles(map.id, n)[0]!, file === 'mobile.html');
    await openOperations(page);
    await page.getByLabel('Nearby signature').selectOption(n.id);
    await expect(page.locator('canvas')).toHaveAttribute('data-node-target', n.id);
    await openOperations(page);
    await page.getByRole('button', { name: 'Extraction mode', exact: true }).click();
    await resumeGame(page);
    await expect(page.locator('canvas')).toHaveAttribute('data-node-target', '');
    const c = page.locator('canvas'),
      rect = (await c.boundingBox())!,
      cam = await c.evaluate((c) => ({
        x: Number(c.dataset.cameraX),
        y: Number(c.dataset.cameraY),
        scale: Number(c.dataset.cameraScale ?? 24),
      }));
    await page.mouse.click(rect.x + (n.x + 0.5 - cam.x) * 24, rect.y + (n.y + 0.5 - cam.y) * 24);
    await expect(c).toHaveAttribute('data-node-target', '');
    expect(f.posts).toHaveLength(0);
    await openOperations(page);
    await page.getByRole('button', { name: 'Laser mode', exact: true }).click();
    await resumeGame(page);
    await expect(page.locator('.nodeTargetStatus')).toContainText('In range');
    const before = f.posts.length;
    await walkTo(page, map, map.spawn, file === 'mobile.html');
    await expect(page.locator('.nodeTargetStatus')).not.toHaveText('In range');
    expect(f.posts.length).toBe(before);
  });
