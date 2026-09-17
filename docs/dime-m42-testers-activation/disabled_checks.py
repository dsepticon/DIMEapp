import json,urllib.request,urllib.error,pathlib
p=pathlib.Path('/tmp/dime-m42-testers-activation');base='https://destroyaindustriesminingextension.com';web='https://destroyaindustriesminingextension.com';ext='https://znaovl2j45idub9k81om1dkatwxnu2.ext-twitch.tv';results=[]
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k):return None
def check(method,path,status,origin=web,headers=None):
 h={'Origin':origin,'Content-Type':'application/json',**(headers or {})};req=urllib.request.Request(base+path,method=method,headers=h,data=b'{}' if method=='POST' else None)
 try:r=urllib.request.build_opener(NoRedirect).open(req,timeout=25)
 except urllib.error.HTTPError as e:r=e
 with r:
  raw=r.read();b=json.loads(raw) if raw else {};cookies=r.headers.get_all('Set-Cookie',[])
  row={'method':method,'path':path.split('?')[0],'status':r.status,'redirect':bool(r.headers.get('Location')),'code':b.get('code'),'expiredCookies':sum('Max-Age=0' in c for c in cookies)};results.append(row)
  assert r.status==status,(method,path.split('?')[0],r.status)
  assert not row['redirect']
  if path=='/auth/logout':assert b=={'signedOut':True} and len(cookies)==3 and all('Max-Age=0' in c and 'Secure' in c and 'HttpOnly' in c for c in cookies)
  if path=='/auth/status':assert b=={'signInAvailable':False,'linkingAvailable':False} and 'no-store' in r.headers.get('Cache-Control','')
  if method=='OPTIONS':assert r.headers.get('Access-Control-Allow-Origin')==(ext if origin==ext else None)
for path in ['/auth/login','/auth/login?invitation='+('A'*200)+'.'+('A'*43),'/auth/callback?code=synthetic-invalid&state=synthetic-invalid']:
 check('GET',path,503)
for path in ['/auth/link/intent','/auth/link/accept']:check('POST',path,503)
check('GET','/auth/status',200)
for _ in range(2):check('POST','/auth/logout',200)
check('POST','/auth/delete/resume',401);check('POST','/auth/delete/resume',403,'https://untrusted.example')
base='https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging'
for method,path in [('GET','/state'),('GET','/v4/state')]+[('POST',x) for x in ['/actions','/profile/reset','/v4/actions','/v4/content/preview','/v4/content/convert','/v4/profile/reset']]:check(method,path,401,ext)
for origin in [ext,'https://untrusted.example']:check('OPTIONS','/v4/actions',204,origin,{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'})
(p/'disabled-http-results.json').write_text(json.dumps(results,indent=2)+'\n');print(f'{len(results)} live checks passed; no real invitation, credential, session cookie or deletion proof sent; no record reads.')
