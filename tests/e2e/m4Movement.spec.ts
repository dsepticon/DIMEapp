import { openOperations, resumeGame } from './m4Harness';
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { initialState as legacyInitialState } from '../../shared/game';
import { upgradeWholeCscuSave } from '../../shared/quantityUpgrade';
import { originalInitialState } from '../../shared/originalGame';
import { originalZoneMap } from '../../shared/originalWorld';
import { setup, walkTo } from './m4Harness';
const position = (page: Page) =>
  page
    .locator('canvas')
    .evaluate((canvas) => ({ x: Number(canvas.dataset.playerX), y: Number(canvas.dataset.playerY) }));
async function keyMove(page: Page, key: string) {
  const before = await position(page);
  await page.keyboard.down(key);
  await expect
    .poll(async () => {
      const after = await position(page);
      return Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeGreaterThan(0.15);
  await page.keyboard.up(key);
}
for (const layout of [
  { name: 'Panel', file: 'panel.html', width: 318, height: 500, touch: false },
  { name: 'Mobile', file: 'mobile.html', width: 360, height: 640, touch: true },
]) {
  test(`${layout.name}: production walking, focus, overlays, refresh, reset and zone transition`, async ({
    page,
  }) => {
    await page.setViewportSize(layout);
    const fixture = await setup(page);
    await page.goto('/' + layout.file);
    await expect(page.locator('.place b')).toHaveText('Crew Ring Arrival');
    await expect(page.locator('canvas')).toHaveAttribute('data-player-x', /\d/);
    const initial = await position(page);
    for (const key of ['d', 'a', 'w', 's', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'])
      await keyMove(page, key);
    const stopped = await position(page);
    await page.waitForTimeout(150);
    expect(await position(page)).toEqual(stopped);
    expect(fixture.posts).toHaveLength(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await keyMove(page, 'd');
    await page.keyboard.down('a');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurred = await position(page);
    await page.waitForTimeout(150);
    expect(await position(page)).toEqual(blurred);
    await page.keyboard.up('a');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await keyMove(page, 'a');
    await openOperations(page);
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-paused', 'true');
    const paused = await position(page);
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    await page.keyboard.up('d');
    expect(await position(page)).toEqual(paused);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await keyMove(page, 'd');
    for (const name of ['NAV', 'TOOL', 'CARGO']) {
      await openOperations(page);
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.locator('canvas')).toHaveAttribute('data-paused', 'true');
      await page.keyboard.press('Escape');
      await keyMove(page, 'a');
      await keyMove(page, 'd');
    }
    for (const direction of ['left', 'right', 'up', 'down']) {
      const control = page.getByRole('button', { name: `Walk ${direction}`, exact: true });
      const box = (await control.boundingBox())!;
      const before = await position(page);
      if (layout.touch) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
        });
        await expect
          .poll(async () => {
            const p = await position(page);
            return Math.hypot(p.x - before.x, p.y - before.y);
          })
          .toBeGreaterThan(0.15);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await expect
          .poll(async () => {
            const p = await position(page);
            return Math.hypot(p.x - before.x, p.y - before.y);
          })
          .toBeGreaterThan(0.15);
        await page.mouse.up();
      }
    }
    expect(fixture.posts).toHaveLength(0);
    await page.reload();
    await expect(page.locator('canvas')).toHaveAttribute('data-player-x', String(initial.x.toFixed(3)));
    await keyMove(page, 'd');
    if (await page.getByRole('button', { name: 'Close map', exact: true }).count())
      await page.getByRole('button', { name: 'Close map', exact: true }).click();
    const map = originalZoneMap('zone.z001');
    await walkTo(page, map, map.exits[0]!);
    await page.getByRole('button', { name: /^Use doorway/ }).click();
    await expect(page.locator('.place b')).not.toHaveText('Crew Ring Arrival');
    await keyMove(page, 'd');
    await openOperations(page);
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await page.getByRole('textbox').fill('RESET MY DIME PROFILE');
    await page.getByRole('button', { name: 'Reset All My Game Progress', exact: true }).click();
    await expect(page.locator('.place b')).toHaveText('Crew Ring Arrival');
    await keyMove(page, 'd');
    expect(fixture.posts).toEqual(['/v4/actions', '/v4/profile/reset']);
    expect(fixture.errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(layout.height);
    await page.screenshot({ path: `/tmp/dime-movement-${layout.name.toLowerCase()}.png` });
  });
}
for (const outcome of ['fracture', 'overcharge'] as const) {
  test(`production mining: actual position, hold/release, ${outcome} and movement recovery`, async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.setViewportSize({ width: 318, height: 500 });
    const fixture = await setup(page);
    const state = originalInitialState(randomUUID(), () => 0.5),
      map = originalZoneMap('zone.z014');
    state.location = 'loc.l002';
    state.world.zone = map.id;
    const id = map.id + '.node.synthetic';
    state.world.nodes[id] = {
      id,
      ore: 'mat.m001',
      source: 'extract.x001',
      x: map.spawn.x + 1,
      y: map.spawn.y,
      size: 1,
      resistance: 0.6,
      instability: 0.2,
      yieldUnits: 400,
      status: 'INTACT',
      fragments: [],
      respawnAt: null,
    };
    state.world.scanner.analyzed = [id];
    state.world.scanner.scannedZones = [map.id];
    fixture.store.states.set('synthetic-walking', state);
    await page.goto('/panel.html');
    await expect(page.getByRole('button', { name: 'Target node', exact: true })).toBeVisible();
    await resumeGame(page);
    await page.getByRole('button', { name: 'Target node', exact: true }).click();
    const laser = page.getByRole('button', { name: 'Hold laser · release to cool', exact: true });
    await expect(laser).toBeVisible();
    await laser.focus();
    const charge = () =>
      page.locator('.charge i').evaluate((el) => parseFloat((el as HTMLElement).style.width));
    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    await page.keyboard.up('Space');
    const peak = await charge();
    expect(peak).toBeGreaterThan(5);
    await page.waitForTimeout(150);
    expect(await charge()).toBeLessThan(peak);
    await expect(page.locator('.charge')).toBeVisible();
    await expect(page.locator('canvas')).toHaveAttribute('data-paused', 'true');
    if (outcome === 'overcharge') {
      await page.keyboard.down('Space');
      await expect(page.getByText('Overcharge destroyed this node.', { exact: false })).toBeVisible({
        timeout: 7000,
      });
      await page.keyboard.up('Space');
      const saved = fixture.store.states.get('synthetic-walking')!;
      expect(saved.schemaVersion).toBe(3);
      if (saved.schemaVersion === 3) {
        expect(saved.world.nodes[id]!.fragments).toEqual([]);
        expect(saved.mining['extract.x001']).toEqual({});
      }
    } else {
      let held = false;
      const deadline = Date.now() + 10_000;
      while ((await laser.count()) && Date.now() < deadline) {
        const value = await page.evaluate(() => {
          const bar = document.querySelector<HTMLElement>('.charge i');
          return bar ? parseFloat(bar.style.width) : null;
        });
        if (value === null) break;
        if (!held && value < 62) {
          await page.keyboard.down('Space');
          held = true;
        } else if (held && value > 70) {
          await page.keyboard.up('Space');
          held = false;
        }
        await page.waitForTimeout(75);
      }
      await page.keyboard.up('Space');
      await expect(page.getByRole('button', { name: 'Hold Vacuum', exact: true })).toBeVisible();
      const saved = fixture.store.states.get('synthetic-walking')!;
      if (saved.schemaVersion !== 3) throw Error('Expected synthetic v4 state');
      const pieces = saved.world.nodes[id]!.fragments;
      expect(pieces.length).toBeGreaterThanOrEqual(3);
      expect(pieces.length).toBeLessThanOrEqual(8);
      const p = await position(page),
        index = pieces.findIndex((piece) => Math.hypot(piece.x + 0.5 - p.x, piece.y + 0.5 - p.y) <= 2.2);
      expect(index).toBeGreaterThanOrEqual(0);
      await walkTo(page, map, pieces[index]!);
      const vacuum = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
      await vacuum.focus();
      await page.keyboard.down('Space');
      await expect
        .poll(() => {
          const current = fixture.store.states.get('synthetic-walking')!;
          return current.schemaVersion === 3 && current.world.nodes[id]!.fragments[index]!.collected;
        })
        .toBe(true);
      await page.keyboard.up('Space');
      await expect(page.locator('.vacuumHold')).toHaveAttribute('data-phase', 'idle');
    }
    await expect(page.locator('canvas')).toHaveAttribute('data-paused', 'false');
    await keyMove(page, 'a');
    expect(fixture.errors).toEqual([]);
    await page.screenshot({ path: `/tmp/dime-movement-${outcome}.png` });
  });
}
test('production legacy conversion is explicit, happens once, and permits walking after refresh', async ({
  page,
}) => {
  const fixture = await setup(page);
  const legacy = upgradeWholeCscuSave(legacyInitialState(() => 0.5));
  legacy.saveGeneration = randomUUID();
  fixture.store.states.set('synthetic-walking', legacy);
  await page.goto('/panel.html');
  await expect(page.getByRole('heading', { name: 'Equivalent content update' })).toBeVisible();
  expect(fixture.store.receipts.size).toBe(0);
  await page.getByRole('button', { name: 'Preview equivalent update' }).click();
  expect(fixture.store.receipts.size).toBe(0);
  await page.getByRole('button', { name: 'Apply reviewed equivalent update' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  expect(fixture.store.receipts.size).toBe(1);
  await keyMove(page, 'd');
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await keyMove(page, 'd');
  expect(fixture.store.receipts.size).toBe(1);
  expect(fixture.errors).toEqual([]);
});
test('production pending movement transition replays once after a lost response and refresh', async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto('/mobile.html');
  await expect(page.locator('.place b')).toHaveText('Crew Ring Arrival');
  fixture.faults.dropOnceAfterCommit = true;
  const map = originalZoneMap('zone.z001');
  await walkTo(page, map, map.exits[0]!);
  await page.getByRole('button', { name: /^Use doorway/ }).click();
  await expect(page.locator('.status')).toContainText('Previous action is unconfirmed');
  const committed = structuredClone(fixture.store.states.get('synthetic-walking'));
  await page.reload();
  await expect(page.locator('.place b')).not.toHaveText('Crew Ring Arrival');
  await expect(page.locator('canvas')).toBeVisible();
  expect(fixture.store.states.get('synthetic-walking')).toEqual(committed);
  expect(fixture.store.receipts.size).toBe(1);
  expect(fixture.posts).toEqual(['/v4/actions', '/v4/actions']);
  await keyMove(page, 'd');
});
