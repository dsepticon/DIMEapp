# Milestone 4 navigation and pending recovery release — 2026-09-15

## Result

The corrected source is committed and pushed to `codex/dime-m4-destroya-universe`. The companion staging Lambda is deployed and verified. The corrected Twitch ZIP is built, audited and copied to Windows Downloads. **Twitch upload, Local Test and Hosted Test remain unperformed because this session has no authenticated Twitch browser control.** No public review or release was submitted.

Source commit: `1423af439db4d2f532f189920b0d610881b6c26f`.
Starting commit: `d5c583411ac36ba90e33c54342fd0ea128c08f45`.
The report is committed separately after the source/artifact commit. Amplify automatic patterns and connected branches were verified as exactly `main` and `codex/react-extension-rebuild` before pushing. Neither branch was changed.

## Root causes and correction

Both failures reproduced against the previous compiled `0.8.0` ZIP in Panel and Mobile with synthetic state, not an inspected real player session.

- **Teleport navigation:** production `.exits` buttons directly submitted `moveZone`. Server checks accepted adjacency without requiring proximity. Existing tests clicked these controls and therefore accepted the defect. The new informational map only selects an objective; it displays the next physical step and a marker. Exit/terminal controls require local approach, with matching server proximity, walkability and line-of-sight checks, plus existing ownership, assignment and departure-point checks. Safe paired arrival and facing are retained. Walking performs no save writes. A fixed interaction row prevents touch-control layout shifts.
- **Pending recovery:** an out-of-range `startLaser` returned `MINING_REJECTED` (409) without changing state. The old client kept the pending record on every error and retried it indefinitely. The reproduced envelope was already version 4 and had request ID, generation and revision markers. The shared recovery classifier now refreshes then clears definitive rejections, retains unknown outcomes under the original request ID, recognizes obsolete generations, and provides explicit confirmed discard. Walking and inspection stay available during ambiguity. Conversion and reset use the same persistence policy; interrupted laser/extraction sessions can be canceled safely.

The older-format/no-generation rule uses strict direct-created v4 invariants: content 4/save format 3/schema 3, revision zero, no conversion receipt and no progress beyond canonical starter state. Converted/reset saves have revision >=1. No browser timestamp or assumed wipe date is trusted, and ambiguous same-version entries are not automatically discarded. Only the matching DIME session entry is removed; other storage remains intact.

The `/v4/state` fresh-profile factory was already correct and remains unchanged. Synthetic tests verify new generation, canonical Tessick Station/Crew Ring state, Destroya Industries, Lark Skiff, Beamline One, no legacy conversion first and no conversion receipt for direct creation. Reset changes generation; synthetic conversion remains idempotent. See [design and recovery proof](dime-m41-navigation-recovery-design.md).

## Validation

- `npm ci`: passed; 245 packages and zero reported vulnerabilities.
- Lint, strict typecheck, formatting and `git diff --check`: passed.
- Vitest: **297 tests across 47 files passed**.
- Chromium: **94 cases passed**: 66 existing tests, plus 28 compiled-production cases. The final production run passed 26; two stale-vacuum pointer fixtures were corrected to use visible targets at the actual Panel/Mobile sizes and both passed their focused rerun. Runtime code was unchanged during that rerun.
- Default, Twitch, web and Lambda builds: passed. Final Twitch output was byte-identical to the audited/browser-tested output.
- Clean Linux-native SAM build and SAM validation: passed. Its `index.mjs` is byte-identical to `dist/server/index.mjs`.
- Source, native SAM packaged, S3 packaged, offline processed and AWS processed `cfn-lint`: passed.
- All six source Guard rules and all four processed Guard rules: passed.

Production cases cover map selection without mutation, keyboard/touch walking and release, focus/visibility/reduced motion, overlays, physical doors/elevator/shuttle, paired directional arrival, ship assignment/departure, remote rejection, fresh state, reset, old-generation and older-format recovery, never-sent requests, unknown/lost responses, receipt replay, conversion retries, explicit discard, new-tab isolation, mining rejection and stale-vacuum recovery. Transaction tests additionally protect collection, sale, processing, conversion, reset and reward from duplicate retries.

