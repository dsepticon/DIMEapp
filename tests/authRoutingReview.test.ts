import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const root = 'docs/dime-m42-testers-dormant-review/routing/';
const read = (name: string) => JSON.parse(readFileSync(root + name, 'utf8'));
const before = read('distribution-before.json').DistributionConfig;
const after = read('distribution-proposed-unresolved.json');
const template = read('auxiliary-template.json');
const contract = read('routing-contract.json') as {
  path: string;
  method: string;
  name: string;
  headers: string[];
  cookies: string[];
  queryNames: string[];
}[];
const guard = readFileSync(root + 'auth-method-guard.js', 'utf8');
const handler = (request: object) =>
  runInNewContext(guard + '\nhandler({request:input})', { input: request });
const match = (config: typeof before, path: string) =>
  config.CacheBehaviors.Items.find((b: { PathPattern: string }) =>
    b.PathPattern.endsWith('*') ? path.startsWith(b.PathPattern.slice(0, -1)) : path === b.PathPattern,
  ) ?? config.DefaultCacheBehavior;
it('routing changes only append one HTTPS origin and ten exact behaviors', () => {
  expect(Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))).toEqual([
    'Origins',
    'CacheBehaviors',
  ]);
  expect(after.Origins.Items.slice(0, -1)).toEqual(before.Origins.Items);
  expect(after.CacheBehaviors.Items.slice(0, before.CacheBehaviors.Quantity)).toEqual(
    before.CacheBehaviors.Items,
  );
  expect(after.Origins.Items.at(-1).CustomOriginConfig.OriginProtocolPolicy).toBe('https-only');
  expect(after.Origins.Items.at(-1).OriginPath).toBe('/staging');
  expect(Object.keys(template.Resources)).toHaveLength(12);
});
it.each([
  '/',
  '/privacy',
  '/privacy/',
  '/game/',
  '/game/index.html',
  '/game/0.9.0/assets/example.js',
  '/api/v4/state',
  '/api/v4/actions',
  '/api/v4/profile/reset',
  '/api/v4/content/convert',
  '/api/v4/content/preview',
  '/v4/state',
  '/v4/actions',
  '/state',
  '/actions',
  '/profile/reset',
  '/auth/unknown',
  '/auth/login/extra',
  '/auth/session/',
])('preserves existing selection for %s', (path) => {
  expect(match(after, path)).toEqual(match(before, path));
});
describe.each(contract)('$path exact forwarding', (route) => {
  it('uses zero-cache managed policy and only route-specific forwarding', () => {
    const behavior = match(after, route.path);
    expect(behavior.CachePolicyId).toBe('4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
    expect(behavior.ViewerProtocolPolicy).toBe('https-only');
    const policy = template.Resources[route.name + 'OriginPolicy'].Properties.OriginRequestPolicyConfig;
    expect(policy.HeadersConfig.Headers).toEqual(route.headers);
    expect(policy.HeadersConfig.HeaderBehavior).toBe('whitelist');
    expect(policy.HeadersConfig.Headers).not.toContain('Host');
    expect(policy.CookiesConfig.Cookies ?? []).toEqual(route.cookies);
    expect(policy.QueryStringsConfig.QueryStrings ?? []).toEqual(route.queryNames);
    expect(policy.HeadersConfig.Headers.includes('Authorization')).toBe(route.name === 'LinkAccept');
    expect(behavior.RealtimeLogConfigArn).toBeUndefined();
  });
  it('allows only reviewed method or CORS preflight; rejects extra query names without leaking values', () => {
    const request = { uri: route.path, method: route.method, querystring: {} };
    expect(handler(request)).toEqual(request);
    expect(handler({ ...request, method: 'OPTIONS' })).toEqual({ ...request, method: 'OPTIONS' });
    for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD'])
      expect(handler({ ...request, method }).statusCode).toBe(405);
    const rejected = handler({
      ...request,
      querystring: { unreviewed: { value: 'synthetic-private-marker' } },
    });
    expect(rejected.statusCode).toBe(400);
    expect(JSON.stringify(rejected)).not.toContain('synthetic-private-marker');
    for (const name of route.queryNames) {
      const expected = { ...request, querystring: { [name]: { value: 'synthetic' } } };
      expect(handler(expected)).toEqual(expected);
    }
  });
});
it('guards raw-path aliases and has no logging or credential-value inspection', () => {
  for (const uri of ['/auth/../auth/login', '/auth/%6cogin', '/auth/login/', '/game/'])
    expect(handler({ uri, method: 'GET', querystring: {} }).statusCode).toBe(404);
  expect(guard).not.toMatch(/console\.|JSON\.stringify|request\.cookies|request\.headers/);
  const policy = template.Resources.AuthResponsePolicy.Properties.ResponseHeadersPolicyConfig;
  expect(policy.SecurityHeadersConfig.ContentSecurityPolicy).toBeUndefined();
  expect(policy.CorsConfig).toBeUndefined();
  expect(policy.CustomHeadersConfig.Items).toContainEqual({
    Header: 'Cache-Control',
    Value: 'no-store, private, max-age=0',
    Override: true,
  });
});
it.each(['scope', 'error_description'])(
  'callback tolerates provider %s metadata but never forwards it',
  (name) => {
    const request = {
      uri: '/auth/callback',
      method: 'GET',
      querystring: { [name]: { value: 'synthetic-provider-metadata' } },
    };
    expect(handler(request)).toEqual(request);
    const policy = template.Resources.CallbackOriginPolicy.Properties.OriginRequestPolicyConfig;
    expect(policy.QueryStringsConfig.QueryStrings).toEqual(['code', 'state', 'error']);
    expect(policy.QueryStringsConfig.QueryStrings).not.toContain(name);
  },
);
