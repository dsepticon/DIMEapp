import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { writePendingRecord } from '../../app/pendingRecovery';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { firstShiftOf } from '../../shared/firstShift';
import { initialState } from '../../shared/game';
import type { Mutation, PlayerState } from '../../shared/schema';

const storageKey = 'dime-pending-v2:local';
const acceptRequest = (revision: number): Mutation => ({
  requestId: randomUUID(),
  expectedRevision: revision,
  action: { type: 'firstShift', step: 'accept' },
});

async function setup(
  page: Page,
  state: PlayerState,
  request: Mutation,
  options: { legacyStorage?: boolean; alreadyApplied?: boolean; failFirstPost?: boolean } = {},
) {
  const store = new MemoryStore();
  store.states.set('synthetic-player', state);
  const service = new GameService(
    store,
    () => 1_800_000_000_000,
    () => 0.5,
  );
  if (options.alreadyApplied) await service.mutate('synthetic-player', request);
  const stored = options.legacyStorage
    ? JSON.stringify(request)
    : writePendingRecord({ request, saveGeneration: state.saveGeneration });
  await page.addInitScript(
    ({ pending, unrelated }) => {
      if (!sessionStorage.getItem('synthetic-pending-seeded')) {
        sessionStorage.setItem('dime-pending-v2:local', pending);
        sessionStorage.setItem('unrelated-session-entry', unrelated);
        sessionStorage.setItem('synthetic-pending-seeded', '1');
      }
    },
    { pending: stored, unrelated: 'keep' },
  );
  const api = createApi(service, async () => 'synthetic-player', ['http://127.0.0.1:5173']);
  const posts: string[] = [];
  let fail = options.failFirstPost ?? false;
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    const incoming = route.request();
    if (incoming.method() === 'POST') {
      posts.push((JSON.parse(incoming.postData() ?? '{}') as Mutation).requestId);
      if (fail) {
        fail = false;
        await route.abort();
        return;
      }
    }
    const response = await api({
      method: incoming.method(),
      path: new URL(incoming.url()).pathname,
      headers: incoming.headers(),
      body: incoming.postData() ?? undefined,
    });
    await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
  });
  await page.goto('/');
  return { store, service, posts };
}

