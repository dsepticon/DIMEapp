import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { originalSpatial } from '../../shared/originalSpatial';
import { setup, walkTo } from './m4Harness';
import { originalInitialState } from '../../shared/originalGame';
import { originalZoneMap } from '../../shared/originalWorld';
import type { OriginalPlayerState } from '../../shared/originalSchema';
const id = 'zone.z014.node.vacuum';
async function fixture(page: Page, file: string, full = false) {
  await page.setViewportSize(
    file === 'panel.html' ? { width: 318, height: 500 } : { width: 360, height: 640 },
  );
  const f = await setup(page),
    s = originalInitialState(randomUUID(), () => 0.5),
    map = originalZoneMap('zone.z014');
  s.location = 'loc.l002';
  s.world.zone = map.id;
  s.world.nodes[id] = {
    id,
    ore: 'mat.m001',
    source: 'extract.x001',
    x: map.spawn.x,
    y: map.spawn.y,
    size: 1,
    resistance: 0.6,
    instability: 0.2,
    yieldUnits: 300,
    status: 'FRACTURED',
    respawnAt: null,
    fragments: [
      { id: 'piece-a', x: map.spawn.x + 1, y: map.spawn.y, units: 100, collected: false },
      { id: 'piece-b', x: map.spawn.x - 1, y: map.spawn.y, units: 100, collected: false },
      { id: 'piece-c', x: map.spawn.x, y: map.spawn.y + 1, units: 100, collected: false },
    ],
  };
  s.world.scanner.analyzed = [id];
  if (full) s.mining['extract.x001']['mat.m001'] = 1200;
  f.store.states.set('synthetic-walking', s);
  await page.goto('/' + file);
  await expect(page.locator('canvas')).toHaveAttribute('data-fragments', '3');
  return { ...f, current: () => f.store.states.get('synthetic-walking') as OriginalPlayerState };
}
async function touchHold(page: Page) {
  const cdp = await page.context().newCDPSession(page),
    button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  return {
    cdp,
    box,
    release: async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    },
  };
}
for (const file of ['panel.html', 'mobile.html']) {
  test(`${file}: visible existing shards collect by proximity, animate and chain on a continuous hold`, async ({
    page,
  }) => {
    const f = await fixture(page, file),
      canvas = page.locator('canvas'),
      button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
    await expect(canvas).toHaveAttribute('data-fragment-art', 'pixel-shards');
    await expect(page.locator('.fragmentPrompt')).toContainText('Garnet');
    expect(
      f
        .current()
        .world.nodes[
          id
        ]!.fragments.every((p) => Math.hypot(p.x + 0.5 - (originalZoneMap('zone.z014').spawn.x + 0.5), p.y + 0.5 - (originalZoneMap('zone.z014').spawn.y + 0.5)) === 1),
    ).toBe(true);
    await button.focus();
    const touch = file === 'mobile.html' ? await touchHold(page) : null;
    if (!touch) await page.keyboard.down('Space');
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-vacuum-progress')))
      .toBeGreaterThan(0);
    await expect(canvas).toHaveAttribute('data-fragments', '3');
    await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/attract-${file}.png` });
    await expect.poll(() => f.current().mining['extract.x001']['mat.m001']).toBe(300);
    if (touch) await touch.release();
    else await page.keyboard.up('Space');
    await expect(button).toHaveAttribute('data-phase', 'idle');
    await expect(canvas).toHaveAttribute('data-fragments', '0');
    const saved = structuredClone(f.current());
    await page.reload();
    await expect(canvas).toBeVisible();
    expect(f.current()).toEqual(saved);
    expect(f.errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(false);
  });
  for (const stop of ['release', 'cancel', 'slide', 'blur', 'hidden'])
    test(`${file}: ${stop} stops attraction and preserves ground pieces`, async ({ page }) => {
      const f = await fixture(page, file),
        button = page.getByRole('button', { name: 'Hold Vacuum', exact: true }),
        touch = await touchHold(page);
      await expect(button).toHaveAttribute('data-phase', 'attracting');
      if (stop === 'cancel')
        await touch.cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else if (stop === 'slide')
        await touch.cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: touch.box.x + touch.box.width / 2, y: touch.box.y - 10 }],
        });
      else if (stop === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      else if (stop === 'hidden')
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      else await touch.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (stop === 'release' || stop === 'cancel') await touch.cdp.detach();
      else await touch.release();
      await expect(button).toHaveAttribute('data-phase', 'idle');
      expect(f.current().world.nodes[id]!.fragments.every((p) => !p.collected)).toBe(true);
      expect(f.current().mining['extract.x001']).toEqual({});
      await expect(page.locator('canvas')).toHaveAttribute('data-vacuum-stage', 'idle');
      await expect(page.locator('canvas')).toHaveAttribute('data-paused', 'false');
    });
  test(`${file}: full hold preserves all pieces and explains required free capacity`, async ({ page }) => {
    const f = await fixture(page, file, true);
    await expect(page.locator('.fragmentPrompt')).toContainText('Free 100 more units');
    const button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
    await button.focus();
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    expect(f.posts).toHaveLength(0);
    expect(f.current().world.nodes[id]!.fragments.every((p) => !p.collected)).toBe(true);
  });
  test(`${file}: uncertainty restores ground presentation, permits walking and replays one start`, async ({
    page,
  }) => {
    const f = await fixture(page, file),
      button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
    f.faults.dropOnceAfterCommit = true;
    await button.focus();
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveAttribute('data-vacuum-stage', 'idle');
    const before = await page.locator('canvas').getAttribute('data-player-x');
    await page.keyboard.down('d');
    await page.waitForTimeout(100);
    await page.keyboard.up('d');
    expect(await page.locator('canvas').getAttribute('data-player-x')).not.toBe(before);
    await page.getByRole('button', { name: 'Retry pending action' }).click();
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
    expect(f.store.receipts.size).toBe(1);
    expect(f.current().world.nodes[id]!.fragments.every((p) => !p.collected)).toBe(true);
  });
}

for (const file of ['panel.html', 'mobile.html'])
  test(`${file}: an authoritative wall blocks nearby extraction`, async ({ page }) => {
    test.setTimeout(60000);
    const f = await fixture(page, file),
      map = originalZoneMap('zone.z014');
    let pair: { player: { x: number; y: number }; piece: { x: number; y: number } } | undefined;
    for (let y = 3; y < map.height - 3 && !pair; y++)
      for (let x = 3; x < map.width - 3 && !pair; x++) {
        const player = { x: x + 0.5, y: y + 0.5 },
          piece = { x: x + 2, y };
        if (
          originalSpatial.validPosition(map.id, player) &&
          originalSpatial.validPosition(map.id, { x: piece.x + 0.5, y: piece.y + 0.5 }) &&
          !originalSpatial.clearLine(map.id, player, { x: piece.x + 0.5, y: piece.y + 0.5 })
        )
          pair = { player, piece };
      }
    if (!pair) throw Error('No synthetic wall fixture');
    const state = f.current();
    state.world.nodes[id]!.fragments.forEach((p, i) => {
      p.collected = i > 0;
      if (i === 0) {
        p.x = pair!.piece.x;
        p.y = pair!.piece.y;
      }
    });
    state.mining['extract.x001']['mat.m001'] = 200;
    await page.reload();
    await expect(page.locator('canvas')).toHaveAttribute('data-fragments', '1');
    await walkTo(
      page,
      map,
      { x: Math.floor(pair.player.x), y: Math.floor(pair.player.y) },
      file === 'mobile.html',
    );
    await expect(page.locator('.fragmentPrompt')).toContainText('clear line of sight');
    const button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
    await button.focus();
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    expect(f.posts).toHaveLength(0);
    expect(f.current().world.nodes[id]!.fragments[0]!.collected).toBe(false);
  });
for (const file of ['panel.html', 'mobile.html']) {
  test(`${file}: server capacity rejection clears pending without losing a fragment`, async ({ page }) => {
    const f = await fixture(page, file),
      before = structuredClone(f.current().world.nodes[id]!.fragments);
    await expect(page.locator('.fragmentPrompt')).toContainText('Hold Vacuum');
    f.current().mining['extract.x001']['mat.m001'] = 1200;
    const button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
    await button.focus();
    await page.keyboard.down('Space');
    await expect(page.locator('.status')).toContainText('Mining hold is full');
    await page.keyboard.up('Space');
    await expect(button).toHaveAttribute('data-phase', 'idle');
    await expect(page.locator('.fragmentPrompt')).toContainText('Free 100 more units');
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
    expect(f.current().world.nodes[id]!.fragments).toEqual(before);
    expect(f.store.receipts.size).toBe(0);
  });
  test(`${file}: lost collection response restores visual ground until receipt replay`, async ({ page }) => {
    const f = await fixture(page, file),
      button = page.getByRole('button', { name: 'Hold Vacuum', exact: true }),
      canvas = page.locator('canvas');
    await button.focus();
    await page.keyboard.down('Space');
    await expect(button).toHaveAttribute('data-phase', 'attracting');
    f.faults.dropOnceAfterCommit = true;
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeVisible();
    await page.keyboard.up('Space');
    await expect(canvas).toHaveAttribute('data-vacuum-stage', 'idle');
    await expect(canvas).toHaveAttribute('data-fragments', '3');
    expect(f.current().mining['extract.x001']['mat.m001']).toBe(100);
    await page.getByRole('button', { name: 'Retry pending action' }).click();
    await expect(canvas).toHaveAttribute('data-fragments', '2');
    expect(f.current().mining['extract.x001']['mat.m001']).toBe(100);
    expect(f.store.receipts.size).toBe(2);
  });
}
