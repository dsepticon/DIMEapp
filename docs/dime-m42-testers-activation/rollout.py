import json, pathlib, subprocess, hashlib, urllib.request, sys, datetime
P=pathlib.Path('/tmp/dime-m42-testers-activation')
R=pathlib.Path('/tmp/dime-m43-integration')
B='destroyaindustriesminingextension.com'; D='EC269D02M2JLD'
def aws(*a):
 r=subprocess.run(['aws',*a,'--output','json'],capture_output=True,text=True)
 if r.returncode: raise RuntimeError(r.stderr)
 return json.loads(r.stdout or '{}')
def save(n,v): (P/n).write_text(json.dumps(v,indent=2)+'\n')
def read(n): return json.loads((P/n).read_text())
def sha(b): return hashlib.sha256(b).hexdigest()
def public(path):
 with urllib.request.urlopen('https://'+B+path,timeout=30) as r:
  assert r.status==200
  return r.read(),dict(r.headers)
mode=sys.argv[1]
AS='dime-web-auth-routing-review'; CS='m42-auth-routing-b3511e7-1'
assert aws('sts','get-caller-identity')['Account']=='861738068626'
if mode=='preflight':
 c=aws('cloudfront','get-distribution-config','--id',D); save('cloudfront-before.json',c)
 assert c==json.loads((R/'docs/dime-m42-testers-dormant-review/routing/distribution-before.json').read_text())
 h=aws('s3api','get-object','--bucket',B,'--key','privacy',str(P/'privacy-before.html'),'--region','us-west-2');save('privacy-before-metadata.json',h)
 body=(P/'privacy-before.html').read_bytes(); assert sha(body)=='6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c'
 candidate=(R/'docs/dime-m42-testers-dormant-review/privacy/candidate.html').read_bytes();assert sha(candidate)=='8d99be55d7b4d198d8918c9667d977e604214e184d598e6e99d7b6f1c5123d7e'
 pb,ph=public('/privacy');assert pb==body;save('privacy-public-before.json',{'sha256':sha(pb),'headers':ph})
 for path,name in [('/','root'),('/game/','game')]:
  b,headers=public(path);save(name+'-before.json',{'sha256':sha(b),'headers':headers})
 save('privacy-rollback.json',{'bucket':B,'key':'privacy','backup':str(P/'privacy-before.html'),'sha256':sha(body),'metadata':h,'restore':'conditional put-object against then-current ETag, preserve original metadata; invalidate /privacy only'})
 print('Exact source, distribution, privacy and public baselines verified; rollback saved.')
elif mode=='privacy':
 assert not (P/'privacy-put.json').exists()
 c=R/'docs/dime-m42-testers-dormant-review/privacy/candidate.html';assert sha(c.read_bytes())=='8d99be55d7b4d198d8918c9667d977e604214e184d598e6e99d7b6f1c5123d7e'
 h=read('privacy-before-metadata.json')
 now=aws('s3api','head-object','--bucket',B,'--key','privacy','--region','us-west-2');assert now['ETag']==h['ETag']
 args=['s3api','put-object','--bucket',B,'--key','privacy','--body',str(c),'--if-match',h['ETag'],'--content-type','text/html; charset=utf-8','--content-disposition','inline','--cache-control','public, max-age=300','--server-side-encryption',h['ServerSideEncryption'],'--region','us-west-2']
 if h.get('Metadata'): args+=['--metadata',json.dumps(h['Metadata'])]
 put=aws(*args);save('privacy-put.json',put)
 inv=aws('cloudfront','create-invalidation','--distribution-id',D,'--paths','/privacy');save('privacy-invalidation.json',inv)
 print('Reviewed privacy uploaded conditionally; /privacy-only invalidation created.')
elif mode=='privacy-verify':
 c=(R/'docs/dime-m42-testers-dormant-review/privacy/candidate.html').read_bytes()
 b,h=public('/privacy');assert b==c
 meta=aws('s3api','get-object','--bucket',B,'--key','privacy',str(P/'privacy-published.html'),'--region','us-west-2');assert (P/'privacy-published.html').read_bytes()==c
 save('privacy-verification.json',{'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':sha(b),'bytes':len(b),'headers':h,'metadata':meta});print('Privacy public HTTPS and S3 bytes match approved hash.')
