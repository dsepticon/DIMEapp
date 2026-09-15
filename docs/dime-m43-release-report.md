# DIME Milestone 4.3 / 4.2 integration — 2026-09-15

## Release status

The original visual upgrade and web/OAuth integration are prepared on `codex/dime-m4-graphics-web`. The Twitch 0.9.0 candidate uses the existing, unchanged staging gameplay backend. The standalone website and separate OAuth handler are not deployed: real OAuth credentials and authenticated Twitch console control are unavailable. No public release or review submission occurred.

## Source and integration

- Verified M4.1 local and remote starting HEAD: `e21e5c8fa4681569fbb8c5d5387ce8d9bd1df042`.
- Verified OAuth local and remote HEAD: `5ca3c0fb4d44b1e5a34852d38807b11e6c5ce4fb`.
- Merge base: `5f60421a183a53d3eb102ace8550e7841a66ac9a`.
- Only the unique OAuth commit was brought forward, as `0f2c9ebf56f86bbceb5812fc82cf42442997b60a`. Older shared work was not reapplied.
- Visual and integration source checkpoint: `bfb75353b8d550a79844ec672e82b6e345882124`.
- Sign-in privacy correction: `59bc7f7`; accessible link styling: `78c1481e48d910baca43f7da676786c2356c1b9b` (final application source).
- Performance verification and routing documentation: `27743d7`.
- Existing branches and histories were preserved. No merge, force push, or production-branch push was performed.

The integration keeps M4.1 physical navigation, generation-aware recovery, proximity targeting, node compatibility and vacuum behavior. It adds cookie/CSRF transport around those current implementations. Two concrete integration defects were corrected: the older OAuth composition defaulted conversion to DISABLED, and legacy global CSS overrode the production controls, clipping the Panel mining button. The integrated runtime now explicitly requires ENABLED with empty tester tags, and production resolves the original game stylesheet consistently. A visual-only half-tile fragment offset found in review was corrected to use the same authoritative tile-center conversion as vacuum.

The complete browser run also caught the privacy footer being conditional on a loaded profile. It now remains available before sign-in and after logout. Links use the interface's high-contrast mint color and keyboard focus outline. A legacy timed-walking test now waits for the overlay-close render to settle before starting its timer; gameplay timing was not changed. Failed/interrupted browser runs are retained as diagnostic evidence and are not counted as a release pass.

## Visual system and review

See [the visual specification](dime-m43-visual-system.md). The implementation uses original code-native 24-pixel tiles, four-direction industrial workers, three rock silhouettes per size, layered location-specific terrain, collision-derived boundaries, depth sorting, service glyphs, directional exits, bounded ambient workers and particles, charge-responsive laser effects, fragment settling and the preserved vacuum controller. There are no third-party images or audio. Silent audio hooks are ready for future original sound production.

All 43 catalog zones receive their regional treatment. Avenbolt retains connected physical districts; Mica uses a distinct diagonal geology, rather than Loam's sediment treatment. Camera bounds and integer scaling are checked for Panel, Mobile and desktop. Reduced motion and high contrast are included. Walking has no per-frame save writes.

Local review artifacts:

- `/tmp/dime-m43-release/visual-review.html` — before/after comparisons, every zone and mining sequence.
- `/tmp/dime-m43-release/DIME-0.9.0-visual-review.zip` — portable gallery and screenshots.
- `/tmp/dime-m43-release/screenshots/` — individual synthetic-state captures.

Before screenshots come from the hash-verified previous 0.8.0 compiled ZIP. Production web screenshots use the actual production bundle with synthetic HTTPS sessions; they do not represent real Twitch OAuth.

## Validation

- `npm ci`, lint, strict TypeScript and formatting: passed.
- Complete Vitest suite: **343 passed, 53 files**.
- One clean complete Chromium suite: **135 passed**, no retries; 65 production-client tests and 70 legacy/web regressions. This complete run is the release result, not the earlier partial runs.
- Default, Twitch, web, gameplay Lambda and separate OAuth Lambda builds: passed.
- Clean Linux-native SAM builds: passed; both generated modules match their respective distribution modules byte-for-byte.
- SAM validation, gameplay source/packaged/processed cfn-lint, and all six source/four processed Guard rules: passed.
- Optional web source/offline-processed cfn-lint and all seven source/six processed Guard rules: passed. These are offline review artifacts, not an executed change set.
- Compiled archive audit and `git diff --check`: passed.
- Production web verification: three sizes, one canvas, 47 DOM elements, no document scrolling, no credential storage or readable session cookie, working walking/link intent/logout, privacy before sign-in, clean callback URL, no page/network errors. Provider identities are synthetic.

