# TESTERS activation attempt and safe rollback

2026-09-16 America/Edmonton (2026-09-17 UTC). Source: `b3511e757e1e0a1c0a67cd9890a8b25db40d9e39`, branch `codex/dime-m4-graphics-web`. Local and remote HEAD matched before work; source was clean.

## Result

Published the exact approved privacy candidate and deployed the reviewed ten exact authentication behaviors. The parameter-only TESTERS activation completed, but its first shaped-invalid-invitation check returned a backend initialization `503` instead of the expected invitation rejection `401`. The same fixed error occurred through CloudFront and directly through API Gateway. **Returned sign-in to DISABLED using a separately compared parameter-only rollback.** No real invitation was generated and no live OAuth exchange was attempted.

Final staging stack: **UPDATE_COMPLETE**. `WebSignInMode=DISABLED`, `AccountLinkingMode=DISABLED`, `ContentConversionMode=ENABLED`; conversion tester tags remain empty. Public sign-in and linking remain unavailable. The verified privacy publication and auth routing remain deployed; neither caused the backend failure.

## Privacy publication

Only `s3://destroyaindustriesminingextension.com/privacy` was written, using `If-Match` against the captured ETag. September 16 was the publication date in the owner's America/Edmonton timezone. The candidate was not regenerated or edited.

| Item       | Before                                                             | Published                                                          |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Bytes      | 8,502                                                              | 15,372                                                             |
| SHA-256    | `6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c` | `8d99be55d7b4d198d8918c9667d977e604214e184d598e6e99d7b6f1c5123d7e` |
| ETag       | `36b650808ecff4e13988e43a3159e62d`                                 | `903a7ee2d01189377454ebe1be941744`                                 |
| Version ID | Not returned by S3                                                 | Not returned by S3                                                 |

Preserved `text/html; charset=utf-8`, `inline`, `public, max-age=300`, AES256 encryption and empty user metadata. The review's OAuth/session/invitation/linking/retention/deletion disclosures, Guest Demo explanation and correction of the obsolete conversion-disabled sentence were published verbatim; unrelated wording and contact links were preserved.

Invalidation **`IBZIH8GWDT5WVRI9XAY8NTBPOY`**, path **`/privacy` only**, completed. Public HTTPS and fresh S3 reads matched the candidate byte-for-byte, including a final recheck. [Backup](dime-m42-testers-activation/privacy-before.html), [metadata](dime-m42-testers-activation/privacy-before-metadata.json), [rollback manifest](dime-m42-testers-activation/privacy-rollback.json), [verification](dime-m42-testers-activation/privacy-verification.json).

## Routing deployment

Distribution **`EC269D02M2JLD`** reached **Deployed**. ETag changed from `E3GPEVCIK9UL3J` to **`E15GZDBBQBW2HX`** using the verified `If-Match` condition.

Auxiliary stack `dime-web-auth-routing-review` reached CREATE_COMPLETE. Executed change set:

`arn:aws:cloudformation:us-east-1:861738068626:changeSet/m42-auth-routing-b3511e7-1/975a2fb1-43f8-40c6-8ef3-40cb2ec17cdb`

Exactly **12 additions**: ten bounded origin-request policies, one scoped no-store response-headers policy, one method/query-name CloudFront function. Zero modifications/removals/replacements in this auxiliary change set. No IAM, Lambda, table or API resources added. [Exact resources and deployed IDs](dime-m42-testers-activation/routing-resources.json).

Appended one HTTPS API origin and only these exact paths: `/auth/login`, `/auth/callback`, `/auth/status`, `/auth/session`, `/auth/logout`, `/auth/link/intent`, `/auth/link/accept`, `/auth/unlink`, `/auth/delete/intent`, `/auth/delete/resume`. No wildcard behavior. All use the reviewed CachingDisabled policy, bounded per-route forwarding and scoped no-store headers. No viewer Host forwarding, real-time logging or global response policy.

Existing origins, default behavior/document, errors, five existing ordered behaviors, `/game/*`, four guest API gates, root, privacy, Extension/gameplay routes and WAF association are unchanged. Readback differed only by HTTP method list ordering and explicit `GrpcConfig.Enabled=false` on new behaviors; narrowly normalized comparison passed. Root and Guest Demo public hashes remained identical. [Before](dime-m42-testers-activation/cloudfront-before.json), [resolved proposal](dime-m42-testers-activation/cloudfront-proposed.json), [deployed](dime-m42-testers-activation/cloudfront-final.json).

## Activation and rollback

