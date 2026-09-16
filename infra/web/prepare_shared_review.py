"""Prepare the separate web-auth/canonical-gameplay SAM candidate. Never deploys."""
import copy,json,sys
from pathlib import Path
from cfnlint.decode import decode
root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True)
project=Path(__file__).resolve().parents[2]
t,errors=decode(str(project/'infra/staging/template.yaml'));assert not errors
resources=t['Resources'];params=t['Parameters'];table={'Fn::GetAtt':['PlayerStateTable','Arn']}
for name in ['OAuthClientSecretArn','WebIdentityKeySecretArn','AuthEncryptionKeySecretArn']:
 params[name]={'Type':'String','AllowedPattern':'^arn:aws:secretsmanager:us-east-2:861738068626:secret:[A-Za-z0-9/_+=.@-]+$'}
params['OAuthClientId']={'Type':'String','AllowedValues':['4228okut24ll35bisjmygbquaf6svm']}
params['AccountLinkingMode']={'Type':'String','AllowedValues':['DISABLED','ENABLED'],'Default':'DISABLED','Description':'Enable only after binding-aware gameplay is deployed and old invocations have drained.'}
# Baseline analyzer is reviewed rather than applied blindly. Transaction authorization is per action.
b=json.loads((root/'iam-baseline.json').read_text());reported={a for p in b['Policies'] for s in p['Policy']['Statement'] for a in s['Action']}
assert {'dynamodb:ConditionCheckItem','dynamodb:DeleteItem'} <= reported
resources['EbsExecutionRole']['Properties']['Policies'][0]['PolicyDocument']['Statement'].append({'Sid':'CheckCanonicalBindingAndSave','Effect':'Allow','Action':['dynamodb:ConditionCheckItem'],'Resource':table,'Condition':{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['BINDING#v1#*','PLAYER#v1#*','ACCOUNT#v1#*']},'Null':{'dynamodb:LeadingKeys':'false'}}})
log='/aws/lambda/dime-v2-staging-${StagingResourcePrefix}-${AWS::StackName}-web-auth'
resources['WebAuthLogGroup']={'Type':'AWS::Logs::LogGroup','DeletionPolicy':'Retain','UpdateReplacePolicy':'Retain','Properties':{'LogGroupName':{'Fn::Sub':log},'RetentionInDays':{'Ref':'LogRetentionDays'}}}
resources['WebAuthExecutionRole']={'Type':'AWS::IAM::Role','Properties':{'AssumeRolePolicyDocument':copy.deepcopy(resources['EbsExecutionRole']['Properties']['AssumeRolePolicyDocument']),'Policies':[{'PolicyName':'ScopedWebAuthenticationAndCanonicalState','PolicyDocument':{'Version':'2012-10-17','Statement':[
 {'Sid':'WebAuthAndCanonicalTransactions','Effect':'Allow','Action':['dynamodb:GetItem','dynamodb:PutItem','dynamodb:ConditionCheckItem'],'Resource':table,'Condition':{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['AUTH#v1#*','BINDING#v1#*','PLAYER#v1#*','ACCOUNT#v1#*']},'Null':{'dynamodb:LeadingKeys':'false'}}},
 {'Sid':'DeleteOnlyAuthRecords','Effect':'Allow','Action':['dynamodb:DeleteItem'],'Resource':table,'Condition':{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['AUTH#v1#*']},'Null':{'dynamodb:LeadingKeys':'false'}}},
 {'Sid':'WriteOwnLogs','Effect':'Allow','Action':['logs:CreateLogStream','logs:PutLogEvents'],'Resource':{'Fn::Sub':'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:'+log+':log-stream:*'}}]}}]}}
f=copy.deepcopy(resources['EbsFunction']['Properties']);f.update({'FunctionName':{'Fn::Sub':'dime-v2-staging-${StagingResourcePrefix}-${AWS::StackName}-web-auth'},'Description':'Separate DIME OAuth/session and web API boundary. Linking requires verified rollout.','CodeUri':str(project/'dist/web-server'),'Role':{'Fn::GetAtt':['WebAuthExecutionRole','Arn']},'Timeout':20,'LoggingConfig':{**f['LoggingConfig'],'LogGroup':{'Ref':'WebAuthLogGroup'}}})
f['Environment']['Variables'].update({'DIME_WEB_ORIGIN':'https://destroyaindustriesminingextension.com','DIME_OAUTH_CLIENT_ID':{'Ref':'OAuthClientId'},'DIME_ACCOUNT_LINKING':{'Ref':'AccountLinkingMode'}})
for key,param in [('DIME_OAUTH_CLIENT_SECRET','OAuthClientSecretArn'),('DIME_WEB_ID_KEY_B64','WebIdentityKeySecretArn'),('DIME_AUTH_ENCRYPTION_KEY_B64','AuthEncryptionKeySecretArn')]:f['Environment']['Variables'][key]={'Fn::Sub':'{{resolve:secretsmanager:${'+param+'}:SecretString}}'}
routes=[('GET','/auth/login'),('GET','/auth/callback'),('GET','/auth/session'),('POST','/auth/logout'),('POST','/auth/link/intent'),('POST','/auth/link/accept'),('GET','/api/v4/state'),('POST','/api/v4/actions'),('POST','/api/v4/content/preview'),('POST','/api/v4/content/convert'),('POST','/api/v4/profile/reset')]
f['Events']={'WebRoute'+str(i):{'Type':'HttpApi','Properties':{'ApiId':{'Ref':'StagingHttpApi'},'Path':path,'Method':method}} for i,(method,path) in enumerate(routes)}
resources['WebAuthFunction']={'Type':'AWS::Serverless::Function','Properties':f}
resources['EbsFunction']['Metadata']={'SamResourceId':'EbsFunction'}
resources['EbsFunction']['Properties']['CodeUri']=str(project/'dist/server')
resources['EbsFunction']['Properties']['Environment']['Variables']['DIME_ACCOUNT_LINKING']={'Ref':'AccountLinkingMode'}
def norm(v):
 if isinstance(v,dict):return {k:(x.split('.') if k=='Fn::GetAtt' and isinstance(x,str) else norm(x)) for k,x in v.items()}
 if isinstance(v,list):return [norm(x) for x in v]
 return v
(root/'source.json').write_text(json.dumps(norm(t),indent=2)+'\n')
print('Prepared separate web-auth template, existing gameplay resource and eight routes preserved. No AWS mutation.')
