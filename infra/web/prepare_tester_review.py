"""Prepare a disabled-mode tester candidate from an exact deployed Original template. Never deploys."""
import copy, json, sys
from pathlib import Path
baseline, output, code = map(Path, sys.argv[1:4])
old = json.loads(baseline.read_text())
new = copy.deepcopy(old)
assert new['Parameters']['WebSignInMode']['Default'] == 'DISABLED'
assert new['Parameters']['AccountLinkingMode']['Default'] == 'DISABLED'
assert new['Parameters']['WebSignInMode']['AllowedValues'] == ['DISABLED', 'TESTERS', 'ENABLED']
new['Parameters']['AccountLinkingMode']['AllowedValues'] = ['DISABLED', 'TESTERS', 'ENABLED']
new['Parameters']['WebSignInMode']['Description'] = 'Independent public sign-in gate. TESTERS requires a signed one-use owner invitation and matching validated Twitch subject.'
new['Resources']['WebAuthFunction']['Properties']['CodeUri'] = str(code.resolve())
output.write_text(json.dumps(new, indent=2) + '\n')
print('Prepared tester candidate. Both defaults remain DISABLED. No AWS operations.')
