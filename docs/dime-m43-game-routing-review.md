# Milestone 4.3 — scoped `/game/` publication review

**Prepared only. No AWS resources or website objects have been changed.** This replaces the broad default-behavior proposal stopped at `c79ef2e`. No root-site link is included or published.

Source commit: `523fc36b9aba4e3cb9785b6db94020958eb8ee32` on `codex/dime-m4-graphics-web`. The companion report commit only binds this reviewed source and records evidence.

## Exact approval scope

Proposed public URL: **https://destroyaindustriesminingextension.com/game/**.

| Component                                          | Before                              | Proposed                                      |
| -------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Origins                                            | One existing website S3 origin      | Identical; zero additions/removals            |
| Default cache behavior                             | Existing origin, policy and headers | Byte-for-byte equivalent structure            |
| Default document                                   | Empty distribution setting          | Unchanged                                     |
| Custom error responses                             | None                                | Unchanged                                     |
| Ordered behaviors                                  | None                                | `/game/*` plus four literal API-denial paths  |
| Auxiliary resources                                | Not created                         | Add GuestCapability, GuestHeaders, GuestCache |
| IAM, Lambdas, DynamoDB, API Gateway, OAuth/linking | Existing deployment                 | No changes                                    |
| Root, privacy, existing shared assets              | Existing files                      | No writes                                     |

Ordered patterns are exactly:

1. `/game/*`
2. `/api/v4/state`
3. `/api/v4/actions`
4. `/api/v4/profile/reset`
5. `/api/v4/content/convert`

Only the first has a wildcard; the other four are disjoint literal matches. Paths for Extension gameplay, `/auth/*` including logout/deletion continuation, privacy and unrelated pages cannot match these behaviors. `/game` without its trailing slash remains unchanged; the public entry is `/game/`. No new redirect or global fallback is introduced.

[Full before/after distribution comparison](../infra/web/guest-review/distribution-diff.json) records the live baseline ETag `E2GYT0DANXUABP`, complete configurations and symbolic CloudFormation output references. It is not an executable AWS update. The only differing top-level field is `CacheBehaviors`. The offline candidate generator requires actual resource outputs and fresh verified state for a future approved update.

### Behavior details

`/game/*` uses the existing origin, GET/HEAD, HTTPS redirection and compression. `/game/` rewrites to `/game/index.html` within its selected behavior. Only the entry and two reviewed hashed assets can reach the origin; unknown game files receive JSON 404. No SPA fallback or unrelated error-response change exists.

`GuestHeaders` is attached only to `/game/*`. Its same-origin CSP, frame protection and other reviewed headers are documented in the [routing specification](../infra/web/guest-review/README.md). The existing default receives no response-header policy. Exact API denial responses have only their explicit safe JSON/no-store headers, not the game's CSP policy. No new cross-origin access or credential forwarding is permitted; existing Extension CORS is untouched.

`GuestCache` is a new third auxiliary resource: MinTTL=0, DefaultTTL=0, MaxTTL=31536000. This permits one behavior to honor short/no-cache HTML and immutable asset metadata. Cookies, authorization/other viewer headers and query strings are neither included nor forwarded; normalized Accept-Encoding supports compression. There is no origin-request policy or additional API origin.

The four API patterns allow CloudFront's seven-method group only to return 401 from the viewer function before origin invocation. The guest bundle has no persistent API calls: its sole capability fetch is credential-less `/game/status`. The edge capability creates no identity or record and does not contact either Lambda. Other website and authentication paths preserve their existing delivery, rather than adding new proxy behavior.

## Publication artifact and rollback

- [Scoped ZIP](/tmp/dime-m43-game-review/DIME-Web-0.9.0-game-scoped-review-20260916.zip)
- Size: **111,199 bytes**
- SHA-256: `81fefdc80654ef0ab45d0665f2ad26482b09e1d29b9a311d8343deae4764e623`
- [Exact publication manifest](dime-m43-game-publication-manifest.json)
- Local rollback review archive: `/tmp/dime-m43-game-review/DIME-game-scoped-rollback-review.zip`, SHA-256 `c438fb064c606361a99bf318a18e827647ebb1d48165951763db0d823c4d6325`.

