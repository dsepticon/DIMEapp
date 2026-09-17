# WAF sampling-only deployment

Source: `codex/dime-m4-graphics-web` at `ced4a0d41c527fb29cc21f7673a26b0e0d390fd0`.

**Native update applied, three-hour wait completed, and post-window confidentiality verification passed. Sign-in and linking stay DISABLED, conversion stays ENABLED. This is not approval to activate TESTERS.**

## Exact update

Account `861738068626`, region `us-east-1`, scope `CLOUDFRONT`.

ACL `arn:aws:wafv2:us-east-1:861738068626:global/webacl/CreatedByCloudFront-507f6793-f541-4211-a1ea-2105c3a73690/5209e705-d0b7-4259-8052-6254d1840fb7`.

Current full ACL/configuration and lock token matched the reviewed baseline. CloudFront distribution `EC269D02M2JLD` and its ACL association also matched. Immediately before the update, a second read confirmed the same lock token and complete configuration. The only effective differences were:

1. Web ACL VisibilityConfig.SampledRequestsEnabled: true → false.
2. Rate-based rule VisibilityConfig.SampledRequestsEnabled: true → false.
3. Amazon IP reputation managed-group reference sampling: true → false.
4. Common rule-set managed-group reference sampling: true → false.
5. Known bad inputs managed-group reference sampling: true → false.
6. SQLi managed-group reference sampling: true → false.

All six CloudWatchMetricsEnabled values remain true. Names, metrics, default action, order, priorities, statements, actions, overrides, labels, custom responses, DDoS configuration, associations and all other fields are identical. Full read-back equals the expected ACL. No enforcement, CloudFront, website, API, IAM, Lambda or table configuration changed.

The first CLI invocation failed local parameter validation because WAF returns an empty Description but the update API rejects an explicitly empty string. **No AWS update request was sent by that invocation.** Read-back including lock token remained identical. Omitting the optional empty Description passed local validation and preserved its empty effective value. The normalized native request was sent exactly once and succeeded. See [local rejection evidence](dime-m42-telemetry-deployment/local-validation-rejection.json).

## Time and lock tokens

- Native request started: **2026-09-16 21:14:47.215794 UTC**.
- AWS update acknowledged: **2026-09-16 21:14:48.252161 UTC**.
- Matching read-back: **2026-09-16 21:14:49.092297 UTC**.
- Sampling-window not-before: **2026-09-17 00:14:49.092297 UTC** — three hours after read-back, later than acknowledgement. This timestamp is a minimum waiting threshold, not authorization to activate OAuth.
- Before LockToken: `299f0cb7-8c51-47e2-8bfb-e25fd1ec0695`.
- Returned/read-back LockToken: `768bed38-8d9c-4b17-bdff-ce0043bc81a8`.

Raw before JSON SHA-256: `4fa82bb2281330211ad024c728a53b09121801e795a2f488ba39206744226fe7`; raw immediate-after JSON SHA-256: `d333141b1b72f0f6ef10f295277deb16cc8348ff224334d15daac2297567514b`. Canonical ACL-only hashes: before `c886f1464e9b9cdf579b5fc399cb598e47d9ebd7917eee634acd6053d9cf377e`, after `4ee860a46b23ee1396bc7c3fb3b2fc82f0e3f9fcc5958435e9ace49d43a6347b`. The fresh post-window ACL canonical hash equals the immediate-after hash; raw files differ only in JSON formatting. [Hash details](dime-m42-telemetry-deployment/acl-hashes.json).

[Complete timing evidence](dime-m42-telemetry-deployment/timing.json), [exact preflight comparison](dime-m42-telemetry-deployment/preflight.json), [before/after artifact hashes](dime-m42-telemetry-deployment/hashes.json).

## Enforcement and guest compatibility

Before and after: `/game/` 200, synthetic XSS query 403, exact persistent web API gate 401. The same blocked request remains blocked. Full CloudFront configuration and ETag remain identical. No root/privacy/site write or cache invalidation occurred.

All **five public guest Chromium cases passed in 7.8 minutes**, with one worker and zero retries. Panel, Mobile/reduced-motion and desktop journeys covered movement/travel, Ping/Analyze, mining/fracture/vacuum, local cargo/processing/sale/quests, independent tabs, refresh clearing progress and empty browser storage/cookies. Twenty unauthenticated live API/CORS checks passed, including all eight Extension routes, disabled login/callback/linking, idempotent logout and missing-proof deletion rejection. No console/network errors. After the three-hour threshold, ACL/lock token and full CloudFront configuration still matched the saved post-update state. WAF full logging remains absent, no CloudFront log delivery source exists, API access-log fields are unchanged, and the same 200/403/401 traffic matrix plus twenty API/CORS checks passed again. AWS session expiry then stopped the fresh-sentinel script at its control-plane mode check, before any fresh sentinel request. The owner renewed AWS sign-in, and fresh probes subsequently ran at **2026-09-17 00:32:44.949519–00:32:47.810358 UTC**, 1,075.857 seconds after the minimum threshold. Initial and delayed searches both passed. Across 60 CloudWatch count-only queries and 12 WAF sample-interface queries, there were **zero sensitive-field matches and zero sampled requests**. The delayed pass scanned ten ingested API records per sentinel query; gameplay and web-auth Lambda groups emitted no records in the fresh-probe window. Verification completed **2026-09-17 01:14:27.594626 UTC**. AWS session renewal was required again before the delayed pass; no new sentinel set or resource update was needed. No rollback was required. No real OAuth attempt or invitation occurred during or after the wait.

