# Milestone 4.2 security and deployment review

Status: implementation and synthetic verification complete; **not approved for deployment without live OAuth and infrastructure verification**. September 15, 2026.

## Implemented boundary

`server/twitchOAuth.ts` implements server-side Twitch OIDC authorization-code exchange with only `openid`. It checks RS256 signatures against Twitch keys, issuer, audience, authorized party, expiry, nonce, optional access-token hash, and agreement between ID-token subject and Twitch `/validate`. Numeric subjects are domain-separated HMACs before storage. Extension signing/client credentials are distinct; the known Extension client ID is explicitly rejected as OAuth configuration. Token requests use POST bodies and fixed Twitch endpoints with timeouts and no redirects. No username/email/profile scopes are requested.

`server/webAuth.ts` implements random internal account IDs; browser-bound five-minute, one-use login state; server-held tokens; eight-hour absolute and thirty-minute idle session expiry; random cookie sessions stored by hash; session rotation at login; per-request provider validation; refresh near expiry; credential-wide revocation; logout and best-effort Twitch revocation. Cookies use `__Host-`, Secure, HttpOnly, Path=/, SameSite=Lax and no Domain. Lax permits the top-level Twitch GET callback. State/nonce, not SameSite alone, prevent login substitution.

`server/webHandler.ts` provides a separately built, opt-in Lambda entry; it requires reviewed runtime configuration and is not part of the deployed Milestone 4.1 bundle. `server/webHttp.ts` implements a same-origin `/auth` boundary and `/api/v4` adapter to the existing authoritative game API with conversion disabled. Mutations require exact Origin, JSON and a per-session CSRF header. Callback completion, denial and validation failure redirect to a clean application URL. External errors are generic. OAuth codes, token bodies, cookies and complete URLs must never enter proxy or application logs. The implementation itself logs none.

The original React engine now supports web cookie sessions, memory-only CSRF, sign-in/sign-out and responsive desktop/mobile layouts. It does not store OAuth credentials or CSRF in browser storage. Pending gameplay requests retain the existing account-scoped session-storage mechanism. The development-only web review entry is absent from build inputs.

## Linking and concurrency

`server/authRecords.ts` provides both a synthetic memory adapter and a DynamoDB adapter with exact-key strongly consistent reads followed by one conditional transaction covering every read and write. Read-only results also receive a transactional version check. Authentication records use AES-256-GCM with record-key authenticated context and versioned key support. Game STATE/REQUEST records keep their established physical formats. No scan or query is implemented. Five-minute link intents are random, stored by hash, one-use, session-bound, and require a separately verified Extension player key. Conflicting established saves are preserved. A link selects an existing save by reference, never by copying quantities or overwriting either record. Successful binding revokes existing sessions. Conflicts consume the intent. The Extension opaque ID cannot be compared with the OAuth numeric ID.

`WebAuth.gameStore` and `extensionStore` conditionally check account bindings together with gameplay writes. Established-progress metadata changes in the same transaction. `createAccountApi` routes both identities through those stores, so stale pre-link bindings cannot write after the link. A linked schema-3 save is rejected on legacy routes before a legacy mutation; v4 conversion remains disabled. A sixty-second credential lease serializes provider validation/refresh across workers. Login/link/logout rotate the credential epoch; a stale refresh cannot overwrite a newer epoch. Expiring token-grant rows are separate from permanent identity/account mappings. Synthetic tests cover stale multi-record writes, encrypted record swapping, lease contention, binding races and account continuity after session expiry.

Account linking defaults disabled in the new handler. It may be enabled only after the combined handler is deployed and all old Lambda executions have drained, so every writer uses the binding guard. The current M4.1 handler must never run concurrently with enabled M4.2 linking. Missing OAuth configuration fails closed. The existing staging IAM policy is insufficient for the new auth transaction/delete operations and has not been broadened.

## Threat review

| Threat | Control / remaining gate |
| --- | --- |
| Login CSRF, code substitution, replay | Browser-bound one-use state, nonce, signed ID token, exact callback; synthetic tests pass |
| Cookie fixation or theft | New random session after callback; hashed session keys; Secure/HttpOnly/host-only; TLS at deployment required |
| CSRF and cross-origin requests | Exact Origin plus CSRF header on mutations; no credentialed CORS |
| Credential confusion | Separate client IDs and subject namespaces; no automatic equality between identity types |
| Revoked provider token | Validate every authenticated request; revoke local credential sessions on failure |
| Refresh race across workers | Conditional credential lease plus epoch checks; synthetic contention test passes; live provider refresh remains unverified |
| Concurrent established saves | Binding/progress conditional transaction implemented and synthetic tests pass; live DynamoDB acceptance remains gated |
| Session storage leakage | Only pending gameplay and public account scope; no OAuth tokens or CSRF |
| Logging leakage | No application auth logs; proxy must exclude query, Cookie, Authorization and response bodies |
| Auth endpoint abuse | Bounded request sizes and short-lived TTL rows; retain reviewed API throttling and verify production abuse limits |
| XSS | React text escaping; deployment CSP must allow only required origins; no analytics or third-party web scripts |
| Token storage exposure | AES-GCM encrypted grant rows with record context; runtime key references must be provisioned and rotation operationally verified |

