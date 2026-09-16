"""Offline only: preserve unmanaged ACL for import; prepare six sampling-only edits."""
import copy,json,pathlib,sys
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
w=json.loads(source.read_text());acl=w['WebACL']
assert acl['Id']=='5209e705-d0b7-4259-8052-6254d1840fb7'
assert acl['ARN'].startswith('arn:aws:wafv2:us-east-1:861738068626:global/webacl/')
assert not acl['ManagedByFirewallManager']
assert len(acl['Rules'])==5
allowed=['Name','DefaultAction','Description','Rules','VisibilityConfig','OnSourceDDoSProtectionConfig','AssociationConfig','CaptchaConfig','ChallengeConfig','CustomResponseBodies','TokenDomains','DataProtectionConfig']
p={k:copy.deepcopy(acl[k]) for k in allowed if k in acl};p['Scope']='CLOUDFRONT'
if p.get('Description')=='':p.pop('Description') # WAF returns empty; CFN rejects explicit empty.
# Customer-owned groups require a separate review of their own visibility configuration.
assert not any('RuleGroupReferenceStatement' in json.dumps(r) for r in p['Rules'])
t={'AWSTemplateFormatVersion':'2010-09-09','Description':'Review only: adopt existing DIME website ACL without changing its protection.','Resources':{'WebsiteWebAcl':{'Type':'AWS::WAFv2::WebACL','DeletionPolicy':'Retain','UpdateReplacePolicy':'Retain','Properties':p}}}
a=copy.deepcopy(t);a['Description']=t['Description']
changes=[]
for label,v in [('VisibilityConfig',a['Resources']['WebsiteWebAcl']['Properties']['VisibilityConfig'])]+[(f'Rules/{i}/VisibilityConfig',r['VisibilityConfig']) for i,r in enumerate(a['Resources']['WebsiteWebAcl']['Properties']['Rules'])]:
 assert v['CloudWatchMetricsEnabled'] is True and v['SampledRequestsEnabled'] is True
 v['SampledRequestsEnabled']=False;changes.append({'path':label+'/SampledRequestsEnabled','before':True,'after':False})
def write(name,v): (out/name).write_text(json.dumps(v,indent=2)+'\n')
write('import-template.json',t);write('sampling-disabled-template.json',a)
write('resources-to-import.json',[{'ResourceType':'AWS::WAFv2::WebACL','LogicalResourceId':'WebsiteWebAcl','ResourceIdentifier':{'Id':acl['Id'],'Name':acl['Name'],'Scope':'CLOUDFRONT'}}])
write('configuration-diff.json',{'changes':changes,'metricsUnchanged':True,'rulesActionsPrioritiesUnchanged':True,'customerRuleGroups':0,'managedRuleGroupReferences':4,'importChangesConfiguration':False,'updateRequiresCompletedImport':True})
# Exact native-API payload is an alternative review only, never executed by this script.
u={k:copy.deepcopy(acl[k]) for k in allowed if k in acl};u.update(Id=acl['Id'],Scope='CLOUDFRONT',LockToken=w['LockToken'])
u['VisibilityConfig']['SampledRequestsEnabled']=False
for r in u['Rules']:r['VisibilityConfig']['SampledRequestsEnabled']=False
write('update-web-acl-review-only.json',u)
