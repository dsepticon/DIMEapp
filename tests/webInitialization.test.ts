import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { handler } from '../server/webHandler';
import { DynamoAuthRecords, MemoryRecords } from '../server/authRecords';
import {
  mintTesterInvitation,
  parseTesterInvitation,
  verifyTesterInvitation,
} from '../server/testerInvitation';
import {
  initializationFailure,
  oauthSecret,
  resolvedSecret,
  webKey,
  WebInitializationError,
} from '../server/webInitialization';
import * as initialization from '../server/webInitialization';
import { WebAuth, type IdentityProvider } from '../server/webAuth';

const key = Buffer.alloc(32, 37),
  origin = 'https://destroyaindustriesminingextension.com';
let logs: ReturnType<typeof vi.spyOn>, send: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logs = vi.spyOn(console, 'error').mockImplementation(() => {});
  send = vi
    .spyOn(DynamoDBDocumentClient.prototype, 'send')
    .mockRejectedValue(Error('SYNTHETIC_PRIVATE_SENTINEL'));
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Forbidden network'));
  for (const [name, value] of Object.entries({
    AWS_REGION: 'us-east-2',
    DIME_WEB_ORIGIN: origin,
    DIME_STATE_TABLE: 'dime-v2-staging-review01-dime-v2-review-20260912-player-state',
    DIME_WEB_SIGN_IN_MODE: 'TESTERS',
    DIME_ACCOUNT_LINKING: 'DISABLED',
    DIME_WEB_ID_KEY_B64: key.toString('base64'),
    DIME_AUTH_ENCRYPTION_KEY_B64: Buffer.alloc(32, 38).toString('base64'),
    DIME_OAUTH_CLIENT_ID: '4228okut24ll35bisjmygbquaf6svm',
    DIME_OAUTH_CLIENT_SECRET: 'synthetic-provider-secret',
    DIME_CONVERSION_MODE: 'ENABLED',
    DIME_CONVERSION_TESTER_TAGS: '',
    DIME_ALLOWED_ORIGINS: 'https://znaovl2j45idub9k81om1dkatwxnu2.ext-twitch.tv',
  }))
    vi.stubEnv(name, value);
  vi.stubEnv('TWITCH_EXTENSION_SECRET_B64', Buffer.alloc(32, 39).toString('base64'));
  vi.stubEnv('DIME_PLAYER_ID_KEY_B64', Buffer.alloc(32, 40).toString('base64'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const invite = () => mintTesterInvitation(key, '123456').invitation;
const request = (value?: string) =>
  handler({
    rawPath: '/auth/login',
    rawQueryString: value === undefined ? '' : new URLSearchParams({ invitation: value }).toString(),
    requestContext: { http: { method: 'GET' } },
  });
const payload = (changes: Record<string, unknown>) => {
  const value = parseTesterInvitation(invite());
  return Buffer.from(JSON.stringify({ ...value, ...changes })).toString('base64url') + '.' + 'A'.repeat(43);
};
for (const [label, value] of [
  ['missing', () => undefined],
  ['empty', () => ''],
  ['malformed encoding', () => '%not-base64'],
  ['old probe outer shape', () => 'A'.repeat(200) + '.' + 'A'.repeat(43)],
  ['missing field', () => payload({ tester: undefined })],
  ['version', () => payload({ v: 2 })],
  ['noninteger expiry', () => payload({ exp: 1.2 })],
  ['expired', () => payload({ exp: 1 })],
  ['too far future', () => payload({ exp: Math.floor(Date.now() / 1000) + 901 })],
  ['extra field', () => payload({ unexpected: 'SYNTHETIC_PRIVATE_SENTINEL' })],
] as const)
  it(`structurally rejects ${label} before any credential or storage initialization`, async () => {
    const input = value();
    vi.stubEnv('DIME_WEB_ID_KEY_B64', undefined);
    const read = vi.spyOn(initialization, 'webKey');
    const response = await request(input);
    expect(response.statusCode).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).not.toHaveBeenCalled();
  });
it('a structurally valid invalid signature loads only the invitation key and rejects, including repeated attempts', async () => {
  const value = invite().split('.')[0] + '.' + 'A'.repeat(43);
  vi.stubEnv('DIME_AUTH_ENCRYPTION_KEY_B64', undefined);
  vi.stubEnv('DIME_OAUTH_CLIENT_SECRET', undefined);
  vi.stubEnv('TWITCH_EXTENSION_SECRET_B64', undefined);
  vi.stubEnv('DIME_PLAYER_ID_KEY_B64', undefined);
  vi.stubEnv('AWS_REGION', undefined);
  for (let i = 0; i < 2; i++) expect((await request(value)).statusCode).toBe(401);
  expect(send).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(logs).not.toHaveBeenCalled();
});
it('correctly signed synthetic invitation still verifies then consumes once after credential separation', async () => {
  const repo = new MemoryRecords();
  vi.spyOn(DynamoAuthRecords.prototype, 'transaction').mockImplementation((run) => repo.transaction(run));
  const value = invite();
  expect(verifyTesterInvitation(key, value).v).toBe(1);
  const response = await request(value);
  expect(response.statusCode).toBe(303);
  expect((response.headers as Record<string, string>).Location).toMatch(
    /^https:\/\/id.twitch.tv\/oauth2\/authorize\?/,
  );
  expect((await request(value)).statusCode).toBe(401);
  expect(send).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(logs).not.toHaveBeenCalled();
});
for (const [name, value, category] of [
  ['DIME_WEB_ID_KEY_B64', undefined, 'SECRET_REFERENCE'],
  ['DIME_WEB_ID_KEY_B64', 'arn:aws:secretsmanager:synthetic', 'SECRET_REFERENCE'],
  [
    'DIME_WEB_ID_KEY_B64',
    JSON.stringify({ WEB_IDENTITY_KEY: key.toString('base64') }),
    'INVITATION_KEY_FORMAT',
  ],
  ['DIME_WEB_ID_KEY_B64', key.toString('hex'), 'INVITATION_KEY_FORMAT'],
  [
    'DIME_AUTH_ENCRYPTION_KEY_B64',
    JSON.stringify({ AUTH_ENCRYPTION_KEY: key.toString('base64') }),
    'SECRET_FORMAT',
  ],
  ['DIME_AUTH_ENCRYPTION_KEY_B64', key.toString('base64'), 'SECRET_FORMAT'],
  ['TWITCH_EXTENSION_SECRET_B64', key.toString('base64'), 'SECRET_FORMAT'],
  ['DIME_PLAYER_ID_KEY_B64', key.toString('base64'), 'SECRET_FORMAT'],
  ['DIME_OAUTH_CLIENT_SECRET', 'arn:aws:secretsmanager:synthetic', 'SECRET_REFERENCE'],
  ['DIME_OAUTH_CLIENT_SECRET', JSON.stringify({ client_secret: 'synthetic' }), 'SECRET_FORMAT'],
  ['DIME_OAUTH_CLIENT_ID', 'znaovl2j45idub9k81om1dkatwxnu2', 'WEB_AUTH_CONFIG'],
  ['DIME_WEB_ORIGIN', origin + '/auth/callback', 'CALLBACK_CONFIG'],
  ['AWS_REGION', 'us-west-2', 'WEB_AUTH_CONFIG'],
] as const)
  it(`fails closed at ${category} for synthetic ${name} configuration, without writes`, async () => {
    const valueToSend = invite();
    vi.stubEnv(name, value);
    const response = await request(valueToSend);
    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.correlationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.parse(String(logs.mock.calls[0]?.[0]))).toEqual({
      category,
      correlationId: body.correlationId,
    });
    expect(send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(logs.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_SENTINEL');
  });
it('DynamoDB client initialization failure is STORAGE_INIT and cannot consume an invitation', async () => {
  vi.spyOn(DynamoDBDocumentClient, 'from').mockImplementation(() => {
    throw Error('SYNTHETIC_PRIVATE_SENTINEL');
  });
  expect((await request(invite())).statusCode).toBe(503);
  expect(JSON.parse(String(logs.mock.calls[0]?.[0])).category).toBe('STORAGE_INIT');
  expect(send).not.toHaveBeenCalled();
  expect(JSON.stringify(logs.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_SENTINEL');
});
for (const raw of [
  key.toString('hex'),
  key.toString('base64').trimEnd() + '\n',
  key.toString('base64').slice(0, -1),
  Buffer.alloc(31).toString('base64'),
  Buffer.alloc(33).toString('base64'),
  JSON.stringify({ key: key.toString('base64') }),
])
  it('rejects noncanonical encoding, length, whitespace and JSON wrappers rather than guessing', () => {
    expect(() => webKey(raw)).toThrow(WebInitializationError);
  });
it('accepts only documented full plaintext SecretString fixtures', () => {
  expect(webKey(key.toString('base64'))).toEqual(key);
  expect(oauthSecret('synthetic-opaque-secret')).toBe('synthetic-opaque-secret');
  expect(() => resolvedSecret('{{resolve:secretsmanager:synthetic:SecretString}}')).toThrow(
    WebInitializationError,
  );
});
for (const errorName of ['AccessDeniedException', 'KMSAccessDeniedException', 'TimeoutError'])
  it(`a synthetic provisioning/provider-preparation ${errorName} cannot write nonce/session state`, async () => {
    // Dynamic references resolve at deployment, not via a runtime SDK. Inject the failed preparation boundary.
    const repo = new MemoryRecords(),
      tx = vi.spyOn(repo, 'transaction');
    const fail = () => {
      throw new WebInitializationError('SECRET_ACCESS');
    };
    const provider: IdentityProvider = {
      prepare: fail,
      authorize: fail,
      exchange: async () => {
        throw Error(errorName);
      },
      validate: async () => {
        throw Error(errorName);
      },
      revoke: async () => {},
    };
    const auth = new WebAuth(repo, provider, key, origin);
    await expect(auth.begin(invite())).rejects.toMatchObject({ category: 'SECRET_ACCESS' });
    expect(tx).not.toHaveBeenCalled();
  });
it('error reporter never serializes request-like exception fields or messages', () => {
  const secret = 'SYNTHETIC_PRIVATE_SENTINEL';
  const error = Object.assign(Error(secret), {
    cookie: secret,
    invitation: secret,
    code: secret,
    arn: secret,
  });
  const response = initializationFailure(error);
  expect(JSON.stringify(response) + JSON.stringify(logs.mock.calls)).not.toContain(secret);
  expect(Object.keys(JSON.parse(String(logs.mock.calls[0]?.[0]))).sort()).toEqual([
    'category',
    'correlationId',
  ]);
});
