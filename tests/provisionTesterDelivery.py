"""Synthetic-only rollback controller tests; rollback is a spy, never an AWS operation."""
import datetime
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('delivery', Path(__file__).parents[1] / 'scripts/provision-tester-delivery.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)

def grant(label):
    return {'url': 'https://destroyaindustriesminingextension.com/auth/login?invitation=' + label + '.' + 'a' * 43,
            'expiresAt': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=899)).isoformat()}

class Delivery(unittest.TestCase):
    def test_both_synthetic_slots_deliver_once_after_full_validation(self):
        grants = [grant('syntheticA'), grant('syntheticB')]
        rollback, write = Mock(), Mock()
        result = delivery.deliver_batch(lambda: SimpleNamespace(returncode=0, stdout=json.dumps(grants)), rollback, write)
        self.assertEqual(result, {'category': 'DELIVERED', 'rolledBack': False})
        rollback.assert_not_called()
        write.assert_called_once_with(json.dumps(grants) + '\n')

    def test_upstream_failure_retains_only_allowlisted_category_and_rolls_back_once(self):
        for category in delivery.CATEGORIES - {'ROLLBACK_FAILED'}:
            rollback, write = Mock(), Mock()
            result = delivery.deliver_batch(lambda: SimpleNamespace(returncode=1, stdout='partial synthetic grant', stderr=json.dumps({'status': 'failed', 'category': category})), rollback, write)
            self.assertEqual(result, {'category': category, 'rolledBack': True})
            rollback.assert_called_once_with()
            write.assert_not_called()

    def test_sensitive_diagnostic_and_exception_never_return(self):
        for execute in [lambda: SimpleNamespace(returncode=1, stderr='synthetic-sensitive', stdout=''), Mock(side_effect=RuntimeError('synthetic-sensitive'))]:
            rollback, write = Mock(), Mock()
            self.assertEqual(delivery.deliver_batch(execute, rollback, write), {'category': 'PROVISION_BATCH', 'rolledBack': True})
            rollback.assert_called_once_with()
            write.assert_not_called()

    def test_bad_second_grant_duplicate_expiry_and_incomplete_batch_never_deliver_first(self):
        for grants in [[grant('syntheticA')], [grant('same'), grant('same')], [grant('syntheticA'), {}], [grant('syntheticA'), {**grant('syntheticB'), 'expiresAt': '2000-01-01T00:00:00Z'}]]:
            rollback, write = Mock(), Mock()
            result = delivery.deliver_batch(lambda: SimpleNamespace(returncode=0, stdout=json.dumps(grants)), rollback, write)
            self.assertTrue(result['rolledBack'])
            rollback.assert_called_once_with()
            write.assert_not_called()

    def test_delivery_failure_rolls_back_and_does_not_retry(self):
        execute = Mock(return_value=SimpleNamespace(returncode=0, stdout=json.dumps([grant('syntheticA'), grant('syntheticB')])))
        rollback, write = Mock(), Mock(side_effect=BrokenPipeError('synthetic-sensitive'))
        self.assertEqual(delivery.deliver_batch(execute, rollback, write), {'category': 'PROVISION_OUTPUT', 'rolledBack': True})
        execute.assert_called_once_with()
        rollback.assert_called_once_with()
        write.assert_called_once()

    def test_interruption_rolls_back_without_delivery(self):
        for error in [KeyboardInterrupt(), SystemExit(1)]:
            rollback, write = Mock(), Mock()
            result = delivery.deliver_batch(Mock(side_effect=error), rollback, write)
            self.assertEqual(result, {'category': 'PROVISION_BATCH', 'rolledBack': True})
            rollback.assert_called_once_with()
            write.assert_not_called()

    def test_failed_rollback_is_never_reported_as_success(self):
        rollback, write = Mock(side_effect=RuntimeError('synthetic-sensitive')), Mock()
        result = delivery.deliver_batch(Mock(side_effect=TimeoutError('synthetic-sensitive')), rollback, write)
        self.assertEqual(result, {'category': 'ROLLBACK_FAILED', 'rolledBack': False})
        rollback.assert_called_once_with()
        write.assert_not_called()

if __name__ == '__main__':
    unittest.main()
