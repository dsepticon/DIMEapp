# Milestone 4 vacuum release report — 2026-09-15

## Result

Backend deployed successfully to `dime-v2-review-20260912` in account `861738068626`, region `us-east-2`. Stack `UPDATE_COMPLETE`; Lambda Active/Successful. Corrected Twitch archive is packaged, audited and copied byte-identically to Windows Downloads. Twitch upload, Local Test and Hosted Test remain unperformed: this session exposes no authenticated browser/Developer Console control. No public submission or release occurred.

## Root cause and correction

The exact previous compiled ZIP reproduced the failure in both layouts with synthetic fresh v4 profiles after physical travel and fracture. Disabling the focused Vacuum button while its start request ran triggered blur, clearing the hold and sending cancelVacuum instead of finishVacuum. Click-only presentation and per-node targeting made the failure harder to understand.

The persistent hold control, explicit Extraction mode, automatic nearest eligible targeting, shared authoritative geometry/range/capacity rules, pixel-art fragments, beam and attraction animation correct this flow. Release/cancel/focus loss safely stops attraction. Full capacity and definitive rejection preserve pieces and clear pending safely; uncertainty restores the ground visual and retains original-ID recovery. Continuous hold retargets after 180 ms. Existing valid pieces retain their IDs, positions and integer quantities; no compatibility normalization was necessary. Existing radial field and tool ranges remain unchanged. See `dime-m41-vacuum-design.md`.

## Source

Branch: `codex/dime-m4-destroya-universe`.
Source commit: `f8b9f17107a08d71f874d9af82b520ee19885c8a` (pushed).
Amplify checked before push: automatic patterns and connected branches remain only `main` and `codex/react-extension-rebuild`.

Changed files:

- `app/original/Main.tsx`
- `app/original/MiningConsole.tsx`
- `app/original/VacuumConsole.tsx`
- `app/original/WalkingWorld.tsx`
- `app/original/fragmentArt.ts`
- `app/original/original.css`
- `docs/dime-m41-vacuum-design.md`
- `playwright.config.ts`
- `playwright.m4.config.ts`
- `scripts/m4-production-performance.ts`
- `shared/originalMining.ts`
- `shared/originalSpatial.ts`
- `shared/originalVacuum.ts`
- `tests/e2e/m4Movement.spec.ts`
- `tests/e2e/m4Release.spec.ts`
- `tests/e2e/m4Vacuum.spec.ts`
- `tests/m4Vacuum.test.ts`

## Validation

- Locked dependency install: passed; dependency audit reported zero vulnerabilities.
- ESLint, strict TypeScript, formatting and diff whitespace checks: passed.
- Vitest: **306 tests / 48 files passed**.
- Production Milestone 4 Chromium: **50/50 passed**, including 22 new Panel/Mobile vacuum cases.
- Broader Chromium: **65/66 passed initially**. One legacy Panel canvas-color assertion sampled the existing highlight color instead of its expected base color; both capacity layout cases passed on targeted rerun (**2/2**). Thus all 116 distinct browser cases passed, with this initial failure disclosed rather than represented as a clean full-suite run.
- Previous-client reproduction: **2/2** scenarios confirmed start/cancel with no collection.
- Default, Twitch, web and Lambda builds: passed. Final Twitch rebuild matched audited/tested bytes.
- Clean Linux-native SAM build and SAM validation: passed. SAM Lambda is byte-identical to `dist/server/index.mjs`.
- Source, SAM, packaged and processed cfn-lint passed; all six source Guard rules and four processed Guard rules passed. Equivalent normalized source intrinsics were used for Guard shorthand parsing. Actual CloudFormation processed template also passed.
- Local production performance: eight visible fragments, exact 80-unit collection in each layout; vacuum p95 frame times **16.7 ms Panel / 16.8 ms Mobile**, zero browser errors/document scrolling. Physical navigation stress: 36 transitions per layout. These are local Chromium measurements, not Twitch webview measurements.

Synthetic tests verify proximity collection without overlap, stable targeting, boundaries, walls, persisted fragments, keyboard/touch hold, cancellation, capacity rejection, stale recovery, uncertain start/finish, receipt replay, quantity conservation, refresh and First Contract completion through sale. The production journeys preserve physical navigation and map selection without teleporting. Real player gameplay was not inspected.

## Lambda artifact and deployment

