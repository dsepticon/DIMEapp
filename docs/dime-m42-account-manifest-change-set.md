# Account-manifest replacement change set — UNEXECUTED

## Result

The bounded manifest, guarded unlink/relink and resumable verified deletion protocol are prepared on `codex/dime-m4-graphics-web`, starting from `4a1132c518e98fbe6e729067c8bc55ea4af11091`.

Runtime source/artifact checkpoint: `6bec1b223a1fc12e77765268cca7996cbc3972fb`. The follow-up evidence commit adds this report and two extra regression tests only; packaged runtime modules are unchanged.

[Complete manifest, state machine, privacy/retention and rollback review](dime-m42-account-manifest-review.md).

**No change set was executed. No website or privacy object was published.**

## Exact replacement candidate

- Account `861738068626`, region `us-east-2`, stack `dime-v2-review-20260912`.
- Change set: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-manifest-6bec1b2-review-1/8cd7d4c1-e1d8-46ff-b673-060de0991e5f`.
- UPDATE, `CREATE_COMPLETE / AVAILABLE`.
- ConfigurationRevision: `m42-manifest-6bec1b2-review-1`.
- ContentConversionMode: existing ENABLED retained.
- ContentConversionTesterTags: existing empty value retained using UsePreviousValue; never displayed.
- AccountLinkingMode: DISABLED. New link/unlink/deletion initiation is disabled. Capability-verified resumption of an existing deletion stays available to avoid stranding jobs during a rollback.
- Superseded change set `m42-shared-save-5c1fad1-review-1` was confirmed unexecuted and deleted after the replacement passed processed-template review. Deleting that proposal changed no deployed resource.

## Every proposed resource operation

**17 Add, 3 Modify, 0 Remove, 0 Import, 0 replacements.** All modifications report Replacement=False.

| Operation | Logical resource                      | Type                      | Replacement |
| --------- | ------------------------------------- | ------------------------- | ----------- |
| Modify    | `EbsExecutionRole`                    | `AWS::IAM::Role`          | False       |
| Modify    | `EbsFunction`                         | `AWS::Lambda::Function`   | False       |
| Modify    | `StagingHttpApi`                      | `AWS::ApiGatewayV2::Api`  | False       |
| Add       | `WebAuthExecutionRole`                | `AWS::IAM::Role`          | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute0Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute10Permission` | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute11Permission` | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute12Permission` | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute13Permission` | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute1Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute2Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute3Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute4Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute5Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute6Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute7Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute8Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute9Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunction`                     | `AWS::Lambda::Function`   | N/A (new)   |
| Add       | `WebAuthLogGroup`                     | `AWS::Logs::LogGroup`     | N/A (new)   |

Compared with the previous unexecuted proposal, this adds three lifecycle route permissions (WebRoute11–13), their method paths, CONTROL-prefix transaction checks and web-auth's manifest-owned delete permission. The separate web-auth function/log/role and first eleven web routes were already part of the preceding proposal, but remain additions relative to the deployed stack.

### Exact existing-resource comparison

- EbsFunction: new canonical/deletion-barrier-aware code; new non-secret DIME_ACCOUNT_LINKING reference and new ConfigurationRevision value. Existing function resource, role reference, runtime, timeout, memory and other environment definitions preserved.
- EbsExecutionRole: one ConditionCheckItem statement on the exact PlayerStateTable ARN with BINDING/PLAYER/ACCOUNT/CONTROL `#v1#*` LeadingKeys and a non-null guard. Existing GetItem/PutItem and own-log statements and trust are unchanged.
- StagingHttpApi: fourteen new web-auth/web API paths; **all eight existing gameplay method paths and integrations are structurally identical**. Existing CORS, stage, throttling and access logging are unchanged.
- Every other existing resource is structurally identical. Existing outputs are identical.
- **DynamoDB: no new table, index, key schema, TTL configuration, encryption, billing or PITR change.** Exact table: `dime-v2-staging-review01-dime-v2-review-20260912-player-state`.
- No website bucket, CloudFront, DNS, TLS, OAuth provider-console setting or unrelated stack is modified by this proposal.

### New web-auth methods

GET `/auth/login`, `/auth/callback`, `/auth/session`, `/api/v4/state`.

POST `/auth/logout`, `/auth/link/intent`, `/auth/link/accept`, `/api/v4/actions`, `/api/v4/content/preview`, `/api/v4/content/convert`, `/api/v4/profile/reset`, `/auth/unlink`, `/auth/delete/intent`, `/auth/delete/resume`.

Each generated invoke permission allows only lambda:InvokeFunction by apigateway.amazonaws.com, for this API ID and exact method/path, using SAM's stage wildcard. Existing invoke permissions are not changed.

## Complete IAM delta

Both execution roles trust lambda.amazonaws.com through sts:AssumeRole.

