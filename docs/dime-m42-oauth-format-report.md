# OAuth secret whitespace-only correction

Branch `codex/dime-m4-graphics-web`, starting commit `82b79f21a893c0aa2e58916f6aead23811815eca`.

**Final outcome:** the whitespace-only candidate passed parser, readiness and Twitch-provider validation, and Helix verified both exact logins. Invitation provisioning then failed before a completed batch or delivery. The required rollback restored the previous secret version as AWSCURRENT and returned sign-in to DISABLED. Linking is DISABLED, conversion ENABLED. No live owner OAuth flow began. [Final result](dime-m42-oauth-format/final-result.json).

## Authorized transformation and validation

Only the configured web OAuth client secret was corrected. The candidate equals the old string with leading/trailing whitespace removed, verified against JavaScript `trim()` and the existing `oauthSecret` parser. No interior character, encoding, envelope, credential identity, secret resource, identity key, encryption key or Extension credential was changed.

The candidate was created as **AWSPENDING** while the old version remained AWSCURRENT. It was read back through the bounded runtime resolver and compared in constant time with the permitted transformation. The parser returned only Boolean evidence. Deployed IAM-only readiness passed 11/11 before promotion.

A separate pending-credential check obtained an app token from official Twitch, validated the reviewed public client/no-user/no-scope contract, and revoked the temporary token. This test did not create a DIME session or start user OAuth. Promotion was gated on all parser, read-back, provider and readiness checks. The prior current version was retained as AWSPREVIOUS; no version was deleted.

Secret material existed only in runtime process memory and an anonymous RAM-backed CLI input descriptor, which was truncated and closed. It did not enter source files, shell arguments/history, tool output or reports. Core dumps were disabled. No values, hashes, prefixes or fingerprints of secret material were emitted. The compatibility resolver continued using authenticated runtime resolution; no access-program override was used.

Validated candidate version: `3d2124fd-ec32-404e-8978-bd7cbf813a59`. Original/restored current version: `861c81fb-3a3e-4826-aea0-369e55bd7683`. [Stage metadata](dime-m42-oauth-format/promoted-stages.json).

## Web-auth configuration refresh

Executed exactly once:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-oauth-format-82b79f2-refresh-1/9c2c977c-9d50-47ff-acef-403a95612f20`

Only `WebAuthFunction.Environment.Variables.DIME_AUTH_KEY_REVISION` changed to `web-oauth-format-20260918-1`. The API definition was structurally identical. The final change set contained two non-replacing modifications (web-auth environment and API reevaluation), zero additions/removals/replacements, and no code, IAM, table, routes, website, CloudFront, WAF or privacy changes.

CloudFormation template validation, cfn-lint, processed shared/runtime Guard rules and describe-events checks passed. The initial pretty-printed template exceeded CloudFormation's inline size limit; compact JSON preserved the exact structure and passed. An initial read-only AWS credential-refresh failure was retried after account verification succeeded. Neither preparation issue executed a change set or changed secret values.

The stack reached UPDATE_COMPLETE. Both Lambda artifacts and all 23 routes remained unchanged. The reviewed web-auth ZIP SHA-256 remains `c80c8793428b49810d98a73476f270fc4eb14941269250e9e7534abd5afef9b5`.

Post-refresh AWSCURRENT passed the existing strict parser and another Twitch app-token validation/revocation check. Deployed readiness passed 11/11. Twenty disabled-mode HTTP/CORS checks and three public guest-layout/movement/storage smoke checks passed. Sign-in and linking remained DISABLED throughout this phase; conversion remained ENABLED, with empty tester tags.

Initial and delayed post-refresh telemetry searches each returned zero matches across 30 CloudWatch count queries and six WAF sampled-request checks. Fourteen malformed synthetic probes caused no sensitive response echoes. No raw log events or samples were retained. WAF sampling remained disabled, aggregate metrics enabled, and CloudFront standard/realtime logging disabled. Telemetry configuration was not modified.

## TESTERS activation

Executed once after dormant verification passed:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-oauth-format-82b79f2-activation-1/5429cadc-96f6-4826-bb88-c86d1dd08e89`

The processed template was identical to the refreshed template. The only parameter difference was WebSignInMode DISABLED → TESTERS. Linking remained DISABLED, conversion ENABLED, and the new current secret version unchanged. Two non-replacing environment/API reevaluations; zero code, IAM, route, table, website or secret-version changes.

TESTERS reached UPDATE_COMPLETE. AWSCURRENT readiness passed 11/11; AWSPENDING, AWSPREVIOUS, arbitrary stages and HTTP/CloudFront-shaped readiness events were rejected. Twenty-five public HTTP/CORS checks and three guest smoke layouts passed. Uninvited, malformed, expired and invalid-signature requests returned expected client errors, linking remained unavailable, and logout/deletion-proof rejection continued working. No valid invitation had been used during these checks.

