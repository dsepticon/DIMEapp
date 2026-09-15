import { test, expect, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { setup, walkTo } from './m4Harness';
import { initialState as legacyInitialState } from '../../shared/game';
import { upgradeWholeCscuSave } from '../../shared/quantityUpgrade';
import { originalInitialState } from '../../shared/originalGame';
import { originalZoneMap } from '../../shared/originalWorld';
import { servicePoint, zoneRoute, exitKind } from '../../shared/originalNavigation';
import type { OriginalPlayerState } from '../../shared/originalSchema';
const key = 'dime-pending-v2:' + createHash('sha256').update('U-synthetic-walking').digest('hex');
const current = (fixture: Awaited<ReturnType<typeof setup>>) =>
  fixture.store.states.get('synthetic-walking') as OriginalPlayerState;
const pending = (generation: string | undefined, revision = 0, type = 'scan') => ({
  version: 4,
  path: '/v4/actions',
  request: {
    requestId: randomUUID(),
    ...(generation ? { expectedGeneration: generation } : {}),
    expectedRevision: revision,
    action: { type },
  },
});
async function seedStorage(page: Page, value: unknown) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem(key, JSON.stringify(value));
        sessionStorage.setItem('unrelated-widget', 'preserve');
        sessionStorage.setItem('seeded', 'yes');
      }
    },
    { key, value },
  );
}
async function pendingExists(page: Page) {
  return page.evaluate((key) => sessionStorage.getItem(key) !== null, key);
}
async function goZone(
  page: Page,
  fixture: Awaited<ReturnType<typeof setup>>,
  destination: string,
  touch = false,
) {
  const path = zoneRoute(current(fixture).world.zone, destination);
  for (const next of path.slice(1)) {
    const map = originalZoneMap(current(fixture).world.zone),
      exit = map.exits.find((e) => e.to === next)!;
    await walkTo(page, map, exit, touch);
    await page
      .getByRole('button', {
        name: `Use ${exitKind(map.id, exit)} · ${originalZoneMap(next).name}`,
        exact: true,
      })
      .click();
    await expect(page.locator('canvas')).toHaveAttribute('data-zone', next);
  }
}
for (const layout of [
  { name: 'Panel', file: 'panel.html', width: 318, height: 500 },
  { name: 'Mobile', file: 'mobile.html', width: 360, height: 640 },
]) {
  test(`${layout.name}: every map destination is informational and pending ambiguity leaves walking available`, async ({
    page,
  }) => {
    await page.setViewportSize(layout);
    const fixture = await setup(page),
      state = originalInitialState(randomUUID(), () => 0.5);
    fixture.store.states.set('synthetic-walking', state);
    await seedStorage(page, pending(undefined));
    await page.goto('/' + layout.file);
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeVisible();
    const before = structuredClone(current(fixture));
    await page.getByRole('button', { name: 'NAV', exact: true }).click();
    const choices = page.locator('.destinationMap button[aria-pressed]');
    for (let i = 0; i < (await choices.count()); i++) {
      await choices.nth(i).click();
      expect(current(fixture)).toEqual(before);
    }
    expect(fixture.posts).toHaveLength(0);
    await page.getByRole('button', { name: 'Close map', exact: true }).click();
    const x = await page.locator('canvas').getAttribute('data-player-x');
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    await page.keyboard.up('d');
    expect(await page.locator('canvas').getAttribute('data-player-x')).not.toBe(x);
    await page.getByRole('button', { name: 'Review discard' }).click();
    await expect(page.getByRole('button', { name: 'Confirm discard', exact: true })).toBeDisabled();
    expect(await pendingExists(page)).toBe(true);
    await page.getByRole('textbox', { name: 'Discard confirmation' }).fill('DISCARD');
    await page.getByRole('button', { name: 'Confirm discard', exact: true }).click();
    await expect.poll(() => pendingExists(page)).toBe(false);
    expect(await page.evaluate(() => sessionStorage.getItem('unrelated-widget'))).toBe('preserve');
    expect(current(fixture)).toEqual(before);
  });
  for (const old of ['different generation', 'older format without generation'] as const)
    test(`${layout.name}: ${old} is obsolete on a fresh canonical profile`, async ({ page }) => {
      await page.setViewportSize(layout);
      const fixture = await setup(page);
      await seedStorage(
        page,
        old === 'different generation'
          ? pending(randomUUID())
          : {
              version: 1,
              request: { requestId: randomUUID(), expectedRevision: 0, action: { type: 'mine' } },
            },
      );
      await page.goto('/' + layout.file);
      await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z001');
      await expect.poll(() => pendingExists(page)).toBe(false);
      expect(fixture.posts).toHaveLength(0);
      expect(current(fixture)).toMatchObject({ contentVersion: 4, saveFormatVersion: 3, revision: 0 });
      expect(fixture.store.receipts.size).toBe(0);
      expect(await page.evaluate(() => sessionStorage.getItem('unrelated-widget'))).toBe('preserve');
    });
  test(`${layout.name}: definitive mining rejection clears its entry on attempt and startup`, async ({
    page,
  }) => {
    await page.setViewportSize(layout);
    const fixture = await setup(page),
      state = originalInitialState(randomUUID(), () => 0.5);
    state.location = 'loc.l002';
    state.world.zone = 'zone.z014';
    const id = 'zone.z014.node.synthetic';
    state.world.nodes[id] = {
      id,
      ore: 'mat.m001',
      source: 'extract.x001',
      x: 2,
      y: 2,
      size: 1,
      resistance: 0.6,
      instability: 0.2,
      yieldUnits: 400,
      status: 'INTACT',
      fragments: [],
      respawnAt: null,
    };
    state.world.scanner.analyzed = [id];
    fixture.store.states.set('synthetic-walking', state);
    await page.goto('/' + layout.file);
    await page.getByRole('button', { name: 'Target node', exact: true }).click();
    await expect(page.locator('.status')).toContainText('Mining not started');
    expect(await pendingExists(page)).toBe(false);
    expect(current(fixture)).toEqual(state);
    const record = pending(state.saveGeneration);
    record.request.action = {
      type: 'startLaser',
      nodeId: id,
      player: { x: 10, y: 10 },
    } as typeof record.request.action;
    await page.evaluate(({ key, record }) => sessionStorage.setItem(key, JSON.stringify(record)), {
      key,
      record,
    });
    await page.reload();
    await expect(page.locator('.status')).toContainText('Mining not started');
    expect(await pendingExists(page)).toBe(false);
    expect(current(fixture)).toEqual(state);
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
  });
  test(`${layout.name}: uninterrupted physical station, ship and mining journey`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(layout);
    const fixture = await setup(page);
    await page.goto('/' + layout.file);
    await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z001');
    expect(current(fixture).conversionReceipt).toBeUndefined();
    await page.getByRole('button', { name: 'NAV', exact: true }).click();
    await page.getByRole('button', { name: 'Loam Crescent', exact: true }).click();
    await expect(page.locator('.objective')).toContainText('Walk to');
    expect(current(fixture).location).toBe('loc.l001');
    await page.getByRole('button', { name: 'Close map', exact: true }).click();
    await goZone(page, fixture, 'zone.z008', layout.name === 'Mobile');
    let map = originalZoneMap('zone.z008');
    await walkTo(page, map, servicePoint(map.id, 'travel')!, layout.name === 'Mobile');
    await page.getByRole('button', { name: 'Assign Lark Skiff · Loam Crescent', exact: true }).click();
    await expect.poll(() => !!current(fixture).world.departure).toBe(true);
    await goZone(page, fixture, 'zone.z009', layout.name === 'Mobile');
    map = originalZoneMap('zone.z009');
    await walkTo(page, map, servicePoint(map.id, 'travel')!, layout.name === 'Mobile');
    await page.getByRole('button', { name: 'Board assigned ship', exact: true }).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z019');
    await goZone(page, fixture, 'zone.z012', layout.name === 'Mobile');
    await page.getByRole('button', { name: 'Begin First Contract', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Beamline One', exact: true }).click();
    await goZone(page, fixture, 'zone.z014', layout.name === 'Mobile');
    map = originalZoneMap('zone.z014');
    const node = current(fixture).world.nodes['assignment.q001.node']!;
    await walkTo(page, map, node, layout.name === 'Mobile');
    await page.getByRole('button', { name: 'Ping signatures', exact: true }).click();
    await page.getByRole('combobox', { name: 'Nearby signature' }).selectOption(node.id);
    await page.getByRole('button', { name: 'Analyze selected signature', exact: true }).click();
    await page.getByRole('button', { name: 'Target node', exact: true }).click();
    const laser = page.getByRole('button', { name: 'Hold laser · release to cool', exact: true });
    await laser.focus();
    let held = false;
    for (let i = 0; i < 180; i++) {
      const charge = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>('.charge i');
        return bar ? parseFloat(bar.style.width) : null;
      });
      if (charge === null) break;
      if (!held && charge < 62) {
        await page.keyboard.down('Space');
        held = true;
      } else if (held && charge > 70) {
        await page.keyboard.up('Space');
        held = false;
      }
      await page.waitForTimeout(75);
    }
    await page.keyboard.up('Space');
    await expect(page.locator('canvas')).toHaveAttribute('data-fragments', '3');
    for (const piece of [...current(fixture).world.nodes[node.id]!.fragments]) {
      await walkTo(page, map, piece, layout.name === 'Mobile');
      const button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
      await button.focus();
      await page.keyboard.down('Space');
      await expect
        .poll(
          () => current(fixture).world.nodes[node.id]!.fragments.find((p) => p.id === piece.id)!.collected,
        )
        .toBe(true);
      await page.keyboard.up('Space');
      await expect(button).toHaveAttribute('data-phase', 'idle');
    }
    const saved = structuredClone(current(fixture));
    await page.reload();
    await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z014');
    expect(current(fixture)).toEqual(saved);
    expect(saved.mining['extract.x001']['mat.m001']).toBe(400);
    expect(saved.world.nodes[node.id]!.status).toBe('DEPLETED');
    await page.getByRole('button', { name: 'NAV', exact: true }).click();
    await page.getByRole('button', { name: 'Avenbolt', exact: true }).click();
    expect(current(fixture)).toEqual(saved);
    await expect(page.getByRole('button', { name: 'Avenbolt', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Close map', exact: true }).click();
    await goZone(page, fixture, 'zone.z012', layout.name === 'Mobile');
    await page.getByRole('button', { name: 'Sell 4 cSCU Garnet · 5,200 shift marks', exact: true }).click();
    await page.getByRole('button', { name: 'Report completed field work · 500 reward', exact: true }).click();
    expect(current(fixture).quest?.status).toBe('COMPLETE');
    expect(current(fixture).wallet).toBe(5700);
    expect(fixture.errors).toEqual([]);
    await page.screenshot({ path: `/tmp/dime-m43-release/screenshots/journey-${layout.name}.png` });
  });
}

for (const file of ['panel.html', 'mobile.html']) {
  test(`${file}: never-sent action survives unknown outcome, retries once and stays isolated from a new tab`, async ({
    page,
  }) => {
    await page.setViewportSize(
      file === 'panel.html' ? { width: 318, height: 500 } : { width: 360, height: 640 },
    );
    const fixture = await setup(page),
      state = originalInitialState(randomUUID(), () => 0.5);
    fixture.store.states.set('synthetic-walking', state);
    state.location = 'loc.l002';
    state.world.zone = 'zone.z014';
    await seedStorage(page, pending(state.saveGeneration));
    fixture.faults.unknownOnceBeforeCommit = true;
    await page.goto('/' + file);
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeVisible();
    expect(await pendingExists(page)).toBe(true);
    expect(fixture.store.receipts.size).toBe(0);
    const raw = await page.evaluate((key) => sessionStorage.getItem(key), key);
    const other = await page.context().newPage();
    const second = await setup(other, fixture.store);
    await other.goto('/' + file);
    await expect(other.locator('canvas')).toBeVisible();
    expect(await pendingExists(other)).toBe(false);
    expect(second.posts).toHaveLength(0);
    await other.close();
    await page.bringToFront();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe(raw);
    await page.getByRole('button', { name: 'Retry pending action' }).click();
    await expect.poll(() => pendingExists(page)).toBe(false);
    expect(fixture.store.receipts.size).toBe(1);
    expect(fixture.posts).toHaveLength(2);
    const saved = structuredClone(current(fixture));
    await page.reload();
    await expect(page.locator('canvas')).toBeVisible();
    expect(current(fixture)).toEqual(saved);
    expect(fixture.store.receipts.size).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem('unrelated-widget'))).toBe('preserve');
  });
  test(`${file}: lost reset response adopts the new generation without another reset`, async ({ page }) => {
    const fixture = await setup(page);
    await page.goto('/' + file);
    await expect(page.locator('canvas')).toBeVisible();
    const generation = current(fixture).saveGeneration;
    await page.getByRole('button', { name: 'PROFILE', exact: true }).click();
    await page.getByRole('textbox').fill('RESET MY DIME PROFILE');
    fixture.faults.dropOnceAfterCommit = true;
    await page.getByRole('button', { name: 'Reset All My Game Progress', exact: true }).click();
    await expect.poll(() => fixture.store.receipts.size).toBe(1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeVisible();
    await page.reload();
    await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z001');
    await expect.poll(() => pendingExists(page)).toBe(false);
    expect(current(fixture).saveGeneration).not.toBe(generation);
    expect(current(fixture)).toMatchObject({ contentVersion: 4, saveFormatVersion: 3 });
    expect(fixture.posts).toEqual(['/v4/profile/reset']);
    expect(fixture.store.receipts.size).toBe(1);
  });
  for (const outcome of ['never sent', 'lost response'])
    test(`${file}: conversion ${outcome} recovers exactly once`, async ({ page }) => {
      const fixture = await setup(page),
        legacy = upgradeWholeCscuSave(legacyInitialState(() => 0.5));
      legacy.saveGeneration = randomUUID();
      fixture.store.states.set('synthetic-walking', legacy);
      if (outcome === 'never sent') {
        const record = {
          version: 4,
          path: '/v4/content/convert',
          request: {
            requestId: randomUUID(),
            expectedRevision: legacy.revision,
            expectedGeneration: legacy.saveGeneration,
          },
        };
        await seedStorage(page, record);
      }
      await page.goto('/' + file);
      if (outcome === 'lost response') {
        await page.getByRole('button', { name: 'Preview equivalent update' }).click();
        fixture.faults.dropOnceAfterCommit = true;
        await page.getByRole('button', { name: 'Apply reviewed equivalent update' }).click();
        await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeVisible();
        await page.reload();
      }
      await expect(page.locator('canvas')).toBeVisible();
      await expect.poll(() => pendingExists(page)).toBe(false);
      expect(fixture.store.receipts.size).toBe(1);
      expect(current(fixture).conversionReceipt).toBeDefined();
      const saved = structuredClone(current(fixture));
      await page.reload();
      await expect(page.locator('canvas')).toBeVisible();
      expect(current(fixture)).toEqual(saved);
      expect(fixture.store.receipts.size).toBe(1);
    });
}
for (const file of ['panel.html', 'mobile.html']) {
  test(`${file}: shuttle platforms require walking and use paired directional arrival`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(
      file === 'panel.html' ? { width: 318, height: 500 } : { width: 360, height: 640 },
    );
    const fixture = await setup(page),
      state = originalInitialState(randomUUID(), () => 0.5);
    state.location = 'loc.l004';
    state.world.zone = 'zone.z031';
    fixture.store.states.set('synthetic-walking', state);
    await page.goto('/' + file);
    await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z031');
    await expect(page.getByRole('button', { name: /^Use shuttle/ })).toHaveCount(0);
    await goZone(page, fixture, 'zone.z032', file === 'mobile.html');
    const incoming = originalZoneMap('zone.z032').exits.find((e) => e.to === 'zone.z031')!;
    await expect(page.locator('canvas')).toHaveAttribute(
      'data-facing',
      { N: 'S', S: 'N', E: 'W', W: 'E' }[incoming.facing],
    );
    await goZone(page, fixture, 'zone.z033', file === 'mobile.html');
    expect(fixture.posts).toHaveLength(2);
    expect(fixture.errors).toEqual([]);
  });
  test(`${file}: stale vacuum refreshes, clears pending and permits one later collection`, async ({
    page,
  }) => {
    await page.setViewportSize(
      file === 'panel.html' ? { width: 318, height: 500 } : { width: 360, height: 640 },
    );
    const fixture = await setup(page),
      state = originalInitialState(randomUUID(), () => 0.5),
      map = originalZoneMap('zone.z014');
    state.location = 'loc.l002';
    state.world.zone = map.id;
    state.revision = 1;
    const id = map.id + '.node.synthetic',
      pieceId = 'synthetic-piece',
      player = { x: map.spawn.x + 0.5, y: map.spawn.y + 0.5 };
    state.world.nodes[id] = {
      id,
      ore: 'mat.m001',
      source: 'extract.x001',
      x: map.spawn.x + 1,
      y: map.spawn.y,
      size: 1,
      resistance: 0.6,
      instability: 0.2,
      yieldUnits: 100,
      status: 'FRACTURED',
      respawnAt: null,
      fragments: [{ id: pieceId, x: map.spawn.x + 1, y: map.spawn.y, units: 100, collected: false }],
    };
    state.world.extractionSession = {
      nodeId: id,
      pieceId,
      origin: player,
      startedAt: Date.now() - 1000,
      zone: map.id,
    };
    fixture.store.states.set('synthetic-walking', state);
    await seedStorage(page, {
      version: 4,
      path: '/v4/actions',
      request: {
        requestId: randomUUID(),
        expectedRevision: 0,
        expectedGeneration: state.saveGeneration,
        action: { type: 'finishVacuum', nodeId: id, pieceId, player },
      },
    });
    await page.goto('/' + file);
    await expect(page.locator('.status')).toContainText('Save refreshed');
    expect(await pendingExists(page)).toBe(false);
    expect(fixture.store.receipts.size).toBe(0);
    const button = page.getByRole('button', { name: 'Hold Vacuum', exact: true });
    await button.focus();
    await page.keyboard.down('Space');
    await expect.poll(() => current(fixture).world.nodes[id]!.fragments[0]!.collected).toBe(true);
    await page.keyboard.up('Space');
    await expect(button).toHaveAttribute('data-phase', 'idle');
    expect(current(fixture).mining['extract.x001']['mat.m001']).toBe(100);
    const saved = structuredClone(current(fixture));
    await page.reload();
    await expect(page.locator('canvas')).toBeVisible();
    expect(current(fixture)).toEqual(saved);
    expect(await page.evaluate(() => sessionStorage.getItem('unrelated-widget'))).toBe('preserve');
  });
}
