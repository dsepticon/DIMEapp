import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { firstShiftOf } from '../../shared/firstShift';
import { initialState } from '../../shared/game';
import { RESET_CONFIRMATION } from '../../shared/schema';

async function fixture(page: Page) {
  const store = new MemoryStore();
  const state = initialState(() => 0.5);
  state.saveGeneration = randomUUID();
  state.revision = 3;
  state.wallet = 5_700;
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  state.ships.Prospector = 1;
  state.equipment['Arbor MH1'] = 1;
  state.mining.Hand.Dolivine = 4;
  state.firstShift = {
    ...firstShiftOf(state),
    status: 'ACTIVE',
    objective: 'SELL_MINED_GEM',
    acceptedAt: 1,
    counters: { mined: 4, refined: 0, sold: 0 },
  };
  store.states.set('synthetic-reset-player', state);
  const api = createApi(
    new GameService(
      store,
      () => 1_800_000_000_000,
      () => 0.5,
    ),
    async () => 'synthetic-reset-player',
    ['http://127.0.0.1:5173'],
  );
  const ids: string[] = [];
  let delay = false;
  let fail = false;
  await page.route('https://extension-files.twitch.tv/**', (route) => route.abort());
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    const incoming = route.request();
    const path = new URL(incoming.url()).pathname;
    if (path === '/profile/reset') {
      ids.push((JSON.parse(incoming.postData() ?? '{}') as { requestId: string }).requestId);
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Synthetic failure.' }),
        });
        return;
      }
    }
    const result = await api({
      method: incoming.method(),
      path,
      headers: incoming.headers(),
      body: incoming.postData() ?? undefined,
    });
    if (delay && path === '/profile/reset') await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open game menu' })).toBeVisible();
  await expect(page.getByLabel('DIME title scene')).toHaveCount(0);
  const navigate = async (name: string) => {
    const close = page.getByRole('button', { name: 'Close menu' });
    if (await close.isVisible()) await close.click();
    await page.getByRole('button', { name: 'Open game menu' }).click();
    await page
      .getByRole('navigation', { name: 'Game menu' })
      .getByRole('button', { name, exact: true })
      .click();
  };
  return {
    store,
    state,
    ids,
    navigate,
    delay: () => {
      delay = true;
    },
    fail: () => {
      fail = true;
    },
  };
}

for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: Profile reset confirmation, safety, and fresh state screenshots`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const { store, state, ids, navigate, delay } = await fixture(page);
    await navigate('Profile');
    const root = `test-results/m23-reset/${layout}`;
    await page.getByRole('button', { name: 'Reset Game Progress', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${root}-profile-section.png` });
    await page.getByRole('button', { name: 'Reset Game Progress', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'reset menu' });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${root}-confirmation.png` });
    const phrase = page.getByLabel(/Type exactly:/);
    const confirm = page.getByRole('button', { name: 'Reset All My Game Progress' });
    await expect(confirm).toBeDisabled();
    await phrase.fill('RESET MY DIME PROFILE ');
    await expect(confirm).toBeDisabled();
    await phrase.fill(RESET_CONFIRMATION);
    await expect(confirm).toBeEnabled();
    await phrase.press('Enter');
    await confirm.focus();
    await page.keyboard.press('Enter');
    expect(ids).toHaveLength(0);
    await page.screenshot({ path: `${root}-phrase-accepted.png` });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    await page.evaluate(() => {
      sessionStorage.setItem('dime-pending-v2:local', 'synthetic-pending');
      sessionStorage.setItem('unrelated-session-entry', 'keep');
    });
    delay();
    await confirm.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole('button', { name: 'Resetting…' })).toBeDisabled();
    await page.screenshot({ path: `${root}-resetting.png` });
    await expect(dialog).toHaveCount(0);
    expect(ids).toHaveLength(1);
    const fresh = store.states.get('synthetic-reset-player')!;
    expect(fresh.revision).toBe(state.revision + 1);
    expect(fresh.saveGeneration).not.toBe(state.saveGeneration);
    expect(fresh.wallet).toBe(0);
    expect(fresh.location).toBe('ARC-L1');
    expect(fresh.firstShift).toBeUndefined();
    expect(await page.evaluate(() => sessionStorage.getItem('dime-pending-v2:local'))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem('unrelated-session-entry'))).toBe('keep');
    await expect(page.getByRole('status')).toContainText('Game progress reset.');
    await navigate('Profile');
    await expect(
      page.getByRole('region', { name: 'Character status' }).getByText('0 aUEC', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `${root}-fresh-profile.png` });
    await navigate('Quest Log');
    await expect(page.getByText('Status: Available')).toBeVisible();
    await expect(page.getByText('Dolivine mined: 0 cSCU · refined: 0 cSCU · sold raw: 0 cSCU')).toBeVisible();
    await page.screenshot({ path: `${root}-initial-quest.png` });
  });
}

test('failed reset keeps confirmation open and retries the identical request ID', async ({ page }) => {
  const { store, ids, navigate, fail } = await fixture(page);
  await navigate('Profile');
  await page.getByRole('button', { name: 'Reset Game Progress', exact: true }).click();
  await page.getByLabel(/Type exactly:/).fill(RESET_CONFIRMATION);
  fail();
  await page.getByRole('button', { name: 'Reset All My Game Progress' }).click();
  await expect(page.getByRole('dialog', { name: 'reset menu' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Reset was not confirmed');
  expect(store.states.get('synthetic-reset-player')?.revision).toBe(3);
  await page.getByRole('button', { name: 'Reset All My Game Progress' }).click();
  await expect(page.getByRole('dialog', { name: 'reset menu' })).toHaveCount(0);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(store.states.get('synthetic-reset-player')?.revision).toBe(4);
});
