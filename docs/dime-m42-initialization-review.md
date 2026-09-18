# Web-auth initialization diagnostic review — September 18, 2026

Baseline: `5e7a1f6efc009bba261206c5b40e9a39d4f89e29`; branch: `codex/dime-m4-graphics-web`.

## Decision

Prepared for review only. Neither the correction nor TESTERS activation has been executed. Sign-in and linking remain DISABLED; conversion remains ENABLED with empty tester tags. The stack remains UPDATE_COMPLETE.

The source correction alone does **not** make TESTERS ready: deployed web identity and encryption entries fail the canonical format predicates and are equal. Correcting these through secure owner tooling, preserving any existing account compatibility, and reviewing a configuration refresh remain separate activation gates. No secret values were requested or retrieved.

## Supported diagnosis

The old handler initialized credentials/encryption/storage before parsing a malformed invitation. The previously deployed ZIP reproduces its 503 locally with synthetic configuration. The corrected compiled ZIP returns 401 before credential initialization for the same malformed input. Signature verification is still mandatory for structurally eligible invitations.

Boolean-only metadata projections establish invalid canonical web-key shape and failed key separation. The template references the intended distinct secret metadata; all three expected records exist in the expected region, use the AWS-managed Secrets Manager key, and have no resource policy. OAuth client ID, origin and storage target predicates match. No value, actual encoding or first throwing statement was inferred beyond those predicates: the previous catch erased the precise failure stage.

References resolve the entire plaintext SecretString at CloudFormation deployment time. The runtime expects resolved values, not ARNs, and has no Secrets Manager client. Its lack of GetSecretValue permissions is expected, not a newly diagnosed runtime IAM defect. No permissions are added.

Canonical identity/encryption keys are independent 32-byte keys, padded canonical Base64 (44 characters), with no whitespace or JSON wrapper. OAuth client secret is the full opaque plaintext provider secret. Hex, JSON wrappers, ambiguous property selection and permissive fallback decoding are rejected. See [the contract and stage review](dime-m42-auth-initialization-contract.md).

## Source scope

- `server/testerInvitation.ts`: separate bounded structural parsing from mandatory constant-time HMAC verification.
- `server/webSignIn.ts`: reject missing, malformed, expired or duplicate invitation parameters before initialization.
- `server/webInitialization.ts`: canonical formats, named failure categories and allowlisted category/correlation-only logging.
- `server/webHandler.ts`: invitation-only key validation before lazy provider/encryption/storage; preserve four-key separation and independent emergency dependencies.
- `server/webAuth.ts`: validate provider configuration before nonce/state transactions.
- `server/webHttp.ts`, `server/webEmergency.ts`: generic correlated internal errors, retaining callback/logout cookie cleanup.
- `scripts/provision-tester.ts`: enforce the same canonical key format; no real provisioning performed.
- `tests/webInitialization.test.ts`, `tests/e2e/webInitialization.spec.ts`, `tests/webSignIn.test.ts`, `tests/webEmergency.test.ts`: synthetic failure, ordering, secrecy, replay and compatibility coverage.
- Documentation and sanitized evidence only otherwise. No gameplay, frontend, infrastructure source or mineral-balance change.

## Validation

Unit: 528 tests, 64 files passed. One clean complete Chromium run: **170 passed in 36.2 minutes, zero failures, retries disabled**. An earlier run used the wrong frontend build configuration and was interrupted; the complete corrected run, not isolated reruns, is the release gate. npm ci, lint, strict typecheck, formatting and git diff --check passed. Default, Twitch, web, guest, gameplay and web-auth builds passed. Clean native SAM build matches the reviewed bundles; SAM validation, source/packaged/processed cfn-lint and applicable source/processed Guard rules passed, including unchanged routing and sampling-disabled review fixtures.

Synthetic IAM: 17 cases / 49 action decisions passed. Four additional secret-resource decisions are implicit deny, consistent with deployment-time injection. No real DynamoDB requests were used to establish isolation. Optional IAM Policy Autopilot could not run because uvx is unavailable; actual AWS policy simulation and static/template review completed. Provisioning-wrapper synthetic tests: 3 passed; no real key resolution or invitation.

Twenty live disabled HTTP/CORS checks passed: login/callback/link creation return unavailable without redirect; status is non-sensitive; logout succeeds and expires cookies; missing deletion proof rejects; unauthenticated persistent requests reject. These are public unauthenticated checks, not authenticated access to real saves. Existing Extension journeys use synthetic local authorization in the browser/unit suites.

