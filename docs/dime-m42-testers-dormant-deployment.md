# Dormant tester support deployed; activation reviews pending

2026-09-16. Branch `codex/dime-m4-graphics-web`; starting local/remote HEAD `3546a09519e548216ec6c2fb6c97f7ab4464956a`, clean. Runtime source remains the reviewed `c8c211cb8643f4cb8e7c279e9335ae915759e1c8` artifact; this follow-up adds review infrastructure, tests and documentation only.

**Dormant deployment succeeded. WebSignInMode=DISABLED, AccountLinkingMode=DISABLED, ContentConversionMode=ENABLED; conversion tester tags are empty. No real invitation or live OAuth flow occurred.**

## Approved execution

Executed once, with request token `dime-testers-dormant-20260916-1`:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-testers-c8c211c-review-1/a32a3a58-aa9b-4014-a55e-18141c233463`

Immediately before execution, account `861738068626`, region `us-east-2`, stack `dime-v2-review-20260912` was UPDATE_COMPLETE; the exact candidate was CREATE_COMPLETE/AVAILABLE. Local ZIP bytes and the uploaded version's downloaded bytes matched the review. All parameter values matched the deployed baseline. The processed comparison matched the reviewed candidate exactly.

| Change                                    | Result                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| WebAuthFunction Modify, Replacement=False | Reviewed code artifact deployed                                    |
| StagingHttpApi Modify, Replacement=False  | Dynamic ARN/body reevaluation; processed API body stayed identical |
| Add / Remove / Replace                    | 0 / 0 / 0                                                          |

The reviewed parameter declaration additions/descriptions were preserved; **no mode value changed**. No gameplay Lambda, table/schema/index/TTL/PITR/encryption/billing, IAM, route/permission, CloudFront, website, log, alarm, output or secret-reference change occurred.

CloudFormation operation `1c5d086d-d6bd-4081-b664-b78bbcb727a0` started **19:55:12 UTC** and completed **19:55:27 UTC**, September 16. Stack result UPDATE_COMPLETE; exact change-set ARN reports EXECUTE_COMPLETE. Resource events show WebAuthFunction UPDATE_IN_PROGRESS → UPDATE_COMPLETE and stack completion; the structurally identical API required no effective resource update. No failed deployment events. [Scoped events](dime-m42-testers-dormant-review/deployment-events.json), [preflight](dime-m42-testers-dormant-review/preflight.json), [approved changes](dime-m42-testers-dormant-review/approved-changes.json), [deployed result](dime-m42-testers-dormant-review/deployment-result.json).

## Artifact and configuration verification

- Deployed web-auth ZIP: `/tmp/dime-m42-testers/DIME-WebAuth-testers-review-20260916.zip`, **493,519 bytes**, SHA-256 **`89c65cce4d9b4b92e33cb281f2bf6880850dc55bedc366ed661e74befdb6b931`**.
- S3: `s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/c8c211cb8643f4cb8e7c279e9335ae915759e1c8/web-auth-testers.zip`, version **`5O9XgdFAX2o3eHmDy2mcgdMGhkdACYKI`**. No artifact was replaced or reuploaded during this deployment.
- Lambda CodeSha256 matches that ZIP: `icZczk2bS5LjPLKB8r9ogIUNxVvtw2btZh50vv22uTE=`.
- Gameplay Lambda CodeSha256 remains **`4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=`**. Its source/bundle/resource were not changed.
- Reviewed frontend ZIP remains SHA-256 `06c5d0a434440dfec3d64bfea9e8645fe0cc933ed45e132d8bac5bd4a590c0d2`; it was not published. Public `/game/` continues serving the existing guest build.
- Both Lambda functions are Active, LastUpdateStatus=Successful. Runtime mode fields were queried selectively; tester-tag verification returned only an empty/not-empty boolean, never values. [Hashes](dime-m42-testers-dormant-review/lambda-after.json), [modes](dime-m42-testers-dormant-review/modes-after.json), [all unchanged routes](dime-m42-testers-dormant-review/routes-after.json).

The three owner-supplied secret ARNs were verified via DescribeSecret metadata, with no value retrieval. CloudFormation uses their existing secure references. OAuth client ID/reference separation remains unchanged.

## Live HTTP and no-record verification

**20 live unauthenticated checks passed** against the staging API. No real invitation, session cookie, authorization credential or deletion proof was supplied. Response evidence contains only paths, status, fixed codes, redirect booleans and cookie-expiry counts.

| Probe                                                                        | Result                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Login, including syntactically shaped but invalid synthetic invitation input | 503 WEB_SIGN_IN_UNAVAILABLE; no redirect                                                 |
| Callback with invalid synthetic code/state                                   | 503 WEB_SIGN_IN_UNAVAILABLE; no exchange path; transient cookies expired                 |
| Link intent / accept                                                         | 503 WEB_SIGN_IN_UNAVAILABLE                                                              |
| Status                                                                       | 200; exactly signInAvailable=false, linkingAvailable=false; no-store                     |
| Logout twice without a session                                               | 200 signedOut=true both times; all three auth/transient cookies expired, Secure/HttpOnly |
| Deletion resume without proof                                                | 401 UNAUTHORIZED; no configuration 503                                                   |
| Deletion resume with wrong origin                                            | 403                                                                                      |
| Eight existing Extension gameplay routes without credentials                 | 401 UNAUTHORIZED                                                                         |
| Exact Extension-origin / untrusted-origin preflight                          | Allowed exact origin / no allow-origin for untrusted origin                              |

A supplemental web-origin OPTIONS probe returned 204 without an allow-origin header, as expected from the unchanged Extension-only API CORS configuration. An initial probe incorrectly expected cross-origin web access and failed that assertion. The proposed website auth routing is same-origin and requires no API CORS expansion; direct cross-origin web access remains unsupported.

[HTTP results](dime-m42-testers-dormant-review/http-results.json). Valid ownership-checked deletion continuation, valid synthetic-session logout, callback/provider non-invocation and zero repository writes under disabled mode remain covered by the complete unit suite. Live valid-session/deletion tests were intentionally not attempted because they would require real account credentials or creating records.

Before execution, tester-record absence was established from code/provisioning provenance: the previously deployed exact bundle did not implement the invitation ledger/eligibility writer, public sign-in was disabled, and no real invitation or OAuth flow had been issued. After execution, tested disabled paths return before admission/provider/account creation, and unauthenticated gameplay rejects before state access. The synthetic invitation-shaped probe was not a minted or usable invitation. **No identity, session, manifest, save, receipt or invitation-use record was created in staging by this work.** This conclusion uses handler control flow, zero-write tests and credential-free requests, not a scan or inspection of real records. It does not claim to audit hypothetical out-of-band database writes.

## Guest and Extension regressions

Five **real public HTTPS** guest browser journeys passed in 7.6 minutes, covering keyboard/touch target cycling and 318×500, 360×640 reduced-motion and desktop layouts. Movement, physical travel, Ping, Analyze, charge/fracture, vacuum, local cargo/processing/market/quest flow, fresh reload and independent tabs passed. Browser storage/cookies stayed empty, requests were static GETs only, and no credential-bearing or authenticated mutation request occurred. No console/page/network errors. See the `public-guest-browser-*` evidence files.

Public root, `/privacy` and `/game/` returned HTTPS 200 without redirects. Privacy remained byte-identical, SHA-256 `6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c`. Distribution configuration and ETag **E3GPEVCIK9UL3J** remain identical. **Zero S3 writes, distribution updates or invalidations.** [Public checks](dime-m42-testers-dormant-review/public-static.json), [unchanged-site evidence](dime-m42-testers-dormant-review/website-unchanged.json).

Public browser samples: Panel p95/worst 16.7/16.8 ms and 84.74% unobstructed; Mobile 16.8/16.8 ms and 89.47%; desktop 16.7/16.8 ms and 97.89%. Each used one canvas and had no document scrolling. These short browser samples are not a new long-session or physical-device performance guarantee.

The complete Extension Chromium suite passed **167/167 cases in 36.2 minutes**, with one worker and zero retries. These use the compiled current client and synthetic authorization/repositories; live authenticated player mutations were not used. Unchanged deployed gameplay hash and live rejection/CORS checks provide the deployment compatibility boundary.

## Three activation review gates

1. **Scoped routing — prepared, not approved/applied.** [Exact routing/WAF review](dime-m42-auth-routing-activation-review.md): ten exact `/auth/...` paths, one existing-API HTTPS origin, ten forwarding policies, one scoped response policy and one method guard. Managed CachingDisabled has all TTLs zero. Preserve every existing origin/behavior and default/root/privacy/game/persistent-API path. No broad wildcard or global headers. Tests cover path isolation and bounded forwarding.
2. **Privacy — candidate prepared, not published.** [Privacy/callback review](dime-m42-privacy-callback-review.md) includes exact before/after text, HTML, hashes and mobile/desktop rendering. Preserve unrelated policy text; require a fresh conditional-write publication review and actual effective date.
3. **Twitch callback — owner-confirmed.** On September 16 the owner confirmed the separately registered public client ID `4228okut24ll35bisjmygbquaf6svm` has exactly `https://destroyaindustriesminingextension.com/auth/callback`. Evidence is owner console attestation, not an automated console inspection or live OAuth flow. Three secret references exist; no Extension client ID or secret reference is reused. [Evidence](dime-m42-testers-dormant-review/callback-review.json).

