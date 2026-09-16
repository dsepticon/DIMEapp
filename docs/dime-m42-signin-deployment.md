# Disabled web-auth deployment — 2026-09-16

## Result: backend deployed; verification failed; website publication stopped

The exact owner-approved change set was executed **once**. Stack `dime-v2-review-20260912` reached `UPDATE_COMPLETE` at **2026-09-16 15:38:56 UTC**, after starting at 15:38:11 UTC. No failed CloudFormation operation events were returned.

**Blocking failure:** unauthenticated POST `/auth/logout` and POST `/auth/delete/resume` both return HTTP **503**, with the fixed body `{"message":"Authentication is unavailable."}`. Neither redirects nor sets a cookie. This is the outer web-handler catch response, rather than the expected emergency-route authentication/validation rejection. The exact underlying exception is not established: the handler intentionally suppresses it. Secret values and resolved environment values were not inspected. No claim is made that an OAuth credential is incorrect.

Per the owner's stop condition, no corrective infrastructure update, website publication, OAuth activation or rollback was attempted. The existing website and `/privacy` remain untouched. The deployed sign-in and linking gates remain disabled.

## Source, execution and exact resources

Branch: `codex/dime-m4-graphics-web`. Local and remote source/report HEAD before this task: `86dd24b7b898b218d0a9ec40f44c95f05803d1d6`; runtime artifact checkpoint: `289cadc60975782785cbc6f90321741119a406eb`. This task changes only this report and its filtered evidence file.