The browser journeys cover all five worlds through physical exits and transit, ship assignment/departure, all three node targets, mining, overcharge, vacuum, refresh, recovery, processing, market and reset. Visual atlas checks cover all 43 zones at three sizes, four directions, reduced motion, high contrast, bounds and overlay layout. Security tests include encrypted-record context integrity, CSRF, state/nonce, replay, refresh contention, revocation, linking conflicts and cross-player isolation.

## Production performance

Local headless Chromium against compiled output and real in-memory services; not authenticated Twitch webview measurements. Each layout runs repeated physical travel for at least three minutes, then eight fragments/eight intact formations, vacuum, laser and the busiest city district.

| Layout | Frame p95 / worst (ms) | Transition avg / p95 / worst (ms) | Vacuum p95 / worst (ms) | Laser p95 / worst (ms) | City p95 / worst (ms) |
| --- | --- | --- | --- | --- | --- |
| Panel | 16.7 / 16.8 | 79.2 / 86.9 / 89.8 | 16.7 / 16.8 | 16.7 / 16.8 | 16.8 / 16.8 |
| Mobile | 16.7 / 16.8 | 75.0 / 76.9 / 77.3 | 16.8 / 16.8 | 16.8 / 16.8 | 16.7 / 16.8 |
| Desktop | 16.8 / 16.8 | 78.8 / 86.2 / 87.5 | 16.8 / 16.8 | 16.8 / 16.8 | 16.8 / 16.8 |

Retained-heap and structure measurements:

- Panel: 19 travel cycles / 114 transitions; forced-GC heap samples 3.45, 5.10, 5.42, 5.55, 5.59, 5.74, 5.80, 5.88, 5.98, 6.01, 6.06, 6.11, 6.18, 6.22, 6.24, 6.30, 6.35, 6.43, 6.47, 6.52 MiB; DOM 47 → 48 → 48; one canvas; no document scroll or reported errors.
- Mobile: 17 travel cycles / 102 transitions; forced-GC heap samples 3.47, 5.19, 5.52, 5.66, 5.75, 5.83, 5.90, 6.00, 6.04, 6.12, 6.16, 6.25, 6.30, 6.34, 6.38, 6.43, 6.51, 6.56 MiB; DOM 47 → 48 → 48; one canvas; no document scroll or reported errors.
- Desktop: 19 travel cycles / 114 transitions; forced-GC heap samples 3.38, 5.09, 5.45, 5.55, 5.67, 5.82, 5.83, 5.94, 5.97, 6.02, 6.06, 6.10, 6.17, 6.23, 6.26, 6.31, 6.35, 6.43, 6.47, 6.52 MiB; DOM 47 → 48 → 48; one canvas; no document scroll or reported errors.

Frame worst includes instrumentation, reload and forced garbage collection. Short local measurements do not prove absence of every leak. Real Twitch webview/network performance remains part of the authenticated release gate. Raw measurements and limitations: `/tmp/dime-m43-release/performance.json`.


### Independent retention diagnostic

The frame/transition benchmark repeatedly injects Playwright polling/evaluation code and retains frame samples, so its raw heap trend is not an application-leak conclusion. A separate browser-owned pathfinding loop repeats real physical travel with no per-step Playwright injection or frame-history array. Direct CDP GC/heap and DOM counters after warmup measured:

| Completed cycles | Retained heap (MiB) | Documents | DOM nodes including internal nodes | Listeners |
| ---: | ---: | ---: | ---: | ---: |
| 6 | 4.429 | 1 | 117 | 162 |
| 12 | 4.472 | 1 | 117 | 162 |
| 18 | 4.506 | 1 | 117 | 162 |
| 24 | 4.522 | 1 | 117 | 162 |
| 30 | 4.505 | 1 | 117 | 162 |

See `heap-stability.json` for the exact method and error count. This diagnostic measures a finite session, not every possible long-term workload.

## OAuth and security

