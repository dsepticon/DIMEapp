"""Metadata-only promotion with rollback; never calls GetSecretValue."""
import json,pathlib,subprocess,sys,datetime
p=pathlib.Path('/tmp/dime-m42-runtime-secrets');params=json.loads((p/'parameters.json').read_text());before=json.loads((p/'secret-metadata-before.json').read_text());names=['WebIdentityKeySecretArn','AuthEncryptionKeySecretArn']
def aws(*args):
 r=subprocess.run(['aws',*args,'--region','us-east-2','--output','json'],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('STAGE_OPERATION_UNAVAILABLE')
 return json.loads(r.stdout or '{}')
def save(n,v):(p/n).write_text(json.dumps(v,indent=2)+'\n')
def selected(stages,label):
 v=[v for v,labels in stages.items() if label in labels];assert len(v)==1,'VERSION_METADATA';return v[0]
def metadata():
 out={}
 for name in names:
  m=aws('secretsmanager','describe-secret','--secret-id',params[name]);assert m['ARN']==params[name] and not m.get('DeletedDate');out[name]=m['VersionIdsToStages']
 return out
def dormant():
 assert aws('sts','get-caller-identity','--query','Account')=='861738068626'
 s=aws('cloudformation','describe-stacks','--stack-name','dime-v2-review-20260912')['Stacks'][0];a={v['ParameterKey']:v['ParameterValue'] for v in s['Parameters']}
 assert s['StackStatus']=='UPDATE_COMPLETE' and a['WebSignInMode']==a['AccountLinkingMode']=='DISABLED' and a['ContentConversionMode']=='ENABLED'
actual={n:selected(before[n]['versions'],'AWSCURRENT') for n in names};pending={n:selected(before[n]['versions'],'AWSPENDING') for n in names}
def rollback():
 m=metadata()
 for n in names:
  current=selected(m[n],'AWSCURRENT')
  if current!=actual[n]:
   assert current==pending[n],'UNEXPECTED_CURRENT_VERSION'
   aws('secretsmanager','update-secret-version-stage','--secret-id',params[n],'--version-stage','AWSCURRENT','--move-to-version-id',actual[n],'--remove-from-version-id',pending[n])
  now=metadata()[n]
  if 'AWSPENDING' not in now[pending[n]]:aws('secretsmanager','update-secret-version-stage','--secret-id',params[n],'--version-stage','AWSPENDING','--move-to-version-id',pending[n])
  if 'AWSPREVIOUS' in now[pending[n]]:aws('secretsmanager','update-secret-version-stage','--secret-id',params[n],'--version-stage','AWSPREVIOUS','--remove-from-version-id',pending[n])
 save('stages-rollback.json',metadata());print('Previous current labels restored; pending versions retained.')
assert sys.argv[1] in ['promote','rollback']
dormant()
if sys.argv[1]=='rollback':rollback();sys.exit(0)
assert not (p/'promotion-started.json').exists(),'ALREADY_ATTEMPTED'
assert metadata()=={n:before[n]['versions'] for n in names},'VERSION_METADATA_CHANGED'
code=aws('lambda','get-function-configuration','--function-name','dime-v2-staging-review01-dime-v2-review-20260912-web-auth','--query','CodeSha256')
assert code==json.loads((p/'dormant-function.json').read_text())['CodeSha256']
subprocess.run(['python3',str(p/'readiness.py'),'AWSPENDING','pending'],check=True,stdout=subprocess.DEVNULL)
assert all(json.loads((p/'readiness-pending.json').read_text()).values())
assert metadata()=={n:before[n]['versions'] for n in names},'VERSION_METADATA_CHANGED'
save('promotion-started.json',{'timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'currentVersions':actual,'pendingVersions':pending})
try:
 for n in names:aws('secretsmanager','update-secret-version-stage','--secret-id',params[n],'--version-stage','AWSCURRENT','--move-to-version-id',pending[n],'--remove-from-version-id',actual[n])
 m=metadata()
 for n in names:assert selected(m[n],'AWSCURRENT')==pending[n] and selected(m[n],'AWSPREVIOUS')==actual[n]
 save('stages-promoted.json',m);print('Both reviewed versions promoted; previous versions retained. No values retrieved.')
except Exception:
 rollback();raise RuntimeError('PROMOTION_FAILED_ROLLED_BACK') from None
