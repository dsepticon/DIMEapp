import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
it('guest release candidate changes only the additive static asset allowlist', () => {
  const before = readFileSync('infra/web/guest-review/status-function.js', 'utf8');
  const after = readFileSync('docs/dime-m44-industrial-services-review/guest-function.review.js', 'utf8');
  const review = JSON.parse(
    readFileSync('docs/dime-m44-industrial-services-review/guest-publication.review.json', 'utf8'),
  );
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  expect(review.reviewOnly).toBe(true);
  expect(review.routing.beforeSha256).toBe(hash(before));
  expect(review.routing.afterSha256).toBe(hash(after));
  expect(after.replace(/ {2}var files = \[[^\n]+\];/, '')).toBe(
    before.replace(/ {2}var files = \[[^\n]+\];/, ''),
  );
  expect(review.routing.removedAssets).toEqual([]);
  expect(review.routing.behaviorChanges).toEqual([]);
  expect(review.routing.addedAssets).toHaveLength(2);
  for (const path of review.routing.addedAssets) {
    expect(path).toMatch(/^\/game\/0\.9\.0\/assets\/[A-Za-z0-9_-]+\.(js|css)$/);
    const result = runInNewContext(after + '\nhandler(event)', {
      event: { request: { uri: path, method: 'GET' } },
    });
    expect(result.uri).toBe(path);
    expect(result.statusCode).toBeUndefined();
  }
  for (const uri of [
    '/api/v4/state',
    '/api/v4/actions',
    '/api/v4/profile/reset',
    '/api/v4/content/convert',
    '/game/status',
    '/game/',
    '/game/missing',
  ]) {
    const event = { request: { uri, method: 'GET' } };
    const invoke = (source: string) =>
      JSON.stringify(runInNewContext(source + '\nhandler(event)', { event: structuredClone(event) }));
    expect(invoke(after)).toBe(invoke(before));
  }
});