| S3 key                                 |   Bytes | Cache                                |
| -------------------------------------- | ------: | ------------------------------------ |
| `game/index.html`                      |     505 | no-cache, max-age=0, must-revalidate |
| `game/0.9.0/assets/index-BPyjZOOz.css` |  20,842 | public, max-age=31536000, immutable  |
| `game/0.9.0/assets/index-DHu8VPJb.js`  | 364,380 | public, max-age=31536000, immutable  |

Every hash, MIME type and create-only condition is in the manifest. Read-only inventory found no game-prefix objects; HEAD for the entry returned 404. No object is scheduled for replacement. Immediately before any later approved publication, recheck each object and stop on drift. No nonexistent VersionId is invented. Future replacements require newly reviewed backup metadata/bytes/version/ETag/hash.

Future single invalidation covers only `/game/` and `/game/index.html`. Rollback restores the original distribution conditionally and records the entry's prior absence. Removing a newly created entry must be conditional on that release's ETag; immutable assets remain. No unrelated objects may be deleted. Local archive/hash and configuration round-trip checks are review evidence; no live rollback has occurred.

## Read-only live verification

- Account `861738068626`, bucket us-west-2, expected distribution/alias and ETag verified.
- Stack `dime-v2-review-20260912` remains `UPDATE_COMPLETE`.
- WebSignInMode `DISABLED`; AccountLinkingMode `DISABLED`; ContentConversionMode `ENABLED`.
- HTTPS `/` returns 200 and unchanged SHA-256 `2bcc8de3c43b8ac7feef1f1e21d331f93a4f6a2d37e808ef2b64f006915dae1a`.
- HTTPS `/privacy` returns 200 and unchanged SHA-256 `6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c`.
- Eight unauthenticated Extension route probes return 401; no player authorization was used.
- Backend `/auth/status` remains the original non-sensitive disabled-sign-in/linking response. The proposed game capability is not live.
- Distribution was fetched again and compared in full: unchanged.

The original website origin's HTTP transport remains unchanged as explicitly required. Viewer HTTPS succeeds with certificate validation; this review does not claim new TLS protection on that origin leg.

## Validation

Evidence: `/tmp/dime-m43-game-review`.

- Complete unit suite: **418 passed in 60 files**.
- Lint, strict typecheck, guest/default/Twitch/web builds, formatting and diff checks passed.
- cfn-lint, Guard and AWS CloudFormation template validation passed; no IAM capability.
- Guest Chromium: **5 passed in one clean complete run (6.3 minutes)**, including three full gameplay journeys and production-path routing smoke. The complete existing Chromium suite passed **164 tests in one clean run (36.5 minutes)**. Combined final Chromium total: **169 passing tests**.
- Compiled audit: no persistent API/auth endpoint, storage implementation, secret reference or credential strings; sole capability path `/game/status`.
- Loopback HTTP smoke: **10 checks passed**, including entry/asset bytes, cache metadata, capability, missing-file 404 and exact API 401.
- Local routing tests compare every non-behavior property and verify exact patterns, unchanged fallback, zero credential forwarding, asset caching, missing-file 404 and API 401 with zero origin calls.
- Browser production-path fixtures are explicit local emulation. Public CloudFront propagation and viewer-function runtime tests require a later approved deployment; they are not claimed complete here.

The rebuilt Twitch artifact is byte-identical to the prior validated review, including every file.

Both Lambda bundles are unchanged and were not rebuilt: gameplay `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`; web-auth `63de7251010498e7bdef8cf6674709a03549a010baf31172fcc25e66a3b590e8`.

Screenshots: [Panel](/tmp/dime-m43-game-review/screenshots/guest-318.png), [Mobile](/tmp/dime-m43-game-review/screenshots/guest-360.png), [Desktop](/tmp/dime-m43-game-review/screenshots/guest-1280.png). Analysis/fracture images are alongside them. Visual inspection confirms the compact guest badge does not overlap expanded analysis; the world-view layout is preserved.