Gameplay retains its existing table-wide GetItem/PutItem statement. The new ConditionCheckItem statement is restricted to BINDING/PLAYER/ACCOUNT/CONTROL prefixes on the exact table. **No gameplay DeleteItem, Query, Scan or OAuth credential is added.** The inherited GetItem/PutItem policy is not claimed to have become prefix-restricted; new AUTH payloads remain encrypted and the gameplay adapter has no decryption key.

The new web-auth role has exactly three statements:

1. GetItem, PutItem and ConditionCheckItem on the exact table, with AUTH/BINDING/PLAYER/ACCOUNT/CONTROL `#v1#*` LeadingKeys.
2. DeleteItem on the same table/prefixes. This expands the preceding proposal's AUTH-only delete grant to support persistent account deletion. It is a partition-level permission, not an IAM guarantee of per-account ownership or STATE-only sort keys; manifest validation and conditional transactions enforce those restrictions in code.
3. CreateLogStream and PutLogEvents on only its own web-auth log streams.

Both table statements use ForAllValues:StringLike plus Null LeadingKeys=false. No Scan, Query, UpdateItem, table administration, runtime Secrets Manager read or KMS action is added. No policy is applied during preparation.

### Synthetic IAM results

The AWS IAM custom-policy simulator passed **16 cases / 46 action decisions**:

- Web Get/Put/ConditionCheck/Delete allowed for all five reviewed prefixes.
- Gameplay ConditionCheck allowed for BINDING/PLAYER/ACCOUNT/CONTROL.
- Missing context, unrelated prefixes, mixed allowed/unrelated prefixes and another table denied.
- Gameplay deletion and gameplay ConditionCheck on encrypted AUTH denied.
- Web Scan, Query, DeleteTable, UpdateTable and UpdateItem denied.

Source-based IAM analysis was rerun with telemetry disabled. Broad analyzer suggestions were narrowed to the reviewed actions, table and prefixes. This is a policy simulation, **not** a deployed role/transaction test; no DynamoDB record was read or written.

## Runtime references and artifacts

The public OAuth client remains `4228okut24ll35bisjmygbquaf6svm`. The separate web-auth Lambda retains the exact three owner-supplied runtime secret ARN parameters ending `client-secret-s5kwbq`, `identity-key-kL7iYK`, and `auth-encryption-key-hAAuXq`. It also retains the separate Extension verification references. Gameplay receives none of the OAuth client secret, web identity key or auth encryption key. No secret value was retrieved or displayed.

Bucket: `dime-v2-staging-artifacts-861738068626-us-east-2`.
Key prefix: `dime-v2/review/6bec1b223a1fc12e77765268cca7996cbc3972fb/`.
Local directory: `/tmp/dime-m42-manifest-review/`.

| Artifact | ZIP                             |  Bytes | SHA-256                                                            | S3 version                         |
| -------- | ------------------------------- | -----: | ------------------------------------------------------------------ | ---------------------------------- |
| gameplay | `gameplay-manifest-6bec1b2.zip` | 490459 | `e246dd9056187c1daf4d26a70dc68ab5cc0e6ef621371a8ba9b6ca0f53a42af6` | `lxI5GaSEt4Tj16..CRrK9si7.egWtlkY` |
| web-auth | `web-auth-manifest-6bec1b2.zip` | 488847 | `d6662209008bffcd1c35fb3961bfd4c3060a70fb409e21fd91db5a20b95d185a` | `3E_GMojUQfIeiBf.T27qjWgDPVbhNRKw` |

Both ZIPs contain only root index.mjs, with no source maps, tests, fixtures or migration modules. Clean Linux-native SAM output is byte-identical to the corresponding dist module. Create-only uploads used If-None-Match: \*, AES256 and verified returned checksums; the processed template pins both object versions. Review-bucket lifecycle expiration remains in force; preserve a compatible rollback artifact under a reviewed retention plan before activation.

## Validation

