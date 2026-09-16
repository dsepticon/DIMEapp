# Owner-only tester provisioning and activation plan

**Preparation only. Do not run the provisioning command with real input yet.** No real invitation was issued during development or validation.

## Before any future invitation

1. Review the disabled-mode change set and security report, including exact web-auth ZIP hash. Separately authorize and deploy support with WebSignInMode=DISABLED and AccountLinkingMode=DISABLED. Verify unchanged gameplay hash, routes, IAM and table settings.
2. Review a narrowly scoped `/auth/*` website-to-web-auth routing plan. Current publication intentionally leaves `/auth/login`, callback and session on the root website default behavior; they currently are not a working same-origin OAuth proxy. Do not activate TESTERS until callback/login/session/logout and required privacy routes have correct reviewed same-origin routing, TLS, no shared caching, no query/cookie/auth logging and preserved root/privacy/game behavior. Do not change the guest API-denial gate to allow persistent gameplay in this phase.
3. Before collecting any real tester authentication data, separately review the published privacy notice for OAuth/session retention, invitation TTLs, linking, unlinking and verified deletion. Publish any required notice through its own approved conditional-write workflow; this preparation does not change `/privacy`.
4. Confirm the existing Twitch OAuth app uses public client ID `4228okut24ll35bisjmygbquaf6svm` and exact callback `https://destroyaindustriesminingextension.com/auth/callback`. Runtime API remains the reviewed staging API. Use only the owner's existing three secret ARNs, never placeholders or plaintext. No Extension credentials are substituted.
5. Separately review a parameter-only change: WebSignInMode=TESTERS, AccountLinkingMode=DISABLED, ContentConversionMode=ENABLED; every other parameter UsePreviousValue. Expect only non-replacing web-auth environment update and structurally unchanged API reevaluation. Stop on any IAM/table/route/resource/code/reference delta. Wait UPDATE_COMPLETE and verify public `/auth/status` still advertises both capabilities false, anonymous login does not redirect, guest is independent and gameplay APIs remain unavailable to web sessions.

## Local owner tool — never run inside a logged agent session

Requires Node 22, locked dependencies, AWS owner credentials and the approved `asm-exec` wrapper. The wrapper resolves the existing web identity-key ARN only inside the process environment. No Lambda IAM change is needed for the local owner tool. Do not use shell tracing, `env`, debug output, terminal recording or CI. The tool performs no AWS/DynamoDB writes; a consumption digest is created only when the browser actually begins OAuth.

From the reviewed repository directory:

```bash
set +x
read -r -s DIME_TESTER_SUBJECT
printf '%s' "$DIME_TESTER_SUBJECT" | bash scripts/provision-tester.sh
unset DIME_TESTER_SUBJECT
```

Type the designated tester's Twitch numeric user ID into the hidden `read` input. Do not put it in a command argument, file, chat or report. Successful output is only JSON containing a short-lived invitation URL and its UTC expiry. The web identity key must decode from Base64 to exactly 32 bytes; the script uses the existing `decodeSecret` validator. No secret value is printed or requested. The identifier inside the URL is HMAC protected, not a raw Twitch ID or DIME identity. Do not decode or print tags during testing.

Open the URL directly in the designated tester's browser within 15 minutes. The first valid OAuth start spends the invitation permanently. Sharing/reusing it, losing the redirect, provider denial or choosing a different Twitch account requires a new invitation. No real invitation or computed tag belongs in evidence artifacts.

## Live sign-in checklist — only after separate approvals

- Public guest browsing remains unchanged; no clickable public Twitch sign-in is advertised.
- Login without invitation, tampered/expired invitation and replay cannot redirect.
- The intended Twitch account can complete normal OIDC authorization; wrong account is rejected with no local records issued. Inspect fixed HTTP results only, never tokens or records.
- Final browser URL is `/auth/session?view=tester` without provider code/state/invitation. Session cookie is Secure/HttpOnly/host-only/Lax; transient cookies have expired.
- Tester page clearly reports linking unavailable and provides Guest Demo/logout. No gameplay save is created or read while linking is disabled; `/api/v4/*` stays blocked.
- A second login using a new invitation rotates session epoch; the old session fails. Test idle/absolute expiry and idempotent logout.
- With synthetic identities, recheck wrong-account, revocation failure, conflicts, deletion continuation and no-save behavior. For a real designated account, use only separately authorized non-disclosing status verification; do not inspect player records.
- Verify CSP, safe errors, no request/identity/token logging, no cookie or gameplay data in localStorage/sessionStorage, and existing Extension behavior.

## Later linking plan — do not activate now

A separate parameter-only review may set AccountLinkingMode=TESTERS after sign-in and recovery pass. The web session must carry current tester eligibility. Present deliberate `LINK_EXTENSION` confirmation and CSRF-protected intent creation; independently authenticate the Extension side. Never pass identity keys or signing secrets to the client. The hosted Extension currently advertises linking only for ENABLED, so a reviewed tester-only interaction is required before this phase. Preserve the Extension save as canonical; if both saves exist, stop for support. Test replay, conflicting accounts, unlink/relink, verified deletion, generation and manifest updates using synthetic identities first. TESTERS web gameplay requires a completed link. No automatic public activation follows.

## Rollback / emergency disablement

First set WebSignInMode=DISABLED and AccountLinkingMode=DISABLED via a separately reviewed parameter-only update; leave conversion ENABLED. Wait UPDATE_COMPLETE and drain the 20-second web-auth maximum invocation window. Invalid/public login/callback must fail before credential use; logout and verified deletion continuation remain reachable. Disable routing only after safe shutdown/privacy endpoints remain accessible.

Do not automatically roll code back to a pre-tester bundle while TESTERS mode is active. Revoke test sessions through reviewed logout/deletion controls; preserve gameplay and manifests. Consumed invitations expire within 15 minutes, login state within 5 minutes, sessions/grants within 8 hours, outcomes within 24 hours; logical expiry is enforced despite asynchronous TTL cleanup. If revocation failed at Twitch, remove the test authorization through Twitch's authenticated controls. Do not scan for tester records or erase unrelated saves.

The previous web-auth S3 artifact/version in the deployment baseline remains available for a separately reviewed code rollback after both gates are disabled and active test accounts/recovery jobs are assessed. Do not revert canonical gameplay resolution or deletion protections for established linked accounts. Guest `/game/`, root and `/privacy` need no rollback for this backend-only preparation.
