# Controlled OAuth tester review — 2026-09-16

Status: preparation only. Do not execute the review change set, issue a real invitation, activate either mode, or publish website changes under this review.

Base: `649e8943192b0e7027f5bd37b75e86148db17ce3`, branch `codex/dime-m4-graphics-web`.

## Admission and identity model

Public `/auth/status` advertises sign-in/linking only for public ENABLED sign-in; TESTERS remains unavailable to public visitors. Unknown, empty, case-modified and whitespace-padded modes fail closed. DISABLED rejects login/callback/link expansion before credential initialization or storage access. Safe logout and verified deletion continuation remain available. Verified unlink/deletion initiation uses existing ownership, fresh-session, CSRF and origin checks independently of linking configuration.

In TESTERS, `/auth/login` requires one syntactically valid invitation. Signature, payload canonicalization, expiry and one-use eligibility are verified before a provider redirect. Invitations are minted only by the local owner tool; there is no issuance endpoint. The 32-byte web identity key derives separate HMAC-SHA256 subkeys with `dime:web-tester:key:signature:v1\0` and `dime:web-tester:key:subject:v1\0`. MAC messages use separate `dime:web-tester:invitation:v1\0` and `dime:web-tester:subject:v1\0` contexts. Existing OAuth subject derivation remains unchanged. MAC and tester-tag comparisons use timingSafeEqual for equal-length buffers; malformed public lengths reject early.

The signed payload has exactly `v`, `exp`, `nonce`, `tester`: version 1, expiry no more than 900 seconds away, a random 256-bit nonce, and a keyed identifier for one canonical numeric Twitch ID (1–20 decimal digits, no leading zero). It contains no raw Twitch ID, email, token, DIME account/player identifier or gameplay data. Both the payload and signature use canonical Base64url. Unknown fields, duplicate/noncanonical JSON encodings, tampering, wrong keys and expiry fail closed. The URL is a short-lived bearer admission credential: keep it out of chats, tickets, analytics and screenshots.

At login, one optimistic DynamoDB transaction reads the nonce-digest ledger and writes its consumption plus a browser-bound OAuth login record. Concurrent reuse can commit only once. Retry after a lost redirect requires a newly provisioned invitation; the previous invitation is intentionally spent.

At callback, state and browser-cookie proof are checked and consumed before code exchange. The normal Twitch OIDC exchange validates signature, issuer, audience, nonce, token hash where present, client ID, scopes and access-token subject. The validated numeric subject must match the invitation tag, and invitation expiry is rechecked after exchange. A mismatch creates no identity, account, session, manifest or save. Rejected tokens are revoked best-effort, including tokens issued before OIDC/access-token validation fails. Provider profile fields are never requested or retained for rejected testers.

Successful admission creates/rotates only the existing bounded auth/account/manifest records and a Secure, HttpOnly session. It does not create gameplay state. Tester eligibility is attached to the authenticated session until its absolute 8-hour expiry; it is not a reusable tester list or permanent account privilege. Every fresh sign-in in TESTERS requires another invitation. Callback replay cannot exchange again or duplicate account records.

## Exact records, bounds and retention

| Record                               | Physical key / content                                                                                                       | Logical expiry and DynamoDB TTL                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Invitation consumption               | `AUTH#v1#tester-use:<SHA256(context                                                                                          |                                                                                       | nonce)>`, `RECORD`; encrypted expiry only | Original invitation expiry, at most 15 minutes; never raw nonce, tag or identity |
| OAuth login                          | Existing `AUTH#v1#login:<state digest>`; encrypted browser digest, OAuth nonce, expiry, temporary intended tester tag/expiry | Earlier of 5 minutes or invitation expiry; deleted on valid callback/denial           |
| Tester session                       | Existing `AUTH#v1#session:<session digest>`; existing fields plus scalar `testerUntil`                                       | 8 hours absolute, 30 minutes idle; credential epoch rotation revokes old sessions     |
| Provider grant                       | Existing encrypted `grant:<OAuth subject>`                                                                                   | At most session absolute expiry (8 hours); deletion/logout revocation rules unchanged |
| Link intent                          | Existing encrypted exact-key record; maximum one active intent per session                                                   | 5 minutes                                                                             |
| Link outcome                         | Existing encrypted record plus tester eligibility deadline for protected replay                                              | 24 hours; TESTERS replay also checks eligibility deadline                             |
| Gameplay receipt                     | Existing player partition/class, unchanged                                                                                   | 30 days                                                                               |
| Verified deletion tombstone/recovery | Existing bounded deletion state machine, unchanged                                                                           | 35 days                                                                               |