- Complete Vitest: **387 passed / 56 files**.
- Complete Chromium: B| Modify | `EbsExecutionRole` | `AWS::IAM::Role` | False |
  | Modify | `EbsFunction` | `AWS::Lambda::Function` | False |
  | Modify | `StagingHttpApi` | `AWS::ApiGatewayV2::Api` | False |
  | Add | `WebAuthExecutionRole` | `AWS::IAM::Role` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute0Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute10Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute11Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute12Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute13Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute1Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute2Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute3Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute4Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute5Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute6Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute7Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute8Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunctionWebRoute9Permission` | `AWS::Lambda::Permission` | N/A (new) |
  | Add | `WebAuthFunction` | `AWS::Lambda::Function` | N/A (new) |
  | Add | `WebAuthLogGroup` | `AWS::Logs::LogGroup` | N/A (new) |ER_RESULT.
- Fresh Chromium deletion protocol against frozen source: **3 passed**, Panel/Mobile/desktop. This repeats three full-suite cases; it does not add three distinct tests. Covers HttpOnly continuation after page refresh, CSRF denial, session blocking, durable phases, original-capability replay and empty frontend storage.
- Lint, strict typecheck, formatting and git diff --check passed.
- Default, Twitch, web and both Lambda builds passed.
- Clean Linux-native SAM build and SAM validation passed.
- Source, packaged and actual CloudFormation-processed cfn-lint passed.
- All rules in the applicable shared source and processed Guard files passed. Historical combined-handler Guard variants describe a different, superseded candidate and are not substituted for these rules.
- Deployed-versus-proposed structural comparison passed, including exact new IAM/log definitions and exact API method/path invoke scopes.
- CloudFormation template validation and describe-events predeployment review passed; no validation failure. describe-stack-events was not used.

Synthetic coverage includes web-only creation, Extension preservation, callback/link retries, two-save conflict, unlink/relink and deletion after unlink, reset then deletion, interruptions at every durable phase and inside purge/final/revocation-checkpoint transactions, provider failure/retry, expired credentials/receipts, pre-deletion replay blocking, cross-account isolation, manifest tampering/cardinality, deletion with new linking disabled, and no persistent mapping orphan after completion.

No live OAuth consent, deployed IAM transaction or real-player deletion was attempted. Current hosted Twitch-console asset identity was not inspected; compatibility uses the reviewed compiled scanner client and synthetic APIs.

## Timing, privacy and rollback limits

Manifest: one per internal account, **1 KiB maximum**, **nine persistent-reference slots maximum**, five fixed temporary-class names, one OAuth identity and one active-or-reserved Extension identity. No unbounded array of session, request or outcome IDs.

Deletion immediately blocks account access, then normally needs three successful resume requests. Provider outage pauses completion; a timeout never counts as success. Persistent records are explicitly deleted under guarded transactions; the manifest and job go last. Temporary sessions/outcomes/receipts are immediately non-authorizing and remain subject to their documented 5-minute / 8-hour / 24-hour / 30-day TTL bounds. TTL eligibility is not immediate physical erasure. Minimal suppression payloads and the continuation cookie have 35-day eligibility/maximum age; the completion receipt has 24 hours. See the linked review for exact class-by-class timing and provider revocation semantics.

Do not restore the older 5c1fad1 or deployed scanner gameplay writer after any manifest/lifecycle operation: those writers do not enforce the new deletion barriers. Source **6bec1b2 or a compatible successor** is the minimum runtime rollback baseline. Disabling new operations must retain deletion resumption and all access barriers. PITR restore must remain offline until verified deletion suppression is reapplied; no restoration or data export was performed.

Production account-settings UI, real-provider verification, deployed synthetic IAM/latency checks, privacy publication and website rollout remain separate gates. The previous manifest activation blocker is resolved in source; these deployment gates are not waived.

## Final deployed state and evidence

The stack remains UPDATE_COMPLETE. Live gameplay CodeSha256 remains `1RaWvR+jysWTCIXUeFlucRA8MVp/nVkGpYeAvGwvlYk=`. Conversion is ENABLED and tester tags are empty. The replacement change set is unexecuted; no deployed IAM, Lambda, route, table or website resource changed.

Local evidence directory contains source/packaged/deployed/proposed templates, actual change-set metadata, predeployment events, Guard output, synthetic IAM results, artifact manifests, upload versions and test logs.

- `source.json` SHA-256: `8db99b4a19fb698f494efc96c9164d9af9cf176d27cec67da684dbf17c923f7b`.
- `packaged.json` SHA-256: `d97dad61e75d9764ffa9b84a2cb27ce45c0179110553c454ce40bd82ac1f1558`.
- `processed.json` SHA-256: `bc4e48c942db45bc901f071e23e5de0cf6c08b35f238b09dd8b9dc48294897fd`.
- `deployed-processed.json` SHA-256: `b42436b1dd0228670d02c3087eb479ec929be80e893ef2585371b4c408054b5e`.
- `iam-simulation-results.json` SHA-256: `4dc2dc3fffa23ac8d1750bed5b869ca652a6abb5946b4dbdbd514c1b8f4f8df0`.

No real player data, item key, token or secret value was inspected or exposed. No scan, reset, wipe, migration or gameplay balance change occurred.

## Changed files

- `docs/dime-m42-account-manifest-review.md`.
- `docs/dime-m42-shared-save-review.md`.
- `infra/web/prepare_shared_review.py`.
- `infra/web/review_shared_candidate.py`.
- `infra/web/shared-processed.guard`.
- `infra/web/shared-source.guard`.
- `server/accountDeletion.ts`.
- `server/accountManifest.ts`.
- `server/authRecords.ts`.
- `server/canonicalPlayer.ts`.
- `server/twitchOAuth.ts`.
- `server/webAuth.ts`.
- `server/webHttp.ts`.
- `tests/accountLifecycle.test.ts`.
- `tests/e2e/m42Deletion.spec.ts`.
- `tests/twitchOAuth.test.ts`.
- `docs/dime-m42-account-manifest-change-set.md` (this evidence report).
