"""Owner-only runtime bridge to the pinned asm-exec resolver. Never run with real inputs in review."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys

RESOLVER_SHA256 = '38399ce2a9a2b5e69fc9179815d90669e80612ea1dfc4dc2d399db9608488035'
DEFAULT_RESOLVER = '/home/dsepticon/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-secrets-manager/references/asm-exec'
REFERENCE = '{{resolve:secretsmanager:arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/identity-key-kL7iYK:SecretString}}'


def verified_resolver():
    path = Path(os.environ.get('DIME_ASM_EXEC_PATH', DEFAULT_RESOLVER))
    source = path.read_bytes()
    if hashlib.sha256(source).hexdigest() != RESOLVER_SHA256:
        raise RuntimeError('Unreviewed resolver.')
    namespace = {'__name__': 'dime_owner_resolver', '__file__': str(path)}
    # Execute only the hash-verified bytes; no second path read or resolver main invocation.
    exec(compile(source, str(path), 'exec'), namespace)
    return namespace['resolve_string']


def provision(resolve):
    # Resolve inside this owner process. Suppress upstream diagnostics; never expose their payloads.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        key = resolve(REFERENCE)
    if not isinstance(key, str) or not key or '{{resolve:' in key:
        raise RuntimeError('Resolution failed.')
    # The signing child needs no AWS credential environment or debug Node options.
    child_env = {'PATH': os.environ.get('PATH', ''), 'DIME_TESTER_IDENTITY_KEY_B64': key}
    result = subprocess.run(
        ['node', '--import', 'tsx', 'scripts/provision-tester.ts'],
        cwd=Path(__file__).resolve().parents[1], env=child_env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False,
    )
    child_env.clear()
    if result.returncode:
        raise RuntimeError('Signing failed.')
    output = json.loads(result.stdout)
    if set(output) != {'url', 'expiresAt'} or not isinstance(output['expiresAt'], str) or not output['url'].startswith('https://destroyaindustriesminingextension.com/auth/login?invitation='):
        raise RuntimeError('Invalid signer output.')
    sys.stdout.write(json.dumps(output) + '\n')


if __name__ == '__main__':
    try:
        resolver = verified_resolver()
        if sys.argv[1:] != ['--check']:
            if len(sys.argv) != 1:
                raise RuntimeError('Invalid arguments.')
            provision(resolver)
        # --check verifies resolver bytes only; no resolution, network or invitation generation.
    except (Exception, SystemExit):
        sys.stderr.write('Invitation provisioning failed.\n')
        sys.exit(1)
