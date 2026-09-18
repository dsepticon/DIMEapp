"""Owner-only bounded key repair. No values in arguments, files, logs or output."""
import base64
import json
import os
from pathlib import Path
import resource
import secrets
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = Path('/tmp/dime-m42-key-repair')
REGION = 'us-east-2'
ARNS = {
    'identity': 'arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/identity-key-kL7iYK',
    'encryption': 'arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/auth-encryption-key-hAAuXq',
}


def aws(*args, payload=None):
    command = ['aws', *args, '--region', REGION, '--output', 'json']
    fd = None
    try:
        if payload is not None:
            # Anonymous RAM-backed descriptor, never a filesystem path containing secret bytes.
            fd = os.memfd_create('dime-secret-input', os.MFD_CLOEXEC)
            os.write(fd, json.dumps(payload).encode())
            os.lseek(fd, 0, os.SEEK_SET)
            command += ['--cli-input-json', 'file:///proc/self/fd/' + str(fd)]
        run = subprocess.run(command, capture_output=True, text=True,
                             pass_fds=() if fd is None else (fd,))
    finally:
        if fd is not None:
            os.ftruncate(fd, 0)
            os.close(fd)
    if run.returncode:
        category = 'AWS_OPERATION'
        if 'Unable to load paramfile' in run.stderr or 'Error parsing parameter' in run.stderr:
            category = 'AWS_INPUT_PIPE'
        for code in ['AccessDeniedException', 'InvalidRequestException', 'InvalidParameterException', 'ResourceNotFoundException', 'DecryptionFailure', 'EncryptionFailure']:
            if '(' + code + ')' in run.stderr:
                category = 'AWS_' + code.upper()
        raise RuntimeError(category)
    return json.loads(run.stdout or '{}')


def save(name, value):
    (EVIDENCE / name).write_text(json.dumps(value, indent=2) + '\n')


def metadata():
    result = {}
    for purpose, arn in ARNS.items():
        m = aws('secretsmanager', 'describe-secret', '--secret-id', arn)
        if m['ARN'] != arn or m.get('DeletedDate'):
            raise RuntimeError('SECRET_METADATA')
        result[purpose] = {'arn': arn, 'stages': m['VersionIdsToStages']}
    return result


def current(m):
    versions = [v for v, labels in m['stages'].items() if 'AWSCURRENT' in labels]
    if len(versions) != 1:
        raise RuntimeError('SECRET_STAGE')
    return versions[0]


def disabled():
    if aws('sts', 'get-caller-identity')['Account'] != '861738068626':
        raise RuntimeError('AWS_ACCOUNT')
    stack = aws('cloudformation', 'describe-stacks', '--stack-name', 'dime-v2-review-20260912')['Stacks'][0]
    params = {p['ParameterKey']: p['ParameterValue'] for p in stack['Parameters']}
    if stack['StackStatus'] != 'UPDATE_COMPLETE' or params['WebSignInMode'] != 'DISABLED' or params['AccountLinkingMode'] != 'DISABLED' or params['ContentConversionMode'] != 'ENABLED':
        raise RuntimeError('MODE_GATE')


def prepare():
    disabled()
    before = metadata()
    if (EVIDENCE / 'pending-versions.json').exists():
        prior = json.loads((EVIDENCE / 'pending-versions.json').read_text())
        if any(v['status'] != 'prepared' or v['versionId'] in before[k]['stages'] for k,v in prior.items()):
            raise RuntimeError('ALREADY_PREPARED')
    if any('AWSPENDING' in labels for m in before.values() for labels in m['stages'].values()):
        raise RuntimeError('EXISTING_PENDING')
    save('secret-stages-before.json', before)
    versions = {}
    for purpose, arn in ARNS.items():
        version = str(uuid.uuid4())
        # Record retry identity before the write; this file contains metadata only.
        versions[purpose] = {'arn': arn, 'versionId': version, 'status': 'prepared'}
        save('pending-versions.json', versions)
        raw = bytearray(secrets.token_bytes(32))
        payload = {'SecretId': arn, 'ClientRequestToken': version,
                   'SecretString': base64.b64encode(raw).decode('ascii'), 'VersionStages': ['AWSPENDING']}
        try:
            result = aws('secretsmanager', 'put-secret-value', payload=payload)
        finally:
            raw[:] = b'\x00' * len(raw)
            payload.clear()
        if result['VersionId'] != version or result['ARN'] != arn:
            raise RuntimeError('SECRET_VERSION')
        versions[purpose]['status'] = 'success'
        save('pending-versions.json', versions)
    print(json.dumps(list(versions.values())))


