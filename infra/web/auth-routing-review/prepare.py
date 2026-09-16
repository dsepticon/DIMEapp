"""Offline review generator. Never calls AWS or applies the generated configuration."""
import copy,json,sys,pathlib,hashlib
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
snapshot=json.loads(source.read_text());before=snapshot['DistributionConfig'];candidate=copy.deepcopy(before)
origin_id='dime-reviewed-web-auth-staging'
assert all(x['Id']!=origin_id for x in before['Origins']['Items'])
session=['__Host-dime-session'];mutation=['Origin','Content-Type','X-Dime-Csrf']
routes=[
 ('Login','/auth/login','GET',[],[],['invitation']),
 ('Callback','/auth/callback','GET',[],['__Host-dime-login',*session],['code','state','error']),
 ('Status','/auth/status','GET',['Origin'],[],[]),
 ('Session','/auth/session','GET',[],session,['view']),
 ('Logout','/auth/logout','POST',mutation,session,[]),
 ('LinkIntent','/auth/link/intent','POST',mutation,session,[]),
 ('LinkAccept','/auth/link/accept','POST',['Origin','Content-Type','Authorization'],[],[]),
 ('Unlink','/auth/unlink','POST',mutation,session,[]),
 ('DeleteIntent','/auth/delete/intent','POST',mutation,session,[]),
 ('DeleteResume','/auth/delete/resume','POST',mutation,[*session,'__Host-dime-deletion'],[]),
]
public=[];resources={}
for name,path,method,headers,cookies,queries in routes:
 # OPTIONS must preserve the exact preflight request fields for the API's existing CORS handling.
 headers=list(dict.fromkeys(headers+['Origin','Access-Control-Request-Method','Access-Control-Request-Headers']))
 public.append({'name':name,'path':path,'method':method,'headers':headers,'cookies':cookies,'queryNames':queries,'acceptedQueryNames':queries+(['scope','error_description'] if name=='Callback' else [])})
 def allow(kind,values):return {kind+'Behavior':'whitelist' if values else 'none',**({kind:values} if values else {})}
 resources[name+'OriginPolicy']={'Type':'AWS::CloudFront::OriginRequestPolicy','Properties':{'OriginRequestPolicyConfig':{'Name':'dime-auth-'+name.lower()+'-20260916','Comment':'Review only; exact auth endpoint, no all-viewer forwarding','HeadersConfig':allow('Header',headers),'CookiesConfig':allow('Cookie',cookies),'QueryStringsConfig':allow('QueryString',queries)}}}
 # CloudFormation uses plural list member names inside these configs.
 cfg=resources[name+'OriginPolicy']['Properties']['OriginRequestPolicyConfig']
 for outer,singular,plural in [('HeadersConfig','Header','Headers'),('CookiesConfig','Cookie','Cookies'),('QueryStringsConfig','QueryString','QueryStrings')]:
  if singular in cfg[outer]:cfg[outer][plural]=cfg[outer].pop(singular)
