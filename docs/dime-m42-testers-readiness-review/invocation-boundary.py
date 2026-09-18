"""No credentials, no successful invocation, no secret reads or writes."""
import subprocess,json,pathlib
p=pathlib.Path('/tmp/dime-m42-readiness-testers')
r=subprocess.run(['aws','lambda','invoke','--function-name','dime-v2-staging-review01-dime-v2-review-20260912-web-auth','--region','us-east-2','--no-sign-request','--cli-binary-format','raw-in-base64-out','--payload','{"dimeOwnerSelfTest":"key-readiness-v2","stage":"AWSCURRENT"}',str(p/'unsigned-response.json')],capture_output=True,text=True)
assert r.returncode!=0 and ('MissingAuthenticationToken' in r.stderr or 'UnrecognizedClientException' in r.stderr or 'AccessDenied' in r.stderr), 'UNEXPECTED_AUTH_BOUNDARY'
result={'unsignedInvocationRejected':True,'handlerInvoked':False,'secretAccess':False,'writes':False}
(p/'invocation-boundary.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
