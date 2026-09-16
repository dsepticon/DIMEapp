import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const host = 'https://destroyaindustriesminingextension.com';
const review = JSON.parse(readFileSync('infra/web/guest-review/distribution-diff.json', 'utf8'));
const source = readFileSync('infra/web/guest-review/status-function.js', 'utf8');
const security = JSON.parse(readFileSync('infra/web/guest-review/security-headers.json', 'utf8'));
const manifest = JSON.parse(readFileSync('docs/dime-m43-game-publication-manifest.json', 'utf8'));

test('production-path routing smoke: unchanged default, scoped entry/assets, exact API gate, no fallback', async ({
  page,
}) => {
  let originCalls = 0;
  const select = (uri: string) =>
    review.proposed.CacheBehaviors.Items.find((b: { PathPattern: string }) =>
      b.PathPattern === '/game/*' ? uri.startsWith('/game/') : uri === b.PathPattern,
    );
  await page.route(host + '/**', async (route) => {
    const req = route.request(),
      uri = new URL(req.url()).pathname;
    const behavior = select(uri);
    if (!behavior) {
      originCalls++;
      // Synthetic unchanged-origin fixture; real root/privacy bytes are verified separately over HTTPS.
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/html',
          'cache-control': 'max-age=123',
          'x-original-origin': 'unchanged',
        },
        body: '<!doctype html><p>Existing unrelated website</p>',
      });
      return;
    }
    const result = runInNewContext(source + '\nhandler(event)', {
      event: { request: { uri, method: req.method() } },
    }) as { statusCode?: number; body?: string; uri: string; headers?: Record<string, { value: string }> };
    if (result.statusCode) {
      await route.fulfill({
        status: result.statusCode,
        headers: Object.fromEntries(Object.entries(result.headers ?? {}).map(([k, v]) => [k, v.value])),
        body: result.body,
      });
      return;
    }
    originCalls++;
    const entry = manifest.entries.find((e: { key: string }) => '/' + e.key === result.uri);
    expect(entry).toBeTruthy();
    const file = result.uri === '/game/index.html' ? 'index.html' : result.uri.replace('/game/0.9.0/', '');
    await route.fulfill({
      status: 200,
      headers: { ...security, 'content-type': entry.contentType, 'cache-control': entry.cacheControl },
      body: readFileSync('dist/guest/' + file),
    });
  });
  await page.goto(host + '/');
  const data = await page.evaluate(async () => {
    const results: Record<
      string,
      { status: number; csp: string | null; cache: string | null; original: string | null; body: string }
    > = {};
    for (const path of [
      '/',
      '/privacy',
      '/auth/status',
      '/auth/logout',
      '/auth/delete/resume',
      '/state',
      '/v4/actions',
      '/assets/old.js',
      '/unrelated',
      '/game/',
      '/game/index.html',
      '/game/status',
      '/game/0.9.0/missing.js',
      '/api/v4/actions/extra',
    ]) {
      const r = await fetch(path);
      results[path] = {
        status: r.status,
        csp: r.headers.get('content-security-policy'),
        cache: r.headers.get('cache-control'),
        original: r.headers.get('x-original-origin'),
        body: await r.text(),
      };
    }
    return results;
  });
  for (const path of [
    '/',
    '/privacy',
    '/auth/status',
    '/auth/logout',
    '/auth/delete/resume',
    '/state',
    '/v4/actions',
    '/assets/old.js',
    '/unrelated',
    '/api/v4/actions/extra',
  ]) {
    expect(data[path]?.original).toBe('unchanged');
    expect(data[path]?.csp).toBeNull();
    expect(data[path]?.cache).toBe('max-age=123');
  }
  for (const path of ['/game/', '/game/index.html']) {
    expect(data[path]?.status).toBe(200);
    expect(data[path]?.csp).toBe(security['Content-Security-Policy']);
    expect(data[path]?.cache).toContain('no-cache');
    expect(data[path]?.body).toContain('/game/0.9.0/assets/');
  }
  expect(data['/game/0.9.0/missing.js']?.status).toBe(404);
  expect(data['/game/0.9.0/missing.js']?.body).not.toContain('<html');
  expect(JSON.parse(data['/game/status']!.body).guestStorage).toBe('memory');
  const before = originCalls;
  const codes = await page.evaluate(async () => {
    const codes = [];
    for (const path of [
      '/api/v4/state',
      '/api/v4/actions',
      '/api/v4/profile/reset',
      '/api/v4/content/convert',
    ])
      for (const method of ['GET', 'POST', 'OPTIONS']) codes.push((await fetch(path, { method })).status);
    return codes;
  });
  expect(codes).toEqual(Array(12).fill(401));
  expect(originCalls).toBe(before);
  for (const entry of manifest.entries.filter((e: { key: string }) => !e.key.endsWith('.html'))) {
    const result = await page.evaluate(async (path: string) => {
      const r = await fetch(path);
      return {
        status: r.status,
        cache: r.headers.get('cache-control'),
        csp: r.headers.get('content-security-policy'),
      };
    }, '/' + entry.key);
    expect(result).toEqual({
      status: 200,
      cache: entry.cacheControl,
      csp: security['Content-Security-Policy'],
    });
  }
  await page.goto(host + '/game/');
  await expect(page.locator('canvas')).toHaveAttribute('data-zone', 'zone.z001');
  await expect(page.getByText('Guest Demo — progress is not saved', { exact: true })).toBeVisible();
});
