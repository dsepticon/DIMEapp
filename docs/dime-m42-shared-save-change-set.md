# Shared-save backend change set — not executed

## Decision boundary

Prepared under owner authorization for a separately reviewed backend update. **No execution, linking activation, website publication or CloudFront invalidation occurred.** Review alongside [identity, security, conflict, privacy and rollback design](dime-m42-shared-save-review.md).

Source checkpoint: `5c1fad14833505a1411bea6e014e5eb3f0619696` on `codex/dime-m4-graphics-web`, based on `83270d7c341f9dc9ce371a2178af9350d22a4a43`. Report-only follow-up does not change the artifacts.

## Exact candidate

- Account: `861738068626`; region: `us-east-2`.
- Stack: `dime-v2-review-20260912`.
- UPDATE change set: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-shared-save-5c1fad1-review-1/088e5071-0971-447a-8550-ad5632921386`.
- Status: `CREATE_COMPLETE`; execution status: `AVAILABLE` (unexecuted).
- ConfigurationRevision: `m42-shared-save-5c1fad1-review-1`.
- Conversion stays `ENABLED`; tester tags use the existing empty value.
- New AccountLinkingMode: `DISABLED`. Enabling linking requires a later separately reviewed update after all writers are binding-aware and OAuth/IAM verification passes.
- CloudFormation reports no validation errors. `describe-events` predeployment validation was inspected; `describe-stack-events` was not used.

## Every resource operation

14 Add, 3 Modify, 0 Remove, 0 Import, 0 replacements. All three modifications report Replacement=False.

| Operation | Logical resource                      | Type                      | Replacement |
| --------- | ------------------------------------- | ------------------------- | ----------- |
| Modify    | `EbsExecutionRole`                    | `AWS::IAM::Role`          | False       |
| Modify    | `EbsFunction`                         | `AWS::Lambda::Function`   | False       |
| Modify    | `StagingHttpApi`                      | `AWS::ApiGatewayV2::Api`  | False       |
| Add       | `WebAuthExecutionRole`                | `AWS::IAM::Role`          | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute0Permission`  | `AWS::Lambda::Permission` | N/A (new)   |
| Add       | `WebAuthFunctionWebRoute10Permission` | `AWS::Lambda::Permission` | N/A (new)   |
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

### Deployed versus proposed

- EbsFunction: code artifact changes to guarded canonical resolution; adds `DIME_ACCOUNT_LINKING`; existing configuration-revision reference takes the new revision. Existing resource identity, runtime, memory, timeout, concurrency, role reference and other environment definitions stay unchanged.
- EbsExecutionRole: one additional scoped ConditionCheckItem statement, described below. Existing GetItem/PutItem and own-log permissions and trust remain structurally identical.
- StagingHttpApi: eleven new web-auth/web-gameplay method paths. All eight existing method paths and integrations remain structurally identical. Existing CORS, stage, throttling and endpoint configuration are unchanged.
- Every other existing processed resource is structurally identical, including PlayerStateTable, existing invoke permissions, log groups, alarms and outputs. No existing resource removal or replacement. No new table or index.
- The new web-auth Lambda has its own execution role and retained log group, Node.js 22, 256 MB, 20-second timeout and reserved concurrency 5.

### Exact new routes and invoke permissions

Each permission grants only `lambda:InvokeFunction` to `apigateway.amazonaws.com`, scoped to this API's corresponding method/path and the new WebAuthFunction. No existing permission is broadened.

- `GET /auth/login` → WebAuthFunction, `WebAuthFunctionWebRoute0Permission`.
- `GET /auth/callback` → WebAuthFunction, `WebAuthFunctionWebRoute1Permission`.
- `GET /auth/session` → WebAuthFunction, `WebAuthFunctionWebRoute2Permission`.
- `POST /auth/logout` → WebAuthFunction, `WebAuthFunctionWebRoute3Permission`.
- `POST /auth/link/intent` → WebAuthFunction, `WebAuthFunctionWebRoute4Permission`.
- `POST /auth/link/accept` → WebAuthFunction, `WebAuthFunctionWebRoute5Permission`.
- `GET /api/v4/state` → WebAuthFunction, `WebAuthFunctionWebRoute6Permission`.
- `POST /api/v4/actions` → WebAuthFunction, `WebAuthFunctionWebRoute7Permission`.
- `POST /api/v4/content/preview` → WebAuthFunction, `WebAuthFunctionWebRoute8Permission`.
- `POST /api/v4/content/convert` → WebAuthFunction, `WebAuthFunctionWebRoute9Permission`.
- `POST /api/v4/profile/reset` → WebAuthFunction, `WebAuthFunctionWebRoute10Permission`.