elif mode=='routing-review':
 c=aws('cloudformation','describe-change-set','--stack-name',AS,'--change-set-name',CS,'--region','us-east-1');save('routing-change-set.json',c)
 assert c['Status']=='CREATE_COMPLETE' and c['ExecutionStatus']=='AVAILABLE'
 t=json.loads((R/'docs/dime-m42-testers-dormant-review/routing/auxiliary-template.json').read_text())
 assert len(c['Changes'])==12
 assert {x['ResourceChange']['LogicalResourceId'] for x in c['Changes']}==set(t['Resources'])
 assert all(x['ResourceChange']['Action']=='Add' and x['ResourceChange'].get('Replacement','False')=='False' for x in c['Changes'])
 for x in c['Changes']:
  r=x['ResourceChange'];assert r['ResourceType']==t['Resources'][r['LogicalResourceId']]['Type']
 proposed=aws('cloudformation','get-template','--stack-name',AS,'--change-set-name',CS,'--template-stage','Processed','--region','us-east-1')['TemplateBody'];assert proposed==t
 e=aws('cloudformation','describe-events','--change-set-name',c['ChangeSetId'],'--filters','FailedEvents=true','--region','us-east-1');save('routing-predeployment-events.json',e);assert not e['OperationEvents']
 w=aws('wafv2','get-web-acl','--name','CreatedByCloudFront-507f6793-f541-4211-a1ea-2105c3a73690','--id','5209e705-d0b7-4259-8052-6254d1840fb7','--scope','CLOUDFRONT','--region','us-east-1');save('waf-before.json',w)
 configs=[w['WebACL']['VisibilityConfig']]+[r['VisibilityConfig'] for r in w['WebACL']['Rules']]
 assert len(configs)==6 and all(not x['SampledRequestsEnabled'] and x['CloudWatchMetricsEnabled'] for x in configs)
 assert aws('cloudfront','get-distribution-config','--id',D)==read('cloudfront-before.json')
 print('Exact twelve additions, no other operations; processed template identical; six WAF sampling settings off.')
elif mode=='routing-execute':
 assert not (P/'routing-execution.json').exists()
 c=read('routing-change-set.json'); current=aws('cloudformation','describe-change-set','--stack-name',AS,'--change-set-name',CS,'--region','us-east-1');assert current['Changes']==c['Changes'] and current['ExecutionStatus']=='AVAILABLE'
 result=aws('cloudformation','execute-change-set','--stack-name',AS,'--change-set-name',CS,'--client-request-token','dime-auth-routing-b3511e7-once','--region','us-east-1');save('routing-execution.json',{'result':result,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()});print('Routing auxiliary change set executed once.')
elif mode=='routing-apply':
 assert not (P/'cloudfront-update.json').exists()
 s=aws('cloudformation','describe-stacks','--stack-name',AS,'--region','us-east-1');save('routing-stack.json',s);assert s['Stacks'][0]['StackStatus']=='CREATE_COMPLETE'
 resources=aws('cloudformation','list-stack-resources','--stack-name',AS,'--region','us-east-1');save('routing-resources.json',resources)
 ids={r['LogicalResourceId']:r['PhysicalResourceId'] for r in resources['StackResourceSummaries']};assert len(ids)==12
 f=aws('cloudfront','describe-function','--name','dime-auth-exact-methods-20260916','--stage','LIVE');save('routing-function.json',f)
 def resolve(v):
  if isinstance(v,dict):
   if set(v)=={'Ref'}:return ids[v['Ref']]
   if set(v)=={'Fn::GetAtt'}:
    assert v['Fn::GetAtt']==['AuthMethodGuard','FunctionARN'];return f['FunctionSummary']['FunctionMetadata']['FunctionARN']
   return {k:resolve(x) for k,x in v.items()}
  if isinstance(v,list):return [resolve(x) for x in v]
  return v
 proposed=resolve(json.loads((R/'docs/dime-m42-testers-dormant-review/routing/distribution-proposed-unresolved.json').read_text()))
 current=aws('cloudfront','get-distribution-config','--id',D);assert current==read('cloudfront-before.json'); before=current['DistributionConfig']
 assert [k for k in proposed if proposed[k]!=before[k]]==['Origins','CacheBehaviors']
 assert proposed['Origins']['Items'][:-1]==before['Origins']['Items']
 assert proposed['CacheBehaviors']['Items'][:5]==before['CacheBehaviors']['Items']
 assert len(proposed['CacheBehaviors']['Items'])==15
 assert not proposed['Logging']['Enabled']
 save('cloudfront-proposed.json',proposed)
 result=aws('cloudfront','update-distribution','--id',D,'--if-match',current['ETag'],'--distribution-config','file://'+str(P/'cloudfront-proposed.json'));save('cloudfront-update.json',result)
 print('Exact reviewed distribution update submitted using verified ETag.')
