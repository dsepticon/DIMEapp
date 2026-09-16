"""Synthetic bridge tests: never initialize or call the real resolver."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'scripts/provision-tester-runtime.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class Provisioning(unittest.TestCase):
    def test_key_only_in_child_environment_and_output_is_bounded(self):
        output = {'url': 'https://destroyaindustriesminingextension.com/auth/login?invitation=synthetic', 'expiresAt': '2026-09-16T00:15:00Z'}
        captured = {}
        def child(args, **kwargs):
            captured.update(args=args, environment=dict(kwargs['env']))
            return SimpleNamespace(returncode=0, stdout=json.dumps(output), stderr='')
        stdout = io.StringIO()
        with patch.object(bridge.subprocess, 'run', child), contextlib.redirect_stdout(stdout):
            bridge.provision(lambda reference: 'synthetic-key-never-printed')
        self.assertEqual(json.loads(stdout.getvalue()), output)
        self.assertNotIn('synthetic-key-never-printed', str(captured['args']))
        self.assertEqual(set(captured['environment']), {'PATH', 'DIME_TESTER_IDENTITY_KEY_B64'})
        self.assertNotIn('synthetic-key-never-printed', stdout.getvalue())

    def test_signer_failure_never_forwards_child_diagnostics(self):
        stdout = io.StringIO()
        with patch.object(bridge.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='synthetic-sensitive', stderr='synthetic-sensitive')), contextlib.redirect_stdout(stdout):
            with self.assertRaises(RuntimeError):
                bridge.provision(lambda reference: 'synthetic-key')
        self.assertEqual(stdout.getvalue(), '')

    def test_unresolved_reference_does_not_launch_signer(self):
        with patch.object(bridge.subprocess, 'run') as run:
            with self.assertRaises(RuntimeError):
                bridge.provision(lambda reference: reference)
        run.assert_not_called()

if __name__ == '__main__':
    unittest.main()
