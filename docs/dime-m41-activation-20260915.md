# Milestone 4 staging activation and movement correction — 2026-09-15

## Outcome

The exact staging stack is `UPDATE_COMPLETE`, content conversion is `ENABLED`, and tester tags remain empty. All 592 staging items were deleted; the subsequent empty pass and two independent verification scans each found zero. Table protections and configuration are unchanged.

The movement and vacuum fixes are committed and packaged. Authenticated Twitch console control is unavailable, so replacement upload, Local Test, Hosted Test and authenticated live gameplay remain unverified. No public review or release was requested or performed.

This report supersedes the DISABLED/no-deletion status in the earlier [Milestone 4.1 release report](dime-m41-release-20260915.md). The owner explicitly authorized this staging-only activation and complete staging-item deletion.

Machine-readable evidence: [activation manifest](dime-m41-activation-20260915.json). Detailed local evidence is retained in `/tmp/dime-m41-activation`.

## Source and scope

- Worktree: `/tmp/dime-m41-publication`.
- Branch: `codex/dime-m4-destroya-universe`.
- Starting local/remote commit: `11ef6d6f1cc04ca1b1e09acc456c9cdb2f59fc3e`, descended from the original required Milestone 4.1 source.
- Fix commit: `d87da54b58b4adc5e7661c22f7341f496e0a1827`.
- The independent `codex/dime-m4-web-oauth` worktree was not modified.
- Amplify app `d90ik3712sg8e` connects and automatically creates only `main` and `codex/react-extension-rebuild`; this Milestone 4 branch is excluded. Rechecked immediately before push.
- No push to either protected branch, merge, force-push, branch deletion or history rewrite.

Changed files:

| File                                                              | Change                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/original/WalkingWorld.tsx`                                   | Local animation loop, visible player, following camera, keyboard/pointer controls, focus/visibility cleanup, node targeting                                  |
| `app/original/walking.ts`                                         | Normalized movement, bounded frame delta, wall collision, walkable spawn/arrival positions                                                                   |
| `app/original/Main.tsx`                                           | Mount walking world and pass actual local position into mining                                                                                               |
| `app/original/MiningConsole.tsx`                                  | Actual targeting/extraction coordinates, pointer capture/release, latest revision for vacuum completion, distance-based timing, active-target selection lock |
| `app/original/original.css`                                       | Responsive world area and directional controls clear of the centered player                                                                                  |
| `tests/m4Walking.test.ts`                                         | All-zone spawn safety, movement normalization and collision regression                                                                                       |
| `tests/m4FreshProfile.test.ts`                                    | Direct canonical creation, unchanged refresh, no conversion receipt and canonical reset                                                                      |
| `tests/e2e/m4Movement.spec.ts`                                    | Production Panel/Mobile movement, mining, conversion and retry regression                                                                                    |
| `playwright.m4.config.ts`, `playwright.config.ts`, `package.json` | Separate production-build regression command from the existing development/legacy suite                                                                      |

## Exact AWS target and conversion update

- Account: `861738068626`.
- Region: `us-east-2`.
- Stack: `dime-v2-review-20260912`; verified `UPDATE_COMPLETE` before and after.
- Change-set ARN: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m41-conversion-enabled-20260915-1/c54d9ca1-7449-4529-bb0b-7be15b1a12c7`.
- Executed exactly once using client request token `m41-enable-20260915-1`.
- Exact operation: one non-replacing `Modify` of `EbsFunction.Environment`.
- `DIME_CONVERSION_MODE`: `DISABLED` → `ENABLED`.
- `DIME_CONFIG_REVISION`: `m41-original-universe-20260915-1` → `m41-conversion-enabled-20260915-1`.
- Tester tags: verified empty as a boolean, without displaying sensitive configuration.
- No API reevaluation was needed. No other resource operation, removal, import or replacement appeared.

The deployed original template exactly matched the reviewed packaged template. Source, packaged and processed cfn-lint passed; all six source Guard rules and four processed Guard rules passed. CloudFormation template validation passed. Candidate and deployed processed templates were structurally identical. Resolved before/after contexts differed only in the two approved environment values. Predeployment `describe-events` showed successful change-set creation; postdeployment failed-event queries returned no events. `describe-stack-events` was not used.

Lambda code was not rebuilt, uploaded or redeployed. Its ZIP CodeSha256 remains `rxZnl9Z5emblaB6SLaAtIOzHYBtcrtCiSK5bj2H/HnA=` (hex `af166797d6797a66e5681e922da02d20ecc7601b5caed0a248ae5b8f61ff1e70`). Existing S3 artifact version remains `S3yh29eIbXGuWR7su4pVComz734DpTTo` under the original `1fd284cc183b551b77fb7786f7c04f655c7cdf96` review prefix.

Eight routes and their existing scoped invoke permissions remain unchanged:

- `GET /state`, `POST /actions`, `POST /profile/reset`.
- `GET /v4/state`, `POST /v4/actions`, `POST /v4/profile/reset`.
- `POST /v4/content/preview`, `POST /v4/content/convert`.

