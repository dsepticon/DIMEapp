import { createHmac } from 'node:crypto';
import { TokenEnvelope } from './authRecords';
import { mintTesterInvitation, verifyTesterInvitation, testerIdentifier } from './testerInvitation';
import { inspectWebKey, requireDistinctKeys } from './webInitialization';
import { readinessWebSecret, type SecretStage } from './webSecrets';
export async function webKeyReadiness(stage: SecretStage) {
  const result = {
    identity_source_valid: false,
    identity_envelope_valid: false,
    identity_encoding_valid: false,
    identity_length_valid: false,
    encryption_source_valid: false,
    encryption_envelope_valid: false,
    encryption_encoding_valid: false,
    encryption_length_valid: false,
    keys_distinct: false,
    derived_invitation_ready: false,
    encryption_round_trip_ready: false,
  };
  const keys: Partial<Record<'identity' | 'encryption', Uint8Array>> = {};
  try {
    for (const purpose of ['identity', 'encryption'] as const) {
      try {
        const raw = await readinessWebSecret(purpose, stage);
        const checks = inspectWebKey(raw);
        result[`${purpose}_source_valid`] = checks.source;
        result[`${purpose}_envelope_valid`] = checks.envelope;
        result[`${purpose}_encoding_valid`] = checks.encoding;
        result[`${purpose}_length_valid`] = checks.length;
        if (checks.key) keys[purpose] = checks.key;
      } catch {
        /* Boolean-only internal response, no exception logging. */
      }
    }
    if (!keys.identity || !keys.encryption) return result;
    try {
      requireDistinctKeys([keys.identity, keys.encryption]);
      result.keys_distinct = true;
    } catch {
      return result;
    }
    const identity = keys.identity,
      encryption = keys.encryption;
    const invitation = mintTesterInvitation(identity, '1'); // Synthetic only, never returned or persisted.
    const tester = testerIdentifier(identity, '1');
    const subject = createHmac('sha256', identity)
      .update('dime:oauth-subject:v1\0' + '1')
      .digest('hex');
    const payload = invitation.invitation.split('.')[0]!;
    const wrongSignature = createHmac('sha256', identity)
      .update('dime:oauth-subject:v1\0' + payload)
      .digest('base64url');
    let crossDomainRejected = false;
    try {
      verifyTesterInvitation(identity, payload + '.' + wrongSignature);
    } catch {
      crossDomainRejected = true;
    }
    result.derived_invitation_ready =
      verifyTesterInvitation(identity, invitation.invitation).tester === tester &&
      tester !== subject &&
      crossDomainRejected;
    invitation.invitation = '';
    const envelope = new TokenEnvelope(new Map([['synthetic', encryption]]), 'synthetic');
    const sealed = envelope.seal({ synthetic: true }, 'dime:readiness:v1');
    const opened = envelope.open(sealed, 'dime:readiness:v1') as { synthetic: boolean };
    let wrongContextRejected = false;
    try {
      envelope.open(sealed, 'dime:readiness:other:v1');
    } catch {
      wrongContextRejected = true;
    }
    result.encryption_round_trip_ready = opened.synthetic === true && wrongContextRejected;
    sealed.data = sealed.iv = sealed.tag = '';
    return result;
  } catch {
    return result;
  } finally {
    keys.identity?.fill(0);
    keys.encryption?.fill(0);
  }
}
