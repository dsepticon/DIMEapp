# Controlled OAuth testers — preparation report

Date: 2026-09-16. Branch: `codex/dime-m4-graphics-web`. Base local and remote HEAD: `649e8943192b0e7027f5bd37b75e86148db17ce3`.

**Review only: support is not deployed, both authentication gates remain DISABLED, conversion remains ENABLED. No real invitation was generated.**

## Source and security

Runtime source checkpoint: `c8c211cb8643f4cb8e7c279e9335ae915759e1c8`. Owner-tool hardening checkpoint: `39df0a8`. Its resolver bridge and subsequent report changes do not alter the Lambda artifact. [Changed files](dime-m42-testers-review/changed-files.json) enumerate the implementation; this report/evidence directory is additional documentation.

Implemented canonical signed, one-use invitations lasting at most 15 minutes; separate HMAC contexts for signing and intended-subject identification; constant-time comparisons; atomic digest-only nonce consumption; callback subject matching before account/session issuance; best-effort rejected-token revocation; temporary cookie cleanup; independently gated deliberate linking; secure tester-session status/logout UI; and fail-closed configuration/path handling. Sign-in alone cannot access or create gameplay state while linking is disabled. Guest and Extension gameplay source remains unchanged.

Read the [security/retention review](dime-m42-tester-security-review.md) and [owner provisioning, activation, live-test and rollback runbook](dime-m42-tester-owner-runbook.md). The pinned owner resolver bridge was tested only with synthetic inputs and a metadata-only hash check. No real key was resolved.

## Exact infrastructure comparison

Change set: `m42-testers-c8c211c-review-1`.

