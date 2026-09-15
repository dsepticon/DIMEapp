import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

const layouts = [
  { name: 'panel', width: 318, height: 500 },
  { name: 'mobile', width: 360, height: 640 },
  { name: 'web', width: 1024, height: 768 },
] as const;

async function pulseToFracture(page: Page) {
  const holdControl = page.getByRole('button', { name: 'Hold mining control' });
  const needle = page.locator('.needle');
  await holdControl.dispatchEvent('pointerdown', { pointerId: 1 });
  await expect(needle).toBeVisible();
  let down = true;
  for (let attempt = 0; attempt < 180; attempt++) {
    const charge = Number((await needle.getAttribute('style'))?.match(/left:\s*([\d.]+)%/)?.[1] ?? 0);
    const shouldHold = charge < 68;
    if (shouldHold !== down) {
      await holdControl.dispatchEvent(shouldHold ? 'pointerdown' : 'pointerup', { pointerId: 1 });
      down = shouldHold;
    }
    if (
      await page
        .locator('footer')
        .textContent()
        .then((text) => text?.includes('fractured'))
    )
      break;
    await page.waitForTimeout(55);
  }
  if (down) await holdControl.dispatchEvent('pointerup', { pointerId: 1 });
  await expect(page.locator('footer')).toContainText('fractured');
}

