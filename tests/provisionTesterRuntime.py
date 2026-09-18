"""Synthetic bridge tests. No resolver, network, AWS credentials or real identities."""
import base64
import contextlib
import datetime
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'scripts/provision-tester-runtime.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def output():
    return {'url': 'https://destroyaindustriesminingextension.com/auth/login?invitation=synthetic.' + 'a' * 43,
            'expiresAt': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=899)).isoformat()}


class Provisioning(unittest.TestCase):
    def call(self, resolver=lambda ref: 'synthetic-key', subject='90000000000000000001'):
        with patch.object(bridge.sys, 'stdin', io.StringIO(subject)):
            bridge.provision(resolver)

    def test_key_only_in_child_environment_and_environment_cleared(self):
        grant = output()
        captured = {}
        def child(args, **kwargs):
            captured.update(args=args, environment=dict(kwargs['env']), reference=kwargs['env'])
            return SimpleNamespace(returncode=0, stdout=json.dumps(grant), stderr='')
        stdout = io.StringIO()
        with patch.object(bridge.subprocess, 'run', child), contextlib.redirect_stdout(stdout):
            self.call()
        self.assertEqual(json.loads(stdout.getvalue()), grant)
        self.assertNotIn('synthetic-key', str(captured['args']))
        self.assertEqual(set(captured['environment']), {'PATH', 'DIME_TESTER_IDENTITY_KEY_B64'})
        self.assertEqual(captured['reference'], {})
        self.assertNotIn('synthetic-key', stdout.getvalue())

    def test_both_intended_tester_slots_use_real_signer_with_synthetic_ids(self):
        key = base64.b64encode(secrets.token_bytes(32)).decode()
        urls = []
        for subject in ['90000000000000000001', '90000000000000000002']:
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                self.call(lambda ref: key, subject)
            grant = json.loads(stdout.getvalue())
            self.assertNotIn(subject, grant['url'])
            self.assertNotIn(key, grant['url'])
            urls.append(grant['url'])
        self.assertNotEqual(*urls)

    def test_real_cli_rejects_arguments_inputs_and_invalid_key_without_payloads(self):
        for args, subject, key, category in [
            (['--unreviewed'], '90000000000000000001', 'synthetic-sensitive', 'PROVISION_INPUT'),
            ([], 'not-a-number', 'synthetic-sensitive', 'PROVISION_INPUT'),
            ([], '90000000000000000001', 'synthetic-sensitive', 'PROVISION_KEY'),
            ([], '90000000000000000001', base64.b64encode(bytes(31)).decode(), 'PROVISION_KEY'),
        ]:
            result = subprocess.run(
                ['node', '--import', 'tsx', 'scripts/provision-tester.ts', *args],
                cwd=Path(__file__).parents[1], input=subject,
                env={'PATH': os.environ.get('PATH', ''), 'DIME_TESTER_IDENTITY_KEY_B64': key},
                capture_output=True, text=True, timeout=30,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, '')
            self.assertEqual(json.loads(result.stderr), {'category': category})

    def test_real_cli_closed_delivery_pipe_has_only_output_category(self):
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            result = subprocess.run(
                ['node', '--import', 'tsx', 'scripts/provision-tester.ts'],
                cwd=Path(__file__).parents[1], input='90000000000000000001',
                env={'PATH': os.environ.get('PATH', ''), 'DIME_TESTER_IDENTITY_KEY_B64': base64.b64encode(secrets.token_bytes(32)).decode()},
                stdout=write_fd, stderr=subprocess.PIPE, text=True, timeout=30,
            )
        finally:
            os.close(write_fd)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stderr), {'category': 'PROVISION_OUTPUT'})

    def test_malformed_input_never_resolves_or_launches(self):
        for subject in ['', '0', '001', '-1', '1 2', 'abc', '1' * 21, '1' * 100]:
            with self.subTest(subject=subject), patch.object(bridge.subprocess, 'run') as run:
                def forbidden(ref):
                    self.fail('resolver called')
                with self.assertRaisesRegex(bridge.ProvisionFailure, '^PROVISION_INPUT$'):
                    self.call(forbidden, subject)
                run.assert_not_called()

    def test_resolver_errors_never_forward_payload(self):
        for error in [RuntimeError('synthetic-sensitive'), SystemExit('synthetic-sensitive')]:
            def fail(ref):
                print('synthetic-sensitive')
                raise error
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err), patch.object(bridge.subprocess, 'run') as run:
                with self.assertRaisesRegex(bridge.ProvisionFailure, '^PROVISION_RESOLVER$'):
                    self.call(fail)
                run.assert_not_called()
            self.assertEqual(out.getvalue() + err.getvalue(), '')

    def test_child_category_allowlist_and_no_partial_delivery(self):
        for diagnostic, expected in [
            ('synthetic-sensitive', 'PROVISION_SIGNER'),
            ('{"category":"synthetic-sensitive"}', 'PROVISION_SIGNER'),
            ('{"category":"PROVISION_KEY","secret":"synthetic"}', 'PROVISION_SIGNER'),
            ('{"category":"PROVISION_KEY"}', 'PROVISION_KEY'),
        ]:
            stdout = io.StringIO()
            with patch.object(bridge.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='partial-synthetic-invitation', stderr=diagnostic)), contextlib.redirect_stdout(stdout):
                with self.assertRaisesRegex(bridge.ProvisionFailure, '^' + expected + '$'):
                    self.call()
            self.assertEqual(stdout.getvalue(), '')

    def test_timeout_and_environment_failures_clear_environment(self):
        for error, category in [(subprocess.TimeoutExpired('synthetic', 30, output='sensitive'), 'PROVISION_TIMEOUT'), (FileNotFoundError('sensitive'), 'PROVISION_ENVIRONMENT')]:
            captured = {}
            def fail(args, **kwargs):
                captured['env'] = kwargs['env']
                raise error
            with patch.object(bridge.subprocess, 'run', fail):
                with self.assertRaisesRegex(bridge.ProvisionFailure, '^' + category + '$'):
                    self.call()
            self.assertEqual(captured['env'], {})

    def test_output_and_expiry_fail_closed(self):
        valid = output()
        for invalid in [None, [], {}, {**valid, 'extra': 'sensitive'}, {**valid, 'url': 'https://unreviewed.example/'}, {**valid, 'expiresAt': 'invalid'}, {**valid, 'expiresAt': '2000-01-01T00:00:00Z'}, {**valid, 'expiresAt': '2999-01-01T00:00:00Z'}, {**valid, 'expiresAt': None}]:
            stdout = io.StringIO()
            with patch.object(bridge.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps(invalid), stderr='')), contextlib.redirect_stdout(stdout):
                with self.assertRaisesRegex(bridge.ProvisionFailure, '^PROVISION_OUTPUT$'):
                    self.call()
            self.assertEqual(stdout.getvalue(), '')

    def test_unresolved_reference_does_not_launch_signer(self):
        with patch.object(bridge.subprocess, 'run') as run:
            with self.assertRaisesRegex(bridge.ProvisionFailure, '^PROVISION_RESOLVER$'):
                self.call(lambda ref: ref)
        run.assert_not_called()

    def test_shell_forwards_arguments_before_any_resolution(self):
        # Unknown flag must reach Python and fail before even loading the pinned resolver.
        result = subprocess.run(
            ['bash', 'scripts/provision-tester.sh', '--unreviewed'],
            cwd=Path(__file__).parents[1], input='', capture_output=True, text=True,
            env={'PATH': os.environ.get('PATH', ''), 'DIME_ASM_EXEC_PATH': '/nonexistent-synthetic-resolver'},
            timeout=30,
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, '')
        self.assertEqual(json.loads(result.stderr), {'category': 'PROVISION_INPUT'})

    def test_argument_failure_before_environment_access(self):
        with patch.object(bridge.sys, 'argv', ['bridge', '--unknown']), patch.object(bridge, 'verified_resolver') as resolver, contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(bridge.main(), 1)
            resolver.assert_not_called()
            self.assertEqual(json.loads(err.getvalue()), {'category': 'PROVISION_INPUT'})

    def test_main_keeps_category_and_suppresses_unknown_exception(self):
        for failure, category in [(bridge.ProvisionFailure('PROVISION_KEY'), 'PROVISION_KEY'), (RuntimeError('synthetic-sensitive'), 'PROVISION_SIGNER')]:
            with patch.object(bridge.sys, 'argv', ['bridge']), patch.object(bridge, 'verified_resolver'), patch.object(bridge, 'provision', side_effect=failure), contextlib.redirect_stderr(io.StringIO()) as err:
                self.assertEqual(bridge.main(), 1)
                self.assertEqual(json.loads(err.getvalue()), {'category': category})


if __name__ == '__main__':
    unittest.main()
