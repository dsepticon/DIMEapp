"""Prepare only a code-only, dormant review change set; never execute."""
import pathlib,json,subprocess,copy,hashlib,base64
p=pathlib.Path('/tmp/dime-m42-readiness-testers');root=pathlib.Path('/tmp/dime-m43-integration');region='us-east-2';stack='dime-v2-review-20260912'
def aws(*args):
 r=subprocess.run(['aws',*args,'--output','json'],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('REVIEW_API_UNAVAILABLE:'+args[0]+'/'+args[1])
 return json.loads(r.stdout or '{}')
def save(n,v):(p/n).write_text(json.dumps(v,indent=2)+'\n')
assert aws('sts','get-caller-identity','--query','Account')=='861738068626'
s=aws('cloudformation','describe-stacks','--stack-name',stack,'--region',region)['Stacks'][0];assert s['StackStatus']=='UPDATE_COMPLETE'
params={x['ParameterKey']:x['ParameterValue'] for x in s['Parameters']};assert params['WebSignInMode']==params['AccountLinkingMode']=='DISABLED' and params['ContentConversionMode']=='ENABLED'
assert aws('lambda','get-function-configuration','--function-name','dime-v2-staging-review01-dime-v2-review-20260912-web-auth','--region',region,'--query','Environment.Variables.DIME_CONVERSION_TESTER_TAGS==``') is True
old=aws('cloudformation','get-template','--stack-name',stack,'--template-stage','Processed','--region',region)['TemplateBody'];assert old==json.loads((root/'docs/dime-m42-runtime-secrets/refresh-template.json').read_text());save('before.json',old);save('parameters.json',params)
for suffix in ['web-auth','ebs']:
 save(suffix+'-metadata.json',aws('lambda','get-function-configuration','--function-name','dime-v2-staging-review01-dime-v2-review-20260912-'+suffix,'--region',region,'--query','{CodeSha256:CodeSha256,LastUpdateStatus:LastUpdateStatus}'))
assert json.loads((p/'ebs-metadata.json').read_text())['CodeSha256']=='4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY='
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert commit.startswith('a51c774')
a=json.loads((p/'artifact-audit.json').read_text());z=pathlib.Path(a['zip']);assert hashlib.sha256(z.read_bytes()).hexdigest()==a['sha256']
bucket='dime-v2-staging-artifacts-861738068626-us-east-2';key='dime-v2/review/'+commit+'/web-auth-testers-readiness.zip'
assert not (p/'upload.json').exists()
u=aws('s3api','put-object','--bucket',bucket,'--key',key,'--body',str(z),'--if-none-match','*','--checksum-algorithm','SHA256','--content-type','application/zip','--server-side-encryption','AES256','--region',region);save('upload.json',{**u,'bucket':bucket,'key':key,'sourceCommit':commit,'sha256':a['sha256']});assert u['ChecksumSHA256']==base64.b64encode(bytes.fromhex(a['sha256'])).decode()
new=copy.deepcopy(old);new['Resources']['WebAuthFunction']['Properties']['Code']={'S3Bucket':bucket,'S3Key':key,'S3ObjectVersion':u['VersionId']}
save('packaged.json',new);(p/'packaged-compact.json').write_text(json.dumps(new,separators=(',',':')))
assert len((p/'packaged-compact.json').read_bytes())<51200
save('parameters-disabled.json',[{'ParameterKey':k,'UsePreviousValue':True} for k in params])
save('template-validation.json',aws('cloudformation','validate-template','--template-body','file://'+str(p/'packaged-compact.json'),'--region',region))
for cmd,log in [(['/home/dsepticon/.venvs/cfn-lint/bin/cfn-lint',str(p/'packaged.json')],'cfn-lint-packaged.log'),(['/home/dsepticon/.guard/bin/cfn-guard','validate','--data',str(p/'packaged.json'),'--rules',str(root/'infra/web/shared-processed.guard'),str(root/'infra/web/runtime-secrets.guard'),'--output-format','json'],'guard-packaged.json')]:
 with (p/log).open('w') as f:subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,check=True)
created=aws('cloudformation','create-change-set','--stack-name',stack,'--change-set-name','m42-readiness-'+commit[:7]+'-review-1','--change-set-type','UPDATE','--template-body','file://'+str(p/'packaged-compact.json'),'--parameters','file://'+str(p/'parameters-disabled.json'),'--capabilities','CAPABILITY_IAM','--description','REVIEW ONLY. Web-auth code-only IAM readiness correction. Sign-in and linking DISABLED. No configuration, permission, route or stateful resource changes. Do not execute.','--region',region);save('created.json',created);print(created['Id'])
