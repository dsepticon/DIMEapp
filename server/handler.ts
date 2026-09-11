import { authenticate, decodeSecret } from './auth';
import { createDynamoStore } from './dynamo';
import { createApi } from './http';
import { GameService } from './service';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error('Missing server configuration: ' + name);
  return value;
}
function configure() {
  const environment = required('DIME_ENV');
  if (!['staging', 'production'].includes(environment))
    throw new Error('Lambda cannot run local authentication.');
  const table = required('DIME_STATE_TABLE');
  if (!table.startsWith('dime-v2-' + environment + '-'))
    throw new Error('Use a separately approved v2 table; legacy tables are not compatible.');
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
    throw new Error('Invalid origin configuration.');
  const keys = [decodeSecret(required('TWITCH_EXTENSION_SECRET_B64'))];
  if (process.env.TWITCH_PREVIOUS_SECRET_B64) keys.push(decodeSecret(process.env.TWITCH_PREVIOUS_SECRET_B64));
  return createApi(
    new GameService(createDynamoStore(required('AWS_REGION'), table)),
    (header) => authenticate(header, keys),
    origins,
  );
}
// Lazy initialization allows packaging/tests without production credentials; one client per warm container.
let api: ReturnType<typeof configure> | undefined;
export async function handler(event: {
  rawPath?: string;
  path?: string;
  httpMethod?: string;
  requestContext?: { http?: { method?: string }; requestId?: string };
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
      path: event.rawPath ?? event.path ?? '',
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
  } catch {
    console.error(JSON.stringify({ event: 'configuration_error' }));
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Service is not configured.' }),
    };
  }
}
