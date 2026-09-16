import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
const source = readFileSync('infra/web/guest-review/status-function.js', 'utf8');
it('edge contract is exact-path GET only, non-identifying and uncached', () => {
  const invoke = (request: unknown) =>
    JSON.parse(JSON.stringify(runInNewContext(source + '\nhandler(event)', { event: { request } })));
  const result = invoke({ method: 'GET', uri: '/auth/status' });
  expect(JSON.parse(result.body)).toEqual({
    guestDemoAvailable: true,
    guestStorage: 'memory',
    signInAvailable: false,
    linkingAvailable: false,
  });
  expect(result.headers['cache-control'].value).toBe('no-store');
  for (const uri of [
    '/auth/login',
    '/auth/callback',
    '/auth/logout',
    '/auth/delete/resume',
    '/privacy',
    '/auth/status/',
  ]) {
    const request = { method: 'GET', uri };
    expect(invoke(request)).toEqual(request);
  }
  expect(invoke({ method: 'POST', uri: '/auth/status' })).toEqual({ method: 'POST', uri: '/auth/status' });
  for (const uri of ['/auth/../api/v4/actions', '/%61pi/v4/actions', '//api/v4/state', '/api/./v4/state'])
    expect(invoke({ method: 'POST', uri }).statusCode).toBe(401);
  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const denied = invoke({
      method,
      uri: '/api/v4/actions',
      headers: { authorization: { value: 'Bearer guest-demo' } },
    });
    expect(denied.statusCode).toBe(401);
    expect(JSON.parse(denied.body)).toEqual({ code: 'UNAUTHORIZED' });
  }
});
it('review infrastructure adds only capability function and headers, no data access or authentication resources', () => {
  const template = JSON.parse(readFileSync('infra/web/guest-review/auxiliary-template.json', 'utf8'));
  expect(
    Object.values(template.Resources)
      .map((r) => (r as { Type: string }).Type)
      .sort(),
  ).toEqual(['AWS::CloudFront::Function', 'AWS::CloudFront::ResponseHeadersPolicy']);
  expect(JSON.stringify(template)).not.toMatch(/secretsmanager|dynamodb|AWS::IAM|AWS::Lambda/);
  const headers = JSON.parse(readFileSync('infra/web/guest-review/security-headers.json', 'utf8'));
  expect(template.Resources.GuestCapability.Properties.FunctionCode).toBe(source);
  expect(
    template.Resources.GuestHeaders.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
      .ContentSecurityPolicy.ContentSecurityPolicy,
  ).toBe(headers['Content-Security-Policy']);
  expect(headers['Content-Security-Policy']).toContain("connect-src 'self'");
  expect(headers['Content-Security-Policy']).toContain("script-src 'self'");
  expect(headers['Content-Security-Policy']).not.toContain('unsafe-eval');
});
