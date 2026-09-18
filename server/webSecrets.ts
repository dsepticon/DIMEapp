/** Web-only exact-ARN resolver. No SDK logger, request logging, or process.env plaintext mutation. */
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { WebInitializationError } from './webInitialization';
export const WEB_SECRET_ARNS = {
  identity: 'arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/identity-key-kL7iYK',
  encryption: 'arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/auth-encryption-key-hAAuXq',
  oauth: 'arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/oauth/client-secret-s5kwbq',
} as const;
const variables = {
  identity: 'DIME_WEB_ID_SECRET_ARN',
  encryption: 'DIME_AUTH_ENCRYPTION_SECRET_ARN',
  oauth: 'DIME_OAUTH_CLIENT_SECRET_ARN',
} as const;
type Purpose = keyof typeof WEB_SECRET_ARNS;
export type SecretStage = 'AWSCURRENT' | 'AWSPENDING';
const cache = new Map<Purpose, { value: string; until: number }>();
let revision: string | undefined;
let client: SecretsManagerClient | undefined;
export function clearWebSecretCache() {
  cache.clear();
  revision = undefined;
}
function source(purpose: Purpose) {
  const current = process.env.DIME_AUTH_KEY_REVISION;
  if (!current || !/^[a-z0-9-]{1,96}$/.test(current)) throw new WebInitializationError('WEB_AUTH_CONFIG');
  if (current !== revision) {
    cache.clear();
    revision = current;
  }
  const arn = process.env[variables[purpose]];
  if (process.env.AWS_REGION !== 'us-east-2' || arn !== WEB_SECRET_ARNS[purpose])
    throw new WebInitializationError('SECRET_REFERENCE');
  return arn;
}
async function retrieve(purpose: Purpose, stage: SecretStage, fresh: boolean): Promise<string> {
  const arn = source(purpose);
  const cached = cache.get(purpose);
  if (!fresh && stage === 'AWSCURRENT' && cached && cached.until > Date.now()) return cached.value;
  let response;
  try {
    client ??= new SecretsManagerClient({
      region: 'us-east-2',
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 },
    });
    response = await client.send(new GetSecretValueCommand({ SecretId: arn, VersionStage: stage }));
  } catch {
    throw new WebInitializationError('SECRET_ACCESS');
  }
  if (
    response.ARN !== arn ||
    !response.VersionStages?.includes(stage) ||
    typeof response.SecretString !== 'string' ||
    response.SecretBinary !== undefined
  )
    throw new WebInitializationError('SECRET_REFERENCE');
  const value = response.SecretString;
  if (!fresh && stage === 'AWSCURRENT') cache.set(purpose, { value, until: Date.now() + 30_000 });
  return value;
}
/** Normal traffic cannot select a version stage. */
export const currentWebSecret = (purpose: Purpose) => retrieve(purpose, 'AWSCURRENT', false);
/** Only imported by the direct-invocation readiness boundary; never caches pending material. */
export const readinessWebSecret = (purpose: 'identity' | 'encryption', stage: SecretStage) =>
  retrieve(purpose, stage, true);
