# Web activation preflight — 2026-09-16

## Result: stopped before execution

Reviewed source: `8c0300b5c3ac9c20c8a3c53a29b928d1986c4865` on `codex/dime-m4-graphics-web`. No runtime source or infrastructure was changed during this preflight.

The owner requires both linking and public web sign-in to remain disabled during the backend rollout. The reviewed artifact implements the linking switch, but **does not implement a public sign-in switch**. Executing it would not satisfy that requirement.

`server/webHttp.ts` dispatches GET `/auth/login` directly to `auth.begin()` and GET `/auth/callback` directly to `auth.callback()`. Neither checks `extension.linkingEnabled`. `server/webAuth.ts` creates authorization state in `begin()` and can create accounts and sessions in `callback()`. `server/webHandler.ts` supplies only the linking flag. The proposed template has `AccountLinkingMode=DISABLED`, but no independent public-sign-in parameter or environment flag.

Withholding the website does not disable the public API endpoints. Invalid credentials, missing callback routing or an unpublished login button are not security gates. No live login was attempted to demonstrate the issue because that could create account records.

## Verified AWS state

- AWS account: `861738068626`; region: `us-east-2`.
- Stack: `dime-v2-review-20260912`, still `UPDATE_COMPLETE`.
- Candidate: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-manifest-6bec1b2-review-1/8cd7d4c1-e1d8-46ff-b673-060de0991e5f`.
- Candidate status: `CREATE_COMPLETE / AVAILABLE`, unexecuted.
- Exact live deployed and candidate processed templates match the prior reviewed evidence structurally.
- Exactly 17 Add, 3 Modify, 0 Remove, 0 replacements.
- Adds: WebAuthFunction, WebAuthExecutionRole, WebAuthLogGroup, and WebAuthFunctionWebRoute0Permission through WebRoute13Permission.
- Non-replacing modifications: EbsFunction, EbsExecutionRole, StagingHttpApi.
- No DynamoDB schema, index, TTL, PITR, encryption, billing, table-policy or other table-definition change.
- Existing eight gameplay routes and their permissions remain unchanged in the proposal. The fourteen new method/path permissions are the reviewed web-auth/API/lifecycle routes.
- Existing logs, alarms, outputs, stage, throttling and CORS definitions are unchanged; the only added logging resource is the reviewed web-auth log group.
- Candidate conversion remains ENABLED and linking DISABLED. Tester tags use the previously reviewed empty value; masked parameter output was not interpreted as plaintext verification.
- Prepared parameters match the exact owner-supplied public OAuth client ID and all three complete secret ARNs. Dynamic references were inspected as template expressions only; no secret values or resolved Lambda environments were retrieved.

See [the complete candidate review](dime-m42-account-manifest-change-set.md) for every resource, route, IAM statement, artifact hash and S3 version.

## Required correction and remaining gates

Prepare an independently configurable, default-disabled public-sign-in gate covering both login initiation and callback completion before any OAuth exchange, authorization-state write, account creation or session issuance. Keep it separate from account linking. Test disabled behavior, existing-session policy, callback replay and controlled activation. Rebuild the web-auth artifact and replace the unexecuted candidate; re-review code/configuration differences while preserving the exact resource inventory and table protections. Do not silently substitute a new artifact under the reviewed S3 version.

Designated-account OAuth verification needs a separately reviewed controlled test path or activation step; enabling public sign-in for everyone merely to test one account would contradict the initial disabled rollout. Do not invent credentials or an authentication bypass.

The requested deployed-role IAM simulations and live Extension regression have not run: the new roles/backend were not deployed. Prior passing local suites and custom-policy simulations remain historical preparation evidence, not deployed verification. No real player save was loaded or mutated for this preflight.

Website publication, object backups/version IDs, public-byte verification, CloudFront invalidation, live OAuth, and live desktop/mobile testing were not performed because they depend on successful backend verification. Existing website objects, including `/privacy`, remain untouched. The separate website routing/CSP/HTTPS-origin/rollback review remains required before publication. No new rollback action is needed because nothing was deployed.

No change set was executed. No linking, deletion, reset, conversion, migration, table scan, gameplay-data read/write or secret-value access was performed by this run. This does not assert that unrelated active clients made no changes during the same interval. The Twitch Extension was not published publicly.
