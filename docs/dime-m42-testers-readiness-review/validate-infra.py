import subprocess,pathlib,json
p=pathlib.Path('/tmp/dime-m42-readiness-testers');r=pathlib.Path('/tmp/dime-m43-integration');guard='/home/dsepticon/.guard/bin/cfn-guard';lint='/home/dsepticon/.venvs/cfn-lint/bin/cfn-lint';results=[]
for label in ['sam-source','packaged','processed']:
 with (p/('lint-'+label+'.log')).open('w') as f:subprocess.run([lint,str(p/(label+'.json'))],stdout=f,stderr=subprocess.STDOUT,check=True)
 results.append({'check':'cfn-lint-'+label,'passed':True})
pairs=[('source',p/'sam-source.json','infra/web/shared-source.guard'),('processed',p/'processed.json','infra/web/shared-processed.guard'),('runtime-source',p/'sam-source.json','infra/web/runtime-secrets.guard'),('runtime-processed',p/'processed.json','infra/web/runtime-secrets.guard'),('staging-source',pathlib.Path('/tmp/dime-m42-init-review/staging-expanded.json'),'infra/staging/staging.guard'),('staging-processed',pathlib.Path('/tmp/dime-m42-init-review/staging-processed.json'),'infra/staging/processed.guard'),('routing',r/'docs/dime-m42-testers-dormant-review/routing/auxiliary-template.json','infra/web/auth-routing-review/routing.guard'),('guest',r/'infra/web/guest-review/auxiliary-template.json','infra/web/guest-review/guest.guard'),('waf',r/'docs/dime-m42-telemetry-review/sampling-disabled-template.json','infra/web/telemetry-review/sampling.guard')]
for label,data,rule in pairs:
 with (p/('guard-'+label+'.json')).open('w') as f:subprocess.run([guard,'validate','--data',str(data),'--rules',str(r/rule),'--output-format','json'],stdout=f,stderr=subprocess.STDOUT,check=True)
 results.append({'check':'guard-'+label,'passed':True,'data':str(data),'rules':rule})
(p/'infrastructure-validation.json').write_text(json.dumps(results,indent=2)+'\n');print('Three cfn-lint and nine applicable Guard suites passed. Unchanged ancillary templates tested as baselines only.')
