/** Restricted owner process: stdin only; emits booleans/categories, never key-derived output. */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { webKey, requireDistinctKeys, WebInitializationError } from '../server/webInitialization';
import { TokenEnvelope } from '../server/authRecords';
import { mintTesterInvitation, verifyTesterInvitation, testerIdentifier } from '../server/testerInvitation';

function validate() {
  const input = JSON.parse(readFileSync(0, 'utf8')) as { identity: string; encryption: string };
  const identity = webKey(input.identity, true);
  const encryption = webKey(input.encryption);
  input.identity = input.encryption = '';
  try {
    requireDistinctKeys([identity, encryption]);
    const subject = '1'; // Synthetic provider subject only; never sent to any service.
    const derived = createHmac('sha256', identity)
      .update('dime:oauth-subject:v1\0' + subject)
      .digest('hex');
    const tester = testerIdentifier(identity, subject);
    if (derived === tester) throw Error();
    const invite = mintTesterInvitation(identity, subject);
    if (verifyTesterInvitation(identity, invite.invitation).tester !== tester) throw Error();
    const payload = invite.invitation.split('.')[0]!;
    const substitute = createHmac('sha256', identity)
      .update('dime:oauth-subject:v1\0' + payload)
      .digest('base64url');
    let rejected = false;
    try {
      verifyTesterInvitation(identity, payload + '.' + substitute);
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error();
    const envelope = new TokenEnvelope(new Map([['synthetic-v1', encryption]]), 'synthetic-v1');
    const ciphertext = envelope.seal({ synthetic: true }, 'dime:key-check:synthetic:v1');
    const clear = envelope.open(ciphertext, 'dime:key-check:synthetic:v1') as { synthetic: boolean };
    if (clear.synthetic !== true) throw Error();
    let wrongContextRejected = false;
    try {
      envelope.open(ciphertext, 'dime:key-check:other:v1');
    } catch {
      wrongContextRejected = true;
    }
    if (!wrongContextRejected) throw Error();
    ciphertext.data = ciphertext.iv = ciphertext.tag = '';
    invite.invitation = '';
    return {
      contractValid: true,
      keysDistinct: true,
      identityReady: true,
      invitationVerifierReady: true,
      encryptionReady: true,
      crossDomainRejected: true,
    };
  } finally {
    identity.fill(0);
    encryption.fill(0);
  }
}
try {
  process.stdout.write(JSON.stringify(validate()) + '\n');
} catch (error) {
  const category = error instanceof WebInitializationError ? error.category : 'KEY_VALIDATION';
  process.stdout.write(JSON.stringify({ valid: false, category }) + '\n');
  process.exitCode = 1;
}
