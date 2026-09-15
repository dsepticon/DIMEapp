/** Separate opt-in build. This entry is not imported by the deployed Milestone 4.1 Lambda. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoAuthRecords, TokenEnvelope } from './authRecords';
import { TwitchOAuth } from './twitchOAuth';
import { WebAuth } from './webAuth';
import { createAccountApi } from './accountApi';
import { authenticate, decodeSecret } from './auth';
import { routePath } from './handler';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw Error('Authentication is not configured.');
  return value;
}
let api: ReturnType<typeof createAccountApi> | undefined;
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
  const repo = new DynamoAuthRecords(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 3 }), {
      marshallOptions: { removeUndefinedValues: true },
    }),
    required('DIME_STATE_TABLE'),
    new TokenEnvelope(new Map([['v1', encryption]]), 'v1'),
  );
  const provider = new TwitchOAuth(
    required('DIME_OAUTH_CLIENT_ID'),
    required('DIME_OAUTH_CLIENT_SECRET'),
    origin + '/auth/callback',
  );
  const auth = new WebAuth(repo, provider, identity, origin);
  const origins = required('DIME_ALLOWED_ORIGINS').split(',');
  if (origins.some((value) => !/^https:\/\/[a-z0-9-]+\.ext-twitch\.tv$/.test(value)))
    throw Error('Invalid Extension origins.');
  if (required('DIME_CONVERSION_MODE') !== 'DISABLED') throw Error('Conversion must remain disabled.');
  return createAccountApi(auth, {
    authorize: (header) => authenticate(header, [extensionKey], extensionIdentity),
    origins,
    linkingEnabled: process.env.DIME_ACCOUNT_LINKING === 'ENABLED',
  });
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
    api ??= configure();
    const path =
      routePath(event.rawPath ?? '', event.requestContext?.stage) +
      (event.rawQueryString ? '?' + event.rawQueryString : '');
    return await api({
      method: event.requestContext?.http?.method ?? '',
      path,
      headers: Object.fromEntries(
        Object.entries({
          ...event.headers,
          ...(event.cookies ? { cookie: event.cookies.join('; ') } : {}),
        }).map(([key, value]) => [key.toLowerCase(), value]),
      ),
      body: event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body,
    });
  } catch {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ message: 'Authentication is unavailable.' }),
    };
  }
}
