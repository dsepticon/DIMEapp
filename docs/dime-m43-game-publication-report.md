# Scoped guest publication — 2026-09-16

Public URL: https://destroyaindustriesminingextension.com/game/

Published the exact build approved at `523fc36` / `7a3f5c3` on `codex/dime-m4-graphics-web`. No application source or deployed Lambda changed in this publication. New repository files contain public-browser verification and deployment/rollback evidence only.

## Artifact and preflight

ZIP: `/tmp/dime-m43-game-review/DIME-Web-0.9.0-game-scoped-review-20260916.zip`, 111,199 bytes.
SHA-256: `81fefdc80654ef0ab45d0665f2ad26482b09e1d29b9a311d8343deae4764e623`.
All archive entries, manifest bytes and reviewed edge-file hashes matched before AWS changes. Account `861738068626`, website bucket `destroyaindustriesminingextension.com` in `us-west-2`, distribution `EC269D02M2JLD` verified.

## CloudFront execution

Auxiliary stack `dime-guest-game-20260916` reached **CREATE_COMPLETE**. Executed change set:
`arn:aws:cloudformation:us-east-2:861738068626:changeSet/guest-game-7a3f5c3-20260916/a7e1d27c-1d25-4083-84c4-6a83f97e8e1e`.

Exactly three additions, no modifications/removals/replacements/IAM capabilities:

| Logical resource | Type                    | Deployed identifier                                                               |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------- |
| GuestCapability  | CloudFront Function     | `arn:aws:cloudfront::861738068626:function/dime-guest-game-20260916-guest-status` |
| GuestHeaders     | Response headers policy | `e8bc9f43-dd2c-4c3e-ad24-ec4419de3ab5`                                            |
| GuestCache       | Cache policy            | `91f7529d-33fb-4f4b-9506-a3562dcede56`                                            |

Reviewed source and processed templates were structurally identical; cfn-lint, Guard and predeployment describe-events checks passed. Resource events show successful creation and no failed operation.

Distribution update used verified `If-Match: E2GYT0DANXUABP`; accepted/deployed ETag `E3GPEVCIK9UL3J`. Only ordered CacheBehaviors changed: `/game/*`, `/api/v4/state`, `/api/v4/actions`, `/api/v4/profile/reset`, `/api/v4/content/convert`. The default origin, behavior, document, error responses and every other configuration field stayed unchanged. Distribution reached **Deployed before any application upload**.

CloudFront serialized method sets in a different order and returned empty optional XSS/HSTS policy objects. Verification normalized only method-set ordering and those empty fields; no routing order or policy value was relaxed or changed.

## S3 publication

All three target keys were absent before publication. No existing object was replaced, so original version IDs, ETags, sizes, metadata and hashes are explicitly null in `objects-before.json`. Bucket versioning is not enabled; new objects have no VersionId. We did not change versioning. Root and privacy bytes/metadata were backed up locally for preservation checks.

Every upload used `If-None-Match: *`, expected bucket owner and AES256 encryption. Assets uploaded first, entry last. GetObject and public HTTPS bytes matched every reviewed SHA-256. Only the three reviewed keys were written. Complete ETags, metadata and hashes: [uploaded objects](dime-m43-game-publication/uploaded-objects.json).

| Key                                    |  Bytes | SHA-256                                                            | Cache-Control                          |
| -------------------------------------- | -----: | ------------------------------------------------------------------ | -------------------------------------- |
| `game/0.9.0/assets/index-BPyjZOOz.css` |  20842 | `235789dd82f9c565f0ee1e9b27709bb2526dfc0aba3b5420ce18df009d1ed9b6` | `public, max-age=31536000, immutable`  |
| `game/0.9.0/assets/index-DHu8VPJb.js`  | 364380 | `9f080626b4f0118a55685105554cf0c263feea15e8b02888a04487b711de11c5` | `public, max-age=31536000, immutable`  |
| `game/index.html`                      |    505 | `fa843fc409a4a940943e2c1d05810412b2a92794d7bbb81dc16a609cd4a07f68` | `no-cache, max-age=0, must-revalidate` |

One invalidation: **`I9JK3TC2W4ZPAALPVVJNI1PO7Q`**, only `/game/` and `/game/index.html`, completed.

## Public routing and authentication evidence