All AUTH records use the existing AES-256-GCM envelope and exact-key revision-conditional transactions. No new table/index/schema/TTL configuration, IAM permission, secret reference or route. Invitation/login records are pre-account transient classes with hard expiries, not unbounded manifest members. Account manifest remains bounded to one web OAuth identity and one Extension identity; no extra permanent membership is added. No Scan or Query is introduced.

DynamoDB TTL removal is asynchronous; every eligibility check enforces expiry in application code. A physically lingering consumed invitation never becomes reusable. An expired invitation remains invalid even after its ledger item disappears.

## Sign-in-only phase and later linking

With AccountLinkingMode=DISABLED, every `/api/v4/*` request is rejected before authorization or game-store access. `/auth/session` does not read a gameplay profile in that mode. The new server-rendered `/auth/session?view=tester` page says the tester is authenticated, shared-save linking is unavailable and no save was created by sign-in; it links to the independent `/game/` demo and offers CSRF-protected logout. It exposes no account ID, provider token or profile information. Its CSP allows only a per-response nonce script and same-origin fetches. No website object needs to change to build this page.

The existing host-only `__Host-` cookies remain Secure/HttpOnly/SameSite=Lax with no Domain attribute. Their Path=/ is required by `__Host-` and shared `/auth/*`/`/api/*` use, rather than a broad domain cookie. Deletion recovery remains SameSite=Strict. Login and any invitation cookie are expired after callback success/failure, including disabled callbacks; logout expires session/login/invitation cookies. Session rotation preserves old-account data but ends previous session epochs. No OAuth token is placed in URLs, JavaScript, storage, logs or responses; final callback redirects remove code/state/invitation query parameters.

Prepared AccountLinkingMode=TESTERS requires an already authenticated, unexpired tester session and `confirmation: LINK_EXTENSION` with same-origin CSRF for intent creation. Acceptance independently validates the Extension JWT, intent, session epoch, account control, save revision/generation and manifest. An existing Extension save retains its exact canonical physical key, generation, progress and receipts. Two existing saves conflict without merging. Replay checks tester deadline and binding epoch; retries cannot bind another account. In TESTERS, web gameplay additionally requires an established Extension link. This mode is NOT activated by sign-in activation. The currently hosted Extension deliberately does not advertise TESTERS linking; a separately reviewed tester interaction/UI is required for live confirmation.

## Threat review

- Invitation theft can consume the invitation or start a provider flow, but cannot authenticate a different Twitch account. A stolen link is not sufficient to create a DIME session.
- Modified/expired/replayed invitations reject before redirect; invalid MACs cause no repository writes or OAuth provider initialization. No public issuance or unsigned-tag bypass exists.
- Login CSRF/state substitution is blocked by state digest plus host-only random browser-cookie binding. One-use callback consumption and credential epochs prevent callback/session replay.
- Early gate and HTTP routing normalize paths identically, with additional handler checks against disabled or malformed modes; dot segments/fragments cannot bypass admission.
- Mode downgrades block new sign-in and linking; existing accounts are not corrupted. Logout and verified deletion remain available. During activation/rollback wait for Lambda configuration completion and invocation draining before testing.
- Wrong-account/token validation failures create no local authorization. Revocation failure still rejects and drops the rejected tokens; there is no persisted retry grant for rejected users. Provider-side grants can outlive that failure until expiry/revocation in Twitch; owner test cleanup must check Twitch authorizations. This does not grant DIME access.
- Linking is deliberate, independently gated, transactional and conflict-preserving. Gameplay reset cannot substitute for unlinking or verified deletion.
- Default capability responses reveal neither tester presence nor mode names, IDs, tags, secret references or account information.
- Runtime paths do not log invitations, cookies, provider errors, codes, subjects, tags or tokens. Future proxy access logging must omit query strings and cookie/authorization headers; do not enable debug tracing or request-body logging.
- Public guest adapter stays independent, in memory only. No guest asset or deployed resource changes are part of this preparation.

No known critical/high finding remains in the implemented code after synthetic validation. Live provider/console, routing and deployment checks remain prerequisites, not claims of completed testing. Existing Extension regression and byte-identical gameplay bundle verification are included in the release report.

## Official protocol references

The minimum requested scope remains `openid`; the flow and validation are checked against [Twitch OIDC](https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/), [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/) and [token revocation](https://dev.twitch.tv/docs/authentication/revoke-tokens/). No email/profile scopes are added.
