import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createApi } from '../../server/http';
import { GameService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { initialState } from '../../shared/game';
import type { Action } from '../../shared/schema';
import { ZONES } from '../../shared/world';
import { walkZoneTo } from './zoneWalking';

test.use({ video: { mode: 'on', size: { width: 360, height: 640 } } });

async function fixture(page: Page) {
  let now = 1_800_000_000_000;
  const player = 'synthetic-m3-player';
  const store = new MemoryStore();
  const fresh = initialState(() => 0.5);
  store.states.set(player, fresh);
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
  const action = async (command: Action) => {
    const state = (await service.snapshot(player)).state;
    await service.mutate(player, {
      requestId: randomUUID(),
      expectedRevision: state.revision,
      action: command,
    });
    await page.reload();
  };
  const finish = async () => {
    now += 1_000_000;
    await action({ type: 'finish' });
  };
  return { store, action, finish };
}

for (const [layout, width, height] of [
  ['panel', 318, 500],
  ['mobile', 360, 640],
] as const) {
  test(`${layout}: one global synthetic state renders four authoritative locations and resets to ARC-L1`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    const { store, action, finish } = await fixture(page);
    const manifest: object[] = [];
    const shot = async (label: string) => {
      const state = store.states.get('synthetic-m3-player')!;
      const zone = ZONES[state.world!.zone];
      await expect(page.getByRole('img', { name: `Original pixel-art map of ${zone.label}` })).toBeVisible();
      if (
        ['arc-l1-refinery', 'arc-l1-cargo', 'area18-market', 'lyria-east-yard', 'wala-south-yard'].includes(
          label,
        )
      ) {
        const service = zone.objects.find((object) =>
          ['refinery', 'cargo', 'market', 'equipment'].includes(object.kind),
        );
        if (service) await walkZoneTo(page, zone, state.world!.entry, [service.x, service.y]);
      }
      if (state.location === 'ARC-L1')
        await expect(page.getByRole('img', { name: /Lyria Mining Outpost/ })).toHaveCount(0);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
      const filename = `test-results/m3-world/${layout}-${label}.png`;
      await page.screenshot({ path: filename });
      manifest.push({
        scenarioStep: label,
        location: state.location,
        zone: state.world!.zone,
        wallet: state.wallet,
        objective: state.firstShift?.objective ?? 'SPEAK_TO_FOREMAN',
        filename,
      });
    };
    await shot('arc-l1-arrival');
    await action({ type: 'enterZone', zone: 'ARC_L1_CONCOURSE' });
    await shot('arc-l1-concourse');
    await action({ type: 'enterZone', zone: 'ARC_L1_TRANSIT' });
    await action({ type: 'enterZone', zone: 'ARC_L1_REFINERY' });
    await shot('arc-l1-refinery');
    await action({ type: 'enterZone', zone: 'ARC_L1_TRANSIT' });
    await action({ type: 'enterZone', zone: 'ARC_L1_CARGO' });
    await shot('arc-l1-cargo');
    await action({ type: 'enterZone', zone: 'ARC_L1_TRANSIT' });
    await action({ type: 'enterZone', zone: 'ARC_L1_EQUIPMENT' });
    await shot('arc-l1-equipment');
    await action({ type: 'enterZone', zone: 'ARC_L1_TRANSIT' });
    await action({ type: 'enterZone', zone: 'ARC_L1_DEPARTURE' });
    await shot('arc-l1-departure');
    await action({ type: 'assignDeparture', ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    await shot('arc-l1-assigned-ship');
    await action({ type: 'enterZone', zone: 'ARC_L1_HANGAR' });
    await shot('arc-l1-assigned-hangar');
    await action({ type: 'travel', ship: 'Nomad', destination: 'Lyria', loadRoc: false });
    await shot('arc-l1-to-lyria-departure');
    await finish();
    await shot('lyria-arrival');
    await action({ type: 'enterZone', zone: 'LYRIA_ASOP' });
    await shot('lyria-asop');
    await action({ type: 'enterZone', zone: 'LYRIA_OUTPOST_01' });
    await action({ type: 'enterZone', zone: 'LYRIA_SURFACE_01' });
    await shot('lyria-surface');
    await action({ type: 'enterZone', zone: 'LYRIA_CAVE_01' });
    await shot('lyria-cave');
    await action({ type: 'enterZone', zone: 'LYRIA_SURFACE_01' });
    await action({ type: 'enterZone', zone: 'LYRIA_SURFACE_02' });
    await shot('lyria-haul-trail');
    await action({ type: 'enterZone', zone: 'LYRIA_OUTPOST_02' });
    await shot('lyria-east-yard');
    await action({ type: 'enterZone', zone: 'LYRIA_OUTPOST_01' });
    await action({ type: 'assignDeparture', ship: 'Nomad', destination: 'Wala', loadRoc: false });
    await action({ type: 'enterZone', zone: 'LYRIA_LANDING_PAD' });
    await shot('lyria-departure-pad');
    await action({ type: 'travel', ship: 'Nomad', destination: 'Wala', loadRoc: false });
    await finish();
    await shot('wala-outpost');
    await action({ type: 'enterZone', zone: 'WALA_SURFACE_01' });
    await shot('wala-surface');
    await action({ type: 'enterZone', zone: 'WALA_CAVE_01' });
    await shot('wala-cave');
    await action({ type: 'enterZone', zone: 'WALA_SURFACE_01' });
    await action({ type: 'enterZone', zone: 'WALA_SURFACE_02' });
    await shot('wala-switchback');
    await action({ type: 'enterZone', zone: 'WALA_OUTPOST_02' });
    await shot('wala-south-yard');
    await action({ type: 'enterZone', zone: 'WALA_OUTPOST_01' });
    await action({ type: 'assignDeparture', ship: 'Nomad', destination: 'Area-18', loadRoc: false });
    await action({ type: 'enterZone', zone: 'WALA_LANDING_PAD' });
    await shot('wala-departure-pad');
    await action({ type: 'travel', ship: 'Nomad', destination: 'Area-18', loadRoc: false });
    await finish();
    await shot('area18-spaceport');
    await action({ type: 'enterZone', zone: 'AREA18_SECURITY' });
    await shot('area18-port-checkpoint');
    await action({ type: 'enterZone', zone: 'AREA18_SPACEPORT_PLATFORM' });
    await shot('area18-spaceport-platform');
    await action({ type: 'enterZone', zone: 'AREA18_SHUTTLE' });
    await shot('area18-shuttle-journey');
    await action({ type: 'enterZone', zone: 'AREA18_CITY_PLATFORM' });
    await shot('area18-city-platform');
    await action({ type: 'enterZone', zone: 'AREA18_TRANSIT' });
    await shot('area18-transit');
    await action({ type: 'enterZone', zone: 'AREA18_PLAZA' });
    await shot('area18-plaza');
    await action({ type: 'enterZone', zone: 'AREA18_MARKET' });
    await shot('area18-market');
    await action({ type: 'enterZone', zone: 'AREA18_INDUSTRIAL' });
    await shot('area18-industrial');
    await action({ type: 'enterZone', zone: 'AREA18_ALLEY' });
    await shot('area18-alley');
    await action({ type: 'enterZone', zone: 'AREA18_RETAIL' });
    await shot('area18-retail');
    await page.getByRole('button', { name: 'Open game menu' }).click();
    await page
      .getByRole('navigation', { name: 'Game menu' })
      .getByRole('button', { name: 'Profile' })
      .click();
    await page.getByRole('button', { name: 'Reset Game Progress', exact: true }).click();
    await page.getByLabel(/Type exactly:/).fill('RESET MY DIME PROFILE');
    await page.getByRole('button', { name: 'Reset All My Game Progress' }).click();
    await expect(
      page.getByRole('img', { name: 'Original pixel-art map of ARC-L1 Habitation' }),
    ).toBeVisible();
    expect(store.states.get('synthetic-m3-player')?.world?.zone).toBe('ARC_L1_START');
    await page.screenshot({ path: `test-results/m3-world/${layout}-reset-arc-l1.png` });
    manifest.push({
      scenarioStep: 'reset-arc-l1',
      location: 'ARC-L1',
      zone: 'ARC_L1_START',
      wallet: 0,
      objective: 'SPEAK_TO_FOREMAN',
      filename: `test-results/m3-world/${layout}-reset-arc-l1.png`,
    });
    await writeFile(`test-results/m3-world/${layout}-manifest.json`, JSON.stringify(manifest, null, 2));
  });
}
