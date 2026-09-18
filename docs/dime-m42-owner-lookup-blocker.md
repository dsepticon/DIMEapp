# Owner tester lookup blocked before Helix

Starting branch: `codex/dime-m4-graphics-web`; starting commit `bf5938b0c3a2eee0617ba491f1ae99e5b2c5dd53`.

## Result

The owner authorized resolving two named Twitch logins using official Helix and generating invitations only after exact returned-login matches. **Neither numeric ID was resolved; zero invitations were generated.** No ID was inferred, and no owner was asked to find one manually.

The secure runtime path stopped before obtaining a Twitch app token. Its non-sensitive failure category was **SECRET_WHITESPACE**: the runtime-supplied OAuth client-secret string differs from its whitespace-trimmed form and fails the reviewed canonical plaintext parser. No trimmed value was submitted to Twitch, accepted as a fallback, printed, fingerprinted or persisted. The secret was not rewritten or rotated. This establishes a format failure in the runtime-supplied string; it does not establish whether the underlying Twitch-issued credential is valid.

## Runtime compatibility diagnosis

The pinned owner resolver called `aws___call_aws`, which the AWS MCP endpoint no longer advertises. A metadata-only handshake and tool listing succeeded. The supported interface is `aws___run_script`; a constant-only probe and an STS account-only predicate confirmed it operates against the authorized account without an access-program override.

A temporary local `asm-exec` transport adapter preserved dynamic-reference resolution inside the helper process. It allowed only the OAuth client-secret and identity-root references, only AWSCURRENT, and only the reviewed region. It required one successful Secrets Manager API-call receipt and rejected unexpected stdout/stderr or response shapes. The original pinned resolver, repository invitation signer, application code, deployed functions and IAM remained unchanged. No Extension credential was accessed. The identity-root resolution/signing step was never reached.

The temporary Helix helper would obtain an app access token, validate its client/no-user/no-scope contract, call [Get Users](https://dev.twitch.tv/docs/api/reference/#get-users) for both exact lower-case logins, reject missing/duplicate/mismatched responses, and revoke the temporary app token before signing. IDs and provider responses would remain in memory. The OAuth credential format gate stopped it before any Twitch request.

Eight synthetic exact-login checks and eight synthetic adapter boundary checks passed. They cover missing/mismatched/duplicate login results, numeric-ID validation, distinct IDs, exact runtime reference/stage/region restrictions and unsuccessful/noisy API responses. These are helper checks, not a new full application validation run. No application source changed.

## Fail-closed rollback

Under the owner's existing instruction to disable sign-in on a failed pre-invitation/live check, the parameter-only rollback was freshly compared and executed once:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-readiness-a51c774-rollback-3/5a3869be-d3ed-480f-b09b-fcb7b2948fd0`

The only parameter change is WebSignInMode TESTERS → DISABLED. The processed template is identical. CloudFormation reports two non-replacing environment/API reevaluations, zero additions/removals/replacements, and no code, IAM, routes, table or secret-version changes. Linking remains DISABLED and conversion remains ENABLED. Rollback reached **UPDATE_COMPLETE**, readiness passed **11/11**, all 23 routes remained unchanged, and there were no failed deployment events. Secret-version stage metadata matched the pre-attempt baseline. [Exact comparison](dime-m42-owner-lookup/rollback-review.json), [completion](dime-m42-owner-lookup/rollback-verification.json), [readiness](dime-m42-owner-lookup/rollback-readiness.json).

Twenty live disabled-mode HTTP/CORS checks passed after rollback: login/callback cannot redirect, linking remains unavailable, logout is idempotent and expires cookies, missing deletion proof returns 401, the eight legacy/v4 gameplay routes reject unauthenticated requests, and exact-origin preflight remains correct. [HTTP results](dime-m42-owner-lookup/disabled-http-results.json).

## Required next step

A secure format-only correction of the existing OAuth client-secret version requires a separate reviewed secret-version operation. Preserve the actual Twitch-issued credential; the required contract is its exact plaintext value with no surrounding whitespace or JSON envelope. Do not send the value through chat. Use the pending-version, validation and rollback process before promoting a replacement. Do not infer that a new Twitch-issued credential or broader parser is needed.

After the runtime parser accepts the corrected secret, rerun the official Helix lookup for both already-authorized logins; require exact returned logins and distinct numeric IDs. Re-activate TESTERS only through the reviewed parameter-only procedure. Generate invitations only after all gates pass. No manual numeric-ID lookup is required from the owner.

Interactive Twitch authorization remains a separate human step: no authenticated browser-control connection is available in this session. Callback matching, real session rotation/refresh/logout/expiry, and consumed-valid-invitation replay have not been tested live. Linking must remain disabled throughout.

No account, session, identity, manifest, save, receipt or invitation-use request was created during this attempt. No player records were read, scanned, reset or modified. No website, privacy, CloudFront, WAF, mineral balance or Twitch Extension publication changed. No secret value, numeric Twitch ID, token, cookie, invitation or secret-derived fingerprint is present in this report.