methods={r['path']:{'method':r['method'],'query':r['acceptedQueryNames']} for r in public}
function='''// Review only. No logging, credential validation, value inspection or origin mutation.
var routes = ROUTES;
function denied(code) {
  return {statusCode:code, headers:{'cache-control':{value:'no-store'},'referrer-policy':{value:'no-referrer'},'content-type':{value:'application/json'}},body:'{"message":"Request unavailable."}'};
}
function handler(event) {
  var request=event.request, rule=routes[request.uri];
  if (!rule) return denied(404);
  if (request.method!==rule.method && request.method!=='OPTIONS') return denied(405);
  var names=Object.keys(request.querystring || {});
  for (var i=0;i<names.length;i++) if (rule.query.indexOf(names[i])<0) return denied(400);
  return request;
}
'''.replace('ROUTES',json.dumps(methods,separators=(',',':')))
resources['AuthMethodGuard']={'Type':'AWS::CloudFront::Function','Properties':{'Name':'dime-auth-exact-methods-20260916','AutoPublish':True,'FunctionConfig':{'Comment':'Exact auth paths/methods/query names only; does not inspect credential values','Runtime':'cloudfront-js-2.0'},'FunctionCode':function}}
resources['AuthResponsePolicy']={'Type':'AWS::CloudFront::ResponseHeadersPolicy','Properties':{'ResponseHeadersPolicyConfig':{'Name':'dime-auth-no-store-20260916','Comment':'Only exact auth paths. Preserve origin nonce CSP and CORS.','SecurityHeadersConfig':{'ContentTypeOptions':{'Override':True},'FrameOptions':{'FrameOption':'DENY','Override':True},'ReferrerPolicy':{'ReferrerPolicy':'no-referrer','Override':True}},'CustomHeadersConfig':{'Items':[{'Header':'Cache-Control','Value':'no-store, private, max-age=0','Override':True},{'Header':'Pragma','Value':'no-cache','Override':True}]}}}}
candidate['Origins']['Items'].append({'Id':origin_id,'DomainName':'t2la0784p6.execute-api.us-east-2.amazonaws.com','OriginPath':'/staging','CustomHeaders':{'Quantity':0},'CustomOriginConfig':{'HTTPPort':80,'HTTPSPort':443,'OriginProtocolPolicy':'https-only','OriginSslProtocols':{'Quantity':1,'Items':['TLSv1.2']},'OriginReadTimeout':30,'OriginKeepaliveTimeout':5},'ConnectionAttempts':3,'ConnectionTimeout':10,'OriginShield':{'Enabled':False},'OriginAccessControlId':''});candidate['Origins']['Quantity']+=1
for r in public:
 methods=['GET','HEAD','OPTIONS'] if r['method']=='GET' else ['GET','HEAD','OPTIONS','PUT','PATCH','POST','DELETE']
 candidate['CacheBehaviors']['Items'].append({'PathPattern':r['path'],'TargetOriginId':origin_id,'ViewerProtocolPolicy':'https-only','AllowedMethods':{'Quantity':len(methods),'Items':methods,'CachedMethods':{'Quantity':2,'Items':['GET','HEAD']}},'Compress':False,'CachePolicyId':'4135ea2d-6df8-44a3-9df3-4b5a84be39ad','OriginRequestPolicyId':{'Ref':r['name']+'OriginPolicy'},'ResponseHeadersPolicyId':{'Ref':'AuthResponsePolicy'},'FunctionAssociations':{'Quantity':1,'Items':[{'EventType':'viewer-request','FunctionARN':{'Fn::GetAtt':['AuthMethodGuard','FunctionARN']}}]},'LambdaFunctionAssociations':{'Quantity':0},'TrustedSigners':{'Enabled':False,'Quantity':0},'TrustedKeyGroups':{'Enabled':False,'Quantity':0},'SmoothStreaming':False,'FieldLevelEncryptionId':''})
candidate['CacheBehaviors']['Quantity']=len(candidate['CacheBehaviors']['Items'])
assert [k for k in before if before[k]!=candidate[k]]==['Origins','CacheBehaviors']
assert candidate['CacheBehaviors']['Items'][:len(before['CacheBehaviors']['Items'])]==before['CacheBehaviors']['Items']
assert candidate['Origins']['Items'][:-1]==before['Origins']['Items']
def write(name,v): (out/name).write_text(v if isinstance(v,str) else json.dumps(v,indent=2)+'\n')
write('auxiliary-template.json',{'AWSTemplateFormatVersion':'2010-09-09','Description':'REVIEW ONLY. No deployment authorized. Requires separately reviewed WAF confidentiality protection.','Resources':resources})
write('auth-method-guard.js',function)
write('distribution-before.json',snapshot)
write('distribution-proposed-unresolved.json',candidate)
write('routing-contract.json',public)
write('routing-comparison.json',{'reviewOnly':True,'distribution':'EC269D02M2JLD','baselineETag':snapshot['ETag'],'changedConfigFields':['Origins','CacheBehaviors'],'existingOriginsUnchanged':True,'existingBehaviorsUnchanged':True,'defaultBehaviorUnchanged':True,'rootPrivacyGameAndApiUnchanged':True,'newOrigin':origin_id,'newExactPatterns':[r['path'] for r in public],'newManagedResources':{k:v['Type'] for k,v in resources.items()},'cachePolicy':'Managed-CachingDisabled (all TTLs zero)','unresolvedRefs':'Resolve only newly reviewed policy/function resource IDs after a separately approved auxiliary deployment; this JSON is not a deployable AWS request.','activationBlockers':['WAF sampling has no data protection','Privacy candidate not approved/published'],'registeredCallback':'Owner-confirmed exact public client ID and URL, 2026-09-16','distributionSha256':hashlib.sha256(json.dumps(before,sort_keys=True,separators=(',',':')).encode()).hexdigest()})
print('Prepared offline: 10 exact auth behaviors, one API origin, 12 auxiliary resources; existing configuration preserved.')
