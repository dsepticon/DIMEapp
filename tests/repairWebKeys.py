"""Synthetic tests only: AWS operations are intercepted; no resolver invocation."""
import contextlib, importlib.util, io, json, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('repair', Path(__file__).parents[1] / 'scripts/repair-web-keys.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Repair(unittest.TestCase):
    def test_values_only_in_stdin_never_arguments(self):
        captured = {}
        def run(args, **kwargs):
            import os
            captured.update(args=args, input=os.read(kwargs['pass_fds'][0],4096).decode(), **kwargs)
            return SimpleNamespace(returncode=0, stdout='{}', stderr='')
        with patch.object(m.subprocess, 'run', run):
            m.aws('secretsmanager', 'put-secret-value', payload={'SecretString':'synthetic-sensitive'})
        self.assertNotIn('synthetic-sensitive', str(captured['args']))
        self.assertIn('synthetic-sensitive', captured['input'])
    def test_errors_do_not_forward_aws_diagnostics(self):
        with patch.object(m.subprocess, 'run', return_value=SimpleNamespace(returncode=1,stdout='sensitive',stderr='sensitive')):
            with self.assertRaisesRegex(RuntimeError, '^AWS_OPERATION$'):
                m.aws('synthetic')
    def test_prepare_only_independent_pending_versions(self):
        before = {p:{'arn':a,'stages':{'old':['AWSCURRENT']}} for p,a in m.ARNS.items()}
        calls = []
        def aws(*args, payload=None):
            calls.append(json.loads(json.dumps(payload)))
            return {'ARN':payload['SecretId'],'VersionId':payload['ClientRequestToken']}
        with tempfile.TemporaryDirectory() as temp, patch.object(m,'EVIDENCE',Path(temp)), patch.object(m,'disabled'), patch.object(m,'metadata',return_value=before), patch.object(m,'aws',aws), contextlib.redirect_stdout(io.StringIO()) as output:
            m.prepare()
            report = json.loads(output.getvalue())
            self.assertEqual(len(report),2)
            self.assertEqual(len(calls),2)
            self.assertNotEqual(calls[0]['SecretString'],calls[1]['SecretString'])
            for call in calls:
                self.assertEqual(call['VersionStages'],['AWSPENDING'])
                self.assertNotIn(call['SecretString'],output.getvalue())
                for file in Path(temp).iterdir():self.assertNotIn(call['SecretString'],file.read_text())
    def test_pending_collision_stops_before_writes(self):
        before = {p:{'arn':a,'stages':{'old':['AWSCURRENT'],'other':['AWSPENDING']}} for p,a in m.ARNS.items()}
        with tempfile.TemporaryDirectory() as temp, patch.object(m,'EVIDENCE',Path(temp)), patch.object(m,'disabled'), patch.object(m,'metadata',return_value=before), patch.object(m,'aws') as aws:
            with self.assertRaisesRegex(RuntimeError,'EXISTING_PENDING'):m.prepare()
            aws.assert_not_called()
    def test_actual_validator_synthetic_domains_and_reuse(self):
        import base64, os, subprocess
        a = base64.b64encode(bytes([1])*32).decode()
        b = base64.b64encode(bytes([2])*32).decode()
        for encryption, status, expected in [(b,0,None),(a,1,{'valid':False,'category':'KEY_REUSE'})]:
            result = subprocess.run(['node','--import','tsx','scripts/validate-web-keys.ts'],cwd=m.ROOT,
                input=json.dumps({'identity':a,'encryption':encryption}),capture_output=True,text=True,
                env={'PATH':os.environ['PATH']},timeout=15)
            self.assertEqual(result.returncode,status)
            self.assertEqual(result.stderr,'')
            if expected:self.assertEqual(json.loads(result.stdout),expected)
            else:self.assertTrue(all(v is True for v in json.loads(result.stdout).values()))
            self.assertNotIn(a,result.stdout)
            self.assertNotIn(b,result.stdout)
    def test_rollback_restores_old_current_and_retains_candidate_pending(self):
        import copy
        old = {p:{'arn':a,'stages':{'old':['AWSCURRENT']}} for p,a in m.ARNS.items()}
        expected = {p:{'arn':a,'versionId':'new','status':'success'} for p,a in m.ARNS.items()}
        state = {p:{'arn':a,'stages':{'old':['AWSPREVIOUS'],'new':['AWSCURRENT','AWSPENDING']}} for p,a in m.ARNS.items()}
        def aws(*args, payload=None):
            arn = args[args.index('--secret-id')+1]
            purpose = next(k for k,v in m.ARNS.items() if v==arn)
            stage = args[args.index('--version-stage')+1]
            remove = args[args.index('--remove-from-version-id')+1] if '--remove-from-version-id' in args else None
            move = args[args.index('--move-to-version-id')+1] if '--move-to-version-id' in args else None
            versions=state[purpose]['stages']
            for labels in versions.values():
                if stage in labels: labels.remove(stage)
            if move: versions.setdefault(move,[]).append(stage)
            if stage=='AWSCURRENT':
                versions[remove]=['AWSPREVIOUS']
                if 'AWSPREVIOUS' in versions[move]:versions[move].remove('AWSPREVIOUS')
            return {}
        with tempfile.TemporaryDirectory() as temp, patch.object(m,'EVIDENCE',Path(temp)), patch.object(m,'disabled'), patch.object(m,'metadata',side_effect=lambda:copy.deepcopy(state)), patch.object(m,'aws',aws), contextlib.redirect_stdout(io.StringIO()):
            Path(temp,'secret-stages-before.json').write_text(json.dumps(old))
            Path(temp,'pending-versions.json').write_text(json.dumps(expected))
            m.rollback()
            m.rollback()
            for value in state.values():
                self.assertEqual(value['stages']['old'],['AWSCURRENT'])
                self.assertEqual(value['stages']['new'],['AWSPENDING'])
if __name__ == '__main__':unittest.main()