def validate(stage='AWSPENDING'):
    disabled()
    expected = json.loads((EVIDENCE / 'pending-versions.json').read_text())
    before = metadata()
    for purpose in ARNS:
        if stage not in before[purpose]['stages'].get(expected[purpose]['versionId'], []):
            raise RuntimeError('SECRET_STAGE')
    # Owner-authorized isolated canary. Only these exact staged versions can be resolved.
    # No SDK logging, exception rendering, secret files, or secret-derived output.
    import logging
    import boto3
    from botocore.config import Config
    logging.disable(logging.CRITICAL)
    client = boto3.Session(region_name=REGION).client('secretsmanager',
        config=Config(connect_timeout=5, read_timeout=10, retries={'total_max_attempts': 2, 'mode':'standard'}))
    values = {}
    try:
        for purpose, arn in ARNS.items():
            response = client.get_secret_value(SecretId=arn,
                VersionId=expected[purpose]['versionId'], VersionStage=stage)
            if response.get('ARN') != arn or response.get('VersionId') != expected[purpose]['versionId'] or stage not in response.get('VersionStages',[]):
                raise RuntimeError('SECRET_STAGE')
            values[purpose] = response.pop('SecretString')
            response.clear()
    except BaseException:
        values.clear()
        raise RuntimeError('SECURE_RESOLUTION') from None
    finally:
        client.close()
    # Child has no AWS credentials, tracing/debug environment, shell, or network requirement.
    run = subprocess.run(['node', '--import', 'tsx', 'scripts/validate-web-keys.ts'], cwd=ROOT,
                         env={'PATH': os.environ.get('PATH', '')}, input=json.dumps(values),
                         capture_output=True, text=True)
    values.clear()
    if run.returncode:
        raise RuntimeError('KEY_VALIDATION')
    result = json.loads(run.stdout)
    fields = {'contractValid', 'keysDistinct', 'identityReady', 'invitationVerifierReady', 'encryptionReady', 'crossDomainRejected'}
    if set(result) != fields or not all(v is True for v in result.values()):
        raise RuntimeError('VALIDATOR_OUTPUT')
    if before != metadata():
        raise RuntimeError('SECRET_STAGE_RACE')
    save('validation-' + stage + '.json', result)
    print(json.dumps(result))


def promote():
    disabled()
    expected = json.loads((EVIDENCE / 'pending-versions.json').read_text())
    old = json.loads((EVIDENCE / 'secret-stages-before.json').read_text())
    result = json.loads((EVIDENCE / 'validation-AWSPENDING.json').read_text())
    if not all(v is True for v in result.values()):
        raise RuntimeError('UNVALIDATED')
    now = metadata()
    for purpose in ARNS:
        if current(now[purpose]) != current(old[purpose]) or 'AWSPENDING' not in now[purpose]['stages'].get(expected[purpose]['versionId'], []):
            raise RuntimeError('SECRET_STAGE_RACE')
    for purpose, arn in ARNS.items():
        aws('secretsmanager', 'update-secret-version-stage', '--secret-id', arn,
            '--version-stage', 'AWSCURRENT', '--move-to-version-id', expected[purpose]['versionId'],
            '--remove-from-version-id', current(old[purpose]))
    after = metadata()
    for purpose in ARNS:
        if current(after[purpose]) != expected[purpose]['versionId'] or 'AWSPREVIOUS' not in after[purpose]['stages'].get(current(old[purpose]), []):
            raise RuntimeError('PROMOTION_METADATA')
    save('secret-stages-promoted.json', after)
    print(json.dumps({'promoted': True, 'priorVersionsRetained': True}))


def rollback():
    disabled()
    old = json.loads((EVIDENCE / 'secret-stages-before.json').read_text())
    expected = json.loads((EVIDENCE / 'pending-versions.json').read_text())
    now = metadata()
    for purpose, arn in ARNS.items():
        active = current(now[purpose])
        if active == current(old[purpose]):
            continue
        if active != expected[purpose]['versionId']:
            raise RuntimeError('SECRET_STAGE_RACE')
        aws('secretsmanager', 'update-secret-version-stage', '--secret-id', arn,
            '--version-stage', 'AWSCURRENT', '--move-to-version-id', current(old[purpose]),
            '--remove-from-version-id', active)
    restored = metadata()
    for purpose, arn in ARNS.items():
        prior_previous = [v for v, labels in old[purpose]['stages'].items() if 'AWSPREVIOUS' in labels]
        candidate = expected[purpose]['versionId']
        if not prior_previous and 'AWSPREVIOUS' in restored[purpose]['stages'].get(candidate, []):
            aws('secretsmanager', 'update-secret-version-stage', '--secret-id', arn,
                '--version-stage', 'AWSPREVIOUS', '--remove-from-version-id', candidate)
    restored = metadata()
    for purpose, arn in ARNS.items():
        candidate = expected[purpose]['versionId']
        if 'AWSPENDING' not in restored[purpose]['stages'].get(candidate, []):
            aws('secretsmanager', 'update-secret-version-stage', '--secret-id', arn,
                '--version-stage', 'AWSPENDING', '--move-to-version-id', candidate)
    save('secret-stages-rollback.json', metadata())
    print(json.dumps({'rolledBack': True}))


if __name__ == '__main__':
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        os.umask(0o077)
        action = sys.argv[1:]
        if action == ['prepare']:
            prepare()
        elif action == ['validate']:
            validate()
        elif action == ['validate-current']:
            validate('AWSCURRENT')
        elif action == ['promote']:
            promote()
        elif action == ['rollback']:
            rollback()
        else:
            raise RuntimeError('INVALID_OPERATION')
    except BaseException as error:
        categories = {'AWS_OPERATION', 'AWS_INPUT_PIPE', 'AWS_ACCESSDENIEDEXCEPTION', 'AWS_INVALIDREQUESTEXCEPTION', 'AWS_INVALIDPARAMETEREXCEPTION', 'AWS_RESOURCENOTFOUNDEXCEPTION', 'AWS_DECRYPTIONFAILURE', 'AWS_ENCRYPTIONFAILURE', 'SECURE_RESOLUTION', 'SECRET_METADATA', 'SECRET_STAGE', 'AWS_ACCOUNT', 'MODE_GATE', 'ALREADY_PREPARED', 'EXISTING_PENDING', 'SECRET_VERSION', 'RESOLVER_INTEGRITY', 'KEY_VALIDATION', 'VALIDATOR_OUTPUT', 'SECRET_STAGE_RACE', 'UNVALIDATED', 'PROMOTION_METADATA', 'INVALID_OPERATION'}
        category = str(error) if type(error) is RuntimeError and str(error) in categories else 'SECURE_WORKFLOW'
        print(json.dumps({'success': False, 'category': category}))
        sys.exit(1)
