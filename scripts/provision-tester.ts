/** Owner-only local tool. Never run with real inputs as part of automated review. */
import { mintTesterInvitation } from '../server/testerInvitation';
import { decodeSecret } from '../server/auth';
let input = '';
try {
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 64) throw Error();
  }
  const key = decodeSecret(process.env.DIME_TESTER_IDENTITY_KEY_B64 ?? '');
  delete process.env.DIME_TESTER_IDENTITY_KEY_B64;
  const grant = mintTesterInvitation(key, input.trim());
  key.fill(0);
  input = '';
  process.stdout.write(
    JSON.stringify({
      url: 'https://destroyaindustriesminingextension.com/auth/login?invitation=' + grant.invitation,
      expiresAt: new Date(grant.expiresAt).toISOString(),
    }) + '\n',
  );
} catch {
  process.stderr.write('Invitation provisioning failed.\n');
  process.exitCode = 1;
}