ARN: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-testers-c8c211c-review-1/a32a3a58-aa9b-4014-a55e-18141c233463`.

State: CREATE_COMPLETE / AVAILABLE; **unexecuted**. Target stack: `dime-v2-review-20260912`, account `861738068626`, region `us-east-2`.

| Operation              | Resource        | Exact effect                                                                         |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Modify, no replacement | WebAuthFunction | Reviewed S3 code artifact only                                                       |
| Modify, no replacement | StagingHttpApi  | Dynamic WebAuthFunction ARN/body reevaluation; processed body structurally identical |

Totals: **0 additions, 2 non-replacing modifications, 0 removals, 0 replacements**. No IAM, route, permission, table/schema/index/TTL/PITR/encryption/billing, log, alarm, output, secret-reference, website or gameplay-Lambda change. No new resource class is introduced.

The only template declaration differences beyond web-auth code are AccountLinkingMode's allowed values gaining TESTERS and WebSignInMode's explanatory description. Both defaults remain DISABLED. Every deployed parameter value is preserved with UsePreviousValue; the actual deployed conversion mode is preserved as ENABLED. Conversion tester tags are an unchanged NoEcho parameter, not printed or retrieved as plaintext.

[Per-resource before/after hashes and exact code/parameter values](dime-m42-testers-review/template-resource-comparison.json), [exact processed comparison](dime-m42-testers-review/exact-review.json), [source comparison](dime-m42-testers-review/source-comparison.json), [sign-in activation parameter plan](dime-m42-testers-review/activation-signin-plan.json), [later linking parameter plan](dime-m42-testers-review/activation-linking-plan.json). Neither activation plan was submitted or executed. No failed change-set validation events were reported by `describe-events`.

The existing three owner-supplied secret ARNs and OAuth public client ID are unchanged. Secret resources must exist and be resolvable when CloudFormation deploys dynamic environment references, even when login is disabled. Runtime disabled gates prevent login/callback initialization; they do not make deployment-time references optional. No placeholder credentials or secret values are present in this review.

## Artifacts

| Artifact                                                         |  Bytes | SHA-256                                                            |
| ---------------------------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `/tmp/dime-m42-testers/DIME-WebAuth-testers-review-20260916.zip` | 493519 | `89c65cce4d9b4b92e33cb281f2bf6880850dc55bedc366ed661e74befdb6b931` |
| `/tmp/dime-m42-testers/DIME-Web-testers-review-20260916.zip`     | 108053 | `06c5d0a434440dfec3d64bfea9e8645fe0cc933ed45e132d8bac5bd4a590c0d2` |

Web-auth ZIP contains only root `index.mjs`; bundle SHA-256 `786f88d32c2fccdf37f6f1ccaa89bfc0e00cc54052ea429c24a43cdca659518a`, byte-identical to the clean native SAM build. No owner provisioner, frontend, tests, fixtures, source maps or real credentials are bundled.

Create-only upload: `s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/c8c211cb8643f4cb8e7c279e9335ae915759e1c8/web-auth-testers.zip`, version `5O9XgdFAX2o3eHmDy2mcgdMGhkdACYKI`, AES256. [Upload/checksum evidence](dime-m42-testers-review/upload.json). Review artifact lifecycle expiry: 2026-12-16; re-review/repackage if unavailable then.

Gameplay bundle remains byte-identical: SHA-256 `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`. Deployed Lambda ZIP hashes are recorded separately in [baseline metadata](dime-m42-testers-review/lambda-before.json); ZIP hashes and uncompressed bundle hashes are different measurements. Guest assets and approved guest ZIP (`81fefdc80654ef0ab45d0665f2ad26482b09e1d29b9a311d8343deae4764e623`) remain unchanged. No frontend publication or Twitch upload occurred.

## Validation

**Final gates passed:** 440 Vitest tests across 61 files; 3 Python bridge tests; one clean complete Chromium release run with **167 passed, 0 failed, 0 retries (36.2 minutes)**; separate guest suite **5 passed**. Total browser cases: **172**. The focused 3-case tester run is not double-counted. [Validation summary](dime-m42-testers-review/validation.json).

Passed: locked npm install, ESLint, strict TypeScript, complete Vitest (440 tests/61 files), three synthetic Python provisioning tests, default/Twitch/web/guest builds, both Lambda builds, clean native SAM build and SAM validation, source/packaged/processed cfn-lint, current shared source/processed Guard profiles, expanded legacy staging source Guard and unchanged guest Guard, formatting and diff whitespace checks. The initial extra legacy Guard call used short-form YAML intrinsics; normalized JSON passed. Historical pre-shared Guard profiles are not applied to the current reviewed shared-account template.

Synthetic IAM: **17 cases, 49 decisions passed**, including invitation digest transactions, missing/mixed/wrong-account partition contexts, wrong table, and denial of Scan/Query/table administration. [Results](dime-m42-testers-review/iam-simulation-results.json). Existing role policies are structurally unchanged; simulations do not access records. IAM source analysis generated no applied policy change.

Browser/security cases include invitation validity/tampering/expiry/replay, wrong account, denial/state/token validation errors, revocation failure, session rotation/expiry/logout, disabled linking/no gameplay save, explicit future tester linking/conflicts/replay, guest isolation, and existing Extension navigation/scanner/mining/vacuum/recovery. All OAuth/provider identities are synthetic. Real Twitch/OIDC end-to-end tests are intentionally not performed before separate deployment/activation approval.

Performance (compiled synthetic browser, not real-device/network guarantees):

| Layout  | Frame p95 / worst ms | Transition average / p95 / worst ms |
| ------- | -------------------- | ----------------------------------- |
| Panel   | 16.7 / 16.8          | 79.5 / 87.4 / 88.5                  |
| Mobile  | 16.7 / 16.8          | 75.8 / 81.8 / 87.3                  |
| Desktop | 16.7 / 16.8          | 77.5 / 86.6 / 86.8                  |

Scanner, laser, vacuum, eight fragments/eight formations and Avenbolt stress were exercised. Mobile vacuum p95 was 16.8 ms. One canvas, bounded contextual DOM, no document scroll, no browser/request errors. [Full metrics and limitations](dime-m42-testers-review/performance.json). The separate [GC heap study](dime-m42-testers-review/heap-stability.json) completed 30 physical-travel cycles/180 transitions: 4,908,128 → 5,021,016 retained bytes after warmup (+2.3%), with constant 1 document, 141 nodes and 185 listeners; no errors. Growth slowed to roughly 8.5 KB per final six-cycle batch. This bounded-duration measurement does not establish zero long-term growth or prove absence of every leak.

## Activation prerequisites and rollback

1. Separately approve execution of this exact disabled-mode support candidate.
2. Review same-origin `/auth/*` routing: the currently published site intentionally has no working OAuth proxy. Preserve `/game/`, root, privacy and emergency/logout/deletion paths; disable shared caching and query/cookie logging on authentication paths.
3. Review the published privacy notice before real tester authentication and configure/verify the exact owner Twitch callback through authenticated console access.
4. Separately approve the parameter-only WebSignInMode=TESTERS plan, with AccountLinkingMode=DISABLED. Then issue an owner-only invitation and perform the runbook's designated-account checks without inspecting player records.
5. Later linking requires another review and a deliberate tester UI; current hosted Extension does not expose TESTERS linking. Do not enable it because sign-in succeeds.

Rollback first disables both gates, waits UPDATE_COMPLETE and drains the 20-second web-auth invocation window. Logout and deletion continuation stay available. Preserve all account/manifest/gameplay records; do not scan or erase them. Only then consider the previous web-auth artifact `dime-v2/review/6a89255d65b957159c8b2a5091512d6ee0ee7958/web-auth-emergency-6a89255.zip`, S3 version `Pa5iTi5B4j4foI1ACOOodpcjDvlxyNkW`, through a reviewed change set. Assess active recovery jobs/linked-account compatibility before code rollback. Guest and website need no rollback because they were not modified.

## Scope confirmation

No real invitation, secret-value retrieval, player-record read, scan, reset, migration, wipe, account creation or deletion occurred. No deployed Lambda, website object, privacy policy, OAuth/linking mode, conversion setting or Twitch publication changed. AWS writes were limited to the authorized create-only review artifact and unexecuted review change set. Amplify auto-creation and connected branches remain only `main` and `codex/react-extension-rebuild`; this branch is excluded.
