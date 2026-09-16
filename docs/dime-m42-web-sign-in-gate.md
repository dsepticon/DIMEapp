# Independent web sign-in gate

## Scope and mode contract

This revision follows `20ea153` and leaves the approved account manifest, no-scan deletion protocol and gameplay resource boundary intact. It is preparation only: no deployment, linking activation or website publication is authorized by this report.

`WebSignInMode` defaults to `DISABLED` with allowed values `DISABLED`, `TESTERS`, `ENABLED`. The web-auth Lambda receives `DIME_WEB_SIGN_IN_MODE`. Only the exact string `ENABLED` permits new web access in this revision. Missing, malformed, unknown and TESTERS values fail closed. `AccountLinkingMode` remains a separate default-disabled parameter; enabling sign-in never enables linking.

| Mode     | Login/callback                                                   | Existing web session/game API                       | Linking                                   | Emergency operations                                                                 |
| -------- | ---------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| DISABLED | Denied before credential initialization or code parsing/exchange | Denied without extending sessions or touching saves | Denied even if linking flag is enabled    | CSRF-protected logout and capability-verified deletion continuation remain available |
| TESTERS  | Denied; eligibility not implemented or provisioned               | Denied                                              | Denied                                    | Same as DISABLED                                                                     |
| ENABLED  | Normal OAuth and session validation                              | Existing authenticated contract                     | Available only when independently enabled | Existing guarded behavior                                                            |

The gate runs both before `webHandler` configures credentials and at the HTTP adapter boundary. Disabled paths return HTTP 503, fixed code `WEB_SIGN_IN_UNAVAILABLE`, and `Web sign-in is not available yet`. They do not redirect, decode credentials, parse OAuth callback values, call the provider, access DynamoDB, or write authorization state, identities, accounts, manifests, sessions, receipts or gameplay saves. Unknown routes/methods also fail closed. The separate Extension handler and its eight gameplay routes do not use this gate.

Requests already executing in an old Lambda environment when a future configuration update begins can finish under their original configuration. Disabling is not cancellation of an already accepted transaction. Operational shutdown verification must wait for UPDATE_COMPLETE and drain prior invocations before asserting that all requests use the new gate. No runtime mechanism or per-request table write was added for this purpose.

## Non-sensitive capability response and frontend

New route: `GET /auth/status`, unauthenticated and `Cache-Control: no-store`.

The entire JSON payload contains only `signInAvailable` and `linkingAvailable` booleans. It reveals no configured mode, tester eligibility, account information, secret identifier or configuration revision. Linking availability is false unless sign-in and the independent linking flag both permit it.

The web frontend fetches this response before fetching a session or gameplay state. Missing, malformed or failed responses suppress login and render the unavailable message. No availability is inferred from build flags or the existence of a login URL. The Extension UI never makes this web capability request. Existing privacy links remain visible.

## Emergency shutdown and recovery

Existing accounts and saves remain untouched when access is disabled. Existing sessions are not extended by denied requests and expire on their existing deadlines. New link, unlink, deletion initiation, reset and web gameplay actions are denied.

`POST /auth/logout` still requires the existing cookie session, exact origin, JSON request and CSRF proof. It validates existing local session/account/credential ownership, invalidates the credential epoch, deletes the session and grant, and attempts provider revocation. It no longer calls provider validation/refresh or rewrites a session first. Provider revocation failure cannot restore the locally invalidated session. A missing/expired session or missing CSRF proof does not authorize account operations.

`POST /auth/delete/resume` remains available with its existing exact-origin and opaque continuation-capability checks. The HttpOnly deletion cookie supports resumption after page reload; explicit proof also supports the existing completion receipt replay. Its REVOKED, PURGED and COMPLETE responses provide deletion-status recovery only after proof validation. No public account-status lookup was introduced. The existing deletion tests now switch sign-in off after initiating a synthetic deletion and complete/replay it after reload.

## TESTERS: reserved, unavailable

There is no tester allowlist, eligibility record, special token or bypass in this revision. Selecting TESTERS cannot admit anybody. No raw Twitch identifiers, emails or tester tags are accepted in CloudFormation.

A future separately reviewed design should use a bounded, expiring, single-use admission capability issued through an owner-controlled provisioning process. Both admission before redirect and verified OAuth subject eligibility at callback must be checked; possession of a shared URL alone is insufficient. Bind each authorization attempt to the browser's state/nonce and the expected pseudonymous subject digest, consume admission transactionally, cap identities and attempts, and revoke eligibility independently. Never rely solely on frontend gating or a callback-only check. Secure issuance, subject enrollment, maximum tester count and support/recovery ownership require a separate owner-reviewed provisioning design. None is silently invented here.

## Secrets: deployment requirements versus request handling

**Yes, the three real OAuth secrets must already exist for this disabled deployment.** The reviewed template continues to use unconditional Secrets Manager dynamic references in WebAuthFunction's environment. CloudFormation resolves them when creating/updating that resource, regardless of the application gate. The deploying principal needs the required resolution permissions; the Lambda gains no Secrets Manager read permission. The disabled login/callback/status request paths do not initialize or read those credentials. Emergency logout and deletion continuation still require the real configured credentials to perform their existing revocation/recovery work.

This distinction follows [AWS's dynamic-reference documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-secretsmanager.html). No claim is made that CloudFormation itself avoids resolving secrets during a disabled deployment.

Only the owner's public client `4228okut24ll35bisjmygbquaf6svm` and these exact complete references are used:

- `arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/oauth/client-secret-s5kwbq`
- `arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/identity-key-kL7iYK`
- `arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/auth-encryption-key-hAAuXq`

No placeholder credentials, secret ARN substitutions or plaintext inspection are permitted. Metadata checks cannot establish secret contents or encoding correctness; these remain runtime configuration checks on future authorized activation.

## Infrastructure comparison

Relative to the deployed stack: 18 additions, three non-replacing modifications, zero removals/replacements. The additions are WebAuthFunction, WebAuthExecutionRole, WebAuthLogGroup, and fifteen exact-method/path invoke permissions (WebRoute0–14). The modifications remain EbsFunction, EbsExecutionRole and StagingHttpApi from the accepted shared-save review.

Relative to the stale manifest proposal: one new GET `/auth/status` integration and invoke permission, one default-disabled configuration parameter and web-auth environment reference, and corrected web-auth code. No new DynamoDB or IAM action, table schema/index/TTL/PITR/encryption/billing/policy change, alarm, output, existing route, CORS, stage or throttle change. The gameplay module is byte-identical to the previous reviewed manifest artifact and reuses its pinned S3 version. It still differs from deployed gameplay by the previously approved canonical-resolution integration; this revision does not add gameplay behavior.

IAM source analysis and the complete synthetic policy matrix are rerun, but no deployed-role behavior or live player-data test is claimed. The replacement change set must reach CREATE_COMPLETE and pass processed comparison before the old unexecuted proposal is removed. Neither proposal may be executed during this task.

## Rollback and activation limits

The previous web-auth artifact has no sign-in gate and is not a safe rollback for a future disabled-sign-in deployment. Retain this gate-aware web-auth artifact (or a later compatible one) when reverting UI or configuration. The previously reviewed manifest/deletion-aware gameplay rollback restriction still applies; old unguarded writers must not be restored after account lifecycle operations.

Activation is not part of this task. ENABLED needs a separate reviewed configuration change and real OAuth verification. TESTERS remains unavailable until its eligibility/provisioning design is approved and implemented. No test account enrollment, synthetic authorization against deployed gameplay, website publication or live account action is performed here.
