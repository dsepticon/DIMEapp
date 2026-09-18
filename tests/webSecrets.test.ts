import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  currentWebSecret,
  readinessWebSecret,
  clearWebSecretCache,
  WEB_SECRET_ARNS,
} from '../server/webSecrets';
import { webKeyReadiness } from '../server/webReadiness';
import { handler } from '../server/webHandler';
const key = Buffer.alloc(32, 17).toString('base64');
let values: Record<string, string>, send: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clearWebSecretCache();
  values = {
    [WEB_SECRET_ARNS.identity]: key,
    [WEB_SECRET_ARNS.encryption]: Buffer.alloc(32, 18).toString('base64'),
    [WEB_SECRET_ARNS.oauth]: 'synthetic-provider-secret',
  };
  for (const [name, value] of Object.entries({
    AWS_REGION: 'us-east-2',
    DIME_AUTH_KEY_REVISION: 'synthetic-v1',
    DIME_WEB_ID_SECRET_ARN: WEB_SECRET_ARNS.identity,
    DIME_AUTH_ENCRYPTION_SECRET_ARN: WEB_SECRET_ARNS.encryption,
    DIME_OAUTH_CLIENT_SECRET_ARN: WEB_SECRET_ARNS.oauth,
    DIME_WEB_SIGN_IN_MODE: 'DISABLED',
    DIME_ACCOUNT_LINKING: 'DISABLED',
  }))
    vi.stubEnv(name, value);
  send = vi.spyOn(SecretsManagerClient.prototype, 'send').mockImplementation(async (input: unknown) => {
    const c = (input as GetSecretValueCommand).input;
    return { ARN: c.SecretId, VersionStages: [c.VersionStage], SecretString: values[c.SecretId!] };
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Forbidden network'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  clearWebSecretCache();
});
it('normal retrieval accesses only the three exact web ARNs and AWSCURRENT', async () => {
  for (const purpose of ['identity', 'encryption', 'oauth'] as const) await currentWebSecret(purpose);
  expect(send.mock.calls.map((c: unknown[]) => (c[0] as GetSecretValueCommand).input)).toEqual(
    Object.values(WEB_SECRET_ARNS).map((SecretId) => ({ SecretId, VersionStage: 'AWSCURRENT' })),
  );
});
it('expires current cache after thirty seconds and invalidates it on revision changes', async () => {
  vi.useFakeTimers();
  await currentWebSecret('identity');
  await currentWebSecret('identity');
  expect(send).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(30_000);
  await currentWebSecret('identity');
  expect(send).toHaveBeenCalledTimes(2);
  vi.stubEnv('DIME_AUTH_KEY_REVISION', 'synthetic-v2');
  await currentWebSecret('identity');
  expect(send).toHaveBeenCalledTimes(3);
});
it('pending readiness bypasses cache and never contaminates current operation', async () => {
  await currentWebSecret('identity');
  await readinessWebSecret('identity', 'AWSPENDING');
  await readinessWebSecret('identity', 'AWSPENDING');
  await currentWebSecret('identity');
  expect(send.mock.calls.map((c: unknown[]) => (c[0] as GetSecretValueCommand).input.VersionStage)).toEqual([
    'AWSCURRENT',
    'AWSPENDING',
    'AWSPENDING',
  ]);
});
for (const [name, value] of [
  ['DIME_WEB_ID_SECRET_ARN', WEB_SECRET_ARNS.oauth],
  ['AWS_REGION', 'us-west-2'],
  ['DIME_AUTH_KEY_REVISION', ''],
] as const)
  it('rejects incorrect source configuration before SDK access', async () => {
    vi.stubEnv(name, value);
    await expect(currentWebSecret('identity')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
for (const response of [
  { ARN: 'wrong', VersionStages: ['AWSCURRENT'], SecretString: key },
  { ARN: WEB_SECRET_ARNS.identity, VersionStages: ['AWSPENDING'], SecretString: key },
  { ARN: WEB_SECRET_ARNS.identity, VersionStages: ['AWSCURRENT'], SecretBinary: Buffer.alloc(32) },
])
  it('rejects unexpected response source, stage and envelope', async () => {
    send.mockResolvedValue(response);
    await expect(currentWebSecret('identity')).rejects.toMatchObject({ category: 'SECRET_REFERENCE' });
  });
for (const reason of ['AccessDeniedException', 'KMSAccessDeniedException', 'TimeoutError'])
  it('does not cache or disclose retrieval failure ' + reason, async () => {
    send.mockRejectedValue(Object.assign(Error('SYNTHETIC_SENSITIVE'), { name: reason }));
    await expect(currentWebSecret('identity')).rejects.toMatchObject({ category: 'SECRET_ACCESS' });
    await expect(currentWebSecret('identity')).rejects.toMatchObject({ category: 'SECRET_ACCESS' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(console.error).not.toHaveBeenCalled();
  });
it('returns exactly eleven booleans, independent of Extension and OAuth credentials', async () => {
  delete values[WEB_SECRET_ARNS.oauth];
  vi.stubEnv('TWITCH_EXTENSION_SECRET_B64', 'DO_NOT_INSPECT');
  vi.stubEnv('DIME_PLAYER_ID_KEY_B64', 'DO_NOT_INSPECT');
  for (const stage of ['AWSCURRENT', 'AWSPENDING'] as const) {
    const r = await webKeyReadiness(stage);
    expect(Object.keys(r)).toHaveLength(11);
    expect(Object.values(r)).toEqual(Array(11).fill(true));
  }
  expect(
    send.mock.calls.every((c: unknown[]) =>
      [WEB_SECRET_ARNS.identity, WEB_SECRET_ARNS.encryption].includes(
        (c[0] as GetSecretValueCommand).input.SecretId as typeof WEB_SECRET_ARNS.identity,
      ),
    ),
  ).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});
for (const [value, envelope, encoding, length] of [
  [JSON.stringify({ key }), false, false, false],
  [key + '\n', true, false, false],
  [Buffer.alloc(31).toString('base64'), true, true, false],
  [key, true, true, true],
] as const)
  it('exposes separate contract booleans with no fallback parsing', async () => {
    values[WEB_SECRET_ARNS.identity] = value;
    const r = await webKeyReadiness('AWSPENDING');
    expect([r.identity_envelope_valid, r.identity_encoding_valid, r.identity_length_valid]).toEqual([
      envelope,
      encoding,
      length,
    ]);
    expect(Object.values(r).every((v) => typeof v === 'boolean')).toBe(true);
  });
it('fails closed on normalized decoded key reuse', async () => {
  values[WEB_SECRET_ARNS.encryption] = key;
  const r = await webKeyReadiness('AWSPENDING');
  expect(r.identity_length_valid && r.encryption_length_valid).toBe(true);
  expect([r.keys_distinct, r.derived_invitation_ready, r.encryption_round_trip_ready]).toEqual([
    false,
    false,
    false,
  ]);
});
it('public event wrappers cannot enter readiness, including body and query spoofing', async () => {
  for (const path of ['/auth/login', '/auth/callback', '/auth/status', '/auth/logout']) {
    const r = await handler({
      dimeOwnerSelfTest: 'key-readiness-v2',
      stage: 'AWSPENDING',
      rawPath: path,
      rawQueryString: 'dimeOwnerSelfTest=key-readiness-v2&stage=AWSPENDING',
      body: JSON.stringify({ dimeOwnerSelfTest: 'key-readiness-v2', stage: 'AWSPENDING' }),
      requestContext: { http: { method: path === '/auth/logout' ? 'POST' : 'GET' } },
    });
    expect(JSON.parse(r.body)).not.toHaveProperty('identity_source_valid');
  }
  expect(send).not.toHaveBeenCalled();
});
