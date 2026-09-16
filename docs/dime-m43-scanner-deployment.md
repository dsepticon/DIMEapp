# Scanner staging deployment — 2026-09-15 America/Edmonton

## Result

The matching scanner gameplay Lambda is deployed to `dime-v2-review-20260912` in account `861738068626`, region `us-east-2`. Stack: **UPDATE_COMPLETE**. The single execution completed successfully from **2026-09-16T02:15:09.228000+00:00** to **2026-09-16T02:15:28.785000+00:00** UTC (September 15 locally).

Source branch: `codex/dime-m4-graphics-web`. Clean local and remote starting commit: `17acd1fca6b535c3da2da4a7d44a384267d42fc0`. No gameplay source changed during deployment; this report and the activation checklist are the only new repository files.

**Twitch activation remains blocked by unavailable authenticated console control. Authenticated gameplay against the deployed backend is not yet verified.** No approved live synthetic authorization mechanism is available. No signing secret was retrieved, no token manufactured, and no real player was used as a test. Complete [the exact activation and live-test checklist](dime-m43-scanner-activation.md) before moving to Hosted Test.

## Artifact and deployment identity

- Lambda ZIP: `/tmp/DIME-Lambda-0.9.0-scanner-20260915.zip`, **487,986 bytes**, root entry only `index.mjs`.
- ZIP SHA-256: `d51696bd1fa3cac5930885d478596e71103c315a7f9d5906a58780bc6c2f9589`.
- Deployed Lambda `CodeSha256`: `1RaWvR+jysWTCIXUeFlucRA8MVp/nVkGpYeAvGwvlYk=` — exact ZIP digest match.
- Module SHA-256: `9eef9357f3ff21436d1c7a069e2a5d4fbde9233e8bf9f493e2e6ac3a80040c1a`. Rebuilt from the required commit; byte-identical to the reviewed archive and clean Linux SAM build.
- S3: `s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/17acd1fca6b535c3da2da4a7d44a384267d42fc0/DIME-Lambda-0.9.0-scanner-20260915.zip`.
- S3 version: `Eu_le4qHq9IHrc4248DiQR4KE2fbpK6p`. Create-only `If-None-Match: *`, AES256 server-side encryption, SHA-256 checksum verified against local bytes. Uploaded once; existing artifacts preserved.
- Configuration revision: `m43-scanner-17acd1f-20260915-1`.
- Change-set ARN: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m43-scanner-17acd1f-20260915-1/eff7425e-ce78-455b-9d40-5d35e2e7609f`.
- Change set: UPDATE, `EXECUTE_COMPLETE`; executed exactly once with client request token `m43-scanner-17acd1f-execute-1`.
- Operation ID: `f8aca204-9c5d-4db8-9062-39ba941755d2`.

## Exact safety review

| Proposed resource | Operation              | Explanation                                                                         |
| ----------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| EbsFunction       | Modify, no replacement | New reviewed ZIP and non-secret ConfigurationRevision environment update            |
| StagingHttpApi    | Modify, no replacement | Dynamic existing Lambda ARN reevaluation; processed API body structurally identical |

Actual resource update events name **EbsFunction only**; the unchanged API reevaluation required no resource update event. Stack completion events confirm success. No replacement, removal, import, new resource, new route or new permission occurred.

Source/deployed SAM definitions matched apart from artifact CodeUri and generated `SamResourceId` metadata, which was preserved in the candidate. Every processed-template definition was structurally identical except `EbsFunction.Properties.Code`. The only stack parameter changed was `ConfigurationRevision`; every other parameter used its previous value. Deployed processed template equals the reviewed candidate, and outputs are unchanged.

Conversion remains **ENABLED**, tester tags remain **empty** (verified using a boolean projection, never printing tags). Lambda is Active / Successful on Node.js 22. Secrets remain existing dynamic references; values were not inspected.

Before/after metadata equality checks covered:

- Exact table `dime-v2-staging-review01-dime-v2-review-20260912-player-state` and ARN `arn:aws:dynamodb:us-east-2:861738068626:table/dime-v2-staging-review01-dime-v2-review-20260912-player-state`.
- Table ID, ACTIVE status, key schema, indexes, billing, encryption, deletion protection, TTL, PITR status and configured recovery period.
- IAM role trust, boundary, inline policies and attached policies.
- Lambda route-scoped invoke policy; API route definitions and stage settings, including throttling/log configuration. Only generated deployment ID/timestamp fields were excluded from stage comparison.

No table items were read or written by the verification. No table scan, wipe/reset, player-field inspection, item-key access, mineral rebalance, IAM mutation, website/OAuth infrastructure change or public publication occurred.

## Validation and post-deployment checks

- Prior exact-source release gate: **355 unit/integration tests / 54 files; one clean complete Chromium run, 152 passed, zero retries**. Covers Panel, Mobile, desktop, legacy gameplay, scanner, refresh, rejection/replay, mining, fracture, vacuum and physical travel using synthetic in-memory authorization. Full suites were not needlessly rerun for this documentation/deployment-only follow-up.
- Prior locked install, lint, strict typecheck, formatting, all application builds, clean SAM build/validation, content/archive audits and production performance passed. [Source release evidence and screenshots](dime-m43-scanner-release.md).
- Rebuilt Lambda and compared exact bytes with reviewed ZIP and SAM output: passed.
- Fresh source and packaged cfn-lint; source Guard; CloudFormation `validate-template`: passed.
- Actual CloudFormation-processed candidate cfn-lint and every processed Guard rule: passed.
- `describe-events` change-set predeployment checks: no validation errors. Post-deployment `describe-events --filters FailedEvents=true`: **zero failed events**. `describe-stack-events` was not used.
- **Eight live unauthenticated route checks passed**, each `401 UNAUTHORIZED`: `GET /state`, `POST /actions`, `POST /profile/reset`, `GET /v4/state`, `POST /v4/actions`, `POST /v4/content/preview`, `POST /v4/content/convert`, `POST /v4/profile/reset`.
- **Two live CORS checks passed**: exact extension origin receives 204 with matching allow-origin; untrusted origin receives no allow-origin. The complete processed CORS definition is unchanged.
- Deployed hash, revision, conversion, tags, route/permission/stage metadata and processed-template equality: passed.

These live checks establish route availability, authorization rejection and CORS; they do **not** establish authenticated legacy or v4 gameplay. Ping, analysis, refresh persistence, rejection recovery, mining, fracture and vacuum passed locally on this source. Their authenticated live acceptance remains pending the external session below.

## Twitch artifact and remaining action

- Version target: mutable **0.9.0**, otherwise create **0.9.1**. No upload or version-state change was performed; current console status could not be inspected.
- ZIP: `/tmp/DIME-Twitch-0.9.0-scanner-20260915.zip`.
- Windows: `C:\Users\dylan\Downloads\DIME-Twitch-0.9.0-scanner-20260915.zip`.
- **107,725 bytes**, SHA-256 `189c4ac1893d0957cbada62352742952b92cd22fbb75dce7193c413c07d326e8`; copies reverified byte-identical after backend deployment.
- No authenticated browser-control tool is exposed; conventional local browser-control endpoints 9222 and 9223 are unavailable. No login/MFA bypass was attempted.
- Manual action: sign into DIME's Twitch console, upload the exact archive, verify processing and Panel/Mobile paths, run **Local Test**, then **Hosted Test only after acceptance passes**. Use an approved authenticated synthetic profile for live regression/recovery testing. Do not submit for public review or release.

The [activation checklist](dime-m43-scanner-activation.md) gives exact configuration, keyboard/touch scenarios, recovery checks and Hosted Test gates. Backend deployment is complete; Twitch upload and authenticated live verification are the remaining external blocker.

## Evidence and rollback

Local evidence: `/tmp/dime-m43-scanner-deploy/` contains reviewed templates, upload/version response, metadata comparisons, events, public-check results and `deployment-summary.json`. These are operator artifacts, not application assets.

Previous artifact remains versioned at `dime-v2/review/1d1e13cd9a855c69cadf31488279b767b0ab01f3/DIME-Lambda-4.1-node-targeting-fixed.zip`, version `.XsdAMyFDBGDc6pwgDWNcJ.A.zRmbQqv`. Any rollback must use a separately reviewed non-replacing change set, preserve ENABLED/empty tags and all stateful resources, and coordinate with the previous client because it lacks `analyzeNearby`. No save rollback, table restore or reverse conversion is appropriate.
