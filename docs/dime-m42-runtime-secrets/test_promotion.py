"""Synthetic metadata only: no AWS process or secret-value operation is permitted."""
import copy,json,pathlib,subprocess,tempfile,unittest
from unittest.mock import patch
SOURCE=pathlib.Path('/tmp/dime-m42-runtime-secrets/promote.py').read_text()
NAMES=['WebIdentityKeySecretArn','AuthEncryptionKeySecretArn']
class PromotionTests(unittest.TestCase):
 def scenario(self,mode):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);params={n:'synthetic:'+n for n in NAMES};initial={n:{'old':['AWSCURRENT'],'new':['AWSPENDING']} for n in NAMES};state=copy.deepcopy(initial);updates=[];readiness=[];failed=False
   for name,value in [('parameters.json',params),('secret-metadata-before.json',{n:{'versions':s} for n,s in initial.items()}),('dormant-function.json',{'CodeSha256':'synthetic-code'})]: (p/name).write_text(json.dumps(value))
   if mode=='already-attempted':(p/'promotion-started.json').write_text('{}')
   def fake(command,**kw):
    nonlocal failed
    if command[0]=='python3':
     readiness.append(command)
     if mode=='readiness-failure':raise subprocess.CalledProcessError(1,command)
     (p/'readiness-pending.json').write_text(json.dumps({'synthetic':True}))
     if mode=='metadata-race':state[NAMES[0]]['unexpected']=['AWSPENDING'];state[NAMES[0]]['new']=[]
     return subprocess.CompletedProcess(command,0,'','')
    self.assertEqual(command[0],'aws');service,operation=command[1:3]
    self.assertNotIn(operation,['get-secret-value','scan','get-item','put-item'])
    def arg(n):return command[command.index(n)+1]
    if service=='sts':value='861738068626'
    elif service=='cloudformation':value={'Stacks':[{'StackStatus':'UPDATE_COMPLETE','Parameters':[{'ParameterKey':n,'ParameterValue':v} for n,v in {'WebSignInMode':'DISABLED','AccountLinkingMode':'DISABLED','ContentConversionMode':'ENABLED'}.items()]}]}
    elif service=='lambda':value='synthetic-code'
    elif operation=='describe-secret':
     n=next(n for n in NAMES if params[n]==arg('--secret-id'));value={'ARN':params[n],'VersionIdsToStages':copy.deepcopy(state[n])}
    elif operation=='update-secret-version-stage':
     n=next(n for n in NAMES if params[n]==arg('--secret-id'));label=arg('--version-stage');move=arg('--move-to-version-id') if '--move-to-version-id' in command else None;remove=arg('--remove-from-version-id') if '--remove-from-version-id' in command else None
     if mode=='partial-failure' and n==NAMES[1] and label=='AWSCURRENT' and move=='new' and not failed:
      failed=True;return subprocess.CompletedProcess(command,1,'','SYNTHETIC_FAILURE')
     updates.append((n,label,move,remove))
     if remove and label in state[n][remove]:state[n][remove].remove(label)
     if move:
      state[n][move].append(label)
      if label=='AWSCURRENT':
       for labels in state[n].values():
        if 'AWSPREVIOUS' in labels:labels.remove('AWSPREVIOUS')
       if remove:state[n][remove].append('AWSPREVIOUS')
     value={}
    else:raise AssertionError('Unexpected AWS operation')
    return subprocess.CompletedProcess(command,0,json.dumps(value),'')
   source=SOURCE.replace("pathlib.Path('/tmp/dime-m42-runtime-secrets')",'pathlib.Path('+repr(d)+')')
   with patch('subprocess.run',side_effect=fake),patch('sys.argv',['promote.py','promote']),patch('builtins.print'):
    if mode=='success':exec(compile(source,'synthetic-promote.py','exec'),{})
    else:
     with self.assertRaises((AssertionError,RuntimeError,subprocess.CalledProcessError)):exec(compile(source,'synthetic-promote.py','exec'),{})
   if mode=='success':
    self.assertEqual(len(updates),2)
    for n in NAMES:self.assertIn('AWSCURRENT',state[n]['new']);self.assertIn('AWSPREVIOUS',state[n]['old'])
   elif mode=='partial-failure':
    for n in NAMES:self.assertIn('AWSCURRENT',state[n]['old']);self.assertIn('AWSPENDING',state[n]['new']);self.assertNotIn('AWSCURRENT',state[n]['new'])
   else:self.assertEqual(updates,[])
   if mode=='already-attempted':self.assertEqual(readiness,[])
 def test_success(self):self.scenario('success')
 def test_failed_readiness_no_mutation(self):self.scenario('readiness-failure')
 def test_metadata_race_no_mutation(self):self.scenario('metadata-race')
 def test_partial_failure_restores_both(self):self.scenario('partial-failure')
 def test_does_not_repeat_attempt(self):self.scenario('already-attempted')
if __name__=='__main__':unittest.main()
