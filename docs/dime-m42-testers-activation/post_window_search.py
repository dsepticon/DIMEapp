import json,pathlib,subprocess,time,datetime,concurrent.futures
p=pathlib.Path('/tmp/dime-m42-testers-activation');probe=json.loads((p/'sentinel-probes.json').read_text());values=json.loads((p/'sentinel-values.json').read_text());w=json.loads((p/'waf-before.json').read_text())['WebACL'];resources=json.loads((p/'resources.json').read_text())
def aws(args):
 r=subprocess.run(['aws',*args,'--output','json'],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('Telemetry API unavailable: '+args[0]+'/'+args[1])
 return json.loads(r.stdout)
assert probe['startEpoch'] >= json.loads((p/'timing.json').read_text())['activationNotBeforeEpoch']
assert w['VisibilityConfig']['SampledRequestsEnabled'] is False and all(r['VisibilityConfig']['SampledRequestsEnabled'] is False for r in w['Rules'])
start=int(probe['startEpoch'])-2;end=int(time.time())+1
# Insights returns only aggregate count; never retrieve matching messages.
queries=[]
for r in resources:
 if r['Type']!='AWS::Logs::LogGroup':continue
 for key,value in values.items():
  query='filter strcontains(@message, "'+value+'") | stats count(*) as matches'
  q=aws(['logs','start-query','--region','us-east-2','--log-group-name',r['Id'],'--start-time',str(start),'--end-time',str(end),'--query-string',query])
  queries.append({'group':r['Logical'],'sentinelClass':key,'queryId':q['queryId']})
results=[]
for q in queries:
 for _ in range(30):
  d=aws(['logs','get-query-results','--region','us-east-2','--query-id',q['queryId']])
  if d['status'] not in ['Scheduled','Running']:break
  time.sleep(1)
 assert d['status']=='Complete'
 count=sum(int(f['value']) for row in d['results'] for f in row if f['field']=='matches')
 results.append({**q,'status':d['status'],'matches':count,'recordsScanned':d.get('statistics',{}).get('recordsScanned')})
# CLI query projects count-only results before tool/file output. No raw samples retained.
metrics=[w['VisibilityConfig']['MetricName']]+[r['VisibilityConfig']['MetricName'] for r in w['Rules']]
window=json.dumps({'StartTime':datetime.datetime.fromtimestamp(start,datetime.timezone.utc).isoformat(),'EndTime':datetime.datetime.fromtimestamp(end,datetime.timezone.utc).isoformat()})
samples=[]
for metric in metrics:
 counts=', '.join(key+': length(SampledRequests[?contains(to_string(@), `'+value+'`)])' for key,value in values.items())
 query='{population: PopulationSize, returned: length(SampledRequests), matches: {'+counts+'}}'
 d=aws(['wafv2','get-sampled-requests','--web-acl-arn',w['ARN'],'--rule-metric-name',metric,'--scope','CLOUDFRONT','--time-window',window,'--max-items','500','--region','us-east-1','--query',query])
 samples.append({'metric':metric,**d})
(p/'sentinel-search.json').write_text(json.dumps({'startEpoch':start,'endEpoch':end,'cloudWatch':results,'wafSamples':samples,'samplingStillEnabled':False,'postDeploymentProof':True,'rawMessagesOrSamplesStored':False},indent=2)+'\n')
print(json.dumps({'cloudWatchQueries':len(results),'cloudWatchMatches':sum(r['matches'] for r in results),'wafSampleMatches':sum(sum(r['matches'].values()) for r in samples),'postDeploymentProof':True}))
