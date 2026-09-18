import { randomUUID, timingSafeEqual } from 'node:crypto';

export type InitCategory =
  | 'WEB_AUTH_CONFIG'
  | 'SECRET_REFERENCE'
  | 'SECRET_ACCESS'
  | 'SECRET_FORMAT'
  | 'KEY_LENGTH'
  | 'KEY_REUSE'
  | 'INVITATION_KEY_FORMAT'
  | 'CALLBACK_CONFIG'
  | 'STORAGE_INIT';
export class WebInitializationError extends Error {
  constructor(readonly category: InitCategory) {
    super('Authentication initialization failed.');
  }
}
export function stage<T>(category: InitCategory, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof WebInitializationError) throw error;
    throw new WebInitializationError(category);
  }
}
/** CloudFormation resolves SecretString at deployment. No runtime Secrets Manager client exists. */
export function resolvedSecret(value: string | undefined): string {
  if (!value || value.startsWith('arn:') || value.startsWith('{{resolve:'))
    throw new WebInitializationError('SECRET_REFERENCE');
  return value;
}
/** One canonical format: full plaintext SecretString, padded Base64 of exactly 32 bytes. */
export function webKey(value: string | undefined, invitation = false): Uint8Array {
  const raw = resolvedSecret(value);
  const category = invitation ? 'INVITATION_KEY_FORMAT' : 'SECRET_FORMAT';
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))
    throw new WebInitializationError(category);
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.toString('base64') !== raw) throw new WebInitializationError(category);
  if (bytes.length !== 32) throw new WebInitializationError('KEY_LENGTH');
  return bytes;
}
/** Inputs are decoded and format/length-validated first. No comparison inputs escape. */
export function requireDistinctKeys(keys: readonly Uint8Array[]): void {
  let reused = false;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i]!,
        b = keys[j]!;
      if (a.length === b.length) reused = timingSafeEqual(a, b) || reused;
    }
  }
  if (reused) throw new WebInitializationError('KEY_REUSE');
}
export function oauthSecret(value: string | undefined): string {
  const raw = resolvedSecret(value);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(raw)) throw new WebInitializationError('SECRET_FORMAT');
  return raw;
}
/** Only these two generated/allowlisted fields reach logs. Never serialize exceptions or requests. */
export function initializationFailure(error: unknown) {
  const allowed: readonly InitCategory[] = [
    'WEB_AUTH_CONFIG',
    'SECRET_REFERENCE',
    'SECRET_ACCESS',
    'SECRET_FORMAT',
    'KEY_LENGTH',
    'KEY_REUSE',
    'INVITATION_KEY_FORMAT',
    'CALLBACK_CONFIG',
    'STORAGE_INIT',
  ];
  const category =
    error instanceof WebInitializationError && allowed.includes(error.category)
      ? error.category
      : 'WEB_AUTH_CONFIG';
  const correlationId = randomUUID();
  console.error(JSON.stringify({ category, correlationId }));
  return {
    statusCode: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ message: 'Authentication is unavailable.', correlationId }),
  };
}
