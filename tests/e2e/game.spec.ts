import { expect, test, Page } from '@playwright/test';
import { MemoryStore } from '../../server/store';
import { GameService } from '../../server/service';
import { createApi } from '../../server/http';
import { initialState } from '../../shared/game';
import { Ore } from '../../shared/schema';
const navigate = async (page: Page, name: string) => {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
};
async function fixture(page: Page, funded = true) {
  let now = 1_800_000_000_000;
  const store = new MemoryStore(),
    state = initialState(() => 0.1);
  if (funded) {
    state.wallet = 10000;
    state.ships.Prospector = 1;
    state.positions.Prospector = 'ARC-L1';
  }
  store.states.set('test', state);
  const api = createApi(
    new GameService(
      store,
      () => now,
      () => 0.1,
    ),
    async () => 'test',
    ['http://127.0.0.1:5173'],
  );
  let loseResponse = false;
  await page.route('https://extension-files.twitch.tv/**', (route) => route.abort());
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    const request = route.request();
    const result = await api({
      method: request.method(),
      path: new URL(request.url()).pathname,
      headers: request.headers(),
      body: request.postData() ?? undefined,
    });
    if (loseResponse && request.method() === 'POST') {
      loseResponse = false;
      await route.abort();
      return;
    }
    await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
  });
  await page.goto('/');
  await expect(page.getByText('Local profile only.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mining operations' })).toBeVisible();
  return {
    store,
    drop: () => {
      loseResponse = true;
    },
    advance: async () => {
      now += 1_000_000;
      await navigate(page, 'profile');
      await page.getByRole('button', { name: 'Refresh authoritative state' }).click();
      await expect(page.getByRole('status')).toHaveText('State synchronized.');
    },
  };
}
test('mine → refine → collect → sell persists across refresh with accurate quantities', async ({ page }) => {
  const { store, advance } = await fixture(page);
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Travel ship', exact: true }).selectOption('Prospector');
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('Halo');
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'mining');
  await page.getByRole('button', { name: 'Prospector', exact: false }).click();
  await page.getByRole('button', { name: 'Scan and mine Prospector' }).click();
  await advance();
  await page.getByRole('button', { name: 'Collect mined ore' }).click();
  await expect.poll(() => store.states.get('test')!.pending).toBeNull();
  const inventory = store.states.get('test')!.mining.Prospector;
  const ore = Object.keys(inventory)[0] as Ore;
  expect(inventory[ore]).toBeGreaterThan(0);
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('ARC-L1');
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'refinery');
  await page.getByRole('combobox', { name: 'Mining hold', exact: true }).selectOption('Prospector');
  await page.getByRole('combobox', { name: 'Ore', exact: true }).selectOption(ore);
  await page.getByLabel('Amount (SCU)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Create work order' }).click();
  await expect.poll(() => store.states.get('test')!.orders.length).toBe(1);
  await page.reload();
  await navigate(page, 'refinery');
  await expect(page.getByText('Dinyx Solventation', { exact: true }).last()).toBeVisible();
  await advance();
  await navigate(page, 'refinery');
  await page.getByRole('combobox', { name: 'Cargo ship', exact: true }).selectOption('Nomad');
  await page.getByRole('button', { name: 'Collect into Nomad' }).click();
  await expect.poll(() => store.states.get('test')!.orders.length).toBe(0);
  const units = store.states.get('test')!.cargo.Nomad!.refined[ore]!;
  const balance = store.states.get('test')!.wallet;
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Travel ship', exact: true }).selectOption('Nomad');
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('Area-18');
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'market');
  await page.getByRole('combobox', { name: 'Ore', exact: true }).selectOption(ore);
  await page.getByRole('combobox', { name: 'Material', exact: true }).selectOption('refined');
  await page.getByLabel('Amount (SCU)', { exact: true }).fill(String(units / 100));
  await page.getByRole('button', { name: 'Sell material' }).click();
  await expect.poll(() => store.states.get('test')!.wallet).toBeGreaterThan(balance);
  expect(store.states.get('test')!.cargo.Nomad!.refined[ore]).toBe(0);
  const soldBalance = store.states.get('test')!.wallet;
  await page.reload();
  await expect(page.getByText(soldBalance.toLocaleString('en-US') + ' aUEC', { exact: true })).toBeVisible();
});
test('lost mutation response survives reload and retry without duplication', async ({ page }) => {
  const { store, drop } = await fixture(page);
  await page.getByText('Travel / select a claim', { exact: true }).click();
  drop();
  await page.getByRole('button', { name: 'Start travel' }).click();
  await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeEnabled();
  expect(store.states.get('test')!.revision).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Retry pending action' }).click();
  await expect(page.getByRole('status')).toHaveText('Previous action confirmed. State synchronized.');
  expect(store.states.get('test')!.revision).toBe(1);
});
test('320px panel navigation stays accessible and contains no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await fixture(page);
  for (const name of ['cargo', 'refinery', 'market', 'profile', 'mining']) {
    await navigate(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.keyboard.press('Tab');
  await page.screenshot({ path: 'test-results/dime-panel.png', fullPage: true });
});

test('new zero-balance profile can earn its first wallet credit through hand mining', async ({ page }) => {
  const { store, advance } = await fixture(page, false);
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'mining');
  await page.getByRole('button', { name: 'Scan and mine Hand' }).click();
  await advance();
  await page.getByRole('button', { name: 'Collect mined ore' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'cargo');
  await page.getByRole('button', { name: 'Transfer raw cargo' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await page.getByText('Travel / select a claim', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('Area-18');
  await page.getByRole('button', { name: 'Start travel' }).click();
  await advance();
  await page.getByRole('button', { name: 'Complete arrival' }).click();
  await expect(page.getByRole('status')).toHaveText('Operation saved.');
  await navigate(page, 'market');
  await page.getByRole('button', { name: 'Sell material' }).click();
  await expect.poll(() => store.states.get('test')!.wallet).toBeGreaterThan(0);
  expect(store.states.get('test')!.cargo.Nomad!.raw.Dolivine).toBe(0);
});
test('corrupt retry storage blocks mutations with an explicit error', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('dime-pending-v2:local', 'invalid json'));
  const { store } = await fixture(page);
  await expect(page.getByRole('status')).toContainText('Transactions are disabled');
  await expect(page.getByRole('button', { name: 'Scan and mine Hand' })).toBeDisabled();
  expect(store.states.get('test')!.revision).toBe(0);
});
