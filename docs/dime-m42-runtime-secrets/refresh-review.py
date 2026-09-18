import json,pathlib,subprocess,copy,sys
p=pathlib.Path('/tmp/dime-m42-runtime-secrets');region='us-east-2';stack='dime-v2-review-20260912';action=sys.argv[1];assert action in ['create','review','execute','rollback-create','rollback-review','rollback-execute']
rollback=action.startswith('rollback-');prefix='rollback' if rollback else 'refresh'
def aws(*args):
 r=subprocess.run(['aws',*args,'--region',region,'--output','json'],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('CONFIGURATION_REVIEW_UNAVAILABLE')
 return json.loads(r.stdout or '{}')
def save(n,v):(p/n).write_text(json.dumps(v,indent=2)+'\n')
assert aws('sts','get-caller-identity','--query','Account')=='861738068626'
s=aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0];assert s['StackStatus']=='UPDATE_COMPLETE'
params={x['ParameterKey']:x['ParameterValue'] for x in s['Parameters']};assert params['WebSignInMode']==params['AccountLinkingMode']=='DISABLED' and params['ContentConversionMode']=='ENABLED'
old=json.loads((p/('refresh-template.json' if rollback else 'processed.json')).read_text())
new=copy.deepcopy(old);new['Resources']['WebAuthFunction']['Properties']['Environment']['Variables']['DIME_AUTH_KEY_REVISION']='web-runtime-secrets-20260918-1' if rollback else 'web-runtime-current-20260918-1'
assert new!=old
assert aws('cloudformation','get-template','--stack-name',stack,'--template-stage','Processed')['TemplateBody']==old
if action.endswith('create'):
 assert not (p/(prefix+'-created.json')).exists()
 save(prefix+'-template.json',new);(p/(prefix+'-compact.json')).write_text(json.dumps(new,separators=(',',':')))
 save(prefix+'-validation.json',aws('cloudformation','validate-template','--template-body','file://'+str(p/(prefix+'-compact.json'))))
 created=aws('cloudformation','create-change-set','--stack-name',stack,'--change-set-name','m42-runtime-83bbdff-'+prefix+'-1','--change-set-type','UPDATE','--template-body','file://'+str(p/(prefix+'-compact.json')),'--parameters','file://'+str(p/'parameters-disabled.json'),'--capabilities','CAPABILITY_IAM','--description','Only web-auth configuration revision refresh; artifact and all secret references unchanged; authentication disabled.')
 save(prefix+'-created.json',created);print(created['Id']);sys.exit(0)
arn=json.loads((p/(prefix+'-created.json')).read_text())['Id'];c=aws('cloudformation','describe-change-set','--change-set-name',arn);assert c['Status']=='CREATE_COMPLETE' and c['ExecutionStatus']=='AVAILABLE'
changes=[x['ResourceChange'] for x in c['Changes']];assert {x['LogicalResourceId'] for x in changes}<={'WebAuthFunction','StagingHttpApi'} and any(x['LogicalResourceId']=='WebAuthFunction' for x in changes);assert all(x['Action']=='Modify' and x['Replacement']=='False' for x in changes)
assert aws('cloudformation','get-template','--stack-name',stack,'--change-set-name',arn,'--template-stage','Processed')['TemplateBody']==new
assert {x['ParameterKey']:x['ParameterValue'] for x in c['Parameters']}==params
failures=aws('cloudformation','describe-events','--change-set-name',arn,'--filters','FailedEvents=true');assert not failures['OperationEvents']
save(prefix+'-exact-review.json',{'changeSetArn':arn,'onlyStructuralDifference':'WebAuthFunction.Environment.DIME_AUTH_KEY_REVISION','changes':changes,'artifactChanges':0,'referenceChanges':0,'parameterChanges':0})
if action.endswith('execute'):
 assert not (p/(prefix+'-execution.json')).exists()
 save(prefix+'-execution.json',{'requestedOnce':True,'changeSetArn':arn})
 aws('cloudformation','execute-change-set','--change-set-name',arn,'--client-request-token','dime-runtime-83bbdff-'+prefix+'-1');print('Configuration refresh requested once; await UPDATE_COMPLETE.')
else:print('Exact web-only revision refresh reviewed; no execution.')