### Exact IAM delta

Both roles trust only `lambda.amazonaws.com` for `sts:AssumeRole`.

Existing gameplay role adds `CheckCanonicalBindingAndSave`: Allow `dynamodb:ConditionCheckItem` on the ARN of the existing PlayerStateTable, conditioned by `ForAllValues:StringLike` LeadingKeys `BINDING#v1#*`, `PLAYER#v1#*`, `ACCOUNT#v1#*`, and `Null` LeadingKeys `false`. Its existing table-wide GetItem/PutItem statement remains unchanged; this review does not claim that existing statement gained prefix restrictions.

New web role has exactly:

1. `WebAuthAndCanonicalTransactions`: GetItem, PutItem, ConditionCheckItem on the same table; LeadingKeys AUTH/BINDING/PLAYER/ACCOUNT `#v1#*` prefixes, with the same non-null guard.
2. `DeleteOnlyAuthRecords`: DeleteItem on the same table, restricted to `AUTH#v1#*`, with the non-null guard. No gameplay/binding deletion grant.
3. `WriteOwnLogs`: CreateLogStream and PutLogEvents only under its `/aws/lambda/dime-v2-staging-review01-dime-v2-review-20260912-web-auth` log streams.

No Scan, Query, UpdateItem, table administration, runtime Secrets Manager read or KMS action is added. IAM static-analysis output was reviewed and narrowed, not blindly applied. Actual IAM transaction execution remains a post-authorization synthetic deployment gate. Canonical binding checks add strongly consistent reads and transactional checks to each request. Local compatibility tests do not measure deployed DynamoDB latency or capacity; synthetic load/latency verification is required before activation.

### Environment and runtime references

Gameplay adds only `DIME_ACCOUNT_LINKING=Ref(AccountLinkingMode)`; it receives no OAuth secret, web identity key or auth encryption key.

Web-auth inherits the existing state-table, origin, conversion, revision and Extension authentication references needed to independently authenticate link acceptance. It adds:

| Environment name             | Reference/value                                                            |
| ---------------------------- | -------------------------------------------------------------------------- |
| DIME_WEB_ORIGIN              | `https://destroyaindustriesminingextension.com`                            |
| DIME_OAUTH_CLIENT_ID         | Public client `4228okut24ll35bisjmygbquaf6svm` via OAuthClientId parameter |
| DIME_ACCOUNT_LINKING         | Ref AccountLinkingMode, initially DISABLED                                 |
| DIME_OAUTH_CLIENT_SECRET     | Secrets Manager dynamic reference, OAuthClientSecretArn                    |
| DIME_WEB_ID_KEY_B64          | Secrets Manager dynamic reference, WebIdentityKeySecretArn                 |
| DIME_AUTH_ENCRYPTION_KEY_B64 | Secrets Manager dynamic reference, AuthEncryptionKeySecretArn              |

The three parameters contain the exact owner-supplied ARNs ending `client-secret-s5kwbq`, `identity-key-kL7iYK`, and `auth-encryption-key-hAAuXq`. Only metadata was inspected; values were not retrieved. CloudFormation resolves references on an authorized deployment. Actual values/encoding and provider consent have not been verified. Callback to register: `https://destroyaindustriesminingextension.com/auth/callback`. Website-to-API routing remains a separate publication review.

### Table and data effects