Both continuous Panel/Mobile journeys physically reached station ship services, assigned Lark Skiff, walked to departure, traveled to Loam Crescent, scanned/analyzed the First Contract node, pulsed the laser, fractured three pieces, walked to and vacuumed all pieces, refreshed the same saved inventory/node/zone, and selected Avenbolt without teleporting. Separate mining tests verify release cooling, residual HUD, fracture range and zero-yield overcharge. No normal-journey console/network errors occurred. Browser screenshots were visually reviewed.

## Lambda and CloudFormation

Account `861738068626`, region `us-east-2`, stack `dime-v2-review-20260912`.

Change set:
`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m41-navigation-recovery-20260915-1/0eae41d9-1920-43f9-b9b9-ca1f15f05e39`

Executed exactly once; **EXECUTE_COMPLETE / UPDATE_COMPLETE**.
Exactly one operation: non-replacing `Modify EbsFunction`.
Changed properties: `Code.S3Key`, `Code.S3ObjectVersion`, and environment `DIME_CONFIG_REVISION` through `ConfigurationRevision=m41-navigation-recovery-20260915-1`.
All other processed definitions are structurally identical. No API reevaluation operation was proposed. No IAM, table, route, permission, CORS, stage, throttle, output, log, alarm or secret-reference changes occurred. `describe-events` found no failed events; `describe-stack-events` was not used.

Lambda ZIP: `/tmp/dime-m41-navigation/DIME-Lambda-4.1-navigation-recovery.zip`, **486,531 bytes**.
SHA-256: `d68aa9dad07cbdb0b6a2c139cc1b18f72c457d0eba8dd5111bf81e911f0d4414`.
Root-only file: `index.mjs`; no frontend, fixtures, source maps or secret literals. Legacy compatibility and intentional content-conversion modules remain part of the existing backend contract; no test migration modules were added.

S3 create-only upload:
`s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/1423af439db4d2f532f189920b0d610881b6c26f/DIME-Lambda-4.1-navigation-recovery.zip`
Version: `c5gr8AJfH3aQqkLnVzHgAe1oXGiIPjpk`.
S3 checksum and deployed Lambda code hash match the reviewed ZIP.

Conversion remains **ENABLED**; tester tags verified empty without displaying their contents. All eight legacy/v4 routes remain deployed with unchanged route-scoped invoke permissions. Each route rejects unauthenticated requests with `401 UNAUTHORIZED`. Exact-origin preflight returns 204 with the approved Twitch origin; an untrusted origin receives no allow-origin header.

The exact staging table `dime-v2-staging-review01-dime-v2-review-20260912-player-state` remains ACTIVE with unchanged ID, ARN, primary-key schema, indexes, encryption and on-demand billing. TTL remains enabled on `expiresAt`; PITR remains enabled with 35-day recovery. **Zero table items were read, scanned or deleted during this correction; there was no second wipe.** IAM policy and invoke policy comparisons are identical.

## Corrected Twitch artifact

Filename: `DIME-Twitch-0.8.0-navigation-recovery-fixed-20260915.zip`

- `/tmp/DIME-Twitch-0.8.0-navigation-recovery-fixed-20260915.zip`
- `/mnt/c/Users/dylan/Downloads/DIME-Twitch-0.8.0-navigation-recovery-fixed-20260915.zip`

**94,154 bytes**, byte-identical copies.
SHA-256: `fda1a65f5230ee7b116480992b9ba80eac2d97dbd1ec1b3ecbd0b0304ad65bd1`.
Five archive entries: three root HTML files and one JS/CSS pair. No wrapper, images, source maps, tests, copied assets, active legacy display terminology, old teleport UI, development endpoints or synthetic credentials. Staging API and published privacy URLs match the authorized targets. Conversion is server-controlled.

Target is a mutable **0.8.0** replacement; use **0.8.1** if Twitch does not permit a safe replacement. Remote version/status is unverified. Older ZIPs and versions were not deleted or overwritten. The older client lacks the new physical-position fields, so it must be replaced before considering Twitch verified with this backend.