- HTTPS/TLS succeeded. `/game/` and all three files returned the reviewed bytes, MIME types and cache controls. Guest CSP applies only to the game behavior; no global CSP/HSTS change.
- `/` remains 200, SHA-256 `2bcc8de3c43b8ac7feef1f1e21d331f93a4f6a2d37e808ef2b64f006915dae1a`.
- `/privacy` remains 200, SHA-256 `6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c`.
- Root/privacy selected headers match the baseline. Unrelated missing assets and website `/auth/logout`, `/auth/delete/resume`, `/state`, `/v4/state` retain their original 404 responses; they were never API proxies on this domain.
- GET, POST and OPTIONS on each of the four exact guest API paths returned 401 with `X-Cache: FunctionGeneratedResponse from cloudfront`. The reviewed published viewer-request function returns the response before origin forwarding, establishing no origin invocation for these 12 probes. This is function/configuration/HTTP evidence; origin logging was not enabled or changed.
- Missing game assets return the reviewed function-generated 404, without SPA fallback. `/game/status` exposes only disabled sign-in/linking and memory-only guest capability.
- Thirteen direct API checks passed using no credentials: auth status 200; login/callback 503 without redirects; logout 200 with expired cookie; deletion continuation without proof 401; eight Extension routes 401 using the permitted Extension origin. An initial Extension probe using the website Origin returned the existing 403 CORS rejection; the corrected Extension-origin probe returned 401. Neither probe mutated data.
- The existing Extension-origin OPTIONS preflight also passed with the exact allowed origin. Both Lambda code hashes stayed identical. Gameplay stack remains UPDATE_COMPLETE. Sign-in **DISABLED**, linking **DISABLED**, conversion **ENABLED**.

## Browser verification

All three complete public Chromium journeys passed in one run (5.6 minutes): 318×500 touch, 360×640 touch/reduced motion, 1280×900 keyboard. Each exercised physical exits, ship assignment/departure, Ping, Analyze, optimal-band laser control, successful three-piece fracture, vacuum of all pieces, cargo sale, First Contract completion, return travel, processing and sale. Menus paused gameplay; map selection did not teleport. Refresh returned to a fresh Crew Ring demo; a second tab remained independent. All browser storage/cookies remained empty, every request was an approved GET, and console/page/network error counts were zero.

Target-cycle verification used a physical journey to the Loam tunnel and sub-tile overlap of two legitimate scanner candidates. The first added harness assumed two targets would overlap at tile centers in the quest zone; the deterministic fixture has no such overlap. A second harness attempt read the canvas before mounting; an explicit readiness assertion fixes that test-only race. No frontend artifact or game behavior was modified. The final two-case run passed cleanly: keyboard Q and touch target-cycle selection both changed the focused rock. Together with the full journey run, **5 public browser cases passed**.

| Viewport | Frame p95 / worst (ms) | Unobstructed view | Canvas / DOM nodes | Document scrolling |
| -------- | ---------------------- | ----------------- | ------------------ | ------------------ |
| 318×500  | 16.7 / 16.8            | 84.74%            | 1 / 60             | none               |
| 360×640  | 16.8 / 16.8            | 89.47%            | 1 / 60             | none               |
| 1280×900 | 16.7 / 16.8            | 97.89%            | 1 / 60             | none               |

These are 120-frame startup samples in headless Chromium on this runner, not guarantees for all devices or long-session heap measurements. Screenshots of initial gameplay, confirmed analysis and fracture at all three sizes are in [screenshots](dime-m43-game-publication/screenshots/). Visual inspection confirmed readable controls and unobstructed player/rock presentation.

Publication verification also passed lint, strict typecheck, formatting and diff checks. The unchanged reviewed build had previously passed 418 unit tests and 169 complete/local Chromium cases; the publication run repeated the unit suite (418 passed). The first sandboxed attempt could not spawn two required subprocesses (EPERM/local server readiness); the complete unrestricted rerun passed all 60 files. No rebuild substituted different bytes for the approved ZIP.

No authenticated user, real player save or token was used. Public guest verification uses in-memory deterministic demo data. Network checks admit only the reviewed static GETs and `/game/status`; no authenticated mutation request is made. Storage and cookie assertions verify no persisted gameplay or identity in the test contexts. These observations plus the unchanged memory-only adapter establish that the guest journey creates no account, session, identity, manifest, save or receipt; no database inspection was used to make this determination.

## Rollback readiness

[Rollback manifest](dime-m43-game-publication/rollback.json) records original absence, publication ETags and the original full distribution configuration. Local backup archive: `/tmp/dime-m43-game-publication/rollback-backup.zip`, SHA-256 `c5395029aca95a84fbc571e146c1899b8b0cf83fc3219ea0d5d4398c32402d1b`.

To roll back, verify current configuration/ETag, conditionally restore the original DistributionConfig, conditionally remove only the release-created `game/index.html` against its recorded ETag, retain immutable assets as reviewed, wait for Deployed and invalidate only the two game entry paths. Original root/privacy backups remain untouched. Auxiliary resources may remain detached; cleanup is separately reviewed. No previous game object versions exist to restore. Live rollback was not needed or exercised; reviewed configuration round-trip and archive checks supply readiness evidence.

## Scope and Git

No Lambda, DynamoDB, IAM, OAuth, linking configuration, mineral balance, root website, privacy object or Twitch release was changed. No table scan, player-data inspection, reset/wipe, secret retrieval or exposure occurred. Amplify automatic patterns and connected branches remain only `main` and `codex/react-extension-rebuild`; this branch is excluded. Publication report and test code are committed and pushed only to `codex/dime-m4-graphics-web`.
