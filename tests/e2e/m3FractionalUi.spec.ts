import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { initialState } from '../../shared/game';
import { beginAssignedTravel } from '../travelFixture';

for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: one synthetic save shows fractional transfer, refinery order and market sale`, async ({
    page,
  }: {
    page: Page;
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    let now = Date.now();
    const player = `synthetic-fractional-ui-${layout}`;
    const store = new MemoryStore();
    const starting = initialState(() => 0.5);
    starting.wallet = 10_000;
    starting.ships.Prospector = 1;
    starting.positions.Prospector = 'ARC-L1';
    starting.mining.Hand.Dolivine = 125;
    starting.mining.Prospector.Agricium = 125;
    store.states.set(player, starting);
    const service = new GameService(
      store,
      () => now,
      () => 0.5,
    );
    const api = createApi(service, async () => player, ['http://127.0.0.1:5173']);
    await page.route('https://extension-files.twitch.tv/**', (route) => route.abort());
    await page.route('http://127.0.0.1:8787/**', async (route) => {
      const request = route.request();
      const result = await api({
        method: request.method(),
        path: new URL(request.url()).pathname,
        headers: request.headers(),
        body: request.postData() ?? undefined,
      });
      await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
    });
    const current = () => store.states.get(player)!;
    const manifest: object[] = [];
    const shot = async (step: string) => {
      const filename = `test-results/m3-world/${layout}-fractional-${step}.png`;
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
      await page.screenshot({ path: filename });
      manifest.push({
        step,
        revision: current().revision,
        wallet: current().wallet,
        handDolivineMinor: current().mining.Hand.Dolivine ?? 0,
        shipDolivineMinor: current().cargo.Nomad?.raw.Dolivine ?? 0,
        prospectorAgriciumMinor: current().mining.Prospector.Agricium ?? 0,
        refineryOrders: current().orders.length,
        filename,
      });
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    };
    const menu = async (name: string) => {
      await page.getByRole('button', { name: 'Open game menu' }).click();
      await page.getByRole('navigation', { name: 'Game menu' }).getByRole('button', { name }).click();
    };
    await page.goto('/');
    await menu('Cargo');
    await page.getByRole('group', { name: 'Transfer amount' }).getByRole('button', { name: 'Max' }).click();
    await expect(page.getByLabel('Transfer amount in cSCU')).toHaveValue('1.25');
    await shot('cargo-before-transfer');
    await page.getByRole('button', { name: 'Transfer raw cargo' }).click();
    await expect.poll(() => current().cargo.Nomad?.raw.Dolivine).toBe(125);
    expect(current().mining.Hand.Dolivine).toBe(0);
    await expect(page.getByLabel('Transfer amount in cSCU')).toHaveValue('0');
    await shot('cargo-after-transfer');
    await page.getByRole('button', { name: 'Close menu' }).click();
    await menu('Refinery');
    await page.getByRole('group', { name: 'Refine amount' }).getByRole('button', { name: 'Max' }).click();
    await expect(page.getByLabel('Refine amount in cSCU')).toHaveValue('1.25');
    await shot('refinery-quote');
    await page.getByRole('button', { name: 'Start Refining' }).click();
    await expect.poll(() => current().orders.length).toBe(1);
    expect(current().orders[0].rawUnits).toBe(125);
    expect(current().mining.Prospector.Agricium).toBe(0);
    await expect(page.getByLabel('Refine amount in cSCU')).toHaveValue('0');
    await page.getByRole('article').scrollIntoViewIfNeeded();
    await shot('refinery-order');
    const refineryCost = current().orders[0].cost;
    await beginAssignedTravel(service, player, 'Area-18');
    now += 1_000_000;
    const travelling = (await service.snapshot(player)).state;
    await service.mutate(player, {
      requestId: randomUUID(),
      expectedRevision: travelling.revision,
      action: { type: 'finish' },
    });
    await page.reload();
    await menu('Market');
    await page.getByRole('group', { name: 'Trade mode' }).getByRole('button', { name: 'Sell' }).click();
    await page.getByRole('group', { name: 'Sell amount' }).getByRole('button', { name: 'Max' }).click();
    await expect(page.getByLabel('Sell amount in cSCU')).toHaveValue('1.25');
    await expect(page.getByText('1,625 aUEC')).toBeVisible();
    await shot('market-quote');
    await page.getByRole('button', { name: 'Sell material' }).click();
    await expect.poll(() => current().cargo.Nomad?.raw.Dolivine).toBe(0);
    expect(current().wallet).toBe(10_000 - refineryCost + 1_625);
    await expect(page.getByLabel('Sell amount in cSCU')).toHaveValue('0');
    await page.getByText(/Dockside exchange/).scrollIntoViewIfNeeded();
    await shot('market-after-sale');
    await writeFile(
      `test-results/m3-world/${layout}-fractional-manifest.json`,
      JSON.stringify(
        {
          initialWallet: 10_000,
          refineryCost,
          saleRevenue: 1_625,
          finalWallet: current().wallet,
          screenshots: manifest,
        },
        null,
        2,
      ),
    );
  });
}