## Fresh sentinel coverage and final telemetry state

Fourteen requests used new synthetic invitation, code, state, nonce, Cookie/session, Authorization, CSRF and provider-token-shaped body values: invitation start, callback, invalid state, repeated invalid invitation, logout, linking rejection and missing-proof deletion continuation through both the website edge and direct staging API. None was a signed invitation, real credential, identity or valid session/deletion proof. Responses reflected none of the values. Disabled routes returned expected errors; logout expired cookies successfully. The website auth routes are still awaiting their separate routing rollout; edge probes exercise existing website telemetry, while direct API probes exercise the deployed disabled backend.

The not-before check and disabled-mode checks executed before fresh requests. Values were distinct from the pre-deployment set. Only sentinel digests, aggregate counts and non-sensitive status metadata are retained in this report; no raw log messages or sampled request contents were displayed or saved. [Freshness](dime-m42-telemetry-deployment/freshness.json), [probes](dime-m42-telemetry-deployment/sentinel-probes.json), [first search](dime-m42-telemetry-deployment/sentinel-search-first.json), [delayed search](dime-m42-telemetry-deployment/sentinel-search.json), [passed assertions](dime-m42-telemetry-deployment/verification-passed.json).

CloudFront standard logging remains disabled, real-time log associations and delivery sources remain absent, and WAF full logging and origin S3 access logging remain absent. API logs retain only requestId, routeKey, status and responseLatency; aggregate WAF metrics remain enabled. No body/header/query logger, tracing collector or analytics was added. Searches are bounded evidence, not a guarantee against future configuration changes: repeat this gate if telemetry or auth routing changes. Keep separate routing/privacy activation reviews in force.

Final stack status UPDATE_COMPLETE. WebSignInMode=DISABLED, AccountLinkingMode=DISABLED, ContentConversionMode=ENABLED. The separate TESTERS activation candidate remains CREATE_COMPLETE/AVAILABLE and unexecuted. All six WAF sampling flags remain false with the unchanged post-update lock token. Amplify patterns and connected branches are exactly `main` and `codex/react-extension-rebuild`; the report branch is excluded.

Current-run verification: five complete public guest Chromium cases; 20 API/CORS checks immediately after deployment and 20 after the wait; before/after/post-window 200/403/401 enforcement matrix; 14 fresh sentinel requests; 60 aggregate CloudWatch searches; 12 WAF sample-interface checks. No runtime source/artifact changed, so no Lambda/frontend build or infrastructure execution beyond the approved native update was required. The prior review's 491 unit tests remain applicable to unchanged code; they were not claimed as newly rerun here. Report formatting and diff checks passed.

## Rollback

The complete original GetWebACL JSON, ARN/ID/lock token and update payload are saved in [before.json](dime-m42-telemetry-deployment/before.json) and [rollback-original-token.json](dime-m42-telemetry-deployment/rollback-original-token.json). The original-token payload records the historical artifact; it must not be sent with that stale lock token or its invalid explicit empty Description.

[rollback-reference-only.json](dime-m42-telemetry-deployment/rollback-reference-only.json) omits empty Description and records the immediate post-update token. **Always obtain and compare a fresh ACL and latest lock token before a rollback; never blindly reuse a saved token.** If any post-window sensitive sentinel appears, restore the exact original effective ACL with only the latest LockToken substituted, keep both authentication modes disabled and report the telemetry source. Stop if unrelated configuration drift appears rather than overwriting another change. No rollback has been performed.

## Import and activation

The WAF import change set has not been executed. No CloudFormation-managed ACL was created or adopted. After successful verification, the exact obsolete import candidate was deleted in a separately recorded cleanup step. DescribeChangeSet now returns ChangeSetNotFound. Its empty `dime-web-telemetry-review` shell remains REVIEW_IN_PROGRESS; no stack deletion was performed and the ACL was never adopted. [Cleanup evidence](dime-m42-telemetry-deployment/import-cleanup.json). Existing TESTERS activation remains unexecuted; routing/privacy reviews remain independent requirements.

No player-data inspection, scans, resets, migrations, secret-value retrieval, real invitation issuance or public Twitch release occurred.
