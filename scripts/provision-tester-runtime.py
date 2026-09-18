"""Owner-only runtime bridge to the pinned asm-exec resolver. Never run with real inputs in review."""
import datetime
import re
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


CATEGORIES = frozenset({
    'PROVISION_INPUT', 'PROVISION_KEY', 'PROVISION_CONSTRUCTION',
    'PROVISION_OUTPUT', 'PROVISION_RESOLVER', 'PROVISION_ENVIRONMENT',
    'PROVISION_TIMEOUT', 'PROVISION_SIGNER',
})


class ProvisionFailure(RuntimeError):
    def __init__(self, category):
        self.category = category if category in CATEGORIES else 'PROVISION_SIGNER'
        super().__init__(self.category)


def child_category(stderr):
    # Never forward arbitrary upstream diagnostics, even if they look like JSON.
    try:
        value = json.loads(stderr)
        if isinstance(value, dict) and set(value) == {'category'} and value['category'] in CATEGORIES:
            return value['category']
    except (ValueError, TypeError):
        pass
    return 'PROVISION_SIGNER'


def validate_output(output):
    try:
        if not isinstance(output, dict) or set(output) != {'url', 'expiresAt'}:
            raise ValueError()
        if not isinstance(output['url'], str) or not re.fullmatch(
            r'https://destroyaindustriesminingextension\.com/auth/login\?invitation=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}', output['url']
        ):
            raise ValueError()
        expiry = datetime.datetime.fromisoformat(output['expiresAt'].replace('Z', '+00:00'))
        remaining = (expiry - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
        if not 0 < remaining <= 900:
            raise ValueError()
    except (ValueError, TypeError, AttributeError, OverflowError):
        raise ProvisionFailure('PROVISION_OUTPUT') from None


def provision(resolve):
    subject = sys.stdin.read(65)
    if len(subject) > 64:
        raise ProvisionFailure('PROVISION_INPUT')
    subject = subject.strip()
    if not re.fullmatch(r'[1-9][0-9]{0,19}', subject):
        raise ProvisionFailure('PROVISION_INPUT')
    child_env = {}
    key = None
    try:
        # Resolver payloads and exception strings must never reach operator output.
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                key = resolve(REFERENCE)
        except (Exception, SystemExit):
            raise ProvisionFailure('PROVISION_RESOLVER') from None
        if not isinstance(key, str) or not key or '{{resolve:' in key:
            raise ProvisionFailure('PROVISION_RESOLVER')
        child_env.update(PATH=os.environ.get('PATH', ''), DIME_TESTER_IDENTITY_KEY_B64=key)
        try:
            result = subprocess.run(
                ['node', '--import', 'tsx', 'scripts/provision-tester.ts'],
                cwd=Path(__file__).resolve().parents[1], env=child_env,
                input=subject + '\n', stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, check=False, timeout=30,
            )
        except subprocess.TimeoutExpired:
            raise ProvisionFailure('PROVISION_TIMEOUT') from None
        except OSError:
            raise ProvisionFailure('PROVISION_ENVIRONMENT') from None
        if result.returncode:
            raise ProvisionFailure(child_category(result.stderr))
        try:
            output = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise ProvisionFailure('PROVISION_OUTPUT') from None
        validate_output(output)
        try:
            sys.stdout.write(json.dumps(output) + '\n')
            sys.stdout.flush()
        except (OSError, ValueError):
            raise ProvisionFailure('PROVISION_OUTPUT') from None
    finally:
        child_env.clear()
        key = None
        subject = ''


def main():
    try:
        if sys.argv[1:] not in ([], ['--check']):
            raise ProvisionFailure('PROVISION_INPUT')
        try:
            resolver = verified_resolver()
        except (Exception, SystemExit):
            raise ProvisionFailure('PROVISION_RESOLVER') from None
        if not sys.argv[1:]:
            provision(resolver)
        return 0
    except (Exception, SystemExit) as error:
        category = error.category if isinstance(error, ProvisionFailure) else 'PROVISION_SIGNER'
        sys.stderr.write(json.dumps({'category': category}) + '\n')
        return 1


if __name__ == '__main__':
    sys.exit(main())
