# Emergency authentication routing correction

## Contract

The sign-in gate now rejects authentication expansion (`/auth/login`, `/auth/callback`, `/auth/link/intent`, `/auth/link/accept`). All other routes retain their existing authentication, CSRF, ownership and independent linking checks; disabling sign-in does not grant authorization. Existing-session inspection and gameplay remain subject to those checks. Callback is the only session/identity creation path and remains disabled.

POST `/auth/logout` is idempotent: success is HTTP 200 `{"signedOut":true}`. Every logout response expires the Secure, HttpOnly, host-only session and login cookies with Max-Age=0. No/invalid session cookie succeeds without constructing storage or credentials. A well-formed cookie for an absent session succeeds after an exact-key lookup/condition check; it creates nothing. An existing session requires its matching CSRF value and exact origin. Logout deletes that session and rotates only its matching existing credential epoch, without session refresh, account/manifest/save creation, or provider validation.

Status and cookie-less logout initialize no credentials. Emergency routes with proof use only reviewed region/origin/table, authentication encryption and web identity keys. They do not decode Extension keys, validate conversion configuration, construct OIDC/JWKS dependencies, or access the OAuth client secret. Provider revocation is lazy and uses only the public client ID and existing encrypted token, as specified by [Twitch's revocation API](https://dev.twitch.tv/docs/authentication/revoke-tokens). No secret reference, environment variable or permission changes are required.

Logout invalidates local authorization before attempting revocation. A temporarily failed revocation leaves the existing encrypted grant available for verified deletion retry; it never restores the session. Grant cleanup after successful revocation is conditional on its original epoch and cannot remove a newer login's grant.

## Deletion continuation

POST `/auth/delete/resume` validates exact origin and the strict existing account/capability body or HttpOnly deletion cookie **before** dependency construction. Missing/malformed proof returns 401; wrong origin, wrong proof, ownership mismatch and expired proof return 403. No authorization is bypassed when sign-in or linking is disabled.

Valid deletion still advances one bounded, revision-checked transaction at a time. Revocation outage returns HTTP 202 with `status: DELETION_PENDING`, `retryable: true`, `code: PROVIDER_REVOCATION_PENDING`; the grant, manifest and checkpoint remain intact. Retry uses the same proof. Completion retries return COMPLETE only while the existing 24-hour outcome receipt remains valid; replay afterward is rejected.

New deletion jobs explicitly expire their proof after 35 days, independently of the persistent resumable job. Existing jobs without this field have a fixed compatibility deadline of **2026-10-21 15:38:56 UTC**, 35 days after the original reviewed manifest deployment completed. Reading/retrying a legacy job never extends that deadline. Expired proof cannot resume deletion; the durable job is retained for separately verified recovery, not silently abandoned or deleted. This introduces a record-value field only, not a DynamoDB schema/index/TTL configuration change. The 35-day deletion tombstone and all existing temporary-record TTLs remain unchanged.

## Deployment boundary

Only the web-auth bundle is rebuilt/replaced. The existing gameplay bundle is retained byte-for-byte. No website, privacy, route, permission, table, IAM, environment/secret reference, log, alarm or gameplay Lambda update is part of this correction. Configuration modes stay DISABLED / DISABLED / ENABLED for sign-in / linking / conversion.

The prior live 503 was the outer handler initialization catch, which required every login/Extension/conversion dependency even for emergency requests. Its hidden underlying exception was not exposed or guessed. Tests now exercise the exported handler with OAuth and Extension credentials absent, plus synthetic authenticated lifecycle tests. Live verification uses no cookie or deletion proof and therefore cannot touch player records; valid-session/deletion behavior is tested only with synthetic in-memory accounts.
