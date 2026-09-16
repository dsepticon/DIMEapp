# Web sign-in gate replacement — UNEXECUTED

Source checkpoint: `289cadc60975782785cbc6f90321741119a406eb`, based on `20ea153`, branch `codex/dime-m4-graphics-web`. Follow-up changes are browser-test synchronization and review evidence only; runtime artifacts remain byte-identical to the source checkpoint.

[Gate behavior, TESTERS limitation, secrets and rollback review](dime-m42-web-sign-in-gate.md).

## Candidate and activation state

- Change set: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-signin-289cadc-review-1/845e0974-41de-41a1-92ba-ad1dfd2de709`.
- Account `861738068626`; region `us-east-2`; stack `dime-v2-review-20260912`.
- UPDATE, CREATE_COMPLETE / AVAILABLE. **No execution.** Deployed stack remains unchanged.
- Stale `m42-manifest-6bec1b2-review-1` was confirmed unexecuted and deleted only after the replacement completed and passed processed-template comparison.

| Parameter                   | Template default                     | Candidate value                        |
| --------------------------- | ------------------------------------ | -------------------------------------- |
| WebSignInMode               | DISABLED                             | DISABLED                               |
| AccountLinkingMode          | DISABLED                             | DISABLED                               |
| ContentConversionMode       | DISABLED (existing template default) | Existing ENABLED retained              |
| ContentConversionTesterTags | Empty (NoEcho)                       | Previous reviewed empty value retained |
| ConfigurationRevision       | None; required parameter             | m42-signin-289cadc-review-1            |

WebSignInMode allows DISABLED, TESTERS, ENABLED. TESTERS deliberately admits nobody; no tester eligibility, tester identity list or admission credential is provisioned. OAuthClientId is restricted to the owner's public `4228okut24ll35bisjmygbquaf6svm`; three secret ARN parameters have no invented defaults. All complete ARN values match the owner-supplied references in the linked review.

## Exact operations

**18 Add, 3 Modify, 0 Remove, 0 Import, 0 replacements.**

| Action | Logical resource                      | Type                      | Replacement |
| ------ | ------------------------------------- | ------------------------- | ----------- |
| Modify | `EbsExecutionRole`                    | `AWS::IAM::Role`          | False       |
| Modify | `EbsFunction`                         | `AWS::Lambda::Function`   | False       |
| Modify | `StagingHttpApi`                      | `AWS::ApiGatewayV2::Api`  | False       |
| Add    | `WebAuthExecutionRole`                | `AWS::IAM::Role`          | N/A         |
| Add    | `WebAuthFunctionWebRoute0Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute10Permission` | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute11Permission` | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute12Permission` | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute13Permission` | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute14Permission` | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute1Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute2Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute3Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute4Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute5Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute6Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute7Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute8Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunctionWebRoute9Permission`  | `AWS::Lambda::Permission` | N/A         |
| Add    | `WebAuthFunction`                     | `AWS::Lambda::Function`   | N/A         |
| Add    | `WebAuthLogGroup`                     | `AWS::Logs::LogGroup`     | N/A         |

Compared with the deployed stack, EbsFunction receives the already reviewed manifest/canonical-resolution artifact and the linking-availability environment reference; EbsExecutionRole receives the previously reviewed ConditionCheckItem statement; StagingHttpApi adds the reviewed web routes plus capability status. No resource is replaced or removed.

Compared with the **stale reviewed proposal**, a structural equality check confirms precisely four differences: new WebSignInMode parameter, DIME_WEB_SIGN_IN_MODE environment reference on WebAuthFunction, updated web-auth code artifact, and GET /auth/status integration/permission. All other processed definitions are identical, including gameplay code's pinned S3 version.

The entire DynamoDB table definition is identical: no table policy, key schema, index, TTL, PITR, encryption, billing or deletion-protection change. Existing eight gameplay method paths, integrations and permissions, CORS, stage, throttling, logs, alarms and outputs are preserved. No website, CloudFront, DNS or certificate resource is changed.

## Routes and permissions

All fifteen new web-auth methods relative to deployment:

- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/session`
- `POST /auth/logout`
- `POST /auth/link/intent`
- `POST /auth/link/accept`
- `GET /api/v4/state`
- `POST /api/v4/actions`
- `POST /api/v4/content/preview`
- `POST /api/v4/content/convert`
- `POST /api/v4/profile/reset`
- `POST /auth/unlink`
- `POST /auth/delete/intent`
- `POST /auth/delete/resume`
- `GET /auth/status`

Only GET /auth/status is new relative to the stale proposal. Each Lambda permission references only this API and exact method/path with SAM's existing stage wildcard convention. The status response contains only two booleans; no account, secret identifier, tester list or internal mode is exposed.

## Reviewed template hashes

SHA-256 of the retained JSON evidence files:

- `source.json`: `68a9ffef623fbf3398c4bb5c3ac18fc0bf92b9d36f4496ea142bf87217b6ee0a`
- `packaged.json`: `c6eda5253c3a4c4dc164818a97746fa0dfd70ba531a70747c195926cf3c0aee7`
- `processed.json`: `4a741639c3bc7c159f7dab6d8ae451a698ead0f5b70fc4f9058ca1431728371b`

## IAM delta

No IAM change versus the accepted manifest proposal. Relative to deployment:

- Gameplay keeps its existing GetItem/PutItem and own-log permissions and adds ConditionCheckItem on the exact table with BINDING/PLAYER/ACCOUNT/CONTROL leading-key prefixes and Null=false. No DeleteItem, Scan, Query or OAuth credential is added to gameplay.
- New web-auth role allows GetItem, PutItem, ConditionCheckItem and DeleteItem on the exact table with AUTH/BINDING/PLAYER/ACCOUNT/CONTROL prefixes and Null=false; own-log CreateLogStream/PutLogEvents only. No Scan, Query, UpdateItem, table administration, runtime Secrets Manager retrieval or KMS action.
- Account ownership, STATE sort-key restrictions and transaction correctness remain code-enforced. Prefix IAM policies do not prove per-account isolation by themselves.

IAM source analysis was rerun with telemetry disabled. AWS custom-policy simulations passed **16 cases / 46 decisions**, including denied mixed/missing/unrelated leading keys, wrong table, unsupported data-plane/table operations, and gameplay auth/deletion permissions. These are synthetic policy simulations, not deployed-role transactions.

## Artifacts

The new web-auth ZIP was audited and uploaded once with If-None-Match `*`, AES256 and a verified SHA-256 checksum. Bucket: `dime-v2-staging-artifacts-861738068626-us-east-2`. Both Lambda packages contain only root `index.mjs`; clean SAM output is byte-identical to the built modules. No frontend, tests, fixtures, maps, literal credentials, identities or unintended migration modules are packaged in Lambda.

### web-auth

- Local: `/tmp/dime-m42-signin-review/web-auth-signin-289cadc.zip`
- Size: 489,298 bytes.
- ZIP SHA-256: `b4680f29a1a0ddebe604433be9789f24345760c2e9b9978c76ffd216dc1a0e1d`
- Module SHA-256: `de820cfa350e69c4cd3407abc0280c69c1e2772cb59d57b79e19f22dbd0f0577`
- S3 key: `dime-v2/review/289cadc60975782785cbc6f90321741119a406eb/web-auth-signin-289cadc.zip`
- S3 VersionId: `zk0Gfs_XbXb8zcKNhbqT1aNCPjWpwxyi`

### gameplay

- Local: `/tmp/dime-m42-manifest-review/gameplay-manifest-6bec1b2.zip`
- Size: 490,459 bytes.
- ZIP SHA-256: `e246dd9056187c1daf4d26a70dc68ab5cc0e6ef621371a8ba9b6ca0f53a42af6`
- Module SHA-256: `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`
- S3 key: `dime-v2/review/6bec1b223a1fc12e77765268cca7996cbc3972fb/gameplay-manifest-6bec1b2.zip`
- S3 VersionId: `lxI5GaSEt4Tj16..CRrK9si7.egWtlkY`

Gameplay was rebuilt for comparison but not reuploaded: it reuses the byte-identical artifact approved at 6bec1b2. Neither Lambda is deployed by this task.

### Standalone web frontend

- Local: `/tmp/dime-m42-signin-review/DIME-Web-0.9.0-signin-disabled-289cadc.zip`
- Size: 106,938 bytes.
- ZIP SHA-256: `697746c93d5ad6caf6fbd387964022b949286d53a093641844c6f341756733e6`
- Contains index.html and hashed JS/CSS assets only. No Twitch ZIP substitution. Not published.

## Validation

**Final clean complete Chromium release suite: 161 passed (36.1m), zero retries, zero failures.** This includes Panel/Mobile/desktop production gameplay, legacy compatibility, disabled frontend availability and emergency deletion continuation.

Locked npm install, lint, strict typecheck, formatting, git diff --check, default/Twitch/web builds, both Lambda builds, clean native SAM build and validation, source/packaged/actual-processed cfn-lint, all applicable shared-source/shared-processed Guard rules, CloudFormation template validation and describe-events predeployment checks passed. Historical combined-handler Guard variants do not apply to this separate web-auth candidate. The processed template is checked against both deployed definitions and the old proposal.

The unit suite passed **400 tests / 57 files**. Thirteen new gate cases cover default/unknown/malformed/TESTERS modes, no credential initialization/network/storage access, denied callback exchange, blocked web mutation paths, independent linking, safe logout and shutdown preservation. The compiled web-auth module also passed 15 credential-free smoke checks.

Compiled standalone web synthetic HTTPS checks passed at 318×500, 360×640 and 1280×900: disabled message/no login, enabled synthetic session, walking without mutation, link-intent UI, refresh, logout, privacy links, no readable session cookie or credential storage, no document scrolling or page/request errors. The provider/repositories were synthetic; no live OAuth consent or player record was used.

The first browser run exposed an existing timing-dependent scanner boundary test: Playwright locator retry delayed key release and the test walked beyond its intended measurement boundary. The test now releases normal keyboard input in the browser animation loop at the measured range; it does not mutate position or gameplay state, relax the original range assertion, or change runtime code. All three focused sizes passed before starting a new complete zero-retry suite. The initial failed/interrupted run is not counted as the release result.

## Performance

Local compiled-build synthetic measurements; these are not live Twitch/device guarantees. One canvas, no document scrolling and no recorded page/network errors in all layouts. Eight visible formations/fragments, scanner, laser, vacuum and busiest-city effects included; collected quantity conserved. Concurrent local browser validation may affect timing.

| Layout  | Frame p95 / worst (ms) | Transition avg / p95 / worst (ms) | Final DOM / canvas | Errors |
| ------- | ---------------------- | --------------------------------- | ------------------ | ------ |
| Panel   | 16.8 / 16.8            | 77.2 / 85.4 / 85.5                | 57 / 1             | 0      |
| Mobile  | 16.7 / 16.8            | 78.0 / 80.4 / 159.8               | 57 / 1             | 0      |
| Desktop | 16.7 / 16.8            | 76.8 / 86.9 / 87.2                | 57 / 1             | 0      |

Short-run post-GC retained heaps were approximately 4.9–5.3 MB. This measurement is not a new long-session leak proof. No walking or Ping save writes were observed.

## Secrets and remaining activation gates

All three exact owner references were checked using describe-secret metadata only: AWSCURRENT exists and no deletion is scheduled. Secret contents, correctness and encoding were not inspected. **The secrets must exist even while sign-in is disabled**, because CloudFormation resolves the unchanged environment dynamic references at resource creation/update. Disabled login, callback and status requests do not initialize those credentials. No placeholder secret or ARN is used.

Stop here for owner review. Execution, website publication, live OAuth, designated tester admission and linking activation remain outside this preparation run. TESTERS is unavailable. Future rollback must retain gate-aware web-auth code and manifest-aware gameplay writers. No table scan, player record read/write, reset, migration, conversion, linking, deletion, secret-value retrieval, website write or Twitch public release occurred.