See [the integrated threat model](dime-m43-web-security-review.md) and [runtime gates](dime-m42-runtime-gates.md). Source and synthetic tests cover authorization-code/OIDC state and nonce validation, minimum `openid` scope, separate credentials, encrypted authentication records, random account IDs, Secure HttpOnly host cookies, SameSite=Lax, CSRF, session rotation/expiration, refresh/revocation, one-use linking, conflicting populated saves and cross-player isolation. No confirmed critical/high source finding remains from this review. Real provider and deployed infrastructure verification remains mandatory.

Unlinking, account recovery and verified privacy deletion remain documented designs, not deployed endpoints. Gameplay reset and logout do not delete accounts. Account linking must remain disabled until all writers use the binding-aware implementation and older invocations drain.

## Website and privacy

The web candidate is prepared for `https://destroyaindustriesminingextension.com`, with versioned assets and a single reviewed `index.html`. No website objects, privacy text, DNS or CloudFront behavior were changed.

Conditional, ETag-bound reads backed up existing `index.html` and `privacy`. The local rollback ZIP round-trip reproduces both exact objects; this is an archive restoration test, not a live rollback exercise. Backup metadata and hashes are in `website-backup-report.json`. The unpublished privacy draft passes its complete-text, HTML, receipt disclosure and preserved-contact audit. Its actual publication date must be set when the gated rollout occurs.

CloudFront inspection confirmed the exact domain, one existing website origin, no ordered API behaviors and disabled access logging. The prepared plan adds only `/auth/*` and `/api/*` to the HTTPS staging API with caching disabled and cookies/query/CSRF forwarding. Existing default behavior is preserved. Re-read the distribution ETag before any application. See `infra/web/README.md` and the local `cloudfront-routing-plan.json`.

The review also identified the static origin's HTTP-only hop as unsuitable for the future authenticated app. The candidate plan replaces that origin with native regional S3 REST, retains HTTPS viewer enforcement, and sets `DefaultRootObject=index.html`. Current website metadata confirms that index and no redirect/error rules. This mandatory TLS correction is prepared, not applied; it requires no DNS, bucket-policy or object change and must be verified with the OAuth rollout.

Anonymous HTTPS reads of the existing public `index.html` and `privacy` through the regional S3 endpoint succeeded and matched the backed-up bytes exactly. This verifies object availability for the prepared origin correction; it is not a CloudFront deployment test.

## Backend and CloudFormation

The gameplay Lambda module is byte-identical to the deployed M4.1 module and to its clean Linux SAM build:

`e7c0b35c402671c65b77b6a5987e4d26514bd2ea05648a27f91d9b1c055b6771`

No gameplay Lambda upload or CloudFormation change set was required or executed. The existing staging stack remains `dime-v2-review-20260912`, with eight routes, conversion ENABLED and empty tester tags. Public unauthenticated checks returned 401/UNAUTHORIZED on all eight routes; exact-origin preflight succeeded, and an unrelated origin received no allow-origin header.

Final read-only verification used account `861738068626` in `us-east-2`: stack `UPDATE_COMPLETE`, configuration revision `m41-node-targeting-fixed-20260915-1`, deployed ZIP code hash `AHojOE1AP4HkHhoy2aEYCpvBFcvjqfEKp0s2AMZfHtY=`. The `describe-events` failed-event result was empty. No table, IAM, CORS, permission, log, alarm or output mutation occurred.

The optional combined web handler was built and audited separately. Its offline infrastructure review preserves all old routes and unrelated resources, adds eleven explicit web/auth routes with route-scoped invoke permissions, and identifies the narrowly scoped transactional IAM additions. The generated IAM baseline's wildcard table/KMS and unused actions were rejected. No OAuth IAM expansion or route was deployed. Offline processed-template validation is not a substitute for a credential-resolved AWS change-set review.

## Twitch candidate and remaining human actions

Candidate: `/tmp/DIME-Twitch-0.9.0-graphics-web-20260915.zip`, also copied byte-identically to `/mnt/c/Users/dylan/Downloads/DIME-Twitch-0.9.0-graphics-web-20260915.zip`.

An authenticated Twitch console browser is not controllable from this session. No upload, Local Test or Hosted Test result is claimed. When console access is available:

