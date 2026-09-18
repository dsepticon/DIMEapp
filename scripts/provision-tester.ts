/** Owner-only local tool. Never run with real inputs as part of automated review. */
import { mintTesterInvitation } from '../server/testerInvitation';
import { webKey } from '../server/webInitialization';
let input = '';
let key: Uint8Array | undefined;
let category = 'PROVISION_INPUT';
try {
  if (process.argv.length !== 2) throw Error();
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 64) throw Error();
  }
  if (!/^[1-9][0-9]{0,19}$/.test(input.trim())) throw Error();
  category = 'PROVISION_KEY';
  key = webKey(process.env.DIME_TESTER_IDENTITY_KEY_B64, true);
  delete process.env.DIME_TESTER_IDENTITY_KEY_B64;
  category = 'PROVISION_CONSTRUCTION';
  const grant = mintTesterInvitation(key, input.trim());
  key.fill(0);
  category = 'PROVISION_OUTPUT';
  await new Promise<void>((resolve, reject) => {
    // Install before writing: a closed delivery pipe must fail without an uncaught dump.
    process.stdout.once('error', reject);
    process.stdout.write(
      JSON.stringify({
        url: 'https://destroyaindustriesminingextension.com/auth/login?invitation=' + grant.invitation,
        expiresAt: new Date(grant.expiresAt).toISOString(),
      }) + '\n',
      (error) => (error ? reject(error) : resolve()),
    );
  });
} catch {
  process.stderr.write(JSON.stringify({ category }) + '\n');
  process.exitCode = 1;
} finally {
  delete process.env.DIME_TESTER_IDENTITY_KEY_B64;
  key?.fill(0);
}
