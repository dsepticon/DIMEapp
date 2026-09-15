"""Offline review artifact only. No AWS operations and no credentials."""
import json,copy,sys
from pathlib import Path
from cfnlint.decode import decode
if len(sys.argv) != 2: raise SystemExit('usage: prepare_review.py EVIDENCE_DIRECTORY')
root=Path(sys.argv[1]).resolve()
project=Path(__file__).resolve().parents[2]
template,errors=decode(str(project/'infra/staging/template.yaml'));assert not errors
params=template['Parameters']; resources=template['Resources']; function=resources['EbsFunction']['Properties']
# References are parameters with no invented secret resources or values.
for name in ['OAuthClientSecretArn','WebIdentityKeySecretArn','AuthEncryptionKeySecretArn']:
 params[name]={'Type':'String','AllowedPattern':'^arn:aws:secretsmanager:us-east-2:861738068626:secret:[A-Za-z0-9/_+=.@-]+$','Description':'Existing separately provisioned runtime secret reference; never a plaintext secret.'}
params['OAuthClientId']={'Type':'String','MinLength':1,'MaxLength':128,'AllowedPattern':'^[a-z0-9]+$','Description':'Separate registered DIME OAuth application client ID; not the Extension client.'}
params['AccountLinkingMode']={'Type':'String','AllowedValues':['DISABLED','ENABLED'],'Default':'DISABLED','Description':'Enable only after every writer uses binding-aware transactions and live verification passes.'}
function['CodeUri']=str(project/'dist/web-server')
env=function['Environment']['Variables'];env.update({'DIME_WEB_ORIGIN':'https://destroyaindustriesminingextension.com','DIME_OAUTH_CLIENT_ID':{'Ref':'OAuthClientId'},'DIME_ACCOUNT_LINKING':{'Ref':'AccountLinkingMode'}})
for key,ref in [('DIME_OAUTH_CLIENT_SECRET','OAuthClientSecretArn'),('DIME_WEB_ID_KEY_B64','WebIdentityKeySecretArn'),('DIME_AUTH_ENCRYPTION_KEY_B64','AuthEncryptionKeySecretArn')]:env[key]={'Fn::Sub':'{{resolve:secretsmanager:${'+ref+'}:SecretString}}'}
params['ContentConversionMode']['AllowedValues']=['ENABLED'];params['ContentConversionMode']['Default']='ENABLED'
params['ContentConversionTesterTags']['AllowedValues']=['']
# Add explicit routes; SAM generates route-scoped invoke permissions. Existing routes are untouched.
routes=[('GET','/auth/login'),('GET','/auth/callback'),('GET','/auth/session'),('POST','/auth/logout'),('POST','/auth/link/intent'),('POST','/auth/link/accept'),('GET','/api/v4/state'),('POST','/api/v4/actions'),('POST','/api/v4/content/preview'),('POST','/api/v4/content/convert'),('POST','/api/v4/profile/reset')]
for i,(method,path) in enumerate(routes):function['Events']['WebRoute'+str(i)]={'Type':'HttpApi','Properties':{'ApiId':{'Ref':'StagingHttpApi'},'Path':path,'Method':method}}
# Review and narrow the generated baseline; retain only the actual transaction operation kinds.
baseline=json.loads((root/'oauth-iam-analysis.json').read_text())
reported={action for record in baseline['Policies'] for statement in record['Policy']['Statement'] for action in statement['Action']}
assert {'dynamodb:ConditionCheckItem','dynamodb:DeleteItem'} <= reported
statements=resources['EbsExecutionRole']['Properties']['Policies'][0]['PolicyDocument']['Statement']
statements.extend([
 {'Sid':'CheckReviewedStagingTransactions','Effect':'Allow','Action':['dynamodb:ConditionCheckItem'],'Resource':{'Fn::GetAtt':['PlayerStateTable','Arn']}},
 {'Sid':'DeleteOnlyAuthenticationRecords','Effect':'Allow','Action':['dynamodb:DeleteItem'],'Resource':{'Fn::GetAtt':['PlayerStateTable','Arn']},'Condition':{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['AUTH#v1#*']},'Null':{'dynamodb:LeadingKeys':'false'}}}
])
(root/'oauth-iam-review.json').write_text(json.dumps({'generator':'iam-policy-autopilot 0.3.0','retainedExistingActions':['dynamodb:GetItem','dynamodb:PutItem'],'addedActions':['dynamodb:ConditionCheckItem','dynamodb:DeleteItem'],'deleteScope':'AUTH#v1#* only, explicit non-null LeadingKeys','resource':'exact existing staging table','rejectedBaselineActions':['dynamodb:ReadDataForReplication','dynamodb:UpdateItem','kms:Decrypt'],'rejectedBaselineResources':['table/*','key/*'],'reason':'No replication, Update transaction operation or direct KMS call exists; app encryption uses Node AES-GCM. Existing table encryption configuration is unchanged.','deployed':False},indent=2))
template['Metadata']={'DimeReviewStatus':'CREDENTIALS_AND_LIVE_VERIFICATION_REQUIRED','MissingGates':['Separate OAuth registration and secret references','Real OAuth and synthetic DynamoDB end-to-end verification','CloudFront same-origin forwarding and privacy publication'],'IAMAnalysis':'Reviewed and narrowed from oauth-iam-analysis.json; see oauth-iam-review.json. Do not apply the broad generator baseline.'}
(root/'oauth-source-review.json').write_text(json.dumps(template,indent=2))
(root/'oauth-route-plan.json').write_text(json.dumps({'routes':[{'method':m,'path':p} for m,p in routes],'preserveExistingRoutes':True,'conversion':'ENABLED','testerTagsEmpty':True,'deployable':False},indent=2))
print('Prepared credential-gated OAuth route/runtime/IAM review template; no CloudFormation change set created.')