Exact table: `dime-v2-staging-review01-dime-v2-review-20260912-player-state`. Entire deployed/proposed processed table definition is identical: no table/index/TTL/PITR/encryption/billing change. Preparation performed no table data operations. When later enabled, normal authenticated requests create auth and binding items and use the same canonical STATE/REQUEST partitions; deployment itself contains no migration or record writer. Linking does not copy or rewrite saves or receipts.

## Reviewed artifacts

Both ZIPs contain only root `index.mjs`; clean SAM modules are byte-identical to their corresponding build output. Audited for accidental frontend/test/fixture/source-map/secret material; gameplay has no OAuth runtime secret or provider-token-exchange implementation. Uploaded once with `If-None-Match: *`, AES256, verified SHA-256 checksums and nonempty S3 version IDs.

Bucket: `dime-v2-staging-artifacts-861738068626-us-east-2`.
Key prefix: `dime-v2/review/5c1fad14833505a1411bea6e014e5eb3f0619696/`.

| ZIP                            |  Bytes | SHA-256                                                            | S3 version                         |
| ------------------------------ | -----: | ------------------------------------------------------------------ | ---------------------------------- |
| gameplay-canonical-5c1fad1.zip | 489645 | `5c3450535d24f6fa5f6934b685b94611560d1b6b54c8c5329f3c8be979ad0641` | `A5pP1KgsEuMRG.jFV4uGnMVjAkT.B9uu` |
| web-auth-canonical-5c1fad1.zip | 485719 | `d756162f5ba75166537ee1e7746d2e1c8a3b5806e63b0547c8721970e64371e3` | `m2gR61KSycLJd5_DcRcHsqiz2DKEXuwN` |

The existing review-bucket lifecycle reports expiration on 2026-12-16. These objects are review artifacts, not an indefinite rollback archive; preserve verified copies under a separately reviewed retention plan before activation.

## Validation and compatibility

- Vitest: **366 passed, 55 files**.
- Full Chromium release/compatibility suite: **152 passed, 36.1 minutes, zero retries**.
- Focused web Chromium suite: **6 passed**, including the two new first-profile-choice tests added after full-suite collection. Four overlap with the full suite: **154 distinct browser tests**, 158 successful executions.
- Lint, strict typecheck, formatting and `git diff --check`: passed.
- Default, Twitch, web and both Lambda builds: passed.
- Clean Linux-native SAM build and SAM validation: passed; both packaged modules match build output byte-for-byte.
- Source, packaged and actual CloudFormation-processed cfn-lint: passed.
- Source and actual processed Guard rules: passed.
- CloudFormation template validation, structural deployed/proposed comparison and predeployment events review: passed.

No live OAuth, deployed synthetic IAM transaction or authenticated Twitch-console test is claimed. The browser suite includes existing visual/effect/performance assertions; no deployed backend latency benchmark was performed.

Compatibility evidence uses the reviewed compiled scanner Twitch client with local synthetic APIs, plus actual gameplay-handler contract tests for both bound and unbound identities. It does not prove which ZIP is currently active in the authenticated Twitch console, nor live provider consent. Linking-aware handler tests preserve legacy/v4 responses, original-request replay, refresh, CORS and unauthenticated rejection. Synthetic tests cover two-save conflicts (including pristine saves), revision/generation races, replay isolation, detached binding behavior, reset and first-web-profile choice.

## Security findings and disposition

This is a source, synthetic-test and processed-infrastructure review, not a claim of completed live OAuth testing.

| Risk                                                                  | Impact                                                | Disposition                                                                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old gameplay writer ignores a newly created binding                   | High: divergent saves or stale mutations              | Canonical resolver checks binding transactionally. Initial linking disabled; old-invocation drain and all-writers verification required before activation. |
| Reset returns to a repeated revision                                  | High: stale transaction could affect a new generation | Dynamo STATE conditions include observed generation; synthetic ABA-race test passes.                                                                       |
| First web load silently creates a conflicting save                    | High: blocks safe preservation/linking                | Explicit first-profile choice gates state creation; two distinct saves always conflict.                                                                    |
| Replayed link after detach or account change                          | High: access could be restored incorrectly            | Durable outcome replay requires original Extension and current binding epoch/status/account; suspended/detached states fail closed.                        |
| Restoring an old, binding-unaware Lambda                              | High after linking: divergent profile access          | Prohibited by rollback design; retain the new canonical resolver and disable linking/web access instead.                                                   |
| Runtime IAM, OAuth credentials and provider consent not yet exercised | Release gate                                          | No activation or website publication until authorized synthetic and real-provider verification succeeds.                                                   |
| Persistent identity/link records differ from gameplay receipt TTL     | Privacy release gate                                  | Update retention/deletion disclosure before website publication; no privacy object changed here.                                                           |
| Extra database transaction overhead                                   | Operational gate                                      | Benchmark deployed synthetic requests before activation.                                                                                                   |