Executed activation:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-testers-activation-3546a09-review-1/dc47b822-bd22-4f43-b0db-0ec3207a3c5c`

Execution acknowledged **2026-09-17 01:33:39.665754 UTC**; UPDATE_COMPLETE verified. Exactly two non-replacing modifications: WebAuthFunction environment and StagingHttpApi dynamic reevaluation. The sole parameter difference was WebSignInMode DISABLED → TESTERS. The deployed/proposed processed templates were structurally identical; the UsePreviousTemplate candidate's Original representation was the existing processed template. Both code artifacts, IAM, DynamoDB, routes and other infrastructure definitions were unchanged.

The invalid invitation had synthetic data only, an accepted outer shape and an invalid signature. Expected response: `401` from InvitationError, before storage or provider initialization. Actual response at **both origins**: `503`, `{"message":"Authentication is unavailable."}`. This is the outer handler's initialization failure response, not the invitation rejection response. `/auth/status` remained non-sensitive and returned both availability flags false. No redirect occurred. [Fixed-response evidence](dime-m42-testers-activation/activation-failure-probes.json).

The precise failing configuration check is **not established**: the handler intentionally hides its exception, and no secret values or raw application events were retrieved to diagnose it. Reviewed non-secret origin, region, table and conversion references were consistent. Do not label this an invalid secret or change credentials without evidence. A separately reviewed, non-sensitive initialization diagnostic is needed before another TESTERS attempt; it must expose fixed categories only, never values, lengths, tags or identity data.

Executed rollback:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-testers-rollback-b3511e7-1/6851b6b2-9938-4fac-a1b8-2b5442f28fda`

Execution acknowledged **2026-09-17 01:44:36.684832 UTC**; UPDATE_COMPLETE verified. Exactly the same two non-replacing resource reevaluations; only WebSignInMode returned to DISABLED. Parameter values match the pre-activation baseline. Processed definitions remain identical. No failed CloudFormation deployment events were found. [Activation operations](dime-m42-testers-activation/activation-change-set.json), [rollback operations](dime-m42-testers-activation/rollback-change-set.json), [events](dime-m42-testers-activation/dime-v2-review-20260912-events.json).

### Unchanged artifact hashes

| Lambda   | SHA-256 (base64, deployed CodeSha256)          |
| -------- | ---------------------------------------------- |
| Web-auth | `icZczk2bS5LjPLKB8r9ogIUNxVvtw2btZh50vv22uTE=` |
| Gameplay | `4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=` |

Both Active / Successful. Web-auth reviewed ZIP SHA-256 remains `89c65cce4d9b4b92e33cb281f2bf6880850dc55bedc366ed661e74befdb6b931`. No artifact build/upload occurred.

## Verification

- Complete unit suite: **491 passed / 63 files**. Initial sandbox attempt blocked two child-process tests; the complete unrestricted rerun passed.
- Routing tests: **43 passed** (also included in complete suite). cfn-lint, Guard, CloudFormation template validation and describe-events predeployment checks passed.
- Complete public Guest Demo Chromium suite: **5 passed, 7.7 minutes**, covering 318/360/1280 layouts and keyboard/touch target cycling. Initial invocation lacked the required TypeScript loader and collected no tests; the complete corrected invocation passed.
- **20 HTTP/CORS checks before activation, 20 after rollback**: disabled login/callback/linking, non-sensitive status, idempotent logout with three Secure/HttpOnly expired cookies, missing deletion proof 401, wrong-origin deletion 403, all eight unauthenticated Extension route rejections, exact Extension CORS and untrusted-origin rejection.
- No authenticated existing-player session was used. Existing-player mutation compatibility is covered synthetically, not claimed as a live real-save test. No player records were inspected to prove absence of writes.
- Real intended-user matching, session creation/rotation/expiry, confirmed invitation consumption/replay and authenticated web state remain **untested live**. Synthetic unit coverage passed. No verified numeric tester ID was supplied, but initialization failure must be resolved before requesting it or generating an invitation.

## Confidentiality and rollback readiness

All six WAF sampling settings remain false; metrics remain enabled; ACL configuration and lock token match the pre-rollout state. CloudFront standard logging is disabled and no real-time log attachment was introduced. API access logs remain limited to requestId, routeKey, status and responseLatency. No Lambda logging code changed.

Fourteen synthetic requests exercised invitation start/repeat, callback, invalid state, logout, linking rejection and deletion continuation through both origins after rollback. All returned expected statuses, no redirects, and no sentinel response echoes. Telemetry search results are recorded alongside the report; real invitations or credentials were never used as sentinels.

Initial and delayed searches completed **60 aggregate CloudWatch queries and 12 WAF sampled-request checks**, with **zero sensitive sentinel matches and zero returned WAF samples**. The delayed queries scanned 35 API records and 8 gameplay Lambda records per sentinel; web-auth emitted no records. The initial zero-record result was not accepted alone. No raw log messages or sampled requests were retained. [Delayed evidence](dime-m42-testers-activation/sentinel-search.json), [initial evidence](dime-m42-testers-activation/sentinel-search-first.json). There are no enabled CloudFront or full WAF log streams to search under the unchanged reviewed telemetry configuration.

Privacy rollback: restore the committed backup using a conditional write against the then-current ETag and its saved metadata; invalidate only `/privacy`. Routing rollback: update the distribution with the saved pre-rollout configuration and then-current ETag, wait Deployed; do not revert the WAF confidentiality controls. No authenticated account was created during this run, so no live shutdown session depends on the newly added behaviors. Do not delete auxiliary resources while associated. Authentication rollback has already been executed and verified.

No table scan, wipe, reset, player-data inspection, secret-value exposure, profile merge, gameplay mutation, invitation generation or Twitch Extension publication occurred. No game/root website file changed. Reports and public metadata contain no real invitation, numeric Twitch ID, cookie, authorization code or token. Amplify continues to allow only `main` and `codex/react-extension-rebuild`, excluding this branch.
