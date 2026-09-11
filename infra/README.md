# Infrastructure-as-code plan (not deployed)

Preserve the observed S3/CloudFront/DNS topology and existing Amplify/CDK stack ownership during recovery. Keep legacy Amplify source under docs/legacy-amplify as reference only. Do not synthesize/deploy it against the account.

For new isolated staging, prefer a small SAM/CloudFormation stack compatible with the account's existing CloudFormation usage. Author the concrete template/change set only after the resource names, region, Twitch origins and secret-reference strategy are approved. Do not bootstrap or import resources as part of local testing.

Proposed resources:
- One new DynamoDB table: dime-v2-staging-player-state (production later gets a separate approved name), pk S and sk S, on-demand billing, encryption, PITR, deletion protection, Retain policies, TTL expiresAt for receipts only.
- One Node 22 Lambda with bundled server/index.mjs, handler index.handler, x86_64, bounded timeout/memory, environment references and no plaintext secrets in template outputs.
- One HTTP API with GET /state, POST /actions and OPTIONS; exact-origin CORS and a restrictive stage throttle. Lambda validates Twitch JWTs; do not confuse them with Cognito tokens.
- A dedicated execution role scoped to reading and conditionally writing that table plus its own log group. Derive required IAM actions from the final SDK calls; do not grant scans, deletes, arbitrary tables, or administration. TransactWriteItems authorization must cover its constituent writes; validate with AWS documentation/policy tooling before deployment.
- A retained log group with defined retention and alarms for 5xx/throttles/transaction conflicts. Logs exclude JWTs, player records and secret values.
- No S3 frontend upload, CloudFront invalidation, DNS change, Cognito change, or mutation of existing stacks in the initial staging template.

The schema deliberately does not fit existing DIMEtable (twitchUser key), TwitchUsers (userId key), or Todo (id key). The application refuses legacy table names. An approved migration must define identity mapping and trustworthy balances first.

Configuration is separated by DIME_ENV, table name, API URL, allowed origins and secret references. There is no default production endpoint or table. Local development never instantiates AWS clients.

For existing manually configured resources, retain sanitized configuration snapshots and later review CloudFormation import support, physical names and Retain policies resource-by-resource. An import/change-set plan needs its own approval; do not accidentally create replacements.