for (const layout of layouts) {
  test(`local mining prototype in ${layout.name}`, async ({ page }) => {
    await page.setViewportSize(layout);
    await page.goto('/prototype.html');
    await expect(page.getByText('Development-only · synthetic state')).toBeVisible();
    await expect(page.getByLabel('Mining HUD')).toBeHidden();
    const hold = page.getByRole('button', { name: 'Hold mining control' });
    await hold.dispatchEvent('pointerdown', { pointerId: 1 });
    await expect(page.getByLabel('Mining HUD')).toBeVisible();
    await page.waitForTimeout(180);
    const rising = Number(
      (
        await page
          .getByText(/Charge \d+%/)
          .first()
          .textContent()
      )?.match(/\d+/)?.[0],
    );
    expect(rising).toBeGreaterThan(0);
    await hold.dispatchEvent('pointerup', { pointerId: 1 });
    await page.waitForTimeout(180);
    const falling = Number(
      (
        await page
          .getByText(/Charge \d+%/)
          .first()
          .textContent()
      )?.match(/\d+/)?.[0],
    );
    expect(falling).toBeLessThan(rising);
    await expect(page.getByLabel('Mining HUD')).toBeVisible();
    await page.screenshot({ path: `/tmp/dime-m4-review/m4-hud-${layout.name}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);
    await page.reload();
    await expect(page.getByLabel('Mining HUD')).toBeHidden();

    await page.getByRole('button', { name: 'Reset node' }).click();
    await page.getByLabel('Reduced motion').check();
    await page.keyboard.down('Space');
    await page.waitForTimeout(250);
    await expect(page.getByLabel('Mining HUD')).toBeVisible();
    await page.screenshot({ path: `/tmp/dime-m4-review/m4-reduced-motion-${layout.name}.png` });
    await page.keyboard.up('Space');
    await page.getByRole('button', { name: 'Switch tool mode' }).click();
    await expect(page.getByRole('button', { name: 'Hold mining control' })).toContainText('vacuum');
  });
}

test('pulsed fracture, synthetic capacity refusal, vacuum recovery, and overcharge evidence', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 318, height: 500 });
  await page.goto('/prototype.html');
  await expect(page.getByText('Development-only · synthetic state')).toBeVisible();
  await pulseToFracture(page);
  await expect(page.getByLabel('Ground pieces').getByRole('button')).toHaveCount(3);
  await page.screenshot({ path: '/tmp/dime-m4-review/m4-fractured-panel.png' });
  await page.reload();
  await expect(page.getByLabel('Ground pieces').getByRole('button')).toHaveCount(3);
  await expect(page.locator('footer')).toContainText('Conservation 199 / 199');
  await page.getByRole('button', { name: 'Switch tool mode' }).click();
  await page.getByLabel('Hold capacity').fill('0');
  await page.getByRole('button', { name: /Fragment 1/ }).click();
  await page.keyboard.down('Space');
  await expect(page.getByRole('status')).toContainText('Hold full.', { timeout: 3000 });
  await page.keyboard.up('Space');
  await expect(page.getByRole('button', { name: /Fragment 1/ })).toBeEnabled();
  await expect(page.locator('footer')).toContainText('Conservation 199 / 199');
  await page.screenshot({ path: '/tmp/dime-m4-review/m4-full-hold-panel.png' });
  await page.reload();
  await expect(page.getByLabel('Hold capacity')).toHaveValue('0');
  await page.getByRole('button', { name: 'Switch tool mode' }).click();
  await expect(page.getByRole('button', { name: /Fragment 1/ })).toBeEnabled();
  await page.getByLabel('Hold capacity').fill('1200');
  await page.getByLabel('Fail next collection').check();
  await page.getByRole('button', { name: /Fragment 1/ }).click();
  await page.keyboard.down('Space');
  await expect(page.getByRole('status')).toContainText('Synthetic network failure', { timeout: 3000 });
  await page.keyboard.up('Space');
  await expect(page.getByRole('button', { name: /Fragment 1/ })).toBeEnabled();
  await expect(page.locator('footer')).toContainText('Conservation 199 / 199');
  await page.getByRole('button', { name: /Fragment 1/ }).click();
  await page.keyboard.down('Space');
  await page.waitForTimeout(220);
  await page.screenshot({ path: '/tmp/dime-m4-review/m4-vacuum-active-panel.png' });
  await expect(page.getByRole('status')).toContainText('Fragment accepted', { timeout: 3000 });
  await page.keyboard.up('Space');
  await expect(page.getByLabel('Ground pieces').getByRole('button').first()).toBeDisabled();
  await expect(page.locator('footer')).toContainText('Conservation 199 / 199');
  await page.screenshot({ path: '/tmp/dime-m4-review/m4-vacuum-panel.png' });
  await page.reload();
  await expect(page.getByLabel('Ground pieces').getByRole('button').first()).toHaveText('Collected');
  await expect(page.getByLabel('Ground pieces').getByRole('button').first()).toBeDisabled();
  await expect(page.locator('footer')).toContainText('Conservation 199 / 199');

  await page.getByRole('button', { name: 'Reset node' }).click();
  await page.keyboard.down('Space');
  await expect(page.getByText('DANGER · release')).toBeVisible({ timeout: 4000 });
  await page.screenshot({ path: '/tmp/dime-m4-review/m4-overcharge-warning-panel.png' });
  await expect(page.getByRole('status')).toContainText('Zero yield', { timeout: 3000 });
  await page.keyboard.up('Space');
  await expect(page.getByLabel('Ground pieces')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/dime-m4-review/m4-destroyed-panel.png' });
});

test('mouse, touch and eight-piece maximum-particle frame study', async ({ page, browser }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 318, height: 500 });
  await page.goto('/prototype.html');
  await expect(page.getByText('Development-only · synthetic state')).toBeVisible();
  const hold = page.getByRole('button', { name: 'Hold mining control' });
  const box = await hold.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(130);
  const mouseCharge = Number(
    (
      await page
        .getByText(/Charge \d+%/)
        .first()
        .textContent()
    )?.match(/\d+/)?.[0],
  );
  expect(mouseCharge).toBeGreaterThan(0);
  await page.mouse.up();
  await expect(page.getByLabel('Mining HUD')).toBeVisible();
  await page.getByRole('button', { name: 'Reset node' }).click();
  const touchBox = await hold.boundingBox();
  expect(touchBox).not.toBeNull();
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const touchPoint = { x: touchBox!.x + touchBox!.width / 2, y: touchBox!.y + touchBox!.height / 2 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] });
  await page.waitForTimeout(130);
  const touchCharge = Number(
    (
      await page
        .getByText(/Charge \d+%/)
        .first()
        .textContent()
    )?.match(/\d+/)?.[0],
  );
  expect(touchCharge).toBeGreaterThan(0);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByLabel('Mining HUD')).toBeVisible();

  for (const count of [3, 4, 5, 6, 7, 8]) {
    await page.getByLabel('Piece fixture').selectOption(String(count));
    await page.getByRole('button', { name: 'Reset node' }).click();
    await pulseToFracture(page);
    await expect(page.getByLabel('Ground pieces').getByRole('button')).toHaveCount(count);
    await page.screenshot({ path: `/tmp/dime-m4-review/m4-fracture-${count}-panel.png` });
  }
  await page.getByLabel('96-particle stress').check();
  const measurements = [];
  for (const layout of layouts) {
    await page.setViewportSize(layout);
    await page.evaluate(() => {
      (window as Window & { __m4RenderTimings?: number[] }).__m4RenderTimings = [];
    });
    await page.screenshot({ path: `/tmp/dime-m4-review/m4-eight-pieces-${layout.name}.png` });
    const sample = await page.evaluate(async () => {
      const durations: number[] = [];
      let previous = 0;
      await new Promise<void>((resolve) => {
        const step = (time: number) => {
          if (previous) durations.push(time - previous);
          previous = time;
          if (durations.length < 180) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      durations.sort((a, b) => a - b);
      const renderTimings = [
        ...((window as Window & { __m4RenderTimings?: number[] }).__m4RenderTimings ?? []),
      ].sort((a, b) => a - b);
      return {
        averageMs: durations.reduce((a, b) => a + b, 0) / durations.length,
        p95Ms: durations[Math.floor(durations.length * 0.95)],
        worstMs: durations.at(-1),
        renderAverageMs: renderTimings.reduce((a, b) => a + b, 0) / renderTimings.length,
        renderP95Ms: renderTimings[Math.floor(renderTimings.length * 0.95)],
        renderWorstMs: renderTimings.at(-1),
        renderSamples: renderTimings.length,
        canvasCount: document.querySelectorAll('canvas').length,
        domNodes: document.querySelectorAll('*').length,
        documentScroll: document.documentElement.scrollHeight > innerHeight,
      };
    });
    measurements.push({ layout: layout.name, ...sample });
  }
  writeFileSync(
    '/tmp/dime-m4-review/m4-performance.json',
    JSON.stringify(
      {
        browser: browser.version(),
        platform: process.platform,
        architecture: process.arch,
        logicalCpus: cpus().length,
        build: 'Vite development-only prototype; not a production or Twitch-webview benchmark',
        scene: 'one canvas, eight pieces, 96 synthetic particles, 180 frames per layout',
        measurements,
      },
      null,
      2,
    ),
  );
  expect(measurements.every((sample) => sample.canvasCount === 1 && !sample.documentScroll)).toBe(true);
});
