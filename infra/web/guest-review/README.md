# Scoped guest-game routing review — NOT DEPLOYED

This replaces the broad root/default proposal rejected in `c79ef2e`. Target: `https://destroyaindustriesminingextension.com/game/`, bucket `destroyaindustriesminingextension.com` (us-west-2), distribution `EC269D02M2JLD`, account `861738068626`.

## Exact boundary

The only changed distribution field is `CacheBehaviors`: zero ordered behaviors become five. The existing origin, default cache behavior, default document, custom errors, aliases, TLS certificate, logging, restrictions and every other distribution property remain structurally identical. No root entry, `/privacy`, `/assets/*`, `/auth/*` or unrelated object changes.

| Order    | Exact pattern             | Result                                                 | Policy / origin                                      |
| -------- | ------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| 1        | `/game/*`                 | Guest static files, exact capability, missing-file 404 | GuestCache + GuestHeaders, existing website origin   |
| 2        | `/api/v4/state`           | Uncached 401 before cache/origin                       | GuestCache; existing website origin is never invoked |
| 3        | `/api/v4/actions`         | Same                                                   | Same                                                 |
| 4        | `/api/v4/profile/reset`   | Same                                                   | Same                                                 |
| 5        | `/api/v4/content/convert` | Same                                                   | Same                                                 |
| fallback | existing default          | Unchanged                                              | Original policy/origin/headers                       |

Only `/game/*` is a wildcard. The four API patterns are literal and disjoint from it and each other. No `/api/*` or `/auth/*` catch-all exists. `/game` (without slash), `/games/`, `/api/v4/actions/extra`, logout, deletion continuation, Extension `/state`, `/actions`, `/v4/*`, `/privacy`, images and unrelated paths use the original default. The guest makes **no persistent API call**; exact API denials are defense-in-depth for the four previously reviewed web paths. This is not a general WAF or authentication replacement. Unknown/encoded alternate paths are not newly intercepted across the website; all existing backend authentication remains required.

The function never reads headers, cookies, query strings, identities, authorization codes or provider data. It only checks URI and method:

- GET `/game/status` returns the non-sensitive memory-only guest capability, sign-in/linking false, `no-store`.
- `/game/` rewrites its origin URI to `/game/index.html` inside the already selected behavior. No default document is changed.
- Only the three manifest files are forwarded; unknown `/game/*` files return a generated JSON 404 without an origin request. There is no SPA fallback, custom error rewrite or missing-asset redirect.
- The four exact API paths return JSON 401, including POST/OPTIONS, without forwarding. No API Gateway origin is added.
- Normal logout/deletion routes are untouched, not proxied through the game function. Their pre-existing delivery and authentication requirements remain unchanged.

The browser fetches only static files and `/game/status` with credentials omitted. It does not call `/auth/status`, login, callback, or persistent API routes. Compiled audit rejects storage implementations and persistent/auth endpoint strings.

## Proposed resources

Exactly **three** auxiliary additions: `GuestCapability` (CloudFront Function), `GuestHeaders` (ResponseHeadersPolicy), `GuestCache` (CachePolicy). The cache policy is new relative to the superseded review because a single `/game/*` behavior must respect both no-cache HTML and one-year immutable object metadata. MinTTL=0, DefaultTTL=0, MaxTTL=31536000. Cookies, viewer headers and query strings are not cache keys or forwarded. Normalized Accept-Encoding is the sole compression-related exception; no feature needs viewer credentials or query strings. No origin-request policy is attached.

`/game/*` allows GET/HEAD, caches GET/HEAD, compresses, and redirects HTTP to HTTPS. Exact denial behaviors allow CloudFront's seven-method group solely so the viewer function can reject mutation methods; all HTTPS requests on those paths terminate at the edge. There are no origin permission grants. Security headers/CSP apply only to `/game/*`, never default or API-denial behaviors. Generated JSON responses explicitly include no-store, nosniff and no-referrer. No cross-origin allowlist is introduced: guest resources are same-origin and do not use cross-origin API calls; existing Extension CORS is unchanged.

No IAM, Lambda, table/index, OAuth, DNS, certificate, API Gateway route, permission, log or alarm change. No resource removal/replacement. The existing distribution is updated conditionally through its native configuration API only after separate approval; it is not imported or replaced by the auxiliary template. No change set has been created, since this task must stop before AWS writes.

[Full before/after comparison](distribution-diff.json) contains logical references for not-yet-created policy/function outputs and is deliberately **not executable**. `scripts/prepare-guest-routing.mjs` accepts only actual resource outputs and a verified snapshot for any future concrete candidate. Recompare the complete result and fresh ETag before execution. The current existing website origin remains HTTP to S3, as required by the owner's no-origin-change boundary; this review does not claim end-to-end HTTPS to that origin.

## Files, caching and rollback

See [publication manifest](../../../docs/dime-m43-game-publication-manifest.json). Three new keys only: `game/index.html` (505-byte entry) plus two hashed files under `game/0.9.0/assets/`. No `/assets/*` reuse. Entry uses `no-cache, max-age=0, must-revalidate`; assets use `public, max-age=31536000, immutable`; AES256 preserved. All initial writes are create-only because read-only inventory found no game-prefix objects. Recheck absence immediately before publication and stop on drift. No existing object is scheduled for replacement, so no remote backup write is needed for this candidate. If a future review authorizes replacement, record and back up bytes, metadata, ETag, version and hash first.

Future single invalidation: `/game/`, `/game/index.html` only. Restore the exact original distribution snapshot conditionally for rollback; invalidate those same paths. The rollback manifest records that the entry did not previously exist: removal may target only the release-created entry, with its recorded publication ETag and separate rollback authorization; retain immutable assets and unrelated objects. Original root/privacy byte backups are local evidence, not planned overwrite targets. No live publication or rollback occurred.

## Validation interpretation

Unit tests compare the full candidate after replacing only `CacheBehaviors` with its baseline; all other fields must equal exactly. Path tables prove disjoint behavior selection and zero credential forwarding. Compiled Chromium journeys run at production `/game/` paths in Panel, Mobile and desktop. Routing smoke tests emulate the reviewed edge plus an unchanged origin and verify 401 without origin invocation; these are local tests, not claims of an AWS edge deployment. Public root/privacy hashes and anonymous Extension rejection are separately checked read-only against live HTTPS. Actual CloudFront propagation/function runtime remains a mandatory future deployment verification gate.

References: [AWS cache behavior ordering](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html), [cache-policy forwarding/TTL](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html), [viewer function responses](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/function-code-choose-purpose.html).

For a local preview: `node scripts/build-guest.mjs`, then `node scripts/preview-guest.mjs`, and open `http://127.0.0.1:4188/game/`. The preview server is not an artifact and cannot authenticate or persist guest progress. Online sign-in and linking remain disabled.

### Authorization forwarding refinement

The game behavior allows GET/HEAD only. No guest feature needs OPTIONS; omitting it avoids CloudFront's documented Authorization forwarding on uncached OPTIONS. The four exact API-denial behaviors retain all methods solely for rejection; the associated function fails closed for any non-game URI spelling without reading credentials. This does not attach the function to unrelated paths. Normalized paths that leave `/game/` select the original default unless they match one of the four literal denials. [AWS custom-origin header behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html).

The scoped policy deliberately omits HSTS: browsers apply HSTS to the entire host even when received on a single path. Omitting this new host-wide policy preserves unrelated-site browser behavior; existing viewer HTTPS redirection and the TLS certificate remain unchanged.