## Performance, security and publication limits

Local headless Chromium production build, actual API service with synthetic in-memory state:

| Layout | Physical transitions | Ready | Transition p95 | Frame p95 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Panel | 36 | 159 ms | 88 ms | 16.7 ms | 0 |
| Mobile touch | 36 | 150 ms | 85 ms | 16.7 ms | 0 |

Each layout ran for more than one minute, with one canvas and no document scrolling. Assets total 318,536 bytes (92,741 gzip). Real Twitch webview/network performance remains unverified. Heap samples are observational, not proof against memory leaks.

No unresolved high-severity finding was identified in the reviewed changes. Position checks are consistent with the existing local-walking/mining model and do not prove an entire movement history. No new personal-data collection was introduced. Privacy publication and website objects remain unchanged; the production web build is validated but web OAuth/deployment is outside this correction. No DNS change occurred.

## Exact remaining human action

Authenticated Twitch control is the remaining release blocker. No signing key was fetched and no live token was manufactured. There is no approved live synthetic authorization mechanism available to this session, so live authenticated Panel/Mobile results cannot be claimed.

1. Sign in to the Twitch Developer Console for **DIME**, client ID `znaovl2j45idub9k81om1dkatwxnu2`. Open only the reviewed 0.8.0 target. If its assets are immutable, create 0.8.1; do not modify/delete older versions.
2. Upload the Windows ZIP above and verify its filename/94,154-byte size and successful processing. Configure `panel.html`, `mobile.html`, Panel height 500, blank configuration paths, API allowlist `t2la0784p6.execute-api.us-east-2.amazonaws.com`, privacy URL `https://destroyaindustriesminingextension.com/privacy`.
3. Enter Local Test using a dedicated test profile. Verify the fresh Crew Ring start, map selections without travel, objective marker, WASD/arrows/touch, release/focus recovery, physical elevator/ship services/departure and Loam Crescent arrival.
4. Scan/analyze, pulse/release laser, fracture/vacuum, refresh, and select Avenbolt without moving. Verify an out-of-range mining rejection does not become permanent recovery attention. On a deliberately interrupted test request, Retry must keep the original action outcome without duplication; local walking remains usable. Verify the explicit discard warning and reset with a dedicated test profile only. Do not wipe the table or clear unrelated storage.
5. Verify no blocking overlay/document scroll, console error, unexpected 404/5xx/configuration error or normal-flow validation rejection in both Panel and Mobile. Move to Hosted Test and repeat in real Twitch webviews. **Do not submit for public review or release.**

## Changed source files

- `app/original/Main.tsx`
- `app/original/MiningConsole.tsx`
- `app/original/PhysicalNavigation.tsx`
- `app/original/WalkingWorld.tsx`
- `app/original/original.css`
- `app/original/recovery.ts`
- `docs/dime-m41-navigation-recovery-design.md`
- `playwright.config.ts`
- `playwright.m4.config.ts`
- `scripts/m4-production-performance.ts`
- `server/originalActionService.ts`
- `server/originalMiningService.ts`
- `shared/originalNavigation.ts`
- `tests/e2e/m4Harness.ts`
- `tests/e2e/m4Movement.spec.ts`
- `tests/e2e/m4Release.spec.ts`
- `tests/m4OriginalActionService.test.ts`
- `tests/m4PhysicalNavigation.test.ts`
- `tests/m4RecoveryClassification.test.ts`
- `tests/m4RecoveryTransactions.test.ts`

Machine-readable evidence: [release manifest](dime-m41-navigation-recovery-20260915.json). Local build/test/deployment evidence is retained under `/tmp/dime-m41-navigation`.

## Safety confirmation

Only the authorized Milestone 4 branch, versioned staging artifact and exact staging Lambda configuration were changed. No real player data, item key, secret value, token, signing key or cookie was inspected or exposed. No table item scan/wipe, production/legacy mutation, unrelated website replacement, branch rewrite/merge, or public Twitch submission occurred.
