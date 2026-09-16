import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
const source = readFileSync('infra/web/guest-review/status-function.js', 'utf8');
const invoke = (request: unknown) =>
  JSON.parse(JSON.stringify(runInNewContext(source + '\nhandler(event)', { event: { request } })));
const denied = ['/api/v4/state', '/api/v4/actions', '/api/v4/profile/reset', '/api/v4/content/convert'];
it('scoped edge returns capability, exact denials, entry rewrite and missing-file 404 without reading credentials', () => {
  const result = invoke({ method: 'GET', uri: '/game/status' });
  expect(JSON.parse(result.body)).toEqual({
    guestDemoAvailable: true,
    guestStorage: 'memory',
    signInAvailable: false,
    linkingAvailable: false,
  });
  expect(result.headers['cache-control'].value).toBe('no-store');
  expect(invoke({ method: 'GET', uri: '/game/' }).uri).toBe('/game/index.html');
  for (const uri of [
    '/game/0.9.0/missing.js',
    '/game/missing',
    '/game/0.9.0/assets/unknown.js',
    '/game/status/',
  ])
    expect(invoke({ method: 'GET', uri }).statusCode).toBe(404);
  for (const uri of denied)
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const request = {
        method,
        uri,
        get headers(): never {
          throw Error('Must not inspect headers');
        },
        get querystring(): never {
          throw Error('Must not inspect query');
        },
      };
      expect(invoke(request).statusCode).toBe(401);
    }
  for (const uri of [
    '/',
    '/privacy',
    '/privacy/',
    '/assets/old.js',
    '/images/a.png',
    '/auth/login',
    '/auth/callback',
    '/auth/logout',
    '/auth/delete/resume',
    '/auth/status',
    '/state',
    '/actions',
    '/v4/actions',
    '/api/v4/actions/extra',
    '/other',
  ]) {
    const request = { method: 'GET', uri };
    expect(invoke(request).statusCode).toBe(401);
  }
});
it('review resources contain only scoped function, headers and zero-minimum origin-controlled cache', () => {
  const template = JSON.parse(readFileSync('infra/web/guest-review/auxiliary-template.json', 'utf8'));
  expect(
    Object.values(template.Resources)
      .map((r) => (r as { Type: string }).Type)
      .sort(),
  ).toEqual([
    'AWS::CloudFront::CachePolicy',
    'AWS::CloudFront::Function',
    'AWS::CloudFront::ResponseHeadersPolicy',
  ]);
  expect(JSON.stringify(template)).not.toMatch(/secretsmanager|dynamodb|AWS::IAM|AWS::Lambda/);
  expect(template.Resources.GuestCapability.Properties.FunctionCode).toBe(source);
  const cache = template.Resources.GuestCache.Properties.CachePolicyConfig;
  expect([cache.MinTTL, cache.DefaultTTL, cache.MaxTTL]).toEqual([0, 0, 31536000]);
  expect(cache.ParametersInCacheKeyAndForwardedToOrigin).toEqual({
    EnableAcceptEncodingGzip: true,
    EnableAcceptEncodingBrotli: true,
    CookiesConfig: { CookieBehavior: 'none' },
    HeadersConfig: { HeaderBehavior: 'none' },
    QueryStringsConfig: { QueryStringBehavior: 'none' },
  });
  const headers = JSON.parse(readFileSync('infra/web/guest-review/security-headers.json', 'utf8'));
  expect(headers['Strict-Transport-Security']).toBeUndefined();
  expect(
    template.Resources.GuestHeaders.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
      .StrictTransportSecurity,
  ).toBeUndefined();
  expect(
    template.Resources.GuestHeaders.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
      .ContentSecurityPolicy.ContentSecurityPolicy,
  ).toBe(headers['Content-Security-Policy']);
});
it('candidate preserves every property except five ordered behaviors; exact path selection cannot capture unrelated requests', () => {
  // Synthetic policy identifiers are test-only, never deployment inputs.
  const old = {
    TargetOriginId: 'website',
    CachePolicyId: 'old',
    ViewerProtocolPolicy: 'redirect-to-https',
    AllowedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
  };
  const config = {
    Aliases: { Items: ['destroyaindustriesminingextension.com'] },
    DefaultCacheBehavior: old,
    DefaultRootObject: '',
    CustomErrorResponses: { Quantity: 0 },
    Origins: { Quantity: 1, Items: [{ Id: 'website', DomainName: 'existing' }] },
    CacheBehaviors: { Quantity: 0 },
  };
  const dir = mkdtempSync(join(tmpdir(), 'dime-routing-test-'));
  writeFileSync(join(dir, 'before.json'), JSON.stringify({ ETag: 'synthetic', DistributionConfig: config }));
  execFileSync(process.execPath, [
    'scripts/prepare-guest-routing.mjs',
    join(dir, 'before.json'),
    'arn:aws:cloudfront::861738068626:function/synthetic-test-only',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    join(dir, 'after.json'),
  ]);
  const after = JSON.parse(readFileSync(join(dir, 'after.json'), 'utf8')).DistributionConfig;
  expect({ ...after, CacheBehaviors: config.CacheBehaviors }).toEqual(config);
  expect(after.CacheBehaviors.Items.map((b: { PathPattern: string }) => b.PathPattern)).toEqual([
    '/game/*',
    ...denied,
  ]);
  const select = (uri: string) =>
    after.CacheBehaviors.Items.find((b: { PathPattern: string }) =>
      b.PathPattern === '/game/*' ? uri.startsWith('/game/') : uri === b.PathPattern,
    ) ?? after.DefaultCacheBehavior;
  for (const uri of [
    '/',
    '/index.html',
    '/privacy',
    '/privacy/',
    '/images/x',
    '/assets/x.js',
    '/auth/status',
    '/auth/logout',
    '/auth/delete/resume',
    '/state',
    '/actions',
    '/v4/state',
    '/v4/actions',
    '/game',
    '/games/',
    '/api/v4/actions/extra',
  ])
    expect(select(uri)).toEqual(old);
  for (const uri of ['/game/', '/game/index.html', '/game/status', '/game/0.9.0/assets/x.js'])
    expect(select(uri).PathPattern).toBe('/game/*');
  expect(select('/game/').AllowedMethods.Items).toEqual(['GET', 'HEAD']);
  for (const uri of denied) {
    expect(select(uri).PathPattern).toBe(uri);
    expect(select(uri).ResponseHeadersPolicyId).toBeUndefined();
  }
  for (const b of after.CacheBehaviors.Items) {
    expect(b.TargetOriginId).toBe(old.TargetOriginId);
    expect(b.OriginRequestPolicyId).toBeUndefined();
  }
});

it('published file allowlist matches every reviewed archive key and references only the versioned game assets', () => {
  const manifest = JSON.parse(readFileSync('docs/dime-m43-game-publication-manifest.json', 'utf8'));
  expect(manifest.entries).toHaveLength(3);
  for (const entry of manifest.entries) {
    const request = { method: 'GET', uri: '/' + entry.key };
    expect(invoke(request)).toEqual(request);
    expect(entry.condition).toEqual({ IfNoneMatch: '*' });
    expect(
      entry.key === 'game/index.html' ||
        /^game\/0\.9\.0\/assets\/index-[A-Za-z0-9_-]+\.(js|css)$/.test(entry.key),
    ).toBe(true);
  }
  expect(manifest.futureInvalidationPaths).toEqual(['/game/', '/game/index.html']);
  expect(
    manifest.entries.some(
      (e: { key: string }) => e.key === 'index.html' || e.key === 'privacy' || e.key.startsWith('assets/'),
    ),
  ).toBe(false);
});
