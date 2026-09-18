/** Synthetic SDK boundary: production code never reads these plaintext fixture variables. */
import { beforeEach, vi } from 'vitest';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { clearWebSecretCache, WEB_SECRET_ARNS } from '../server/webSecrets';
export function syntheticWebSecrets() {
  beforeEach(() => {
    clearWebSecretCache();
    vi.stubEnv('AWS_REGION', 'us-east-2');
    vi.stubEnv('DIME_AUTH_KEY_REVISION', 'synthetic-v1');
    vi.stubEnv('DIME_WEB_ID_SECRET_ARN', WEB_SECRET_ARNS.identity);
    vi.stubEnv('DIME_AUTH_ENCRYPTION_SECRET_ARN', WEB_SECRET_ARNS.encryption);
    vi.stubEnv('DIME_OAUTH_CLIENT_SECRET_ARN', WEB_SECRET_ARNS.oauth);
    vi.spyOn(SecretsManagerClient.prototype, 'send').mockImplementation(async (input: unknown) => {
      const command = input as GetSecretValueCommand;
      const name =
        command.input.SecretId === WEB_SECRET_ARNS.identity
          ? 'DIME_WEB_ID_KEY_B64'
          : command.input.SecretId === WEB_SECRET_ARNS.encryption
            ? 'DIME_AUTH_ENCRYPTION_KEY_B64'
            : command.input.SecretId === WEB_SECRET_ARNS.oauth
              ? 'DIME_OAUTH_CLIENT_SECRET'
              : undefined;
      if (!name) throw Error('Unexpected synthetic secret scope');
      return {
        ARN: command.input.SecretId,
        VersionStages: [command.input.VersionStage],
        SecretString: process.env[name],
      };
    });
  });
}
