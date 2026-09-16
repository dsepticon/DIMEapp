import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { handler } from '../server/webHandler';
const load = (name: string) =>
  JSON.parse(readFileSync(`docs/dime-m42-telemetry-review/${name}.json`, 'utf8'));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('changes exactly six sampling flags while retaining all enforcement and aggregate metrics', () => {
  const before = load('import-template');
  const after = load('sampling-disabled-template');
  const p = before.Resources.WebsiteWebAcl.Properties;
  p.VisibilityConfig.SampledRequestsEnabled = false;
  for (const rule of p.Rules) {
    expect(rule.VisibilityConfig.CloudWatchMetricsEnabled).toBe(true);
    rule.VisibilityConfig.SampledRequestsEnabled = false;
  }
  expect(p.Rules).toHaveLength(5);
  expect(p.VisibilityConfig.CloudWatchMetricsEnabled).toBe(true);
  expect(after).toEqual(before);
  expect(Object.keys(after.Resources)).toEqual(['WebsiteWebAcl']);
  expect(after.Resources.WebsiteWebAcl.DeletionPolicy).toBe('Retain');
});
for (const [path, method, status] of [
  ['/auth/login', 'GET', 503],
  ['/auth/callback', 'GET', 503],
  ['/auth/link/intent', 'POST', 503],
  ['/auth/link/accept', 'POST', 503],
  ['/auth/logout', 'POST', 200],
  ['/auth/delete/resume', 'POST', 401],
] as const)
  it(`disabled ${path} never logs sentinel fields or contacts storage/provider`, async () => {
    vi.stubEnv('DIME_WEB_SIGN_IN_MODE', 'DISABLED');
    vi.stubEnv('DIME_ACCOUNT_LINKING', 'DISABLED');
    vi.stubEnv('DIME_OAUTH_CLIENT_SECRET', undefined);
    const sentinel = 'SYNTHETIC_NOT_A_CREDENTIAL_'.repeat(4);
    const logs = ['info', 'error', 'warn', 'log', 'debug'].map((name) =>
      vi.spyOn(console, name as 'info').mockImplementation(() => {}),
    );
    const send = vi
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockRejectedValue(Error('unexpected storage'));
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('unexpected network'));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await handler({
        rawPath: path,
        rawQueryString: `code=${sentinel}&state=${sentinel}&invitation=${sentinel}`,
        headers: {
          origin: 'https://destroyaindustriesminingextension.com',
          authorization: sentinel,
          'x-dime-csrf': sentinel,
        },
        cookies: [`__Host-dime-session=${sentinel}`, `__Host-dime-login=${sentinel}`],
        body: JSON.stringify({ access_token: sentinel, refresh_token: sentinel }),
        requestContext: { http: { method } },
      });
      expect(result.statusCode).toBe(status);
      expect(JSON.stringify(result)).not.toContain(sentinel);
    }
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
it('web-auth emits no full events and gameplay uses explicit log allowlists', () => {
  expect(readFileSync('server/webHandler.ts', 'utf8')).not.toMatch(/console\.|logger\./);
  const source = readFileSync('server/handler.ts', 'utf8');
  expect(source).toContain("event: 'request_completed'");
  expect(source).toContain('status: response.statusCode');
  expect(source).not.toMatch(/JSON.stringify\(event\)|console\.\w+\(event/);
});
