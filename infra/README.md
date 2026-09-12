# Infrastructure-as-code plan (not deployed)

The isolated [SAM staging definition](staging/template.yaml) and its [deployment review guide](staging/README.md) are now authored. They have not been packaged, deployed, or connected to any existing DIME resource. The remaining notes below are the architecture rationale.

Preserve the observed S3/CloudFront/DNS topology and existing Amplify/CDK stack ownership during recovery. Keep legacy Amplify source under docs/legacy-amplify as reference only. Do not synthesize/deploy it against the account.

For new isolated staging, prefer a small SAM/CloudFormation stack compatible with the account's existing CloudFormation usage. The source template is reviewable now; actual parameter values, packaging, a change set and execution require separate approval. Do not bootstrap or import resources as part of local testing.

Proposed resources:
- One new DynamoDB table: dime-v2-staging-player-state (production later gets a separate approved name), pk S and sk S with `PLAYER#v1#<server-HMAC>` partition keys and `STATE`, `REQUEST#<UUID>`, reserved permanent `MIGRATION#v1#<source digest>` and global `LEGACY#v1#<source digest>` migration receipts, on-demand billing, encryption, PITR, deletion protection, Retain policies, TTL expiresAt for receipts only.
- One Node 22 Lambda with bundled server/index.mjs, handler index.handler, x86_64, bounded timeout/memory, environment references and no plaintext secrets in template outputs.
- One HTTP API with GET /state, POST /actions and OPTIONS; exact-origin CORS and a restrictive stage throttle. Lambda validates Twitch JWTs; do not confuse them with Cognito tokens.
- A dedicated execution role scoped to reading and conditionally writing that table plus its own log group. Derive required IAM actions from the final SDK calls; do not grant scans, deletes, arbitrary tables, or administration. TransactWriteItems authorization must cover its constituent writes; validate with AWS documentation/policy tooling before deployment.
- A retained log group with defined retention and alarms for 5xx/throttles/transaction conflicts. Logs exclude JWTs, player records and secret values.
- No S3 frontend upload, CloudFront invalidation, DNS change, Cognito change, or mutation of existing stacks in the initial staging template.

The schema deliberately does not fit existing DIMEtable (twitchUser key), TwitchUsers (userId key), or Todo (id key). The application refuses legacy table names. An approved migration must define identity mapping and trustworthy balances first.

Configuration is separated by DIME_ENV, table name, API URL, allowed origins and secret references. There is no default production endpoint or table. Local development never instantiates AWS clients.

For existing manually configured resources, retain sanitized configuration snapshots and later review CloudFormation import support, physical names and Retain policies resource-by-resource. An import/change-set plan needs its own approval; do not accidentally create replacements.

A separate stable backend-only `DIME_PLAYER_ID_KEY_B64` is required for deterministic global player keys. Rotate it only with an explicit identity-key migration; ordinary Twitch signing-secret rotation must not rename saves. Migration writes remain disabled and are excluded from the proposed initial deployment.
