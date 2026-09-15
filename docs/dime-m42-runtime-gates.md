# M4.2 runtime configuration and release gates

No credentials are embedded in this document or the application. `scripts/build-web-server.mjs` produces the opt-in handler separately from the deployed Milestone 4.1 bundle.

## Required configuration

| Setting | Reviewed value or provisioning requirement |
| --- | --- |
| AWS_REGION | us-east-2 |
| DIME_STATE_TABLE | dime-v2-staging-review01-dime-v2-review-20260912-player-state |
| DIME_WEB_ORIGIN | https://destroyaindustriesminingextension.com |
| DIME_OAUTH_CLIENT_ID | Separately registered Twitch OAuth application; never the Extension client ID |
| DIME_OAUTH_CLIENT_SECRET | Separate server-only runtime secret reference; not yet provisioned |
| DIME_WEB_ID_KEY_B64 | Stable, separate runtime HMAC key reference; not yet provisioned |
| DIME_AUTH_ENCRYPTION_KEY_B64 | Separate 32-byte runtime encryption key reference; not yet provisioned |
| TWITCH_EXTENSION_SECRET_B64 | Existing approved dynamic secret reference, never retrieved for inspection |
| DIME_PLAYER_ID_KEY_B64 | Existing stable Extension identity-key reference |
| DIME_ALLOWED_ORIGINS | Existing exact Twitch Extension origin |
| DIME_CONVERSION_MODE | DISABLED, required by the new handler |
| DIME_ACCOUNT_LINKING | Initially DISABLED; ENABLED only after all writers use the new binding-aware API and live gates pass |

Callback registration: `https://destroyaindustriesminingextension.com/auth/callback`. Requested scope: `openid`. Browser sign-in/consent and authenticated console configuration are external gates. Do not paste secrets or tokens into chat, command arguments, repository files or logs.

## Infrastructure review still required

Prepare the actual CloudFormation candidate only after runtime secret references and OAuth configuration exist. Preserve stateful resources and the approved regions. Scope any added permission to the authorized table and exact auth namespaces; no scan, query, broad deletion, legacy-table or administrator access. The new adapter uses exact-key GetItem and conditional transaction Put/Delete/ConditionCheck operations; the old IAM policy must not be assumed sufficient. Auth deletion must be restricted to auth record keys; verified gameplay privacy deletion is a separate unimplemented workflow.

Route additions are `/auth/login`, `/auth/callback`, `/auth/session`, `/auth/logout`, `/auth/link/intent`, `/auth/link/accept`, and `/api/v4/{state,actions,content/preview,content/convert,profile/reset}` with their reviewed GET/POST methods. Existing Extension routes remain on their established paths. Use the combined handler for both identity types before enabling linking. Drain prior executions first; do not send old and new writers to different code versions while linking is enabled.

CloudFront same-origin `/auth/*` and `/api/*` behaviors must disable caching and forward necessary Cookie, Origin, Content-Type, X-Dime-CSRF and Authorization headers. Return Set-Cookie unchanged. Access logs must omit complete query strings, cookies and authorization; retain only non-identifying operational fields. Do not alter unrelated behaviors or DNS. Generate and compare the processed template and actual distribution configuration before any execution; no web change set or distribution update was created in this run.

## Rollout prerequisites

1. Provision the reviewed separate OAuth client and runtime references securely.
2. Register callback and complete actual login, nonce/state, refresh, revocation, logout, cookie and CSRF verification.
3. Validate DynamoDB persistence/conditional conflict behavior with synthetic accounts only; verify both clients share the guarded store.
4. Reverify code/IAM/CORS/CloudFront changes, security review, privacy publication and retained backup hashes.
5. Deploy only the reviewed application objects with conditional index replacement and create-only versioned assets. Do not overwrite unrelated website keys.
6. Test desktop/mobile real-domain performance, account-link replay/conflict handling and rollback. Conversion remains DISABLED.

The prepared rollback index references existing assets, which this candidate does not replace. Before publication, recheck its ETag and back it up again if changed. No live web rollout or rollback is claimed.
