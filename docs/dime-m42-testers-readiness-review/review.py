import json,pathlib,subprocess,copy,datetime
p=pathlib.Path('/tmp/dime-m42-readiness-testers');region='us-east-2';stack='dime-v2-review-20260912'
def aws(*args):
 r=subprocess.run(['aws',*args,'--region',region,'--output','json'],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('REVIEW_API_UNAVAILABLE:'+args[0]+'/'+args[1])
 return json.loads(r.stdout or '{}')
def save(n,v):(p/n).write_text(json.dumps(v,indent=2)+'\n')
assert aws('sts','get-caller-identity','--query','Account')=='861738068626'
arn=json.loads((p/'created.json').read_text())['Id'];c=aws('cloudformation','describe-change-set','--change-set-name',arn);assert c['Status']=='CREATE_COMPLETE' and c['ExecutionStatus']=='AVAILABLE'
s=aws('cloudformation','describe-stacks','--stack-name',stack)['Stacks'][0];assert s['StackStatus']=='UPDATE_COMPLETE'
a={x['ParameterKey']:x['ParameterValue'] for x in s['Parameters']};b={x['ParameterKey']:x['ParameterValue'] for x in c['Parameters']};assert a==b and a['WebSignInMode']==a['AccountLinkingMode']=='DISABLED' and a['ContentConversionMode']=='ENABLED'
old=aws('cloudformation','get-template','--stack-name',stack,'--template-stage','Processed')['TemplateBody'];assert old==json.loads((p/'before.json').read_text())
new=aws('cloudformation','get-template','--stack-name',stack,'--change-set-name',arn,'--template-stage','Processed')['TemplateBody'];assert new==json.loads((p/'packaged.json').read_text());save('processed.json',new)
n=copy.deepcopy(new);n['Resources']['WebAuthFunction']['Properties']['Code']=old['Resources']['WebAuthFunction']['Properties']['Code'];assert n==old
changes=[x['ResourceChange'] for x in c['Changes']];assert {x['LogicalResourceId'] for x in changes}=={'WebAuthFunction','StagingHttpApi'};assert all(x['Action']=='Modify' and x['Replacement']=='False' for x in changes)
for x in changes:
 for detail in x.get('Details',[]):
  assert detail['Target']['Attribute']=='Properties' and detail['Target']['RequiresRecreation']=='Never'
  assert detail['Target']['Name']==('Code' if x['LogicalResourceId']=='WebAuthFunction' else 'Body')
f=aws('cloudformation','describe-events','--change-set-name',arn,'--filters','FailedEvents=true');assert not f['OperationEvents'];save('predeployment-failures.json',f)
assert aws('lambda','get-function-configuration','--function-name','dime-v2-staging-review01-dime-v2-review-20260912-web-auth','--query','Environment.Variables.DIME_CONVERSION_TESTER_TAGS==``') is True
save('exact-review.json',{'timestampUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'changeSetArn':arn,'status':c['Status'],'executionStatus':c['ExecutionStatus'],'executed':False,'changes':changes,'structuralDifferences':['Resources.WebAuthFunction.Properties.Code'],'parameterChanges':0,'iamChanges':0,'routeChanges':0,'environmentChanges':0,'secretReferenceChanges':0,'tableChanges':0,'signIn':'DISABLED','linking':'DISABLED','conversion':'ENABLED','testerTagsEmpty':True})
print('Exact code-only review passed: two non-replacing modifications, zero other changes, unexecuted.')
