# TESTERS activation preflight: readiness blocker

Baseline: `252eb71b256a4879ba8e1864da279ef60b7873cc`, branch `codex/dime-m4-graphics-web`.

## Outcome

Activation remains unexecuted. Final read-only AWS review passed the parameter/template comparison, but the exact deployed bundle demonstrably cannot satisfy the required post-activation readiness check. No AWS configuration, secret stage, website or application code was changed.

Account: `861738068626`; region: `us-east-2`; stack: `dime-v2-review-20260912`, `UPDATE_COMPLETE`.

Change set: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-runtime-83bbdff-testers-review-1/88d00bb7-aa8c-40e3-9b5b-9859d72996b8`, `CREATE_COMPLETE / AVAILABLE`.

The only parameter difference is `WebSignInMode: DISABLED → TESTERS`. Linking stays `DISABLED`; conversion stays `ENABLED`. Two non-replacing modifications: web-auth environment parameter reevaluation and structurally unchanged API reevaluation. Zero additions, removals, replacements, code, IAM, table or route changes. Live and proposed processed templates equal the reviewed template. Secret stage metadata remains unchanged. CloudFront, WAF, website and privacy are outside this stack update.

Deployed web-auth CodeSha256 matches `JWPFY1I51p2+KQ8UXYNw/QKfe55VRZiLM8AtDTnmfpI=`. Fresh direct deployed `AWSCURRENT` readiness passes all eleven Booleans while both modes are disabled.

## Reproduced failure before execution

`server/webHandler.ts` explicitly throws `WEB_AUTH_CONFIG` for direct key readiness unless both sign-in and linking are `DISABLED`. Therefore changing sign-in to `TESTERS` guarantees a 503 from the readiness invocation; it does not demonstrate invalid key material.

A local invocation of the exact compiled deployed bundle (index SHA-256 `f39d80895841820bd07340d04c9b2dd122e4538fa760b06bb8ed6bb9d7362862`) with TESTERS and disabled linking returned 503. Only a non-sensitive category and correlation ID were logged. The guard runs before any secret/storage dependency, so this reproduction made no AWS call and used no secret, invitation or identity.

Executing the otherwise exact parameter change would knowingly fail the owner's mandatory post-activation readiness check and require an immediate disable rollback. It was therefore held before execution. This is an application readiness-gate conflict, not routine deployment approval or an external API error.

## Required resolution

Recommended separate review: permit IAM-only **AWSCURRENT** readiness in TESTERS with linking disabled, while retaining AWSPENDING readiness only in fully disabled mode. Preserve exact event shape, public-route exclusion, eleven Boolean output, and all secret-read restrictions. This requires a separately reviewed web-auth code update; it is outside the current parameter-only activation authorization. No such code change has been made.

Alternatively, the owner could explicitly accept pre-activation deployed 11/11 readiness plus post-activation functional checks instead of post-activation direct readiness. Do not silently substitute that interpretation.

No new invitation was generated. The owner's verified numeric Twitch ID has not been provided in this conversation; request it only after activation checks pass. No username inference, live OAuth, gameplay access, session creation or linking was performed.

Post-activation HTTP, replay, guest/Extension and delayed telemetry checks remain pending because activation was not attempted. Prior completed unit/browser/performance results are preserved, not presented as new activation evidence. No rollback was needed; modes remain sign-in/linking DISABLED, conversion ENABLED.

Evidence: [preflight records](dime-m42-activation-preflight-252eb71/).