All eight unauthenticated checks returned 401. Exact extension-origin preflight returned 204 with the matching allow-origin header. No player response body was inspected. IAM remains the reviewed GetItem/PutItem permission on this table and CreateLogStream/PutLogEvents on this Lambda's log streams, with no attached policies. Table, IAM, permissions, CORS, stage, throttling, logs, alarms, secret references and outputs were unchanged.

## Complete staging-item wipe

Exact table: `dime-v2-staging-review01-dime-v2-review-20260912-player-state`.

Exact ARN: `arn:aws:dynamodb:us-east-2:861738068626:table/dime-v2-staging-review01-dime-v2-review-20260912-player-state`.

| Measurement                          | Result                             |
| ------------------------------------ | ---------------------------------- |
| Start UTC                            | `2026-09-15T14:30:31.657484+00:00` |
| Finish UTC                           | `2026-09-15T14:31:09.661417+00:00` |
| Initial full key-only count          | 592                                |
| Acknowledged deletion requests       | 592                                |
| STATE category                       | 6                                  |
| REQUEST category                     | 586                                |
| Other technical category             | 0                                  |
| Retry rounds                         | 0                                  |
| Complete deletion-pass counts        | 592, then 0                        |
| Independent final verification scans | 0 and 0                            |
| Successful wipe error                | None                               |

Every item in this exact staging table was eligible for deletion, including unknown technical categories. Scans projected only `pk` and `sk`, used consistent reads, and followed every pagination cursor. Deletes were bounded to 25 requests per batch, with bounded exponential backoff implemented and synthetically checked for unprocessed writes. Keys were held only in process/anonymous memory, never printed or written to persistent files. Category counts use only the technical sort-key prefix; conversion provenance embedded in STATE was not separately inspected.

One earlier attempt stopped in read-only preflight because AWS CLI rejected JSON read from standard input. It completed zero scans/deletions. Anonymous memory-backed file descriptors corrected the input handling; no key-bearing disk file was created. Three synthetic checks verified pagination/projection, unprocessed-write retry accounting and batch bounds. No recurring client writes required closing the Twitch test window.

Protected metadata recorded before and after:

| Property                 | Unchanged value                        |
| ------------------------ | -------------------------------------- |
| Table status             | ACTIVE                                 |
| Table ID                 | `7fb5e7ae-bb65-4955-89f7-c842ab0e2116` |
| Primary key              | `pk` HASH and `sk` RANGE, both String  |
| Secondary indexes        | None                                   |
| TTL                      | ENABLED on `expiresAt`                 |
| Continuous backup / PITR | ENABLED; 35-day recovery period        |
| Earliest recovery point  | `2026-09-12T17:20:54-06:00`            |
| Encryption               | KMS, ENABLED, same key ARN             |
| Billing                  | PAY_PER_REQUEST                        |
| Deletion protection      | Enabled                                |

The latest-restorable PITR timestamp advanced normally. Existing backups remain governed by the unchanged recovery window. DynamoDB's approximate metadata ItemCount was 533 before the wipe; the authoritative full key-only scan found 592. The table itself was not deleted or recreated. No other table was scanned, read for player fields, or written.

## Supported movement root cause and correction

The production alias loaded `app/original/Main.tsx`. Its original canvas ref drew tiles and one fixed player rectangle; it had no movement state, input listeners, camera updates or animation loop. The legacy walking engine was not mounted. Enabling conversion or resetting data could not repair this frontend omission.

Running the original 0.8.0 ZIP locally with synthetic authorization reproduced unchanged canvas pixels after keyboard input in both Panel and Mobile, with zero directional controls. The corrected production build changes player/camera rendering and exposes four touch controls. Walking creates zero save writes per frame.

Regression checks cover WASD, all arrow directions, actual touch events, pointer holds/releases, wall collision, walkable arrival in every zone, profile-overlay pause/cancel, navigation/tool/cargo interaction, blur/focus recovery, reduced motion, refresh, reset and a second reachable zone. The canvas receives focus and label overlays do not intercept pointer input.

A production mining test also exposed stale-closure vacuum completion: it reused the revision captured before `startVacuum`, returned a revision conflict and left extraction active. Completion now reads the current callback/revision and waits for distance-based server timing. Laser and vacuum use the actual local position instead of fabricated coordinates. Tests verify charge rise, release decay, residual HUD, optimal-band pulsing, deterministic 3–8-piece fracture, zero-yield overcharge, vacuum collection and movement resumption.

## Fresh profiles and gameplay verification

The deployed factory already creates a canonical profile directly through `/v4/state`: content version 4, save format/schema 3, Tessick Station / Crew Ring Arrival, Lark Skiff and Beamline One. Destroya Industries is the original client's central employer/presentation. No factory or legacy-endpoint change was needed.