## Execution boundary

No change set, CloudFront function/policy/distribution write, S3 upload/backup/delete, invalidation, Lambda update, OAuth/link activation or Twitch publication was performed. No player data, item keys or secret values were accessed. The next owner approval should cover this new three-resource auxiliary template, five-behavior comparison and scoped ZIP—not the superseded root publication artifact.

## Guest viewport measurements

120 initial-world frame intervals per layout in local headless Chromium; not a claim about all devices or long-session heap behavior.

| Layout                         | Unobstructed viewport | Frame p95 / worst | Canvas / DOM | Document scroll |
| ------------------------------ | --------------------: | ----------------: | -----------: | --------------- |
| Panel 318×500                  |                84.74% |    16.7 / 16.8 ms |       1 / 60 | None            |
| Mobile 360×640, reduced motion |                89.47% |    16.7 / 16.8 ms |       1 / 60 | None            |
| Desktop 1280×900               |                97.89% |    16.8 / 16.8 ms |       1 / 60 | None            |

### Authorization forwarding refinement

The game behavior allows GET/HEAD only. No guest feature needs OPTIONS; omitting it avoids CloudFront's documented Authorization forwarding on uncached OPTIONS. The four exact API-denial behaviors retain all methods solely for rejection; the associated function fails closed for any non-game URI spelling without reading credentials. This does not attach the function to unrelated paths. Normalized paths that leave `/game/` select the original default unless they match one of the four literal denials. [AWS custom-origin header behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html).

The scoped policy deliberately omits HSTS: browsers apply HSTS to the entire host even when received on a single path. Omitting this new host-wide policy preserves unrelated-site browser behavior; existing viewer HTTPS redirection and the TLS certificate remain unchanged.

## Production renderer regression

The complete production performance study passed at all three layouts using the unchanged Twitch build and current standalone web build with synthetic in-memory transport. It includes scanner/laser/vacuum effects, eight formations, eight fragments, exact 80-unit collection, and Avenbolt Commodity Hall. These finite local measurements are not a deployed Twitch-webview or unlimited-session leak guarantee.

| Layout  | Maximum frame p95 / worst | Transition average / p95 / worst | Retained heap after study | Errors |
| ------- | ------------------------: | -------------------------------: | ------------------------: | -----: |
| Panel   |            16.8 / 16.8 ms |            79.0 / 87.1 / 87.5 ms |                   5.02 MB |      0 |
| Mobile  |            16.8 / 16.8 ms |            75.5 / 77.1 / 77.2 ms |                   5.05 MB |      0 |
| Desktop |            16.8 / 16.8 ms |            76.4 / 87.6 / 88.6 ms |                   5.33 MB |      0 |

One canvas throughout and stable ordinary DOM; no document scrolling. Raw evidence: `/tmp/dime-m43-game-review/production-performance.json`.

HSTS scope reference: [MDN Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security).

Only complete final test runs count toward the release totals. Initial sandbox startup failures and an intentionally interrupted guest run during policy refinement are excluded.

Final read-only distribution comparison still matches the baseline exactly. Amplify connected branches and automatic branch patterns are only `main` and `codex/react-extension-rebuild`; `codex/dime-m4-graphics-web` remains excluded.

## Exact changed files

- `app/guestCapability.ts`
- `docs/dime-m43-game-publication-manifest.json`
- `infra/web/guest-review/README.md`
- `infra/web/guest-review/auxiliary-template.json`
- `infra/web/guest-review/distribution-diff.json`
- `infra/web/guest-review/guest.guard`
- `infra/web/guest-review/security-headers.json`
- `infra/web/guest-review/status-function.js`
- `playwright.guest.config.ts`
- `scripts/prepare-guest-routing.mjs`
- `scripts/preview-guest.mjs`
- `tests/guest-browser/guest.spec.ts`
- `tests/guest-browser/journey.ts`
- `tests/guest-browser/routing.spec.ts`
- `tests/guestEdge.test.ts`
- `tests/guestRuntime.test.ts`
- `vite.config.ts`
- `docs/dime-m43-game-routing-review.md`
