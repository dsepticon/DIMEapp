import { authenticate, decodeSecret } from './auth';
import { createDynamoStore } from './dynamo';
import { parseVersionedContent } from './contentConversion';
import { createOriginalApi } from './originalApi';
import { createApi } from './http';
import { GameService } from './service';
import type { PlayerState } from '../shared/schema';
import type { Store } from './store';
import { createConversionGate } from './conversionGate';
type ConfigurationCode =
  | 'missing_setting'
  | 'invalid_environment'
  | 'invalid_table'
  | 'invalid_origin'
  | 'invalid_revision'
  | 'invalid_conversion_mode'
  | 'invalid_conversion_testers'
  | 'invalid_twitch_key'
  | 'invalid_identity_key'
  | 'invalid_previous_key'
  | 'unexpected_configuration_error';
class ConfigurationError extends Error {
  constructor(readonly code: ConfigurationCode) {
    super('Invalid server configuration');
  }
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new ConfigurationError('missing_setting');
  return value;
}
function secret(name: string, code: ConfigurationCode) {
  try {
    return decodeSecret(required(name));
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError(code);
  }
}
function configure() {
  const environment = required('DIME_ENV');
  if (!['staging', 'production'].includes(environment)) throw new ConfigurationError('invalid_environment');
  const table = required('DIME_STATE_TABLE');
  if (!table.startsWith('dime-v2-' + environment + '-')) throw new ConfigurationError('invalid_table');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(required('DIME_CONFIG_REVISION')))
    throw new ConfigurationError('invalid_revision');
  const origins = required('DIME_ALLOWED_ORIGINS').split(',');
  if (
    origins.some((o) => {
      try {
        const u = new URL(o);
        return u.protocol !== 'https:' || u.origin !== o;
      } catch {
        return true;
      }
    })
  )
    throw new ConfigurationError('invalid_origin');
  const keys = [secret('TWITCH_EXTENSION_SECRET_B64', 'invalid_twitch_key')];
  const identityKey = secret('DIME_PLAYER_ID_KEY_B64', 'invalid_identity_key');
  if (process.env.TWITCH_PREVIOUS_SECRET_B64)
    keys.push(secret('TWITCH_PREVIOUS_SECRET_B64', 'invalid_previous_key'));
  const store = createDynamoStore(required('AWS_REGION'), table, parseVersionedContent);
  const auth = (header: string | undefined) => authenticate(header, keys, identityKey);
  let conversionGate;
  try {
    conversionGate = createConversionGate(
      required('DIME_CONVERSION_MODE'),
      process.env.DIME_CONVERSION_TESTER_TAGS ?? '',
      identityKey,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'invalid_conversion_mode' || code === 'invalid_conversion_testers')
      throw new ConfigurationError(code);
    throw error;
  }
  const original = createOriginalApi(store, auth, origins, Date.now, conversionGate);
  const legacy = createApi(new GameService(store as unknown as Store<PlayerState>), auth, origins);
  return (request: Parameters<typeof original>[0]) =>
    request.path.startsWith('/v4/') ? original(request) : legacy(request);
}
// Lazy initialization allows packaging/tests without production credentials; one client per warm container.
let api: ReturnType<typeof configure> | undefined;
export function routePath(rawPath: string, stage: string | undefined) {
  if (!stage || stage === '$default') return rawPath;
  const prefix = '/' + stage;
  if (rawPath === prefix) return '/';
  return rawPath.startsWith(prefix + '/') ? rawPath.slice(prefix.length) : rawPath;
}
export async function handler(event: {
  rawPath?: string;
  path?: string;
  httpMethod?: string;
  requestContext?: { http?: { method?: string }; requestId?: string; stage?: string };
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}) {
  try {
    api ??= configure();
    const headers = Object.fromEntries(
      Object.entries(event.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
    );
    const response = await api({
      method: event.requestContext?.http?.method ?? event.httpMethod ?? '',
      path: routePath(event.rawPath ?? event.path ?? '', event.requestContext?.stage),
      headers,
      body: event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body,
    });
    const requestId = event.requestContext?.requestId;
    console.info(
      JSON.stringify({
        event: 'request_completed',
        status: response.statusCode,
        requestId: requestId && /^[A-Za-z0-9-]{1,80}$/.test(requestId) ? requestId : undefined,
      }),
    );
    return response;
  } catch (error) {
    const code = error instanceof ConfigurationError ? error.code : 'unexpected_configuration_error';
    console.error(JSON.stringify({ event: 'configuration_error', code }));
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Service is not configured.' }),
    };
  }
}
