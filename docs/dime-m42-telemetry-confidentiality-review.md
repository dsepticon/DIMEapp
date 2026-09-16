# OAuth telemetry confidentiality — prepared, not deployed

2026-09-16. Source branch `codex/dime-m4-graphics-web`, base `0e849a5b535bc545ce4ac11892eba3d784b69390`. AWS account 861738068626. No runtime source, Lambda, website, privacy policy, authentication mode, gameplay data or secret value changed.

## Decision and measured finding

**Do not activate TESTERS yet.** The pre-change sentinel test found **26 synthetic sensitive-field occurrences in four WAF sampled requests**. Thirty count-only CloudWatch queries found zero sentinel matches. This is positive evidence of the existing sampling risk, not a passing confidentiality gate. No real OAuth invitation, code, token or identity was used. Raw sampled requests and log messages were neither displayed nor saved.

The instruction to stop before WAF changes prevents post-deployment zero-sample verification in this run. Existing samples can remain queryable for the preceding three hours; disabling sampling is not retrospective deletion. After the future approved deployment, allow propagation, use a fresh test window entirely after convergence, and keep real OAuth disabled until the old sampling window has elapsed and repeat verification passes. [AWS sampling API](https://docs.aws.amazon.com/waf/latest/APIReference/API_GetSampledRequests.html).

## Exact WAF proposal

ACL: `arn:aws:wafv2:us-east-1:861738068626:global/webacl/CreatedByCloudFront-507f6793-f541-4211-a1ea-2105c3a73690/5209e705-d0b7-4259-8052-6254d1840fb7`.

Only six boolean changes are proposed:

| Visibility configuration                            | Before sampling | Proposed sampling | Metrics         |
| --------------------------------------------------- | --------------- | ----------------- | --------------- |
| Web ACL                                             | true            | false             | true, unchanged |
| AWS-RateBasedRule-IP-300-CreatedByCloudFront        | true            | false             | true, unchanged |
| AWS-AWSManagedRulesAmazonIpReputationList reference | true            | false             | true, unchanged |
| AWS-AWSManagedRulesCommonRuleSet reference          | true            | false             | true, unchanged |
| AWS-AWSManagedRulesKnownBadInputsRuleSet reference  | true            | false             | true, unchanged |
| AWS-AWSManagedRulesSQLiRuleSet reference            | true            | false             | true, unchanged |

There are no customer-owned RuleGroupReferenceStatement resources or custom OAuth rules in this ACL. The four AWS-managed references are covered at their enclosing rule VisibilityConfig; managed group internals are not customer-editable resources. A future custom auth rule/group must explicitly disable its own sampling. Preserve all rule statements, priorities, actions, overrides, rate limits, default action, metric names, DDoS settings and association. Do not add logging or request matching rules. Losing per-request samples across this website, including root and guest paths, is intentional because the ACL-level setting is global; request routing and enforcement stay unchanged and aggregate metrics stay enabled. The ACL is attached only to distribution EC269D02M2JLD. Extension API traffic goes directly to the separate staging API and is not captured by this website behavior change.

[Exact six-field diff](dime-m42-telemetry-review/configuration-diff.json), [original ACL](dime-m42-telemetry-review/waf-before.json), [proposed template](dime-m42-telemetry-review/sampling-disabled-template.json).

Logging redaction does not protect sampled requests. This proposal disables sampling; it does not rely on RedactedFields or the previous DataProtectionConfig proposal. [AWS VisibilityConfig](https://docs.aws.amazon.com/java/api/latest/software/amazon/awssdk/services/wafv2/model/VisibilityConfig.html).

## CloudFormation ownership and unexecuted review

The CloudFront-created ACL has no CloudFormation ownership tags. DescribeStackResources using both its ID and its composite `name|id|scope` identifier returned no owning stack. It cannot be changed by an UPDATE to the existing gameplay stack.

Prepared an **IMPORT**, not a sampling-changing UPDATE:

`arn:aws:cloudformation:us-east-1:861738068626:changeSet/m42-telemetry-import-0e849a5-review-1/397852f5-915c-4fbc-9054-7ccbcc5c56c9`

Stack review shell: `dime-web-telemetry-review`, us-east-1. Candidate **CREATE_COMPLETE / AVAILABLE, unexecuted**. Exactly **one Import: WebsiteWebAcl**, zero Add/Modify/Remove/Replace, no IAM resources/capabilities. DeletionPolicy and UpdateReplacePolicy are Retain. The import template preserves current sampling=true and all current resource properties. The API's empty Description is represented by an omitted optional Description because the CloudFormation schema rejects an explicit empty string. No ACL adoption or configuration change has occurred; the stack is only REVIEW_IN_PROGRESS.

[Import template](dime-m42-telemetry-review/import-template.json), [change set](dime-m42-telemetry-review/change-set-review.json), [validation events](dime-m42-telemetry-review/change-set-events.json).

CloudFormation prohibits configuration changes during import. After separate owner approval of adoption, execute import, verify IMPORT_COMPLETE and drift, then create a fresh UPDATE from `sampling-disabled-template.json`. Review exactly one non-replacing ACL modification containing the six flags above. **That UPDATE cannot be created against an imported resource until import is executed.** Do not execute import or substitute a new ACL in this review. [CloudFormation import restrictions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/import-resources-manually.html).

An exact native `UpdateWebACL` request is also provided as a review-only alternative, with optimistic LockToken. It is not an executable CloudFormation change set and has not been applied. If the owner elects that alternative, discard/review the unused import candidate, refresh and compare the complete ACL and LockToken, and separately approve the six-field update. Do not use both management paths.

## End-to-end telemetry inventory

| Layer                                       | Current configuration / evidence                                                                                             | Proposed change                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| CloudFront legacy standard logs             | Enabled=false, IncludeCookies=false                                                                                          | None; fail activation if enabled              |
| CloudFront v2 log delivery                  | No delivery source for this distribution in us-east-1                                                                        | None; recheck before activation               |
| CloudFront real-time logs                   | No association on default or any ordered behavior                                                                            | None; auth behaviors must remain unassociated |
| CloudFront functions / Lambda@Edge          | Existing guest function has no logging; no Lambda@Edge associations                                                          | None                                          |
| Website S3 origin access logging            | No LoggingEnabled configuration                                                                                              | None                                          |
| WAF samples                                 | ACL and all five rules enabled; synthetic values captured                                                                    | Disable all six sampling flags                |
| WAF full logging                            | GetLoggingConfiguration: WAFNonexistentItemException; no destination                                                         | Keep absent                                   |
| API Gateway access logs                     | Exactly requestId, routeKey, status, responseLatency                                                                         | None                                          |
| API execution/body logging                  | HTTP API; no body trace/execution-log feature configured                                                                     | None                                          |
| Web-auth Lambda                             | No console/logger statements or request event logging; JSON system logs WARN                                                 | None                                          |
| Gameplay Lambda                             | Explicit event/status/sanitized correlation-ID allowlist; fixed configuration error code                                     | None                                          |
| Tracing / collectors                        | Both functions PassThrough, no layers, no OTEL/DD/Sentry/exec-wrapper environment variable names; no application tracing SDK | None                                          |
| CloudWatch subscriptions and metric filters | None on the three stack log groups                                                                                           | None                                          |
| Dashboards / alarms                         | No DIME-prefixed dashboards; exact stack alarms use AWS aggregate Lambda/API metrics                                         | None                                          |
| Browser analytics/error reporting           | No analytics/remote error SDK; production React error handling suppresses private component state                            | None                                          |

This inventory is scoped to the authorized distribution, its origin, attached ACL and DIME stack; it is not a claim to audit unrelated account resources. No log bodies, raw traces, player records or secret values were read. PassThrough is not a promise that no system-level trace can ever exist: do not add request attributes/headers/query values to tracing, and reject any future instrumentation that captures them.

No logging configuration change is currently needed. If full WAF logging appears before activation, stop and review it: keep auth request details out of logs, including successful requests, and retain aggregate metrics separately. Logging filters can use actions/labels; do not assume a URI-specific filter exists without a reviewed auth label rule. Redact complete query strings and Authorization, Cookie, CSRF, Referer and any credential-bearing headers as defense-in-depth. Never log request bodies or response headers containing codes, state, invitations/nonces, session identifiers, provider tokens or Set-Cookie. WAF request logging does not normally capture response Set-Cookie; this is not permission to capture it elsewhere. CloudFront standard query logging is an activation blocker, not something short code expiry makes acceptable.

## Sentinel evidence and limitations

Fourteen requests: seven scenarios through the existing website edge and the same seven directly through the staging API. Scenarios: invalid invitation start, callback-shaped input, invalid state, repeated invalid invitation, logout, linking rejection, deletion continuation. Values cover invitation, code, state, nonce, CSRF, session, authorization and synthetic provider-token/body fields. The response-cookie sentinel is sent in a synthetic request header; no real response cookie/token is created. Current auth routing is not deployed, so edge requests test the existing website telemetry path, not successful auth routing.

Backend results: login/callback/link 503 without redirect, logout 200 with three expired cookies, deletion without valid proof 401. No sentinel echoed in responses. Invalid session values deliberately cannot match the 43-character credential format; deletion payloads cannot pass proof validation. No repository/provider dependency is reached. Repeated invalid invitation is a disabled-path test, **not** a claim that a valid one-use invitation was issued/replayed; synthetic in-memory invitation tests cover that separately.

CloudWatch: ten distinct sentinel classes × three stack log groups, 30 complete aggregate-only queries per pass, zero matches. The initial pass scanned no records due to ingestion delay. A delayed second pass scanned 27 API records and eight gameplay Lambda records per sentinel query; web-auth emitted no log records in this window. This is 60 queries total, with zero matches in both passes. WAF: bounded GetSampledRequests across ACL and all five rule metric names, max 500 each, counts only. Four ACL samples contained 26 field matches; the five rule queries returned no samples. Zero in a probabilistic sample alone would not establish confidentiality. [Probe results](dime-m42-telemetry-review/sentinel-probes.json), [search counts](dime-m42-telemetry-review/sentinel-search.json).

Raw logs and samples are never saved. AWS CLI processes its sampled response in memory and projects only counts before output; no unrelated request contents are examined. Search time windows are bounded to the synthetic probe run. Logs can arrive late, so repeat delayed searches after deployment. API access logs contain no sentinel values by design; route/status evidence remains available.

## Validation and compatibility

The complete unit/integration suite passed **491 tests across 63 files**, including eight new sampling-diff and disabled-handler telemetry tests. Lint, strict typecheck, formatting, cfn-lint for import/proposed templates, Guard, CloudFormation template validation and import predeployment validation passed. Twenty live unauthenticated API/CORS regression checks passed. All five public guest Chromium cases passed in 7.7 minutes, with one worker and no retries: keyboard/touch cycling and full journeys at 318×500, 360×640 reduced-motion and 1280 desktop. Physical movement/travel, Ping/Analyze, mining/fracture/vacuum, local cargo/processing/sale/quests, independent tabs, fresh reload, no stored progress/cookies and no console/network errors passed. The prior complete Extension Chromium result remains 167/167 on unchanged runtime bytes; this review reran full unit coverage and live unauthenticated Extension routes/CORS, not real player mutations. This review changes only offline infrastructure preparation, focused tests and evidence; runtime artifacts remain byte-identical to deployment. No Lambda or frontend rebuild is needed. [Artifact hashes](dime-m42-telemetry-review/artifact-hashes.json) identify both templates and the native review alternative. [Validation totals](dime-m42-telemetry-review/validation.json).

## Privacy and rollback

No privacy text is published. The unpublished candidate must state that request sampling/full request logging is disabled for auth, aggregate security counts remain, and session/invitation/deletion record retention is separate from telemetry. Do not promise zero collected auth samples before the configuration change and historical sample window clear. Existing log retention and account-data retention are unchanged. Synthetic sentinels contain no real identities and require no account deletion.

Before execution capture a fresh ACL/LockToken and confirm exact six-field diff, metrics enabled, no full logging, no new groups/associations and unchanged website/default routes. If import alone fails, retain the ACL; never delete/recreate or detach it. If sampling update fails, keep both auth modes DISABLED and diagnose without changing enforcement rules. Restoring sampling=true is **not a safe default rollback after real OAuth traffic**. Prefer leaving samples disabled; if restoration is separately approved for diagnostics, first disable auth, revoke/expire test access through reviewed mechanisms, drain requests and ensure no sensitive auth traffic can arrive. Never re-enable samples merely to restore a prior template. Native rollback needs a fresh LockToken; CloudFormation rollback needs a reviewed single-ACL change set. No gameplay data rollback is involved.

## Revised activation sequence

1. Review ownership path and sampling-only configuration; keep existing TESTERS activation candidate unexecuted.
2. Separately approve import and then the one-resource UPDATE, or approve the native six-field update alternative. Verify all six flags false and metrics unchanged.
3. Confirm WAF/CloudFront full request logging remains absent. Allow WAF propagation, then three hours for historical samples. Use fresh synthetic sentinels; inspect ACL/all rule sample interfaces and aggregate-only logs. Require zero sentinel matches and no post-change auth samples. Check delayed ingestion again. Stop on any match.
4. Review/apply exact auth routing from the prior gate without adding telemetry. Repeat sentinels through the now-routed domain while modes remain DISABLED, including all login/callback/logout/link/deletion paths. Verify no origin records created via control-flow tests and invalid probes, not database scans.
5. Review/publish privacy candidate separately; preserve/reconfirm the owner-attested public OAuth client/callback configuration.
6. Re-review parameter-only TESTERS candidate against the then-current stack. Only owner-approved execution may set sign-in TESTERS. Linking remains DISABLED. Generate no real invitation before these gates pass.

Amplify automatic branch patterns and connected branches remain exactly `main` and `codex/react-extension-rebuild`; this isolated review branch is excluded.

No WAF/CloudFront update, OAuth activation, invitation issuance, website/privacy publication, record inspection, reset, wipe, or secret-value retrieval occurred. Only the unexecuted import review was created in AWS.
