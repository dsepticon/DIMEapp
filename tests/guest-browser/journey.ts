import { expect, type Page } from '@playwright/test';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import { createGuestRuntime } from '../../app/original/guestRuntime';
import { originalZoneMap } from '../../shared/originalWorld';
import { zoneRoute, servicePoint, exitKind } from '../../shared/originalNavigation';
import { nodeInteractionTiles } from '../../shared/originalNodePlacement';
import { originalNodeSpec } from '../../shared/originalMining';
import { initialState, parameters, tickMining } from '../../shared/continuousMining';
import { walkTo, openOperations, resumeGame } from '../e2e/m4Harness';
export async function journey(page: Page, touch: boolean, width: number) {
  // Independent deterministic oracle only; never injected into the browser.
  let now = 100000;
  const model = createGuestRuntime(() => now),
    canvas = page.locator('canvas');
  const go = async (destination: string) => {
    for (const next of zoneRoute(model.snapshot().world.zone, destination).slice(1)) {
      const map = originalZoneMap(model.snapshot().world.zone),
        exit = map.exits.find((e) => e.to === next)!;
      await walkTo(page, map, exit, touch);
      await page
        .getByRole('button', {
          name: `Use ${exitKind(map.id, exit)} · ${originalZoneMap(next).name}`,
          exact: true,
        })
        .click();
      await expect(canvas).toHaveAttribute('data-zone', next);
      model.mutate({ type: 'moveZone', destination: next, player: { x: exit.x + 0.5, y: exit.y + 0.5 } });
    }
  };
  const terminal = async () => {
    const map = originalZoneMap(model.snapshot().world.zone),
      p = servicePoint(map.id, 'travel')!;
    await walkTo(page, map, p, touch);
    return { x: p.x + 0.5, y: p.y + 0.5 };
  };
  const destination = async (name: string) => {
    const before = await canvas.getAttribute('data-zone');
    await openOperations(page);
    await page.getByRole('button', { name: 'NAV', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(canvas).toHaveAttribute('data-zone', before!);
    await page.getByRole('button', { name: 'Close map', exact: true }).click();
  };
  await destination('Loam Crescent');
  await go('zone.z008');
  let player = await terminal();
  await page.getByRole('button', { name: 'Assign Lark Skiff · Loam Crescent', exact: true }).click();
  model.mutate({
    type: 'assignDeparture',
    player,
    ship: 'fleet.v001',
    destination: 'loc.l002',
    loadGroundVehicle: false,
  });
  await go('zone.z009');
  player = await terminal();
  await page.getByRole('button', { name: 'Board assigned ship', exact: true }).click();
  model.mutate({ type: 'completeDeparture', player });
  await expect(canvas).toHaveAttribute('data-zone', 'zone.z019');
  await go('zone.z012');
  await openOperations(page);
  await page.getByRole('button', { name: 'Begin First Contract', exact: true }).click();
  model.mutate({ type: 'acceptFirstContract' });
  await openOperations(page);
  await page.getByRole('button', { name: 'Confirm Beamline One', exact: true }).click();
  model.mutate({ type: 'confirmFirstContractTool' });
  await go('zone.z014');
  const node = model.snapshot().world.nodes['assignment.q001.node']!,
    map = originalZoneMap('zone.z014');
  const tile =
    nodeInteractionTiles(map.id, node).find((t) => t.x === node.x && t.y === node.y - 1) ??
    nodeInteractionTiles(map.id, node)[0]!;
  await walkTo(page, map, tile, touch);
  await canvas.focus();
  const key = node.x < tile.x ? 'a' : node.x > tile.x ? 'd' : node.y < tile.y ? 'w' : 's';
  await page.keyboard.down(key);
  await page.waitForTimeout(50);
  await page.keyboard.up(key);
  await page.getByRole('button', { name: 'Ping (P)', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-ping-active', 'true');
  for (let i = 0; i < 8 && (await page.locator('.scannerHUD').getAttribute('data-focus')) !== node.id; i++)
    await page.getByRole('button', { name: 'Next scanner target (Q)' }).click();
  await expect(page.locator('.scannerHUD')).toHaveAttribute('data-focus', node.id);
  const cdp = await page.context().newCDPSession(page);
  let touchActive = false;
  const hold = async (name: string, key: string, on: boolean) => {
    if (!touch) {
      if (on) {
        await canvas.focus();
        await page.keyboard.down(key);
      } else await page.keyboard.up(key);
      return;
    }
    if (on) {
      touchActive = true;
      const b = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(b).not.toBeNull();
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 1, x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }],
      });
    } else if (touchActive) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      touchActive = false;
    }
  };
  await hold('Hold Analyze (F)', 'f', true);
  await expect(page.getByLabel('Confirmed rock analysis')).toBeVisible();
  await hold('Hold Analyze (F)', 'f', false);
  await page.screenshot({ path: `/tmp/dime-m43-game-review/screenshots/analyzed-${width}.png` });
  await page.getByRole('button', { name: 'Close analysis · Ping to recall' }).click();
  player = { x: tile.x + 0.5, y: tile.y + 0.5 };
  model.mutate({ type: 'analyzeNearby', nodeId: node.id, player });
  await page.getByRole('button', { name: 'Target node', exact: true }).click();
  model.mutate({ type: 'startLaser', nodeId: node.id, player });
  let held = false;
  for (let i = 0; i < 200; i++) {
    const charge = await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('.charge i');
      return b ? parseFloat(b.style.width) : null;
    });
    if (charge === null) break;
    if (!held && charge < 62) {
      await hold('Hold laser · release to cool', 'Space', true);
      held = true;
    } else if (held && charge > 70) {
      await hold('Hold laser · release to cool', 'Space', false);
      held = false;
    }
    await page.waitForTimeout(75);
  }
  await hold('Hold laser · release to cool', 'Space', false);
  await expect(canvas).toHaveAttribute('data-fragments', '3');
  let mining = initialState();
  const spec = originalNodeSpec(node),
    p = parameters(spec),
    runs: Array<{ held: boolean; ticks: number }> = [];
  while (mining.phase !== 'fractured' && mining.tick < 1000) {
    const h = mining.charge < p.upper - p.gain,
      last = runs.at(-1);
    if (last?.held === h) last.ticks++;
    else runs.push({ held: h, ticks: 1 });
    mining = tickMining(mining, spec, h);
  }
  now += mining.tick * 50;
  model.mutate({ type: 'resolveLaser', runs });
  await page.screenshot({ path: `/tmp/dime-m43-game-review/screenshots/fracture-${width}.png` });
  for (const piece of model.snapshot().world.nodes[node.id]!.fragments) {
    const before = Number(await canvas.getAttribute('data-fragments'));
    if (!before) break;
    await walkTo(page, map, piece, touch);
    await hold('Hold Vacuum', 'Space', true);
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-fragments')), { timeout: 10000 })
      .toBeLessThan(before);
    await hold('Hold Vacuum', 'Space', false);
  }
  await expect(canvas).toHaveAttribute('data-fragments', '0');
  await go('zone.z012');
  await openOperations(page);
  await page.getByRole('button', { name: /Sell 4 cSCU Garnet/ }).click();
  await openOperations(page);
  await page.getByRole('button', { name: /Report completed field work/ }).click();
  await resumeGame(page);
  await destination('Tessick Station');
  player = await terminal();
  await page.getByRole('button', { name: 'Assign Lark Skiff · Tessick Station', exact: true }).click();
  model.mutate({
    type: 'assignDeparture',
    player,
    ship: 'fleet.v001',
    destination: 'loc.l001',
    loadGroundVehicle: false,
  });
  await go('zone.z019');
  player = await terminal();
  await page.getByRole('button', { name: 'Board assigned ship', exact: true }).click();
  model.mutate({ type: 'completeDeparture', player });
  await expect(canvas).toHaveAttribute('data-zone', model.snapshot().world.zone);
  await go('zone.z004');
  await openOperations(page);
  await page.getByRole('button', { name: 'Start Destroya processing order', exact: true }).click();
  await page.waitForTimeout(25000);
  await openOperations(page);
  await page.getByRole('button', { name: /Collect demo processing order/ }).click();
  await expect(page.getByRole('button', { name: /Collect demo processing order/ })).toHaveCount(0);
  await go(
    ORIGINAL_CONTENT.zones.find(
      (z) => z.location === 'loc.l001' && (z.objectKinds as readonly string[]).includes('market'),
    )!.id,
  );
  await openOperations(page);
  await page.getByRole('button', { name: 'Use available cargo quantity', exact: true }).click();
  await page.getByRole('button', { name: 'Sell selected demo cargo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sell selected demo cargo', exact: true })).toBeDisabled();
  await resumeGame(page);
  await cdp.detach();
}