The corrected compiled smoke tests reproduce old 503 and new structural 401, bad-signature 401, categorized key/configuration errors and DISABLED 503. There is no runtime Secrets Manager operation; access/KMS/timeout failures are synthetic preparation fixtures, not claims of live secret retrieval tests.

Performance: frame p95 16.7 ms across Panel, Mobile and desktop; worst 33.4 / 16.8 / 16.8 ms. Zone transition average/p95/worst: Panel 78.15/86.02/86.48 ms; Mobile 75.35/76.87/77.40 ms; desktop 76.91/86.77/87.47 ms. Eight nodes/eight fragments and active effects tested. One canvas, no scrolling/errors. Thirty cycles and 180 physical transitions: heap stabilized around 4.9–5.0 MB, ending 4,963,780 bytes; one document, 141 nodes, 185 listeners remained fixed. This bounded synthetic run is not a guarantee about indefinitely long sessions.

## Activation and rollback

Do not execute this candidate as part of the diagnostic pass. A later approved dormant deployment must retain both modes DISABLED. Correct the key contract separately through secure tooling; review compatibility before rotating keys and review the required environment refresh. Then create a fresh parameter-only TESTERS change set from the verified deployed template. Keep linking DISABLED, artifacts/permissions/routes/storage unchanged. The prepared parameter files are plans, not activated or independently executable approval.

If a separately approved live test fails, use the reviewed parameter-only DISABLED rollback; preserve linking DISABLED and conversion ENABLED. A code rollback uses the previous exact web-auth S3 code reference recorded in the local before-template, never a gameplay rollback or data restore. No data migration or irreversible storage change is introduced here.

No secret value, real invitation, OAuth token, player field or item key was retrieved, exposed or committed. No player-data access, scan, reset, mutation or wipe occurred. No routing, privacy, website, Lambda deployment or authentication activation occurred.

## Artifact and exact review candidate

Source checkpoint: `e67b7748c380e4ccaa2cf8165998b2be955e0e79`.

- ZIP: `/tmp/dime-m42-init-review/DIME-WebAuth-initialization-review-20260918.zip`
- Size: 494017 bytes
- ZIP SHA-256: `2f3ef9e70dfc96c6a30d48e52d09a04fd713f6903772b1cc84dfff94f9a931e9`
- Root `index.mjs` SHA-256: `5c3e178c955219a8737f6fb384c2929fe23dd943af57005c7022f3e277edf6e7`
- S3: `s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/e67b7748c380e4ccaa2cf8165998b2be955e0e79/web-auth-initialization.zip`
- S3 version: `8RsuJDLwpUO8Km02.9G9K3OK2MvvV3ht`; create-only write, SHA-256 checksum verified, AES256 encryption.
- Change set: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-init-e67b774-review-1/d71cc9c0-a8cc-4830-b825-317333d85805`
- Status: CREATE_COMPLETE / AVAILABLE; **not executed**.

| Resource        | Operation                        | Replacement | Actual processed difference       |
| --------------- | -------------------------------- | ----------- | --------------------------------- |
| WebAuthFunction | Modify                           | False       | Code S3 bucket/key/version only   |
| StagingHttpApi  | Modify, dynamic ARN reevaluation | False       | None; body structurally identical |

Zero Add/Remove/Import/replacements. All other resources and all parameters are structurally identical, including IAM, DynamoDB schema/indexes/TTL/PITR/encryption/billing/policy, logs, alarms, routes, permissions, CORS, secret references, outputs and gameplay Lambda. Predeployment `describe-events` returned zero failed events. The full SAM-source translation using deployed artifact references also matches the deployed processed template.

The gameplay ZIP continues matching deployed CodeSha256 `4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=`. Its `index.mjs` remains byte-identical with SHA-256 `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`.

[Sanitized evidence](dime-m42-initialization-review/exact-review.json) accompanies this report. Local before/processed templates and review/activation/rollback preparation files are retained under `/tmp/dime-m42-init-review`; no secret-value snapshot is present.

## Git publication safety

Amplify automatic branch patterns and connected branches were rechecked: only `main` and `codex/react-extension-rebuild`. This review branch is excluded. Only `codex/dime-m4-graphics-web` is pushed; no history rewrite or merge.