**Blocking security finding:** WAF sampling is enabled at the ACL and all rules, with no DataProtectionConfig. No WAF logging destination exists, but samples can still retain sensitive request fields. No samples/logs were read. Review a separate confidentiality change before real invitation/OAuth traffic. A proposed metadata-only WAF redaction configuration is provided for review; it is not silently included in or applied with the CloudFront plan. No real tester credential was exposed during these checks.

## Unexecuted parameter-only activation candidate

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-testers-activation-3546a09-review-1/dc47b822-bd22-4f43-b0db-0ec3207a3c5c`

Status **CREATE_COMPLETE / AVAILABLE; UNEXECUTED**. Proposed values: WebSignInMode=TESTERS, AccountLinkingMode=DISABLED, conversion ENABLED. The only parameter-value change is WebSignInMode. Two non-replacing modifications: WebAuthFunction Environment from that parameter and dynamic StagingHttpApi reevaluation. Zero Add/Remove/Replace; proposed processed template is structurally identical to the deployed template, with the same code, IAM, table, routes, permissions and references. No failed predeployment events. [Exact activation review](dime-m42-testers-dormant-review/activation-review.json), [parameters](dime-m42-testers-dormant-review/activation-parameters.json).

Do not execute it until scoped routing, WAF confidentiality and privacy publication pass separate owner review and their verification gates. Preserve/reconfirm the owner-verified callback if configuration changes. Do not generate an invitation merely because support is deployed. Account linking remains independently disabled.

## Validation and rollback

483 unit tests passed across 62 files, including 43 new exact-routing/forwarding cases. Lint, strict typecheck, formatting, diff checks, auxiliary-template CloudFormation validation/cfn-lint/Guard and activation processed cfn-lint/Guard passed. The initial sandbox unit invocation could not spawn/bind local test processes; the complete unrestricted rerun passed. An initial local HTTP verification filename shadowed Python's stdlib `http`; renaming the local script resolved that harness error before any probe from that invocation. No application fix or unreviewed runtime change was needed.

The prior full build/SAM/IAM/security gates remain applicable to the byte-identical deployed reviewed artifact; no new Lambda build or code change is introduced by these review documents. The complete postdeployment browser gate passed: 167 synthetic Extension cases plus five public guest cases, **172 browser cases total**.

Dormant code rollback, if separately authorized: keep both modes DISABLED; create a fresh change set restoring only the prior web-auth S3 Code reference from `/tmp/dime-m42-testers-deploy/before-original.json`. Previous artifact: `dime-v2/review/6a89255d65b957159c8b2a5091512d6ee0ee7958/web-auth-emergency-6a89255.zip`, version `Pa5iTi5B4j4foI1ACOOodpcjDvlxyNkW`; original Lambda ZIP hash `fj71uQ9Eq6dF/Mg+i6oUf47Yev0lcT6sH3Ah7N1Eha0=`. Review only non-replacing web-auth code/API reevaluation; do not revert gameplay, table, IAM, manifest or deletion protections. Execute only with separate approval, then verify hash/modes/logout/deletion/Extension routes. The prior artifact version remains available and its S3 checksum matches that original Lambda hash. [Rollback artifact metadata](dime-m42-testers-dormant-review/rollback-artifact.json). No rollback was needed or executed.

After any future activation, first disable both gates through a reviewed parameter update, wait UPDATE_COMPLETE and drain the 20-second web-auth invocation window. Preserve logout and verified deletion continuation, revoke sessions using reviewed controls, and assess recovery jobs before code rollback. Never scan/delete account records as rollback. Guest/root/privacy need no rollback from this deployment because they were not changed.

## Scope and Git

No table read, scan, wipe/reset, real player-data inspection, invitation issuance, live OAuth, linking, migration, secret-value retrieval, website/privacy publication or Twitch release occurred. AWS writes were limited to execution of the exact approved dormant change set and creation of the unexecuted activation review. Secret resolution during the authorized CloudFormation operation remained service-side through existing secure references; no values entered tools, reports or Git.

Final authenticated checks confirmed account 861738068626, stack UPDATE_COMPLETE and the activation candidate CREATE_COMPLETE/AVAILABLE. Amplify automatic branch patterns and connected branches are exactly `main` and `codex/react-extension-rebuild`; this report branch is excluded. Commit/push only this isolated branch after final validation. No main/rebuild branch, force push or history rewrite is involved.
