import { originalSpatial } from '../../shared/originalSpatial';
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { originalInitialState } from '../../shared/originalGame';
import { populateOriginalZone } from '../../shared/originalDiscovery';
import { nodeInteractionTiles } from '../../shared/originalNodePlacement';
import { originalZoneMap } from '../../shared/originalWorld';
import { setup, walkTo } from './m4Harness';
import type { OriginalPlayerState } from '../../shared/originalSchema';
async function scene(page: Page, file: string) {
  const f = await setup(page),
    base = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5),
    map = originalZoneMap('zone.z014');
  base.location = 'loc.l002';
  base.world.zone = map.id;
  const state = populateOriginalZone(base),
    node = Object.values(state.world.nodes).find((n) => n.source === 'extract.x001')!,
    tile =
      nodeInteractionTiles(map.id, node).find((t) => t.x === node.x && t.y === node.y - 2) ??
      nodeInteractionTiles(map.id, node)[0]!;
  // Overlapping scanner signals exercise explicit focus without precision clicks.
  state.world.nodes['zone.z014.node.focus-copy'] = {
    ...structuredClone(node),
    id: 'zone.z014.node.focus-copy',
  };
  f.store.states.set('synthetic-walking', state);
  await page.goto('/' + file);
  await page.locator('canvas[data-player-x]').waitFor();
  await walkTo(page, map, tile);
  const key = node.x < tile.x ? 'a' : node.x > tile.x ? 'd' : node.y < tile.y ? 'w' : 's';
  await page.keyboard.down(key);
  await page.waitForTimeout(80);
  await page.keyboard.up(key);
  await expect(page.getByRole('button', { name: 'Hold Analyze (F)', exact: true })).toBeVisible();
  return {
    ...f,
    state,
    key,
    node,
    map,
    current: () => f.store.states.get('synthetic-walking') as OriginalPlayerState,
  };
}
for (const layout of [
  { name: 'panel', width: 318, height: 500, file: 'panel.html' },
  { name: 'mobile', width: 360, height: 640, file: 'mobile.html' },
  { name: 'desktop', width: 1280, height: 900, file: 'index.html' },
]) {
  test(`${layout.name}: menu-free ping, focus, cancellable analysis and immediate mining`, async ({
    page,
  }) => {
    await page.setViewportSize(layout);
    if (layout.name === 'panel')
      await page.addInitScript(() => {
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (callback) => raf((time) => callback(time - 100));
      });
    const f = await scene(page, layout.file),
      canvas = page.locator('canvas');
    await canvas.focus();
    const beforeX = await canvas.getAttribute('data-player-x');
    await page.keyboard.down('a');
    await page.keyboard.press('p');
    await page.waitForTimeout(80);
    await page.keyboard.up('a');
    mkdirSync('/tmp/dime-m43-scanner/screenshots', { recursive: true });
    await page.screenshot({ path: `/tmp/dime-m43-scanner/screenshots/${layout.name}-pulse.png` });
    expect(f.errors).toEqual([]);
    expect(await canvas.getAttribute('data-player-x')).not.toBe(beforeX);
    await page.keyboard.down('d');
    await page.waitForTimeout(80);
    await page.keyboard.up('d');
    await page.keyboard.down(f.key);
    await page.waitForTimeout(30);
    await page.keyboard.up(f.key);
    await page.getByRole('button', { name: 'Ping (P)', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-ping-active', 'true');
    expect(Number(await canvas.getAttribute('data-ping-signals'))).toBeGreaterThanOrEqual(2);
    await page.keyboard.press('p');
    await page.keyboard.press('p');
    expect(f.posts).toHaveLength(0);
    await expect(page.getByLabel('Confirmed rock analysis')).toHaveCount(0);
    mkdirSync('/tmp/dime-m43-scanner/screenshots', { recursive: true });
    await page.screenshot({ path: `/tmp/dime-m43-scanner/screenshots/${layout.name}-ping.png` });
    expect(f.errors).toEqual([]);
    const focused = await page.locator('.scannerHUD').getAttribute('data-focus');
    await expect(canvas).toHaveAttribute('data-node-target', focused!);
    await page.getByRole('button', { name: 'Next scanner target (Q)' }).click();
    await expect(page.locator('.scannerHUD')).not.toHaveAttribute('data-focus', focused!);
    await expect(canvas).not.toHaveAttribute('data-node-target', focused!);
    await page.keyboard.press('q');
    await expect(canvas).toHaveAttribute('data-node-target', focused!);
    const analyze = page.getByRole('button', { name: 'Hold Analyze (F)', exact: true });
    const box = (await analyze.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await expect(canvas).toHaveAttribute('data-paused', 'true');
    await page.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(canvas).toHaveAttribute('data-paused', 'false');
    expect(f.posts).toHaveLength(0);
    if (layout.name === 'desktop') {
      await canvas.focus();
      await page.keyboard.down('f');
    } else
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      });
    await expect(page.getByLabel('Confirmed rock analysis')).toBeVisible();
    await page.keyboard.up('f');
    if (layout.name !== 'desktop')
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expect(f.current().world.scanner.analyses).toBe(1);
    expect(f.posts).toHaveLength(1);
    await expect(page.getByLabel('Confirmed rock analysis')).toContainText('Optimal');
    await expect(page.getByLabel('Confirmed rock analysis')).toContainText('Est. yield');
    await expect(page.locator('.scannerFeedback')).toHaveCount(0);
    const card = (await page.getByLabel('Confirmed rock analysis').boundingBox())!;
    const view = await canvas.evaluate((c) => ({
      x: Number(c.dataset.cameraX),
      y: Number(c.dataset.cameraY),
      scale: Number(c.dataset.cameraScale),
      px: Number(c.dataset.playerX),
      py: Number(c.dataset.playerY),
    }));
    const node = f.current().world.nodes[focused!]!;
    for (const point of [
      { x: node.x + 0.5, y: node.y + 0.5, r: 24 },
      { x: view.px, y: view.py, r: 10 },
    ]) {
      const x = (point.x - view.x) * view.scale,
        y = (point.y - view.y) * view.scale;
      expect(
        card.x + card.width <= x - point.r ||
          card.x >= x + point.r ||
          card.y + card.height <= y - point.r ||
          card.y >= y + point.r,
      ).toBe(true);
    }
    await page.screenshot({ path: `/tmp/dime-m43-scanner/screenshots/${layout.name}-analysis.png` });
    await page.getByRole('button', { name: 'Close analysis · Ping to recall' }).click();
    await page.getByRole('button', { name: 'Target node', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Hold laser · release to cool', exact: true }),
    ).toBeVisible();
    await page.reload();
    await canvas.waitFor();
    expect(f.current().world.scanner.analyses).toBe(1);
    expect(f.current().world.scanner.analyzed).toContain(focused);
    expect(f.errors).toEqual([]);
  });
  test(`${layout.name}: range approach, obstruction, no signal and reduced-motion scanner feedback`, async ({
    page,
  }) => {
    await page.setViewportSize(layout);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const f = await setup(page),
      state = originalInitialState('00000000-0000-4000-8000-000000000000', () => 0.5),
      map = originalZoneMap('zone.z014');
    state.location = 'loc.l002';
    state.world.zone = map.id;
    const generated = populateOriginalZone(state),
      template = Object.values(generated.world.nodes)[0]!;
    const origin = { x: map.spawn.x + 0.5, y: map.spawn.y + 0.5 };
    const tiles = Array.from(map.tiles, (v, i) => ({
      x: i % map.width,
      y: Math.floor(i / map.width),
      open: !!v,
    }));
    const far = tiles.find(
      (t) =>
        t.open &&
        ((t.y === map.spawn.y && Math.abs(t.x - map.spawn.x) === 3) ||
          (t.x === map.spawn.x && Math.abs(t.y - map.spawn.y) === 3)) &&
        originalSpatial.clearLine(map.id, origin, { x: t.x + 0.5, y: t.y + 0.5 }),
    )!;
    expect(far).toBeDefined();
    const id = 'zone.z014.node.range';
    const single = (tile: { x: number; y: number }) => {
      generated.world.nodes = { [id]: { ...structuredClone(template), id, x: tile.x, y: tile.y } };
      f.store.states.set('synthetic-walking', structuredClone(generated));
    };
    single(far);
    await page.goto('/' + layout.file);
    const canvas = page.locator('canvas');
    await canvas.waitFor();
    await page.keyboard.press('p');
    await expect(page.locator('.scannerFeedback')).toContainText('Out of range');
    await expect(page.getByRole('button', { name: 'Hold Analyze (F)' })).toHaveCount(0);
    await canvas.focus();
    const approach = far.x < map.spawn.x ? 'a' : far.x > map.spawn.x ? 'd' : far.y < map.spawn.y ? 'w' : 's';
    await page.keyboard.down(approach);
    await expect(page.getByRole('button', { name: 'Hold Analyze (F)' })).toBeVisible();
    await page.keyboard.up(approach);
    const distance = Math.hypot(
      far.x + 0.5 - Number(await canvas.getAttribute('data-player-x')),
      far.y + 0.5 - Number(await canvas.getAttribute('data-player-y')),
    );
    expect(distance).toBeLessThanOrEqual(2.2);
    expect(distance).toBeGreaterThan(1.4);
    await page.keyboard.down('f');
    await expect(canvas).toHaveAttribute('data-paused', 'true');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('f');
    await expect(canvas).toHaveAttribute('data-paused', 'false');
    expect(f.posts).toHaveLength(0);
    const blocked = tiles.find((t) => !t.open && Math.hypot(t.x - map.spawn.x, t.y - map.spawn.y) < 8)!;
    single(blocked);
    await page.reload();
    await canvas.waitFor();
    await page.keyboard.press('p');
    await expect(page.locator('.scannerFeedback')).toContainText('Obstructed');
    await expect(page.getByRole('button', { name: 'Hold Analyze (F)' })).toHaveCount(0);
    generated.world.nodes = {};
    f.store.states.set('synthetic-walking', structuredClone(generated));
    await page.reload();
    await canvas.waitFor();
    await page.keyboard.press('p');
    await expect(page.locator('.scannerFeedback')).toHaveText('No signal');
    single(far);
    const unsupported = f.store.states.get('synthetic-walking') as OriginalPlayerState;
    unsupported.equipment['gear.e001'] = 0;
    await page.reload();
    await canvas.waitFor();
    await page.keyboard.press('p');
    await expect(page.locator('.scannerFeedback')).toContainText('Unsupported node');
    expect(f.posts).toHaveLength(0);
    expect(f.errors).toEqual([]);
  });
  for (const fault of ['rejection', 'lost-response'] as const)
    test(`${layout.name}: analysis ${fault} recovery preserves walking and original-ID replay`, async ({
      page,
    }) => {
      await page.setViewportSize(layout);
      const f = await scene(page, layout.file),
        canvas = page.locator('canvas');
      if (fault === 'lost-response') f.faults.dropOnceAfterCommit = true;
      else {
        const id = (await canvas.getAttribute('data-node-target'))!;
        f.current().world.nodes[id]!.x = 0;
        f.current().world.nodes[id]!.y = 0;
      }
      await canvas.focus();
      await page.keyboard.down('f');
      await expect.poll(() => f.posts.length).toBe(1);
      await page.keyboard.up('f');
      await expect(canvas).toHaveAttribute('data-paused', 'false');
      if (fault === 'rejection') {
        await expect(page.getByRole('button', { name: 'Pending · Retry' })).toHaveCount(0);
        expect(f.current().world.scanner.analyses).toBe(0);
        expect(f.store.receipts.size).toBe(0);
      } else {
        await expect(page.getByRole('button', { name: 'Pending · Retry' })).toBeVisible();
        expect(f.current().world.scanner.analyses).toBe(1);
      }
      const x = await canvas.getAttribute('data-player-x');
      await page.keyboard.down('a');
      await page.waitForTimeout(120);
      await page.keyboard.up('a');
      expect(await canvas.getAttribute('data-player-x')).not.toBe(x);
      await page.reload();
      await canvas.waitFor();
      await expect(page.getByRole('button', { name: 'Pending · Retry' })).toHaveCount(0);
      expect(f.current().world.scanner.analyses).toBe(fault === 'rejection' ? 0 : 1);
      expect(f.store.receipts.size).toBe(fault === 'rejection' ? 0 : 1);
    });
}
