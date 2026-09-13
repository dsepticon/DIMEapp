import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { MemoryStore } from '../../server/store';
import { GameService } from '../../server/service';
import { createApi } from '../../server/http';
import { initialState } from '../../shared/game';
import { FIRST_SHIFT_REWARD, TUTORIAL_RAW_UNITS, TUTORIAL_SALE_AUEC } from '../../shared/firstShift';
import type { FirstShiftStep } from '../../shared/firstShift';

for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`continuous First Shift accounting and screenshots: ${layout}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    const player = 'synthetic-persistent-twitch-identity';
    const otherPlayer = 'another-synthetic-twitch-identity';
    const now = 1_800_000_000_000;
    const store = new MemoryStore();
    const oldSave = initialState(() => 0.5);
    oldSave.location = 'Lyria';
    oldSave.positions.Nomad = 'Lyria';
    delete oldSave.firstShift;
    store.states.set(player, oldSave);
    const startingWallet = oldSave.wallet;
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
    await page.goto('/');
    await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
    expect(store.states.get(player)?.firstShift).toBeUndefined();
    const requests: { step: FirstShiftStep; input: object }[] = [];
    const manifest: object[] = [];
    const current = () => store.states.get(player)!;
    const act = async (step: FirstShiftStep) => {
      const input = {
        requestId: randomUUID(),
        expectedRevision: current().revision,
        action: {
          type: 'firstShift',
          step,
          ...(step === 'mineDolivine' ? { depositId: 'dolivine' } : {}),
        },
      };
      const result = await service.mutate(player, input);
      requests.push({ step, input });
      expect(result.state.revision).toBe(input.expectedRevision + 1);
      await page.reload();
      await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
      return result.state;
    };
    const capture = async (name: string, step: string) => {
      const state = current();
      const filename = `test-results/m2-${layout}-${name}.png`;
      await page.screenshot({ path: filename });
      manifest.push({
        scenarioStep: step,
        requestAction: step,
        expectedQuestObjective: state.firstShift?.objective ?? 'SPEAK_TO_FOREMAN',
        expectedWallet: state.wallet,
        expectedRawInventory: state.mining.Hand.Dolivine ?? 0,
        expectedRefinedInventory: state.cargo.Nomad?.refined.Dolivine ?? 0,
        expectedQuestCounters: state.firstShift?.counters ?? { mined: 0, refined: 0, sold: 0 },
        screenshotFilename: filename,
      });
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    };
    const openMenu = async (name: string) => {
      await page.getByRole('button', { name: 'Open game menu' }).click();
      await page.getByRole('navigation', { name: 'Game menu' }).getByRole('button', { name }).click();
    };
    await act('accept');
    const tracker = page.getByRole('button', { name: 'Toggle objective tracker' });
    await expect(tracker).toHaveAttribute('aria-expanded', 'true');
    await tracker.click();
    await expect(tracker).toHaveAttribute('aria-expanded', 'false');
    await tracker.click();
    await act('checkTool');
    expect(current().equipment['Hand mining tool']).toBe(1);
    await act('enterMine');
    await act('mineDolivine');
    expect(current().mining.Hand.Dolivine).toBe(TUTORIAL_RAW_UNITS);
    expect(current().firstShift?.counters).toEqual({ mined: TUTORIAL_RAW_UNITS, refined: 0, sold: 0 });
    await page.getByRole('button', { name: 'Quest Log' }).click();
    await capture('mining-success', 'mineDolivine');
    await act('returnOutpost');
    expect(current().firstShift?.objective).toBe('SELL_MINED_GEM');
    expect(current().mining.Hand.Dolivine).toBe(TUTORIAL_RAW_UNITS);
    expect(current().orders).toHaveLength(0);
    await act('sell');
    expect(current().mining.Hand.Dolivine).toBe(0);
    expect(current().wallet).toBe(startingWallet + TUTORIAL_SALE_AUEC);
    expect(current().firstShift?.counters.sold).toBe(TUTORIAL_RAW_UNITS);
    await openMenu('Market');
    await capture('market-sale-confirmation', 'sell');
    await page.getByRole('button', { name: 'Close menu' }).click();
    await act('complete');
    await expect(page.getByLabel('Area introduction')).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByRole('status')).toHaveCount(0, { timeout: 5000 });
    await capture('quest-completion', 'complete');
    expect(current().wallet).toBe(startingWallet + TUTORIAL_SALE_AUEC + FIRST_SHIFT_REWARD);
    expect(current().firstShift?.counters).toEqual({
      mined: TUTORIAL_RAW_UNITS,
      refined: 0,
      sold: TUTORIAL_RAW_UNITS,
    });
    await page.getByRole('button', { name: 'Quest Log' }).click();
    await expect(page.getByLabel('Final reward summary')).toContainText(
      `Final wallet: ${current().wallet} aUEC`,
    );
    await expect(page.getByLabel('Final reward summary')).toContainText(
      `Sale revenue: +${TUTORIAL_SALE_AUEC} aUEC`,
    );
    await capture('final-reward-summary', 'complete');
    await page.reload();
    await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
    await page.getByRole('button', { name: 'Quest Log' }).click();
    await expect(page.getByLabel('Quest Log')).toContainText(
      `Dolivine mined: ${TUTORIAL_RAW_UNITS} cSCU · refined: 0 cSCU · sold raw: ${TUTORIAL_RAW_UNITS} cSCU`,
    );
    await capture('final-quest-log-after-refresh', 'refresh');
    const finalState = structuredClone(current());
    for (const { input } of requests) {
      const replay = await service.mutate(player, input);
      expect(replay.replayed).toBe(true);
      expect(replay.state).toEqual(finalState);
    }
    expect(current()).toEqual(finalState);
    expect((await service.snapshot(otherPlayer)).state.firstShift).toBeUndefined();
    await writeFile(
      `test-results/m2-${layout}-manifest.json`,
      JSON.stringify(
        {
          identity: player,
          startingWallet,
          rawMined: TUTORIAL_RAW_UNITS,
          rawConsumed: TUTORIAL_RAW_UNITS,
          refinedProduced: 0,
          refinedCollected: 0,
          rawSold: TUTORIAL_RAW_UNITS,
          saleRevenue: TUTORIAL_SALE_AUEC,
          refineryCost: 0,
          questReward: FIRST_SHIFT_REWARD,
          finalWallet: finalState.wallet,
          walletEquation: `${startingWallet} + ${TUTORIAL_SALE_AUEC} + ${FIRST_SHIFT_REWARD} = ${finalState.wallet}`,
          screenshots: manifest,
        },
        null,
        2,
      ),
    );
  });
}