elif mode=='activation-review':
 cf=aws('cloudfront','get-distribution','--id',D);assert cf['Distribution']['Status']=='Deployed';save('cloudfront-deployed.json',cf)
 proposed=read('cloudfront-proposed.json'); actual=cf['Distribution']['DistributionConfig']
 def normalized(v):
  v=json.loads(json.dumps(v))
  for behavior in v['CacheBehaviors']['Items'][5:]:
   behavior.setdefault('GrpcConfig',{'Enabled':False})
   behavior['AllowedMethods']['Items'].sort();behavior['AllowedMethods']['CachedMethods']['Items'].sort()
  return v
 assert normalized(actual)==normalized(proposed)
 save('routing-normalization.json',{'differencesOnly':'HTTP method set ordering and explicit GrpcConfig.Enabled=false on ten new behaviors','existingBehaviorsUnchanged':True,'normalizedEqual':True})
 stack='dime-v2-review-20260912';region='us-east-2';arn='arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-testers-activation-3546a09-review-1/dc47b822-bd22-4f43-b0db-0ec3207a3c5c'
 s=aws('cloudformation','describe-stacks','--stack-name',stack,'--region',region);save('activation-stack-before.json',s);assert s['Stacks'][0]['StackStatus']=='UPDATE_COMPLETE'
 c=aws('cloudformation','describe-change-set','--stack-name',stack,'--change-set-name',arn,'--region',region);save('activation-change-set.json',c);assert c['Status']=='CREATE_COMPLETE' and c['ExecutionStatus']=='AVAILABLE'
 a={v['ParameterKey']:v['ParameterValue'] for v in s['Stacks'][0]['Parameters']};b={v['ParameterKey']:v['ParameterValue'] for v in c['Parameters']}
 assert a['WebSignInMode']==a['AccountLinkingMode']=='DISABLED' and a['ContentConversionMode']=='ENABLED'
 assert b==dict(a,WebSignInMode='TESTERS')
 assert len(c['Changes'])==2
 assert {x['ResourceChange']['LogicalResourceId'] for x in c['Changes']}=={'WebAuthFunction','StagingHttpApi'}
 assert all(x['ResourceChange']['Action']=='Modify' and x['ResourceChange']['Replacement']=='False' for x in c['Changes'])
 for stage in ['Original','Processed']:
  old=aws('cloudformation','get-template','--stack-name',stack,'--template-stage',stage,'--region',region)['TemplateBody']
  new=aws('cloudformation','get-template','--stack-name',stack,'--change-set-name',arn,'--template-stage',stage,'--region',region)['TemplateBody']
  if stage=='Processed':assert old==new
  else:
   # UsePreviousTemplate candidate is represented by CloudFormation as its already processed template.
   processed=aws('cloudformation','get-template','--stack-name',stack,'--template-stage','Processed','--region',region)['TemplateBody'];assert new==processed
  save('activation-'+stage.lower()+'.json',new)
 e=aws('cloudformation','describe-events','--change-set-name',arn,'--filters','FailedEvents=true','--region',region);save('activation-predeployment-events.json',e);assert not e['OperationEvents']
 reviewed=json.loads((R/'docs/dime-m42-testers-dormant-review/activation-review.json').read_text());assert [x['ResourceChange'] for x in c['Changes']]==reviewed['changes']
 print('Exact activation review passed: only WebSignInMode parameter differs; two reviewed non-replacing reevaluations, identical processed templates.')