## Unlinking and account recovery design

Unlinking requires recent independent authentication of the credential that remains, a short-lived confirmation tied to account binding epoch, exact-origin CSRF, and an atomic removal plus session-epoch rotation. Never detach the last usable credential. Preserve the account/save; do not clone it or create a second spendable copy. If both saves were populated, stop and retain both; there is no administrator merge or balance editor. A disconnected or deleted Twitch account requires an explicitly reviewed recovery procedure; support email alone is not ownership proof. Do not request tokens, cookies or raw player identifiers by email.

## Verified privacy deletion design

Use recent independent authentication, a CSRF-protected explicit confirmation and an account-scoped, one-use deletion intent. Atomically freeze gameplay and linking, rotate every credential/session epoch, remove all credential associations, revoke Twitch tokens, and delete live auth/session/link records and the account's gameplay and technical receipts through exact-key/partition-scoped operations. A durable deletion job must enumerate only the verified account partition, its referenced Extension save partition, and any original pristine account STATE left after binding with least privilege, retry idempotently, and retain only a minimal non-identifying completion receipt. The current IAM policy does not authorize this new workflow. No deletion endpoint is implemented or claimed available.

Preserve the verified 35-day PITR limitation: deleted live records may remain recoverable within that window. Backups must not silently resurrect deleted accounts; any restore requires replaying deletion tombstones before serving data. Unlink, logout, conversion and gameplay reset are not privacy deletion.

## External configuration and rollout

A separate registered Twitch OAuth client, server-held secret reference and exact callback `https://destroyaindustriesminingextension.com/auth/callback` are required. No client or secret was invented. No authenticated console session is available in this tool environment.

Use same-origin reverse-proxy behaviors only for `/auth/*` and `/api/*`, with caching disabled and only required cookies/headers forwarded. Preserve unrelated website objects and DNS. Before any website deployment: live DynamoDB/IAM and refresh/link concurrency checks must pass, OAuth must work end-to-end, the updated privacy text must be reviewed/published, every replaced website object must be backed up, rollback must be tested, and processed infrastructure must match reviewed source with no unresolved high-severity finding. None of those deployment gates may be inferred from local synthetic tests. Source review identified and fixed the multi-worker binding race, refresh race, expiring identity-mapping error, and stale post-logout UI response. No confirmed high-severity source finding remains in this review; live configuration and end-to-end verification are still mandatory and are not a claim of production security certification.

## Primary references

- [Twitch authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [Twitch OIDC and nonce validation](https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/)
- [Twitch token validation and revocation handling](https://dev.twitch.tv/docs/authentication/validate-tokens/)
- [Twitch token refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/)

## Validation and artifacts

289 unit/integration tests in 45 files passed; this includes 23 new security/storage tests. The prior full Chromium suite passed 66 scenarios; seven focused checks (four new web scenarios and three original UI layouts) passed after web changes. Lint, strict typecheck, formatting, default/web builds and the separate web Lambda build passed. The M4.1 Lambda module remains byte-identical to its deployed source hash. Frontend scanning found no provider secrets, refresh tokens, development endpoints, source maps or protected legacy terms.

Prepared `/tmp/dime-m42-web/DIME-Web-m42-candidate.zip` (88,512 bytes, SHA-256 `d849b4da8802a2dc3a12561865a607f715586de976a822a52e6455133a34b561`). New asset prefix: `dime-web/releases/bb91fcef62c9d92d`. Only index.html would be replaced; existing asset keys remain untouched. Current index backup: 748 bytes, ETag `"a4c3c0e31f6f6aeaf91b0dacb9df1e88"`, SHA-256 `2bcc8de3c43b8ac7feef1f1e21d331f93a4f6a2d37e808ef2b64f006915dae1a`. The rollback ZIP round-trips the exact backed-up index bytes; this is an archive restoration test, not a live rollback. No web object or DNS change was applied.

Separate web Lambda: 2,891,010 bytes, SHA-256 `da1f4d95e6295d75bca19dfc6f606a97b60e3b6babf07936e4d20c7f7c7a3c22`. It was not uploaded or deployed. The [web privacy draft](privacy-m42-draft.html) is prepared but unpublished.