1. Open DIME and create/select version 0.9.0 without modifying older versions.
2. Upload the audited ZIP; configure `panel.html`, `mobile.html`, Panel height 500, blank config paths, staging API domain `t2la0784p6.execute-api.us-east-2.amazonaws.com`, and `https://destroyaindustriesminingextension.com/privacy`.
3. In Local Test, verify keyboard/touch walking, physical transit, map selection without travel, all three node targets, laser/overcharge, smaller fracture pieces, continuous vacuum, full capacity, refresh and safe request replay in Panel and Mobile.
4. Check real webview performance and errors, then move to Hosted Test only after those checks pass. Do not submit for public review.

For standalone OAuth, register the separate reviewed application with exact callback `https://destroyaindustriesminingextension.com/auth/callback`. Provision only runtime references for the real client secret and separate identity/encryption keys; do not paste secret values into chat or files. Complete provider callback, refresh, revocation, CSRF, linking and logout checks, then the reviewed infrastructure/privacy/website gates. No credentials were invented.

## Resource and data boundary

No staging table scan, wipe, reset, real player-field inspection, item-key exposure or secret-value retrieval occurred. No production/legacy resource was modified. All gameplay mutations in tests used synthetic in-memory state. AWS activity was limited to task-relevant metadata, public unauthenticated checks and conditional website backup reads. No authenticated player token was used for live testing.

## Artifact manifest

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `DIME-Twitch-0.9.0-graphics-web-20260915.zip` | 102591 | `776cb5a9aaf3877fc4378fe59721f1fcdb6c1f0c08ae29552dde1ae61f0a53f8` |
| `DIME-Web-0.9.0-candidate.zip` | 101589 | `2f11212928e930a1f3845ef500e43ba4da0f01c60bee4c4617e45e810ec4e3de` |
| `DIME-Web-Lambda-0.9.0-candidate.zip` | 496901 | `5064fc91dda4329301c573988c8cadf0e985eb6713eb9fa5298eff7ce7b82ded` |

Web and OAuth Lambda ZIPs are under `/tmp/dime-m43-release/`. Twitch local and Windows copies are byte-identical. ZIPs have no wrapper directory, maps, fixtures, tests, development entry, copied artwork or literal secrets. The web ZIP places only `index.html` and its content-versioned assets. The OAuth Lambda ZIP contains only root `index.mjs`; it was not uploaded.

## Exact changed files

- `app/AccountLink.tsx`
- `app/original/Main.tsx`
- `app/original/MiningConsole.tsx`
- `app/original/WalkingWorld.tsx`
- `app/original/audioEvents.ts`
- `app/original/nodeArt.ts`
- `app/original/original.css`
- `app/original/sceneArt.ts`
- `app/webReview.tsx`
- `app/webSession.ts`
- `docs/dime-m42-runtime-gates.md`
- `docs/dime-m42-security-review.md`
- `docs/dime-m43-release-report.md`
- `docs/dime-m43-visual-system.md`
- `docs/dime-m43-web-security-review.md`
- `docs/privacy-m42-draft.html`
- `infra/web/README.md`
- `infra/web/iam-review.json`
- `infra/web/prepare_review.py`
- `infra/web/processed.guard`
- `infra/web/source.guard`
- `playwright.config.ts`
- `playwright.m4.config.ts`
- `playwright.release.config.ts`
- `scripts/build-web-server.mjs`
- `scripts/m4-production-performance.ts`
- `scripts/m43-before-views.ts`
- `scripts/m43-heap-stability.ts`
- `scripts/m43-web-production.ts`
- `server/accountApi.ts`
- `server/authRecords.ts`
- `server/twitchOAuth.ts`
- `server/webAuth.ts`
- `server/webHandler.ts`
- `server/webHttp.ts`
- `tests/authRecords.test.ts`
- `tests/e2e/game.spec.ts`
- `tests/e2e/m42Web.spec.ts`
- `tests/e2e/m43Travel.spec.ts`
- `tests/e2e/m43Visual.spec.ts`
- `tests/e2e/m4Nodes.spec.ts`
- `tests/e2e/m4Release.spec.ts`
- `tests/e2e/m4Vacuum.spec.ts`
- `tests/sceneArt.test.ts`
- `tests/twitchOAuth.test.ts`
- `tests/webAuth.test.ts`
- `vite.config.ts`
- `web-review.html`