Persistent link outcomes also lack a per-account enumeration manifest. Exact-key deletion of all outcomes is therefore not implemented; a bounded manifest or reviewed bounded outcome-retention design is required before enabling linking. See the explicit deletion-design limitation in the identity review.

Unlinking, recovery and account deletion remain support designs. Do not expose or advertise incomplete self-service operations.

## Live state and remaining gates

Read-only verification found the stack still `UPDATE_COMPLETE`, revision `m43-scanner-17acd1f-20260915-1`, conversion ENABLED and tester tags empty. Gameplay CodeSha256 remains `1RaWvR+jysWTCIXUeFlucRA8MVp/nVkGpYeAvGwvlYk=`. The change set has not executed. Website, privacy, CloudFront and Twitch publication are untouched.

Amplify auto-branch patterns and connected branches contain only `main` and `codex/react-extension-rebuild`; this branch is excluded.

Owner review must cover the IAM and route additions explicitly. Execution is not authorized by this preparation. After separate execution authorization, follow the staged gates in the identity review: deploy with linking disabled; drain old invocations; verify runtime credentials, synthetic IAM and OAuth behavior; review activation separately. Unlink/recovery/deletion are support designs, not enabled self-service features. Publish the privacy update and complete website backup/TLS/CSP/cookie/rollback checks before any website publication.

Rollback after any possible link must keep the binding-aware gameplay resolver and preserve canonical partitions. Disable new linking/web entry points rather than returning to a pre-binding writer. Do not delete bindings, auth records, saves or receipts as rollback.

## Changed source files

- `app/AccountLink.tsx`.
- `app/original/Main.tsx`.
- `app/webSession.ts`.
- `docs/dime-m42-shared-save-review.md`.
- `infra/web/prepare_shared_review.py`.
- `infra/web/review_shared_candidate.py`.
- `infra/web/shared-processed.guard`.
- `infra/web/shared-source.guard`.
- `server/authRecords.ts`.
- `server/canonicalPlayer.ts`.
- `server/handler.ts`.
- `server/webAuth.ts`.
- `server/webHandler.ts`.
- `server/webHttp.ts`.
- `tests/authRecords.test.ts`.
- `tests/e2e/m42Web.spec.ts`.
- `tests/handler-canonical.test.ts`.
- `tests/handler-routing.test.ts`.
- `tests/webAuth.test.ts`.

The follow-up report adds `docs/dime-m42-shared-save-change-set.md` and makes the privacy/deletion limitation explicit in `docs/dime-m42-shared-save-review.md`; runtime source and artifacts are unchanged.

## Evidence files

Local review evidence: `/tmp/dime-m42-link-review/` contains source/packaged/deployed/proposed templates, change-set metadata, validation output, upload versions and test logs. Exact template hashes:

- `source.json`: `451767394319c827b227412abcf2cdc3778ebdd9acba99020c427eeed88d1665`.
- `packaged.json`: `9240a56356901dce2bf3a527a8ce50eb68eaf7eda11cc42c6f91e2c1a15d36db`.
- `processed.json`: `5d5e4d165491ba97b03b32dc05057a68f5b4d85b7bdccb81041f6cb551092b02`.
- `deployed-processed.json`: `b42436b1dd0228670d02c3087eb479ec929be80e893ef2585371b4c408054b5e`.

No player records were scanned, inspected, merged, reset or migrated. No secret value, authorization token, cookie, item key or player field was displayed. No change set was executed and no website was published.