Both TESTERS telemetry searches also completed with zero sensitive matches (30 CloudWatch queries and six WAF checks per search). Across dormant and TESTERS phases, all four searches passed. WAF/CloudFront telemetry boundaries remained unchanged.

## Scope and remaining interactive checks

Official Twitch Helix returned both owner-designated logins exactly, with distinct valid numeric IDs. The temporary app token was validated and revoked. [Non-identifying lookup evidence](dime-m42-oauth-format/helix-verification.json). Numeric IDs and full provider responses remain in process memory; no ID is guessed or copied from fixtures. Invitations are delivered only after all required checks pass and are excluded from committed evidence.

No authenticated browser-control connection is available in this session. Account holders must complete Twitch's interactive login/consent in their own browser sessions. Exact callback, intended-user matching, secure session rotation/refresh/logout/expiry and consumed-valid-invitation replay must not be claimed as live successes before that interaction. The reviewed callback is `https://destroyaindustriesminingextension.com/auth/callback`. Linking remains disabled and no gameplay-save mutation is authorized.

## Provisioning failure and completed rollback

The owner utility's exact-match Helix stage succeeded for both designated logins and revoked its temporary app token. The subsequent local provisioning process failed before returning a completed invitation batch. The controller captured its child output in memory and initiated rollback, but did not retain the child's specific failure category. Therefore the original failure must not be attributed to the deployed application, an invalid key, a format mismatch or a transport timeout without further evidence.

Executed once:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-oauth-format-82b79f2-rollback-1/b8667c21-faa9-4ac3-a9c1-c218dec64d54`

The exact parameter-only update returned WebSignInMode to DISABLED, with linking DISABLED and conversion ENABLED. It reached UPDATE_COMPLETE. The previous OAuth secret version was then restored to AWSCURRENT; the validated corrected version remains retained under AWSPREVIOUS. No version was deleted. Lambda code, routes and other resources remained unchanged; the non-secret refresh revision was retained. Readiness passed 11/11 and 20 disabled-mode HTTP/CORS checks passed after rollback.

A read-only follow-up used an independently random synthetic key and synthetic subject with the unchanged signer, and separately checked only the real identity-root parser result. Both passed. No real invitation was generated by that diagnostic. These successes do not establish the cause of the earlier failure. No further real invitation attempt or reactivation was made after rollback.

Zero invitations were delivered or used. No completed batch was recorded. The aborted child may have constructed an intermediate invitation in memory before failing; its exact progress was not retained, so this report does not claim that no intermediate bytes were ever generated. None were persisted, exposed or submitted to the DIME authentication endpoints.

The next provisioning attempt needs fixed-category capture around each runtime-resolution and signer boundary before retrying the real batch. Do not expose child stdout/stderr or relax validation. Both usernames can be resolved through official Helix again; no manual numeric-ID lookup is required. The corrected credential is validated and retained, but must not be re-promoted or TESTERS re-enabled as part of this failed attempt.

## Rollback procedure

On a validation, identity-match, telemetry or initialization failure: return WebSignInMode to DISABLED through an exact parameter-only update, restore the recorded previous AWSCURRENT version using metadata-guarded staging-label operations, retain all versions, and verify disabled routes/readiness. Do not generate or deliver invitations after failure. A mode rollback restarts the runtime; the secret cache is bounded to 30 seconds and new login/callback paths remain gated while disabled.

The failure handler completed the rollback above. No application source or mineral balance changed. No player record was inspected, scanned, reset, merged or deleted. No public Twitch Extension release, account linking, website or privacy publication occurred.

## Evidence

- [Format-only proof](dime-m42-oauth-format/format-proof.json) and [pending read-back validation](dime-m42-oauth-format/validation-pending.json)
- [Current provider validation](dime-m42-oauth-format/validation-provider-current.json)
- [Refresh comparison](dime-m42-oauth-format/refresh-review.json) and [activation comparison](dime-m42-oauth-format/activation-review.json)
- [Final stack configuration](dime-m42-oauth-format/activation-verification.json) and [readiness](dime-m42-oauth-format/activation-readiness.json)
- [Test totals](dime-m42-oauth-format/validation-summary.json) and [resource events](dime-m42-oauth-format/resource-events.json)
- [Dormant delayed telemetry](dime-m42-oauth-format/disabled-telemetry-sentinel-search.json) and [TESTERS delayed telemetry](dime-m42-oauth-format/testers-telemetry-sentinel-search.json)

Amplify remains limited to main and codex/react-extension-rebuild; the integration report branch is excluded.
