"""Local batch delivery boundary. Caller supplies reviewed execution/rollback; no AWS access here."""
import importlib.util
import json
from pathlib import Path

_spec = importlib.util.spec_from_file_location('dime_provision_bridge', Path(__file__).with_name('provision-tester-runtime.py'))
_bridge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bridge)

# Fixed categories only. Never surface an upstream exception or arbitrary diagnostic string.
CATEGORIES = _bridge.CATEGORIES | frozenset({
    'PREFLIGHT', 'SECRET_RESOLUTION', 'INVITATION_PROVISIONING',
    'TWITCH_APP_TOKEN', 'TWITCH_TOKEN_VALIDATION', 'HELIX_EXACT_LOGIN',
    'TOKEN_REVOCATION', 'PROVISIONING_FAILED', 'INVITATION_EXPIRY',
    'PROVISION_PERSISTENCE', 'PROVISION_BATCH', 'ROLLBACK_FAILED',
})


def failure_category(stderr):
    try:
        value = json.loads(stderr)
        if isinstance(value, dict) and set(value) in ({'category'}, {'status', 'category'}):
            category = value['category']
            if isinstance(category, str) and category in CATEGORIES:
                return category
    except (TypeError, ValueError):
        pass
    return 'PROVISION_BATCH'


def deliver_batch(execute, rollback, deliver):
    """All-or-none validation before delivery; any failure requires caller's reviewed rollback.

    No retry: output transport failure may occur after partial delivery. The caller must keep
    activation disabled and let any potentially exposed invitation expire before another attempt.
    Returns only a category and rollback Boolean; grants and upstream diagnostics are never returned.
    """
    category = 'PROVISION_BATCH'
    try:
        result = execute()
        if result.returncode:
            category = failure_category(result.stderr)
            raise RuntimeError()
        grants = json.loads(result.stdout)
        if not isinstance(grants, list) or len(grants) != 2:
            raise RuntimeError()
        for grant in grants:
            _bridge.validate_output(grant)
        if grants[0]['url'] == grants[1]['url']:
            raise RuntimeError()
        category = 'PROVISION_OUTPUT'
        deliver(json.dumps(grants) + '\n')
        return {'category': 'DELIVERED', 'rolledBack': False}
    except (Exception, SystemExit, KeyboardInterrupt):
        try:
            rollback()
        except (Exception, SystemExit, KeyboardInterrupt):
            return {'category': 'ROLLBACK_FAILED', 'rolledBack': False}
        return {'category': category, 'rolledBack': True}
