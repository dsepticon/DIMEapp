import { afterEach, describe, expect, it, vi } from 'vitest';

const validKey = Buffer.alloc(32, 7).toString('base64');
const validEnvironment = {
  DIME_ENV: 'staging',
  DIME_STATE_TABLE: 'dime-v2-staging-test-table',
  DIME_CONFIG_REVISION: 'twitch-secret-fix-20260912-1',
  DIME_CONVERSION_MODE: 'DISABLED',
  DIME_ALLOWED_ORIGINS: 'https://test.ext-twitch.tv',
  TWITCH_EXTENSION_SECRET_B64: validKey,
  DIME_PLAYER_ID_KEY_B64: validKey,
  AWS_REGION: 'us-east-2',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runWith(overrides: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries({ ...validEnvironment, ...overrides })) vi.stubEnv(name, value);
  vi.resetModules();
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { handler } = await import('../server/handler');
  const response = await handler({ requestContext: { http: { method: 'GET' } }, rawPath: '/state' });
  return { response, error };
}

describe('Lambda configuration diagnostics', () => {
  it.each([
    [{ DIME_CONFIG_REVISION: undefined }, 'missing_setting'],
    [{ DIME_CONFIG_REVISION: 'bad revision' }, 'invalid_revision'],
    [{ DIME_CONVERSION_MODE: undefined }, 'missing_setting'],
    [{ DIME_CONVERSION_MODE: 'OPEN' }, 'invalid_conversion_mode'],
    [
      { DIME_CONVERSION_MODE: 'TESTERS', DIME_CONVERSION_TESTER_TAGS: 'not-a-tag' },
      'invalid_conversion_testers',
    ],
    [{ TWITCH_EXTENSION_SECRET_B64: '"not-base64"' }, 'invalid_twitch_key'],
    [{ DIME_PLAYER_ID_KEY_B64: 'invalid' }, 'invalid_identity_key'],
    [{ DIME_ALLOWED_ORIGINS: 'http://test.ext-twitch.tv' }, 'invalid_origin'],
  ] as const)('emits only an allowlisted code for invalid configuration', async (overrides, code) => {
    const { response, error } = await runWith(overrides);
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      code: 'UNAVAILABLE',
      message: 'Service is not configured.',
    });
    expect(error).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: 'configuration_error', code }));
  });

  it('rejects missing authorization when configuration is valid', async () => {
    const { response, error } = await runWith({});
    expect(response.statusCode).toBe(401);
    expect(error).not.toHaveBeenCalled();
  });
});
