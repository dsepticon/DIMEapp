exec(open('/tmp/dime-m42-testers-activation/rollout.py').read().split('mode=sys.argv[1]')[0])
stack='dime-v2-review-20260912';region='us-east-2'
s=aws('cloudformation','describe-stacks','--stack-name',stack,'--region',region);save('stack-final.json',s);assert s['Stacks'][0]['StackStatus']=='UPDATE_COMPLETE'
params={x['ParameterKey']:x['ParameterValue'] for x in s['Stacks'][0]['Parameters']};assert params['WebSignInMode']==params['AccountLinkingMode']=='DISABLED' and params['ContentConversionMode']=='ENABLED'
empty=aws('lambda','get-function-configuration','--function-name','dime-v2-staging-review01-dime-v2-review-20260912-web-auth','--region',region,'--query','length(Environment.Variables.DIME_CONVERSION_TESTER_TAGS) == `0`');assert empty is True
save('modes-final.json',{**{k:params[k] for k in ['WebSignInMode','AccountLinkingMode','ContentConversionMode']},'conversionTesterTagsEmpty':empty})
hashes=[]
for suffix,expected in [('web-auth','icZczk2bS5LjPLKB8r9ogIUNxVvtw2btZh50vv22uTE='),('ebs','4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=')]:
 d=aws('lambda','get-function-configuration','--function-name','dime-v2-staging-review01-dime-v2-review-20260912-'+suffix,'--region',region,'--query','{Hash:CodeSha256,State:State,Update:LastUpdateStatus}');assert d['Hash']==expected and d['State']=='Active' and d['Update']=='Successful';hashes.append({'function':suffix,**d})
save('lambda-hashes.json',hashes)
for name in [stack,AS if 'AS' in globals() else 'dime-web-auth-routing-review']:
 r=region if name==stack else 'us-east-1'
 e=aws('cloudformation','describe-events','--stack-name',name,'--region',r);save(name+'-events.json',e)
 failed=aws('cloudformation','describe-events','--stack-name',name,'--filters','FailedEvents=true','--region',r);save(name+'-failed-events.json',failed);assert not failed['OperationEvents']
t=aws('cloudformation','get-template','--stack-name',stack,'--template-stage','Processed','--region',region)['TemplateBody'];assert t==read('activation-processed.json');save('template-final.json',t)
cf=aws('cloudfront','get-distribution','--id',D);save('cloudfront-final.json',cf);assert cf['Distribution']['Status']=='Deployed';assert cf['Distribution']['DistributionConfig']==read('cloudfront-deployed.json')['Distribution']['DistributionConfig']
w=aws('wafv2','get-web-acl','--name','CreatedByCloudFront-507f6793-f541-4211-a1ea-2105c3a73690','--id','5209e705-d0b7-4259-8052-6254d1840fb7','--scope','CLOUDFRONT','--region','us-east-1');save('waf-final.json',w);assert w==read('waf-before.json')
routes=aws('apigatewayv2','get-routes','--api-id','t2la0784p6','--region',region);save('routes-final.json',routes)
stage=aws('apigatewayv2','get-stage','--api-id','t2la0784p6','--stage-name','staging','--region',region);save('stage-final.json',stage)
api=aws('apigatewayv2','get-api','--api-id','t2la0784p6','--region',region);save('api-final.json',api)
pages=[]
for path,name in [('/','root'),('/game/','game'),('/privacy','privacy')]:
 b,h=public(path);expected=read(name+'-before.json')['sha256'] if name!='privacy' else '8d99be55d7b4d198d8918c9667d977e604214e184d598e6e99d7b6f1c5123d7e';assert sha(b)==expected;pages.append({'path':path,'sha256':sha(b),'status':200})
save('pages-final.json',pages)
inv=aws('cloudfront','get-invalidation','--distribution-id',D,'--id',read('privacy-invalidation.json')['Invalidation']['Id']);save('privacy-invalidation-final.json',inv);assert inv['Invalidation']['Status']=='Completed'
print('Final modes, unchanged code hashes/templates/routes, WAF, distribution, root/game/privacy and invalidation verified.')