Executed change-set ARN:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-signin-289cadc-review-1/845e0974-41de-41a1-92ba-ad1dfd2de709`

Execution request token: `m42-signin-289cadc-owner-execution-20260916`. CloudFormation update operation ID: `c50a58fd-8eec-4f12-9345-066f9199d694`.

Immediately before execution, the live change set was CREATE_COMPLETE / AVAILABLE and the stack UPDATE_COMPLETE. Its processed template, parameters and resource changes exactly matched the saved owner-reviewed candidate. The deployed baseline also matched the saved comparison baseline. Artifact bytes and versioned S3 checksums matched. The three exact owner-supplied Secrets Manager ARNs had AWSCURRENT metadata and were not pending deletion; no secret-value API was called.

- **18 additions:** `WebAuthExecutionRole`, `WebAuthFunction`, `WebAuthLogGroup`, and all fifteen `WebAuthFunctionWebRoute0Permission` through `WebAuthFunctionWebRoute14Permission` resources. Route14 is exclusively GET `/auth/status`; the other fourteen are the previously reviewed web-auth/web-gameplay routes.
- **Three non-replacing modifications:** `EbsExecutionRole`, `EbsFunction`, `StagingHttpApi`.
- **Zero removals, replacements or imports.** No additional resources were executed.

The gameplay role receives only the accepted conditional `dynamodb:ConditionCheckItem` statement. The new role and all invoke permissions match their reviewed policies exactly. No additional IAM expansion occurred. Existing eight Extension routes, CORS, stage settings, logs, alarms and outputs remain structurally identical. The deployed template equals the proposed processed template, including the reviewed secret references.

Read-only table metadata before/after confirms unchanged table ID/ARN, key schema, indexes, billing, encryption, deletion protection, TTL and PITR configuration. PITR recovery-window timestamps advance normally. No item operation was used for this verification.

## Deployed hashes and modes

| Artifact                      | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| Deployed gameplay ZIP         | `e246dd9056187c1daf4d26a70dc68ab5cc0e6ef621371a8ba9b6ca0f53a42af6` |
| Deployed web-auth ZIP         | `b4680f29a1a0ddebe604433be9789f24345760c2e9b9978c76ffd216dc1a0e1d` |
| Reviewed, unpublished web ZIP | `697746c93d5ad6caf6fbd387964022b949286d53a093641844c6f341756733e6` |

Both Lambda CodeSha256 values match their respective ZIP hashes; both functions are Active with LastUpdateStatus Successful. The gameplay artifact is the separately approved manifest-aware update, not the previously deployed scanner-only artifact.

Artifacts remain in `dime-v2-staging-artifacts-861738068626-us-east-2`:

- Gameplay: `dime-v2/review/6bec1b223a1fc12e77765268cca7996cbc3972fb/gameplay-manifest-6bec1b2.zip`, version `lxI5GaSEt4Tj16..CRrK9si7.egWtlkY`.
- Web auth: `dime-v2/review/289cadc60975782785cbc6f90321741119a406eb/web-auth-signin-289cadc.zip`, version `zk0Gfs_XbXb8zcKNhbqT1aNCPjWpwxyi`.

Final stack parameters: **WebSignInMode DISABLED**, **AccountLinkingMode DISABLED**, **ContentConversionMode ENABLED**, ConfigurationRevision `m42-signin-289cadc-review-1`. ContentConversionTesterTags retains the previously reviewed empty value through UsePreviousValue; its NoEcho value was not exposed or independently retrieved. TESTERS admission remains unimplemented and unavailable; no eligibility mechanism was added.

## Verification results and limits

- All eight Extension endpoints reject unauthenticated requests with **401 UNAUTHORIZED**.
- `/auth/status`: **200**, exactly `{"signInAvailable":false,"linkingAvailable":false}`, Cache-Control no-store.
- Twelve disabled routes passed: login, callback with invalid synthetic query strings, session, web state, link intent/accept, unlink, deletion intent, actions, preview, conversion and reset. Each returned **503 WEB_SIGN_IN_UNAVAILABLE**, no redirect and no cookie.
- Emergency logout failed; separate confirmation found deletion resume has the same outer-handler failure. Website deployment stopped at this gate.
- The disabled preflight occurs before credential initialization and repository access in the hash-matched artifact. No live authenticated player request or record inspection was used to prove no writes. No account/save/manifest/session creation was requested through an authenticated path.
- Route inventory contains all **23 expected routes**. CORS configuration is unchanged and still limited to the exact Extension origin. The live preflight phase of the smoke script was not reached after emergency-route failure; no passing live preflight result is claimed for this run.
- Deployed IAM inline policies equal the reviewed policies. The prior synthetic IAM suite passed 16 cases / 46 decisions; it was not rerun against deployed roles after the stop condition.
- Count-only CloudWatch queries examined the deployment window and returned no matches for the checked error and credential-pattern expressions. Only eight log records were scanned; no runtime REPORT match was returned. This limited result does **not** prove absence of configuration errors or all possible leakage. The observed HTTP failure remains authoritative; no raw log messages were retrieved.
- Prior complete validation at the unchanged runtime source passed **400 unit tests / 57 files** and **161 Chromium tests**, plus build, SAM, cfn-lint, Guard, formatting and synthetic production checks. These are predeployment results. Full authenticated live Extension state/mutation, scanner, mining, travel, reset and recovery regression was not performed: it would require approved synthetic live authorization or real-player access, and the backend stop condition was reached. No live gameplay compatibility claim beyond the rejection, artifact and template checks is made.

## Website and rollback

Reviewed ZIP: `/tmp/dime-m42-signin-review/DIME-Web-0.9.0-signin-disabled-289cadc.zip`, **106,938 bytes**. Target remains https://destroyaindustriesminingextension.com.

**No website object was replaced.** Object versions, conditional uploads, backup objects and CloudFront invalidation ID: **not applicable; none created**. `/privacy` was not written. No website rollback was necessary, and no tested website rollback package is claimed for this aborted publication.

Read-only CloudFront inspection also confirms unresolved publication prerequisites: only the existing S3 website HTTP-only origin is present, no `/auth/*` or `/api/*` behaviors exist, and no response-headers policy is attached. The reviewed frontend requires same-origin `/auth/status`; a separately reviewed distribution plan remains necessary before public-domain verification. No direct CloudFront configuration change was made.

The backend remains at the approved disabled deployment. Do not roll it back to an older gate-less web-auth build or non-manifest-aware gameplay writer. Any corrective deployment must preserve disabled gates and receive its own source/template review. No existing account was linked, reset, migrated, converted or deleted by this task.

## Remaining action

Diagnose the emergency-path initialization failure using non-disclosing validation; prepare a reviewed correction if needed. Re-run the blocked backend gate before website work. Resolve same-origin routing, HTTPS origin and CSP through the reviewed website infrastructure process, then perform backups, conditional publication, one path-limited invalidation and public smoke testing. Sign-in and linking must stay disabled.

Evidence: [filtered deployment evidence](dime-m42-signin-deployment-evidence.json); full local operational metadata is in `/tmp/dime-m42-signin-deploy`. No player data, item keys, tokens or secret values are included. No table scan/wipe/reset, website change, unrelated resource change or Twitch upload/public release occurred.