elif mode=='activation-execute':
 assert not (P/'activation-execution.json').exists()
 c=read('activation-change-set.json');cur=aws('cloudformation','describe-change-set','--change-set-name',c['ChangeSetId'],'--region','us-east-2');assert cur['ExecutionStatus']=='AVAILABLE' and cur['Changes']==c['Changes'] and cur['Parameters']==c['Parameters']
 s=aws('cloudformation','describe-stacks','--stack-name','dime-v2-review-20260912','--region','us-east-2');assert s==read('activation-stack-before.json')
 result=aws('cloudformation','execute-change-set','--change-set-name',c['ChangeSetId'],'--client-request-token','dime-testers-b3511e7-once','--region','us-east-2');save('activation-execution.json',{'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':result});print('Exact parameter-only TESTERS activation executed once; linking remains DISABLED.')
elif mode=='rollback-prepare':
 stack='dime-v2-review-20260912';s=aws('cloudformation','describe-stacks','--stack-name',stack,'--region','us-east-2');save('activation-stack-after.json',s);assert s['Stacks'][0]['StackStatus']=='UPDATE_COMPLETE'
 params=[{'ParameterKey':x['ParameterKey'],**({'ParameterValue':'DISABLED'} if x['ParameterKey']=='WebSignInMode' else {'UsePreviousValue':True})} for x in s['Stacks'][0]['Parameters']];save('rollback-parameters.json',params)
 result=aws('cloudformation','create-change-set','--stack-name',stack,'--change-set-name','m42-testers-rollback-b3511e7-1','--change-set-type','UPDATE','--use-previous-template','--parameters','file://'+str(P/'rollback-parameters.json'),'--capabilities','CAPABILITY_NAMED_IAM','CAPABILITY_AUTO_EXPAND','--region','us-east-2');save('rollback-created.json',result);print('Prepared parameter-only DISABLED rollback after backend initialization probe failure.')
elif mode=='rollback-review-execute':
 assert not (P/'rollback-execution.json').exists()
 arn=read('rollback-created.json')['Id'];c=aws('cloudformation','describe-change-set','--change-set-name',arn,'--region','us-east-2');save('rollback-change-set.json',c);assert c['Status']=='CREATE_COMPLETE' and c['ExecutionStatus']=='AVAILABLE'
 assert len(c['Changes'])==2 and {x['ResourceChange']['LogicalResourceId'] for x in c['Changes']}=={'WebAuthFunction','StagingHttpApi'}
 assert all(x['ResourceChange']['Action']=='Modify' and x['ResourceChange']['Replacement']=='False' for x in c['Changes'])
 before={x['ParameterKey']:x['ParameterValue'] for x in read('activation-stack-before.json')['Stacks'][0]['Parameters']};assert {x['ParameterKey']:x['ParameterValue'] for x in c['Parameters']}==before
 t=aws('cloudformation','get-template','--stack-name','dime-v2-review-20260912','--change-set-name',arn,'--template-stage','Processed','--region','us-east-2')['TemplateBody'];assert t==read('activation-processed.json')
 e=aws('cloudformation','describe-events','--change-set-name',arn,'--filters','FailedEvents=true','--region','us-east-2');save('rollback-predeployment-events.json',e);assert not e['OperationEvents']
 result=aws('cloudformation','execute-change-set','--change-set-name',arn,'--client-request-token','dime-testers-rollback-b3511e7-once','--region','us-east-2');save('rollback-execution.json',{'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':result});print('Exact two-modification parameter-only rollback executed once.')
