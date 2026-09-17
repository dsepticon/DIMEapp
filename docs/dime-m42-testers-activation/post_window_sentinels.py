import subprocess
import json,pathlib,subprocess,time,urllib.request,urllib.error,datetime,uuid
p=pathlib.Path('/tmp/dime-m42-testers-activation');web='https://destroyaindustriesminingextension.com';api='https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging'
# Intentionally invalid credential shape (longer than 43), not a minted invitation or account ID.
marker='DIME_SYNTHETIC_TELEMETRY_'+uuid.uuid4().hex
values={k:marker+'_'+k for k in ['invitation','code','state','nonce','csrf','session','access','refresh','authorization','response_cookie']}
(p/'sentinel-values.json').write_text(json.dumps(values,indent=2)+'\n')
assert time.time() >= json.loads((p/'timing.json').read_text())['activationNotBeforeEpoch'], 'Sampling window has not expired'

mode_output=subprocess.run(['aws','cloudformation','describe-stacks','--stack-name','dime-v2-review-20260912','--region','us-east-2','--query','Stacks[0].{Status:StackStatus,Modes:Parameters[?ParameterKey==`WebSignInMode` || ParameterKey==`AccountLinkingMode` || ParameterKey==`ContentConversionMode`]}','--output','json'],capture_output=True,text=True,check=True)
modes=json.loads(mode_output.stdout)
assert modes['Status']=='UPDATE_COMPLETE'
assert {x['ParameterKey']:x['ParameterValue'] for x in modes['Modes']}=={'WebSignInMode':'DISABLED','AccountLinkingMode':'DISABLED','ContentConversionMode':'ENABLED'}
(p/'post-window-modes.json').write_text(json.dumps(modes,indent=2)+'\n')
with urllib.request.urlopen(api+'/auth/status',timeout=25) as response:
 assert json.load(response)=={'signInAvailable':False,'linkingAvailable':False}

start=time.time();rows=[]
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**kw):return None
opener=urllib.request.build_opener(NoRedirect)
cases=[('invitation-start','GET','/auth/login?invitation='+values['invitation'],503),('callback','GET','/auth/callback?code='+values['code']+'&state='+values['state'],503),('invalid-state','GET','/auth/callback?state='+values['state']+'&code='+values['code'],503),('replayed-invalid-invitation','GET','/auth/login?invitation='+values['invitation'],503),('logout','POST','/auth/logout',200),('linking-rejection','POST','/auth/link/intent',503),('deletion-continuation','POST','/auth/delete/resume',401)]
for endpoint,base in [('edge',web),('api',api)]:
 for label,method,path,expected in cases:
  headers={'User-Agent':'DIME-Synthetic-Telemetry-Review','Origin':web,'Content-Type':'application/json','Authorization':values['authorization'],'Cookie':'__Host-dime-session='+values['session']+'; __Host-dime-login='+values['nonce'],'X-Dime-CSRF':values['csrf'],'X-Dime-Synthetic-Response-Cookie':values['response_cookie']}
  body=json.dumps({'access_token':values['access'],'refresh_token':values['refresh'],'nonce':values['nonce']}).encode() if method=='POST' else None
  try:r=opener.open(urllib.request.Request(base+path,method=method,headers=headers,data=body),timeout=25)
  except urllib.error.HTTPError as e:r=e
  with r:
   raw=r.read();status=r.status;redirect=bool(r.headers.get('Location'));echo=any(v.encode() in raw for v in values.values());expired=sum('Max-Age=0' in x for x in r.headers.get_all('Set-Cookie',[]))
  rows.append({'endpoint':endpoint,'case':label,'path':path.split('?')[0],'status':status,'redirect':redirect,'sentinelEcho':echo,'expiredCookies':expired})
  assert not redirect and not echo
  assert status==expected,(label,status)
end=time.time()
(p/'sentinel-probes.json').write_text(json.dumps({'startEpoch':start,'endEpoch':end,'startUTC':datetime.datetime.fromtimestamp(start,datetime.timezone.utc).isoformat(),'endUTC':datetime.datetime.fromtimestamp(end,datetime.timezone.utc).isoformat(),'valuesAreSynthetic':True,'mintedInvitation':False,'rows':rows},indent=2)+'\n')
print(json.dumps({'requests':len(rows),'allExpectedApiResults':True,'sensitiveResponseEchoes':0,'realCredentialsUsed':False}))
