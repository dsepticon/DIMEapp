import { webSignInPreflight } from './webSignIn';
/** Separate opt-in build. This entry is not imported by the deployed Milestone 4.1 Lambda. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoAuthRecords, TokenEnvelope } from './authRecords';
import { emergencyRoute } from './webEmergency';
import { TwitchOAuth, revokeTwitchToken } from './twitchOAuth';
import { WebAuth } from './webAuth';
import { createConversionGate } from './conversionGate';
import { createWebApi } from './webHttp';
import { authenticate, decodeSecret } from './auth';
import { routePath } from './handler';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw Error('Authentication is not configured.');
  return value;
}
let api: ReturnType<typeof createWebApi> | undefined;
function configure() {
  const region = required('AWS_REGION'),
    origin = required('DIME_WEB_ORIGIN');
  if (region !== 'us-east-2' || origin !== 'https://destroyaindustriesminingextension.com')
    throw Error('Unreviewed web environment.');
  const encryption = decodeSecret(required('DIME_AUTH_ENCRYPTION_KEY_B64')),
    identity = decodeSecret(required('DIME_WEB_ID_KEY_B64'));
  const extensionKey = decodeSecret(required('TWITCH_EXTENSION_SECRET_B64')),
    extensionIdentity = decodeSecret(required('DIME_PLAYER_ID_KEY_B64'));
  const keys = [encryption, identity, extensionKey, extensionIdentity];
  if (keys.some((key, i) => keys.slice(i + 1).some((other) => Buffer.from(key).equals(Buffer.from(other)))))
    throw Error('Credential separation is required.');
  const table = required('DIME_STATE_TABLE');
  if (table !== 'dime-v2-staging-review01-dime-v2-review-20260912-player-state')
    throw Error('Unreviewed web storage.');
  const repo = new DynamoAuthRecords(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 3 }), {
      marshallOptions: { removeUndefinedValues: true },
    }),
    table,
    new TokenEnvelope(new Map([['v1', encryption]]), 'v1'),
  );
  // Invalid invitations are rejected before OAuth-login credentials/JWKS initialize.
  let oauth: TwitchOAuth | undefined;
  const providerInstance = () =>
    (oauth ??= new TwitchOAuth(
      required('DIME_OAUTH_CLIENT_ID'),
      required('DIME_OAUTH_CLIENT_SECRET'),
      origin + '/auth/callback',
    ));
  const provider = {
    authorize: (state: string, nonce: string) => providerInstance().authorize(state, nonce),
    exchange: (code: string, nonce: string) => providerInstance().exchange(code, nonce),
    validate: (tokens: import('./webAuth').Tokens) => providerInstance().validate(tokens),
    revoke: (tokens: import('./webAuth').Tokens) =>
      revokeTwitchToken(required('DIME_OAUTH_CLIENT_ID'), tokens),
  };
  const auth = new WebAuth(repo, provider, identity, origin);
  const origins = required('DIME_ALLOWED_ORIGINS').split(',');
  if (origins.some((value) => !/^https:\/\/[a-z0-9-]+\.ext-twitch\.tv$/.test(value)))
    throw Error('Invalid Extension origins.');
  const conversion = createConversionGate(
    required('DIME_CONVERSION_MODE'),
    process.env.DIME_CONVERSION_TESTER_TAGS ?? '',
    extensionIdentity,
  );
  if (conversion.mode !== 'ENABLED' || conversion.testerCount !== 0)
    throw Error('Unreviewed conversion configuration.');
  return createWebApi(
    auth,
    {
      authorize: (header) => authenticate(header, [extensionKey], extensionIdentity),
      origins,
      linkingEnabled: process.env.DIME_ACCOUNT_LINKING === 'ENABLED',
      linkingMode: () => process.env.DIME_ACCOUNT_LINKING,
    },
    conversion,
    () => process.env.DIME_WEB_SIGN_IN_MODE,
  );
}
// Emergency routes have no Extension, conversion, OIDC/JWKS or OAuth-login dependency.
function configureEmergency() {
  const region = required('AWS_REGION'),
    origin = required('DIME_WEB_ORIGIN');
  const table = required('DIME_STATE_TABLE');
  if (
    region !== 'us-east-2' ||
    origin !== 'https://destroyaindustriesminingextension.com' ||
    table !== 'dime-v2-staging-review01-dime-v2-review-20260912-player-state'
  )
    throw Error('Unreviewed recovery environment.');
  const encryption = decodeSecret(required('DIME_AUTH_ENCRYPTION_KEY_B64'));
  const identity = decodeSecret(required('DIME_WEB_ID_KEY_B64'));
  if (Buffer.from(encryption).equals(Buffer.from(identity)))
    throw Error('Credential separation is required.');
  const repo = new DynamoAuthRecords(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 3 }), {
      marshallOptions: { removeUndefinedValues: true },
    }),
    table,
    new TokenEnvelope(new Map([['v1', encryption]]), 'v1'),
  );
  const forbidden = () => {
    throw Error('Authentication expansion unavailable.');
  };
  return new WebAuth(
    repo,
    {
      authorize: forbidden,
      exchange: forbidden,
      validate: forbidden,
      // Twitch revocation uses only the public client ID and existing encrypted grant.
      revoke: (tokens) => revokeTwitchToken(required('DIME_OAUTH_CLIENT_ID'), tokens),
    },
    identity,
    origin,
  );
}
export async function handler(event: {
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { stage?: string; http?: { method?: string } };
}) {
  try {
    const path =
      routePath(event.rawPath ?? '', event.requestContext?.stage) +
      (event.rawQueryString ? '?' + event.rawQueryString : '');
    const method = event.requestContext?.http?.method ?? '';
    const preflight = webSignInPreflight(
      { method, path, headers: { cookie: event.cookies?.join('; ') ?? event.headers?.cookie } },
      process.env.DIME_WEB_SIGN_IN_MODE,
      ['ENABLED', 'TESTERS'].includes(process.env.DIME_ACCOUNT_LINKING ?? ''),
    );
    if (preflight) return preflight;
    const request = {
      method: event.requestContext?.http?.method ?? '',
      path,
      headers: Object.fromEntries(
        Object.entries({
          ...event.headers,
          ...(event.cookies ? { cookie: event.cookies.join('; ') } : {}),
        }).map(([key, value]) => [key.toLowerCase(), value]),
      ),
      body: event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body,
    };
    const emergency = await emergencyRoute(request, configureEmergency);
    if (emergency) return emergency;
    api ??= configure();
    return await api(request);
  } catch {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ message: 'Authentication is unavailable.' }),
    };
  }
}