Synthetic API tests verify initial creation without a legacy intermediate state or conversion receipt, identical refresh, and canonical reset with a new save generation. Production tests verify explicit legacy preview/conversion once, continued movement after refresh, and one applied action despite a deliberately lost response and replay. Existing domain tests cover capacity enforcement, processing/market accounting, First Contract, travel, cross-player isolation, generation conflicts and idempotency.

These are local synthetic checks. Authenticated post-wipe Twitch gameplay and legacy regression against the live API remain blocked by unavailable authenticated browser control and the absence of an approved live synthetic-authorization mechanism. No signing secret was fetched to manufacture a token, and no real player was used as a test.

## Corrected Twitch artifact

- Target: DIME client `znaovl2j45idub9k81om1dkatwxnu2`, version `0.8.0`.
- Filename: `DIME-Twitch-0.8.0-movement-fixed-20260915.zip`.
- Linux path: `/tmp/DIME-Twitch-0.8.0-movement-fixed-20260915.zip`.
- Windows path: `/mnt/c/Users/dylan/Downloads/DIME-Twitch-0.8.0-movement-fixed-20260915.zip`.
- Size: **90,608 bytes**.
- SHA-256: `274fa1ce9067a368672f560e43ede29b6337b7e3244ef43e88afe01ca7ccdfb5`.
- Both copies are byte-identical.
- Matching v4 rollback: `/tmp/dime-m41-activation/DIME-Twitch-0.8.0-movement-fixed-v4-rollback.zip`. The earlier v4-compatible ZIP is also preserved; no Milestone 3 client is substituted as a v4 rollback.

ZIP audit passed: five root-relative HTML/JS/CSS files, correct Panel/Mobile entries and helper reference, no wrapper directory, source maps, tests, fixtures, images or copied assets, no active legacy-universe terminology, development endpoint/text, obsolete API URL, secret material, tester tags or identities. Runtime maps are generated from the original catalog. The staging API and published privacy URL are correct; conversion remains server-controlled.

No Twitch asset was uploaded by this run. Current remote version status could not be inspected. No website object or privacy policy was changed during this update.

## Validation and performance

- Locked dependencies installed with `npm ci` and Node 22.
- ESLint, strict TypeScript, formatting and `git diff --check`: passed.
- Vitest: **270 tests / 44 files passed**.
- Production Chromium: **6 tests passed** against the real v4 API implementation with an in-memory synthetic store.
- Complete existing Chromium suite: **66 passed in 24.2 minutes**; **72 Chromium tests total** including the production suite.
- Three synthetic wipe safety checks passed.
- CloudFormation validation, three template lint stages, six source Guard rules and four processed Guard rules passed.
- Local corrected production rendering: 301 measured frame intervals per layout over about five seconds; p95 16.8 ms (Panel) / 16.7 ms (Mobile), maximum 16.8 ms, no console errors. This is a local headless Chromium measurement, not a Twitch webview benchmark.

Expected diagnostic failures were corrected: sandbox restriction on the local integration server; initial test assumptions about the full Crew Ring name and fracture count; test sampling raced successful HUD removal; and the actual vacuum revision defect described above. Successful production checks have no unexpected HTTP, console or failed-request errors. The retry test deliberately drops one response.

## Exact remaining human action

1. Open the authenticated Twitch Developer Console for DIME (`znaovl2j45idub9k81om1dkatwxnu2`) and inspect only version 0.8.0. Upload the corrected ZIP above if that version permits asset replacement. If immutable, create 0.8.1; preserve older versions.
2. Verify filename, 90,608-byte size and successful asset processing. Configure Panel `panel.html`, Mobile `mobile.html`, Panel height 500, blank configuration paths, staging API domain `t2la0784p6.execute-api.us-east-2.amazonaws.com`, and privacy URL `https://destroyaindustriesminingextension.com/privacy`.
3. Enter Local Test. With a fresh post-wipe profile, verify Tessick Station/Crew Ring, Destroya Industries, Lark Skiff and Beamline One; no conversion prompt; refresh preserves the profile; reset creates the same canonical defaults.
4. Test Panel and Mobile: WASD/arrows/touch in every direction, hold/release, overlay close, refresh, reset, focus loss/restoration, reachable zone transition, visible player/camera and no blocking overlay or persistent page scrolling.
5. Exercise targeting, hold/release laser charge and residual HUD, optimal pulsing, 3–8-piece fracture, zero-yield overcharge, vacuum, capacity, processing, market, travel, First Contract and retry/refresh persistence. Inspect only safe status/error information; do not share authorization headers or tokens.
6. Live synthetic legacy conversion requires an approved authenticated synthetic fixture mechanism, which is not currently available. Local explicit one-time conversion passed. Do not use a real legacy save as a substitute for this test.
7. After successful authenticated checks, move the corrected version to Hosted Test and repeat the Panel/Mobile smoke test and performance check in actual Twitch webviews. Do not submit for review or public release.

No secret value, real authorization token, item key or real player gameplay field was exposed. Only the explicitly authorized staging items were deleted; no production/legacy table or other prohibited resource was accessed for player data or changed.
