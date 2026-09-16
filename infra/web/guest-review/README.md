# Guest web publication review — NOT DEPLOYED

Target: `https://destroyaindustriesminingextension.com`, bucket of the same name (us-west-2), distribution `EC269D02M2JLD`, AWS account `861738068626`.

## Runtime boundary

`VITE_DIME_MODE=guest` compiles an explicit in-memory simulator. The guest build rejects a configured persistent API URL and substitutes a throwing pending-storage adapter. Other production builds substitute an unavailable guest factory. No mock authentication, identity credential, receipt or request ID is created. The fixed generation in the simulation is a schema sentinel, not an account identifier or authentication proof. Nothing exports or transfers guest progress to a real account.

The simulator shares geometry, charge, fracture, quantity, processing and economy functions with the game. Its only starting differences are labelled demo resources: 5,000 shift marks, a refinery loaner at Tessick Station, and four cSCU of refinery sample stock. Mineral balance is unchanged. No display preferences are persisted. Browser HTTP caching of versioned scripts/styles contains application code, not progress.

The only runtime fetch is credential-less GET `/auth/status`. Missing, malformed, unavailable, or online-enabled capability fails closed. `status-function.js` proposes this exact non-identifying deployment contract:

```json
{"signInAvailable":false,"linkingAvailable":false,"guestDemoAvailable":true,"guestStorage":"memory"}
```

This edge response enables a local demonstration; it never authorizes an API mutation. The two deployed Lambdas remain unchanged. The function returns the capability only for exact GET `/auth/status`; all `/api/*` requests receive a generic uncached 401 before the origin. Other requests, including logout and verified deletion recovery, pass to their configured origin. Before any later OAuth activation, separately remove/replace this static disabled-online capability and deploy a reviewed online frontend. Do not enable OAuth behind this guest contract.

## Proposed resources and distribution changes

`auxiliary-template.json` proposes exactly TWO additions: one CloudFront Function and one response-headers policy. No IAM roles/policies, Lambda, table, index, DNS, certificate, secrets, OAuth settings or API Gateway routes change. No change set or resource has been created in this task.

The existing distribution is NOT owned/imported/replaced by that template. `scripts/prepare-guest-routing.mjs` produces an offline conditional-update candidate only when supplied actual reviewed auxiliary outputs and a fresh matching distribution snapshot. It never calls AWS. A later publication approval must review the concrete candidate and its ETag before applying it.

| Path | Proposed behavior |
|---|---|
| `/privacy` | Exact original default behavior and origin; unchanged object and headers |
| `/assets/*` | HTTPS S3 REST origin, immutable object metadata, CachingOptimized |
| `/auth/*` | Existing staging API over HTTPS, no cache, all viewer inputs except Host; exact GET status edge function |
| `/api/*` | Guest edge gate: all requests return 401 before the existing API origin |
| Default/root | HTTPS S3 REST origin, root `index.html`, caching disabled, reviewed application headers |

The old origin stays for privacy. Two origins are added: `s3.us-west-2.amazonaws.com` with path `/destroyaindustriesminingextension.com`, and `t2la0784p6.execute-api.us-east-2.amazonaws.com` with path `/staging`. The S3 path form avoids the dotted-bucket TLS hostname problem. Public REST `index.html` bytes were verified against the current backup. No bucket-policy change is proposed. The API origin is existing staging only. CloudFront permits its seven-method group on auth/API behaviors because POST/OPTIONS are required, but the guest API gate rejects before forwarding; it grants no backend permission. Anonymous mutation routes remain authenticated.

Preserve alias, TLS certificate, TLS policy, WAF, logging, geographic controls and every unrelated distribution property. No SPA catch-all error rewrite: auth failures and missing paths must retain their status codes. Reject unreviewed behavior/origin drift. Existing unrelated objects are not deleted; their default delivery changes to HTTPS REST with security headers, which needs owner review before publication.

## CSP and browser boundary

`security-headers.json` is applied to the application and assets, not `/privacy`. Scripts and connections are same-origin only; no inline script, eval, third-party helper, external authentication page, iframe embedding or form submission. Existing game HUD animation uses inline style attributes, so only `style-src-attr 'unsafe-inline'` is permitted. Stylesheets remain same-origin. COOP/COEP are deliberately not introduced. Secure cookies remain solely a backend responsibility; guest does not set or send any.

Managed policy references: [cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html), [API Gateway origin-request policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html), [response headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/modifying-response-headers.html).

## Publication and rollback gate

This is preparation only. Before any remote write, verify account, distribution ETag, secret-free mode parameters (`DISABLED`, `DISABLED`, conversion `ENABLED`), origin responses and exact guest artifact hash. Re-head and hash all replaced objects. Preserve `/privacy` SHA-256 `6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c`.

The current bucket reports no enabled versioning and the current index has no VersionId. Never invent version IDs. Create immutable, create-only backup objects under a versioned release prefix before replacement, verify their hashes, and record returned VersionIds/ETags (VersionId may remain null). Backups already available locally are not remote publication backups. Conditional index write must match its freshly verified ETag; new hashed assets use If-None-Match `*`. If an asset already exists, reuse only after exact byte/metadata verification; do not blindly replace it.

Publish hashed assets first, verify hashes, then index last. HTML uses `no-cache, max-age=0, must-revalidate`; hashed assets use `public, max-age=31536000, immutable`; preserve encryption. One eventual invalidation: `/` and `/index.html`. Viewer-request status response is generated before cache lookup. No privacy invalidation.

Rollback: restore exact old index bytes and original metadata conditionally against the recorded new ETag; restore the original distribution snapshot against its current verified ETag; invalidate the same entry paths. Leave new content-addressed assets in place (harmless and no unrelated deletion). Detach the new edge function/headers before deleting auxiliary resources through a separately reviewed change set. The local rollback bundle hashes are verified; no remote rollback or publication has occurred.

OAuth sign-in, account linking, guest progress transfer and public Twitch release remain outside this review. Both deployed Lambdas, player data and privacy must remain untouched.

## Local reviewer preview

With the locked Node 22 dependencies installed, run `node scripts/build-guest.mjs`, then `node scripts/preview-guest.mjs`. Open `http://127.0.0.1:4188`. This binds only loopback, serves the exact proposed status function, and has no authenticated API implementation. Its CSP omits only HTTPS upgrading for localhost HTTP. The production HTTPS browser fixtures use the full CSP. Do not upload this preview server with the static artifact.

## Existing disabled-web API limitation

Read-only verification found all eight anonymous/forged probes across four direct staging web gameplay paths return a generic 503 while online sign-in is disabled. Its backend root cause was not investigated in this frontend-only task. No request succeeds; the guest frontend never calls these paths. This task does not change either Lambda to alter that response. The proposed guest edge function therefore rejects every public-domain `/api/*` request with uncached 401, including forged credentials, and never forwards it to persistence. Tests exercise the exact function embedded in the reviewed template. Direct staging web responses remain an existing limitation for the later online rollout; guest gameplay does not call them. Extension API authentication remains 401. Remove/replace the edge API gate only in a separately reviewed online activation.