for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: accepted Mara action with lost response replays its receipt once`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const state = initialState(() => 0.5);
    state.saveGeneration = randomUUID();
    state.location = 'Lyria';
    state.positions.Nomad = 'Lyria';
    const request = acceptRequest(0);
    const { store, service, posts } = await setup(page, state, request, { alreadyApplied: true });
    await expect(page.getByRole('status')).toContainText('Previous action confirmed');
    expect(store.states.get('synthetic-player')?.firstShift?.status).toBe('ACTIVE');
    expect(store.states.get('synthetic-player')?.revision).toBe(1);
    expect(posts).toEqual([request.requestId]);
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem('unrelated-session-entry'))).toBe('keep');
    await expect(
      service.mutate('synthetic-player', {
        ...acceptRequest(1),
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'QUEST_ORDER' });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
    expect(store.states.get('synthetic-player')?.revision).toBe(1);
  });

  test(`${layout}: wiped legacy save exposes only a verified obsolete discard`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const current = initialState(() => 0.5);
    current.saveGeneration = randomUUID();
    const oldRequest = acceptRequest(5);
    const { store, posts } = await setup(page, current, oldRequest, { legacyStorage: true });
    await expect(page.getByRole('button', { name: 'Discard obsolete pending action' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
    expect(posts).toHaveLength(0);
    expect(store.states.get('synthetic-player')?.revision).toBe(0);
    await page.getByRole('button', { name: 'Discard obsolete pending action' }).click();
    await expect(page.getByRole('button', { name: 'Discard obsolete pending action' })).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem('unrelated-session-entry'))).toBe('keep');
    expect(store.states.get('synthetic-player')?.firstShift).toBeUndefined();
  });
}

test('Mara acceptance that never reached the backend retries once with its original request ID', async ({
  page,
}) => {
  const state = initialState(() => 0.5);
  state.saveGeneration = randomUUID();
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  const request = acceptRequest(0);
  const { store, posts } = await setup(page, state, request);
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
  expect(posts).toEqual([request.requestId]);
  expect(store.states.get('synthetic-player')?.firstShift?.status).toBe('ACTIVE');
  expect(store.states.get('synthetic-player')?.revision).toBe(1);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
});

test('an unconfirmed response retries after refresh in the same tab, while a new tab has no session pending', async ({
  page,
  context,
}) => {
  const state = initialState(() => 0.5);
  state.saveGeneration = randomUUID();
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  const request = acceptRequest(0);
  const { store, posts } = await setup(page, state, request, { failFirstPost: true });
  await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeVisible();
  expect(store.states.get('synthetic-player')?.revision).toBe(0);
  await page.reload();
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
  expect(posts).toEqual([request.requestId, request.requestId]);
  expect(store.states.get('synthetic-player')?.revision).toBe(1);
  const freshTab = await context.newPage();
  await freshTab.route('http://127.0.0.1:8787/**', async (route) => {
    const response = await createApi(new GameService(store), async () => 'synthetic-player', [
      'http://127.0.0.1:5173',
    ])({
      method: route.request().method(),
      path: new URL(route.request().url()).pathname,
      headers: route.request().headers(),
      body: route.request().postData() ?? undefined,
    });
    await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
  });
  await freshTab.goto('/');
  await expect(freshTab.getByRole('button', { name: 'Retry pending action' })).toHaveCount(0);
  expect(await freshTab.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
  expect(store.states.get('synthetic-player')?.revision).toBe(1);
  await freshTab.close();
});

test('stale revision and conflicting payload retain the original pending action', async ({ page }) => {
  const state = initialState(() => 0.5);
  state.saveGeneration = randomUUID();
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  state.revision = 1;
  const request = acceptRequest(0);
  const { store, posts } = await setup(page, state, request);
  await expect(page.getByRole('status')).toContainText('stale save revision');
  await expect(page.getByRole('button', { name: 'Retry pending action' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard obsolete pending action' })).toHaveCount(0);
  expect(posts).toEqual([request.requestId]);
  expect(store.states.get('synthetic-player')?.revision).toBe(1);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).not.toBeNull();
});

test('an existing receipt with the same ID and different payload is rejected without clearing storage', async ({
  page,
}) => {
  const state = initialState(() => 0.5);
  state.saveGeneration = randomUUID();
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  const original = acceptRequest(0);
  const changed: Mutation = { ...original, action: { type: 'firstShift', step: 'checkTool' } };
  const store = new MemoryStore();
  store.states.set('synthetic-player', state);
  const service = new GameService(
    store,
    () => 1_800_000_000_000,
    () => 0.5,
  );
  await service.mutate('synthetic-player', original);
  const stored = writePendingRecord({ request: changed, saveGeneration: state.saveGeneration });
  await page.addInitScript((value) => sessionStorage.setItem('dime-pending-v2:local', value), stored);
  const api = createApi(service, async () => 'synthetic-player', ['http://127.0.0.1:5173']);
  await page.route('http://127.0.0.1:8787/**', async (route) => {
    const request = route.request();
    const response = await api({
      method: request.method(),
      path: new URL(request.url()).pathname,
      headers: request.headers(),
      body: request.postData() ?? undefined,
    });
    await route.fulfill({ status: response.statusCode, headers: response.headers, body: response.body });
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('different action');
  expect(store.states.get('synthetic-player')?.revision).toBe(1);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).not.toBeNull();
});

test('a lost Mara completion response cannot grant its reward twice', async ({ page }) => {
  const state = initialState(() => 0.5);
  state.saveGeneration = randomUUID();
  state.location = 'Lyria';
  state.positions.Nomad = 'Lyria';
  state.revision = 5;
  state.wallet = 5200;
  state.firstShift = {
    ...firstShiftOf(state),
    status: 'ACTIVE',
    objective: 'RETURN_TO_FOREMAN',
    acceptedAt: 1_800_000_000_000 - 1000,
    counters: { mined: 4, refined: 0, sold: 4 },
  };
  const request: Mutation = {
    requestId: randomUUID(),
    expectedRevision: 5,
    action: { type: 'firstShift', step: 'complete' },
  };
  const { store, service, posts } = await setup(page, state, request, { alreadyApplied: true });
  await expect(page.getByRole('status')).toContainText('Previous action confirmed');
  expect(posts).toEqual([request.requestId]);
  expect(store.states.get('synthetic-player')?.wallet).toBe(5700);
  expect(store.states.get('synthetic-player')?.firstShift?.rewardClaimed).toBe(true);
  await page.reload();
  expect(store.states.get('synthetic-player')?.wallet).toBe(5700);
  await expect(
    service.mutate('synthetic-player', {
      requestId: randomUUID(),
      expectedRevision: 6,
      action: { type: 'firstShift', step: 'complete' },
    }),
  ).rejects.toMatchObject({ code: 'QUEST_ORDER' });
});
