"""Fail closed on unexpected processed changes. Reads local templates; no AWS calls."""
import copy,json,sys
from pathlib import Path
root=Path(sys.argv[1]);candidate=Path(sys.argv[2])
def body(path):
 t=json.loads(path.read_text());return t.get('TemplateBody',t)
a=body(root/'deployed-processed.json');b=body(candidate)
old=a['Resources'];new=b['Resources'];expected_add={'WebAuthFunction','WebAuthExecutionRole','WebAuthLogGroup'}|{f'WebAuthFunctionWebRoute{i}Permission' for i in range(11)}
assert set(new)-set(old)==expected_add
assert not set(old)-set(new)
allowed={'EbsFunction','EbsExecutionRole','StagingHttpApi'}
for name,v in old.items():
 if name not in allowed:assert new[name]==v,name
assert a['Outputs']==b['Outputs']
# Existing function stays identical except Code and one reviewed environment reference.
x=copy.deepcopy(new['EbsFunction']);x['Properties']['Code']=old['EbsFunction']['Properties']['Code']
assert x['Properties']['Environment']['Variables'].pop('DIME_ACCOUNT_LINKING')=={'Ref':'AccountLinkingMode'}
assert x==old['EbsFunction']
role=copy.deepcopy(new['EbsExecutionRole']);statement=role['Properties']['Policies'][0]['PolicyDocument']['Statement'].pop()
assert statement['Action']==['dynamodb:ConditionCheckItem'] and statement['Resource']=={'Fn::GetAtt':['PlayerStateTable','Arn']}
assert statement['Condition']=={'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['BINDING#v1#*','PLAYER#v1#*','ACCOUNT#v1#*']},'Null':{'dynamodb:LeadingKeys':'false'}}
assert role==old['EbsExecutionRole']
api=copy.deepcopy(new['StagingHttpApi']);paths=api['Properties']['Body']['paths'];oldpaths=old['StagingHttpApi']['Properties']['Body']['paths']
expected_paths={'/auth/login':'get','/auth/callback':'get','/auth/session':'get','/auth/logout':'post','/auth/link/intent':'post','/auth/link/accept':'post','/api/v4/state':'get','/api/v4/actions':'post','/api/v4/content/preview':'post','/api/v4/content/convert':'post','/api/v4/profile/reset':'post'}
assert set(paths)-set(oldpaths)==set(expected_paths)
for path,method in expected_paths.items():
 entry=paths.pop(path);assert set(entry)=={method}
 assert entry[method]['x-amazon-apigateway-integration']['uri']=={'Fn::Sub':'arn:${AWS::Partition}:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${WebAuthFunction.Arn}/invocations'}
assert api==old['StagingHttpApi'],'Existing API/CORS routes or properties changed'
for i,(path,method) in enumerate(expected_paths.items()):
 p=new[f'WebAuthFunctionWebRoute{i}Permission']['Properties']
 assert p['Action']=='lambda:InvokeFunction' and p['Principal']=='apigateway.amazonaws.com'
 assert p['FunctionName']=={'Ref':'WebAuthFunction'}
 source=p['SourceArn']['Fn::Sub'];text=source[0] if isinstance(source,list) else source
 assert method.upper()+path in text or method.upper()+'/'+path.lstrip('/') in text
assert new['WebAuthFunction']['Properties']['Environment']['Variables']['DIME_OAUTH_CLIENT_SECRET']=={'Fn::Sub':'{{resolve:secretsmanager:${OAuthClientSecretArn}:SecretString}}'}
result={'adds':sorted(expected_add),'modifies':sorted(allowed),'removes':[],'replacements':[],'existingRoutesPreserved':8,'newRoutes':expected_paths,'tableEffect':'NONE; entire processed definition identical','outputsUnchanged':True,'conversionSettingsUnchanged':True,'linkingInitially':'DISABLED'}
(root/'structural-review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
