"""Exact web-only runtime-secret migration. Local templates only; no deployment."""
import copy,json,sys
from pathlib import Path

def migrate(source):
 t=copy.deepcopy(source)
 env=t['Resources']['WebAuthFunction']['Properties']['Environment']['Variables']
 refs=[('DIME_WEB_ID_KEY_B64','DIME_WEB_ID_SECRET_ARN','WebIdentityKeySecretArn'),('DIME_AUTH_ENCRYPTION_KEY_B64','DIME_AUTH_ENCRYPTION_SECRET_ARN','AuthEncryptionKeySecretArn'),('DIME_OAUTH_CLIENT_SECRET','DIME_OAUTH_CLIENT_SECRET_ARN','OAuthClientSecretArn')]
 for old,new,param in refs:
  assert env.pop(old)=={'Fn::Sub':'{{resolve:secretsmanager:${'+param+'}:SecretString}}'}
  assert new not in env
  env[new]={'Ref':param}
 env['DIME_AUTH_KEY_REVISION']='web-runtime-secrets-20260918-1'
 statements=t['Resources']['WebAuthExecutionRole']['Properties']['Policies'][0]['PolicyDocument']['Statement']
 assert not any('secretsmanager:' in json.dumps(s) for s in statements)
 statements.extend([
  {'Sid':'ReadWebKeysAtExplicitStages','Effect':'Allow','Action':['secretsmanager:GetSecretValue'],'Resource':[{'Ref':'WebIdentityKeySecretArn'},{'Ref':'AuthEncryptionKeySecretArn'}],'Condition':{'StringEquals':{'secretsmanager:VersionStage':['AWSCURRENT','AWSPENDING']}}},
  {'Sid':'ReadCurrentWebOAuthSecret','Effect':'Allow','Action':['secretsmanager:GetSecretValue'],'Resource':[{'Ref':'OAuthClientSecretArn'}],'Condition':{'StringEquals':{'secretsmanager:VersionStage':'AWSCURRENT'}}}
 ])
 return t
if __name__=='__main__':
 old=Path(sys.argv[1]);out=Path(sys.argv[2]);out.write_text(json.dumps(migrate(json.loads(old.read_text())),indent=2)+'\n')
 print('Prepared exact three-web-secret migration; Extension configuration unchanged.')