- Local ZIP: `/tmp/dime-m41-vacuum/DIME-Lambda-4.1-vacuum-fixed.zip`
- Size: **487151 bytes**
- ZIP SHA-256: `20968d980790cb5c10257ae361681d771690303c677c80298ec9165c8c144c17`
- Root `index.mjs` SHA-256: `c106e1bf6a3ad4b0eff39a5c0ed9657320550747b42d1b3ebdb84ae4e49368c2`
- S3: `s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/f8b9f17107a08d71f874d9af82b520ee19885c8a/DIME-Lambda-4.1-vacuum-fixed.zip`
- S3 version: `x4PZdAzWb8KXw0Bc.po4a5oEnRqH1q17`
- Uploaded once with `If-None-Match: *`, AES256 encryption and verified SHA-256 checksum.
- Archive audit: only root `index.mjs`; no frontend, fixtures, source maps, secret literals, real identities, tester tags or player snapshots. Existing conversion support remains; no migration module was added.
- Change set: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m41-vacuum-fixed-20260915-1/0378ee7e-6dd0-4420-83f5-fb8330c9ec29`
- Executed exactly once. Sole resource operation: **Modify EbsFunction, no replacement**. Property paths: Code/S3Key, Code/S3ObjectVersion, Environment/Variables/DIME_CONFIG_REVISION.
- Configuration revision: `m41-vacuum-fixed-20260915-1`.
- Conversion: **ENABLED**; tester tags verified empty without printing configuration contents.
- Deployed code checksum matches the audited ZIP. All eight legacy/v4 routes remain. Lambda invoke policy and IAM inline policy compare identical before/after. Every other processed resource/output definition remains structurally identical, including DynamoDB, API, CORS, logs, alarms and secret references.
- `describe-events` returned no failed events before creation, before execution or after deployment. `describe-stack-events` was not used.
- Live public checks: eight routes return expected 401/UNAUTHORIZED without authentication; exact Twitch-origin OPTIONS succeeds with 204, untrusted origin receives no allow-origin header. No authorized live gameplay request was attempted without an approved synthetic/authenticated mechanism.

## Twitch package and remaining owner action

- Filename: `DIME-Twitch-0.8.0-vacuum-fixed-20260915.zip`
- Linux: `/tmp/DIME-Twitch-0.8.0-vacuum-fixed-20260915.zip`
- Windows/WSL: `/mnt/c/Users/dylan/Downloads/DIME-Twitch-0.8.0-vacuum-fixed-20260915.zip`
- Size: **96774 bytes**
- SHA-256: `4d32cf81df7a3fa410c947e1ec1df226edcb189fe829807a470bedbe03c236f8`
- Five root-relative HTML/JS/CSS files; no wrapper, maps, tests, unused images, copied external art, active legacy terminology, development endpoint, obsolete API, secret literals or synthetic identity fixtures. Correct staging API and privacy URL verified.
- Local and Windows copies compare byte-identical. Prior Twitch and Lambda artifacts remain available; the prior navigation/recovery Twitch ZIP is v4-compatible, but restoring it would restore the vacuum defect.
- Target: **0.8.0**, status **upload pending / console status unverified**. If its assets are immutable, use **0.8.1**; do not replace/delete older immutable versions.

Required authenticated console work:

1. Open DIME only; upload the corrected ZIP to mutable 0.8.0, otherwise create 0.8.1. Verify filename, 96,774-byte size and processing success.
2. Confirm `panel.html`, `mobile.html`, Panel height 500, existing staging API allowlist and published privacy URL. Enter Local Test.
3. In Panel and Mobile, physically reach existing valid fragments and newly fractured 3–8-piece nodes. Walk near a fragment, select Extraction mode, hold Vacuum using keyboard/touch, and verify highlight, prompt, beam, attraction, exact inventory credit and continuous retargeting. Release/slide off/focus away before completion and verify the piece remains.
4. Verify walls block extraction; full hold preserves pieces and gives free-capacity feedback; refresh preserves uncollected fragments; replay does not duplicate collection; proceed through sale and First Contract; verify physical navigation, reset and no blocking recovery/console/network errors.
5. Only after Local Test passes, move the corrected version to Hosted Test and repeat on real Twitch webviews. Do not submit for public review.

## Safety and evidence

No DynamoDB scan, wipe, item read/write, real player-data inspection, item-key display, secret retrieval/exposure or unrelated-resource modification occurred in this correction run. No production/legacy target or website object was modified. Live changes were confined to the authorized staging Lambda/configuration and create-only staging artifact upload. Synthetic identities/state were confined to local in-memory tests.

Evidence directory: `/tmp/dime-m41-vacuum` (test logs, baseline results, synthetic screenshots, performance, artifact manifests, reviewed templates, change set, safe deployment checks). The only remaining release blocker is authenticated Twitch console access and its required live testing.
