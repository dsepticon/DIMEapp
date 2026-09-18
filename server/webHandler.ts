import { currentWebSecret } from './webSecrets';
import { webKeyReadiness } from './webReadiness';
import { webSignInPreflight } from './webSignIn';
/** Separate opt-in build. This entry is not imported by the deployed Milestone 4.1 Lambda. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoAuthRecords, TokenEnvelope } from './authRecords';
import { emergencyRoute } from './webEmergency';
import { TwitchOAuth, revokeTwitchToken } from './twitchOAuth';
import { WebAuth } from './webAuth';
import { parseTesterInvitation, verifyTesterInvitation, InvitationError } from './testerInvitation';
import {
  initializationFailure,
  stage,
  webKey,
  requireDistinctKeys,
  oauthSecret,
  resolvedSecret,
  WebInitializationError,
} from './webInitialization';
import type { RecordRepository } from './authRecords';
import { createWebApi } from './webHttp';
import { authenticate, decodeSecret } from './auth';
import { routePath } from './handler';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw Error('Authentication is not configured.');
  return value;
}
function runtime() {
  return stage('WEB_AUTH_CONFIG', () => {
    const region = required('AWS_REGION'),
      origin = required('DIME_WEB_ORIGIN'),
      table = required('DIME_STATE_TABLE');
    if (region !== 'us-east-2' || table !== 'dime-v2-staging-review01-dime-v2-review-20260912-player-state')
      throw Error();
    if (origin !== 'https://destroyaindustriesminingextension.com')
      throw new WebInitializationError('CALLBACK_CONFIG');
    return { region, origin, table };
  });
}
async function configuredAuth(emergency = false) {
  const { region, origin, table } = runtime();
  const identity = webKey(await currentWebSecret('identity'), true);
  let stored: DynamoAuthRecords | undefined;
  const repo: RecordRepository = {
    transaction: async (run) => {
      if (!stored) {
        const encryption = webKey(await currentWebSecret('encryption'));
        requireDistinctKeys([encryption, identity]);
        // Preserve the original four-key separation check before persistent authentication use.
        // Invalid invitations never reach this boundary; emergency shutdown remains independent.
        if (!emergency) {
          const keys = [
            encryption,
            identity,
            stage('SECRET_FORMAT', () =>
              decodeSecret(resolvedSecret(process.env.TWITCH_EXTENSION_SECRET_B64)),
            ),
            stage('SECRET_FORMAT', () => decodeSecret(resolvedSecret(process.env.DIME_PLAYER_ID_KEY_B64))),
          ];
          requireDistinctKeys(keys);
        }
        stored = stage(
          'STORAGE_INIT',
          () =>
            new DynamoAuthRecords(
              DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 3 }), {
                marshallOptions: { removeUndefinedValues: true },
              }),
              table,
              new TokenEnvelope(new Map([['v1', encryption]]), 'v1'),
            ),
        );
      }
      return stored.transaction(run);
    },
  };
  const publicClient = () =>
    stage('WEB_AUTH_CONFIG', () => {
      const id = required('DIME_OAUTH_CLIENT_ID');
      if (id !== '4228okut24ll35bisjmygbquaf6svm') throw Error();
      return id;
    });
  let oauth: TwitchOAuth | undefined;
  const providerInstance = async () => {
    if (emergency) throw new WebInitializationError('WEB_AUTH_CONFIG');
    if (oauth) return oauth;
    const secret = oauthSecret(await currentWebSecret('oauth'));
    return (oauth = stage(
      'WEB_AUTH_CONFIG',
      () => new TwitchOAuth(publicClient(), secret, origin + '/auth/callback'),
    ));
  };
  return new WebAuth(
    repo,
    {
      prepare: async () => {
        await providerInstance();
      },
      authorize: (state, nonce) => {
        if (!oauth) throw new WebInitializationError('WEB_AUTH_CONFIG');
        return oauth.authorize(state, nonce);
      },
      exchange: async (code, nonce) => (await providerInstance()).exchange(code, nonce),
      validate: async (tokens) => (await providerInstance()).validate(tokens),
      revoke: (tokens) => revokeTwitchToken(publicClient(), tokens),
    },
    identity,
    origin,
  );
}
async function configure() {
  const auth = await configuredAuth();
  const origins = stage('WEB_AUTH_CONFIG', () => {
    const values = required('DIME_ALLOWED_ORIGINS').split(',');
    if (values.some((value) => !/^https:\/\/[a-z0-9-]+\.ext-twitch\.tv$/.test(value))) throw Error();
    if (
      required('DIME_CONVERSION_MODE') !== 'ENABLED' ||
      (process.env.DIME_CONVERSION_TESTER_TAGS ?? '') !== ''
    )
      throw Error();
    return values;
  });
  return createWebApi(
    auth,
    {
      authorize: async (header) => {
        // Extension credentials are used only by independently enabled, authenticated link acceptance.
        const extensionKey = stage('SECRET_FORMAT', () =>
          decodeSecret(resolvedSecret(process.env.TWITCH_EXTENSION_SECRET_B64)),
        );
        const extensionIdentity = stage('SECRET_FORMAT', () =>
          decodeSecret(resolvedSecret(process.env.DIME_PLAYER_ID_KEY_B64)),
        );
        const keys = [
          extensionKey,
          extensionIdentity,
          webKey(await currentWebSecret('identity'), true),
          webKey(await currentWebSecret('encryption')),
        ];
        requireDistinctKeys(keys);
        return authenticate(header, [extensionKey], extensionIdentity);
      },
      origins,
      linkingEnabled: process.env.DIME_ACCOUNT_LINKING === 'ENABLED',
      linkingMode: () => process.env.DIME_ACCOUNT_LINKING,
    },
    { mode: 'ENABLED', testerCount: 0, permits: () => true },
    () => process.env.DIME_WEB_SIGN_IN_MODE,
    initializationFailure,
  );
}
export async function handler(event: {
  dimeOwnerSelfTest?: string;
  stage?: string;
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { stage?: string; http?: { method?: string } };
}) {
  try {
    // Lambda IAM authorizes direct invocations before this handler runs. Never
    // interpret a readiness marker carried by an HTTP integration as readiness.
    if (Object.prototype.hasOwnProperty.call(event, 'dimeOwnerSelfTest')) {
      const mode = process.env.DIME_WEB_SIGN_IN_MODE;
      const stage = event.stage;
      if (
        Object.keys(event).length !== 2 ||
        event.dimeOwnerSelfTest !== 'key-readiness-v2' ||
        process.env.DIME_ACCOUNT_LINKING !== 'DISABLED' ||
        !(
          (mode === 'DISABLED' && (stage === 'AWSCURRENT' || stage === 'AWSPENDING')) ||
          (mode === 'TESTERS' && stage === 'AWSCURRENT')
        )
      )
        throw new WebInitializationError('WEB_AUTH_CONFIG');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(await webKeyReadiness(stage as 'AWSCURRENT' | 'AWSPENDING')),
      };
    }
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
    const emergency = await emergencyRoute(request, () => configuredAuth(true), initializationFailure);
    if (emergency) return emergency;
    if (
      method === 'GET' &&
      path.split('?')[0] === '/auth/login' &&
      process.env.DIME_WEB_SIGN_IN_MODE === 'TESTERS'
    ) {
      const invitation = new URL(path, 'https://localhost').searchParams.get('invitation') ?? '';
      parseTesterInvitation(invitation);
      // Signature rejection loads only the invitation key. No encryption, OAuth or storage dependency.
      verifyTesterInvitation(webKey(await currentWebSecret('identity'), true), invitation);
    }
    return await (
      await configure()
    )(request);
  } catch (error) {
    if (error instanceof InvitationError)
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ message: 'Authentication could not be completed.' }),
      };
    return initializationFailure(error);
  }
}
