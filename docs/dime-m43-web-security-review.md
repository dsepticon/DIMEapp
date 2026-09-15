# Integrated web security review — 2026-09-15

## Release boundary

The graphics/web branch carries the binding-aware OAuth implementation onto the latest physical-navigation, pending-recovery, vacuum and node-placement source. The Twitch bundle still uses the current staging API. The opt-in web handler is a separate artifact; the deployed gameplay handler and its eight routes remain unchanged.

Real OAuth is **not deployment-ready**: the separate registered OAuth application, its runtime secret references, actual callback/consent and provider refresh/revocation checks are unavailable. Synthetic tests cannot satisfy these gates. Account linking remains off until every writer uses the transactional binding-aware implementation and old invocations have drained.

## Review findings resolved in this integration

1. **Conversion configuration regression:** the old web composition silently defaulted to DISABLED and its runtime rejected ENABLED. Both API adapters now receive the same explicit gate; the authorized combined runtime requires ENABLED with no tester tags. Fresh canonical save tests exercise both adapters.
2. **Storage target validation:** the combined runtime now checks the exact authorized staging table, rather than relying on the lower-level adapter's staging prefix alone.
3. **Client merge risk:** current M4.1 request timeout, fixed-code recovery classification, generation checks, physical position, targeting and vacuum controls are retained. Cookie/CSRF transport is added around that implementation. Epoch checks suppress responses after logout/link changes.

## Threat model

| Boundary / threat | Implemented protection | Remaining deployment evidence |
| --- | --- | --- |
| Browser → login/callback; login substitution | Random browser-bound five-minute state, single-use consumption, signed ID token, issuer/audience/nonce/expiry and subject agreement with Twitch validation | Real registered callback and consent |
| Browser → game mutations; CSRF | Exact HTTPS origin, JSON, per-session CSRF header, Secure HttpOnly host-only SameSite=Lax cookies | Real CloudFront forwarding and cookie behavior |
| Account → save; cross-player/conflicting linking | Independently verified Extension credential, one-use session/epoch-bound intent, transactional binding guards, populated-save conflict rejection | Synthetic identities through real DynamoDB transactions after runtime provisioning |
| Concurrent login/refresh/link/logout | Credential leases and epochs; stale writes fail conditional transactions; rotated cookie sessions | Provider refresh/revocation and concurrent real-runtime tests |
| Auth storage disclosure | AES-256-GCM with per-record authenticated context and versioned encryption key; separate Extension/OAuth identity keys and credentials | Secure provisioning and operational key rotation |
| Request replay and uncertain network outcomes | Existing generation-aware DIME-only pending entry; original request ID retained on uncertainty; terminal rejections reconcile safely | Hosted webview regression |
| Token leakage | No provider tokens in frontend code/storage, application logs or completed callback URL; clean redirect after callback | Proxy logging must exclude query strings, cookies, authorization and response bodies |
| XSS / third-party script supply | React escaping, no raw HTML insertion; original code-native art; production excludes development review entry | Same-origin CSP and final deployed-header verification |
| Auth endpoint abuse | Bounded bodies, short-lived intents/sessions, fixed provider hosts, timeouts, existing throttling | Real latency/throttle behavior, including 10-second current Lambda timeout |
| Static executable-content transport | Prepared native S3 REST origin with HTTPS viewer policy and explicit index root | Existing HTTP-only website origin must be replaced through the reviewed website rollout before OAuth publication |

Source tests cover encryption context swapping, replay, expiry, CSRF, provider revocation, refresh contention, binding races and save isolation. No confirmed critical/high source finding remains from this review. This is not a declaration that undeployed infrastructure or untested real OAuth is secure.

The existing static site's HTTP-only S3 website-origin hop is a deployment security finding for the future authenticated application. Its source-supported TLS correction is prepared in `infra/web/README.md` and the local routing plan. Do not publish OAuth on the unchanged origin; applying and verifying that correction belongs to the gated website rollout. No live website configuration changed during this review.

## Unlink, recovery and privacy deletion

The reviewed design in `dime-m42-security-review.md` remains applicable: independently authenticate a remaining credential, never remove the last recovery path, rotate sessions atomically, never clone a spendable save or overwrite conflicting progress. These owner/recovery/deletion workflows are designs, not implemented endpoints. Logout and gameplay reset do not delete an account. Verified privacy deletion requires a separately scoped, idempotent account-partition job and restore tombstones; no data scan or deletion occurred in this update.

## Exact owner configuration steps

1. Sign into the Twitch Developer Console normally and open/register the reviewed standalone DIME OAuth application, distinct from Extension client `znaovl2j45idub9k81om1dkatwxnu2`.
2. Register **https://destroyaindustriesminingextension.com/auth/callback** exactly. Use authorization-code/OIDC with only `openid`; no email, profile, chat or moderation scopes.
3. Provision the separate OAuth client secret, stable web identity HMAC key and 32-byte auth encryption key through runtime secret references. Do not paste values into chat or files. Supply only non-secret reference identifiers through the deployment configuration.
4. Review the combined handler, narrowly scoped IAM transaction permissions, same-origin `/auth/*` and `/api/*` forwarding with caching disabled, and the processed change set. Preserve existing table/log/alarm/CORS settings and routes.
5. Complete actual sign-in, callback cleanup, refresh, revocation, expiry, logout, CSRF, linking conflict and replay tests using synthetic identities. Then publish reviewed privacy text, recheck backups, test rollback and conditionally publish only the reviewed website objects.

## Primary documentation checked

- https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/
- https://dev.twitch.tv/docs/authentication/validate-tokens/
- https://dev.twitch.tv/docs/authentication/refresh-tokens/

The implementation requests only `openid`, validates nonce/state and calls the provider validation boundary for every authenticated request; the real provider flow remains an external gate.
