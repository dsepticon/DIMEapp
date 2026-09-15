# Milestone 4 node visibility and targeting release — 2026-09-15

## Result

The corrected backend is deployed to `dime-v2-review-20260912` in account `861738068626`, region `us-east-2`: **UPDATE_COMPLETE**. The audited Twitch ZIP is ready in Linux and Windows Downloads. Authenticated Twitch upload, Local Test and Hosted Test remain blocked by unavailable browser/Developer Console control in this session. No public submission/release occurred.

## Supported root cause

The exact previously packaged vacuum-fixed client reproduced the reported two-of-three result in Panel and Mobile using synthetic generated state. Three tunnel nodes had sizes 2, 2 and 4, all with reachable positions and clear line of sight from one tile away. The first two laser starts succeeded; the third returned **409 / MINING_REJECTED**. Generation allowed hand nodes of sizes 1–5 while Beamline One supports 1–3. This was a tool-eligibility mismatch, not a reason to inflate range. The old renderer drew every intact node as the same 14-pixel circle.

New hand nodes respect the supported sizes. Persisted oversized nodes retain their parameters and are inspectable, with an explicit occupied-Crawl-Rig requirement; an owned, active, occupied rig in the same zone can mine them using its existing range. Existing material, rarity inputs, size, resistance, instability, yield and deadlines are not rerolled.

## Changes

- Original five-tier rock formations (20/24/28/32/36 pixels), neutral before analysis, with outline, shadow, inclusions, analyzed facets and target brackets. Existing nine-pixel vacuum fragments stay smaller.
- Automatic local forward-cone acquisition prioritizes clear sight, facing angle, distance and stable ID. Padded clicks/taps and explicit signature inspection remain available. In range / Move closer / Obstructed feedback distinguishes geometry from tool eligibility.
- Intact and fragment targeting are separated by tool mode. Destroyed/fractured nodes leave the intact target set; overcharge feedback persists separately.
- Collision-map/flood-fill placement requires clear shoulders, reachable adjacent interaction tiles, line of sight and separation from interactions/nodes/persisted fragments. First Contract uses the same placement checks.
- Bounded deterministic compatibility relocation changes only invalid intact-node x/y during a normal revision-controlled scan/zone-entry action. It does not mutate GET responses, move existing fragments, duplicate nodes, restore collected pieces or reroll parameters. Existing session activity suppresses relocation. Respawn placement is validated lazily on a scan in that zone.
- Panel layout keeps target feedback and controls visible. Vacuum controller/collection logic, save formats, physical navigation and pending recovery remain intact; walking adds no per-frame writes.

Design and compatibility details: `dime-m41-node-targeting-design.md`.

## Source and Git

Branch: `codex/dime-m4-destroya-universe`.
Source commit: `1d1e13cd9a855c69cadf31488279b767b0ab01f3` (pushed).
Amplify exclusion checked before push: only `main` and `codex/react-extension-rebuild` are connected/automatic patterns.

Changed files:

- `app/original/Main.tsx`
- `app/original/MiningConsole.tsx`
- `app/original/WalkingWorld.tsx`
- `app/original/fragmentArt.ts`
- `app/original/nodeArt.ts`
- `app/original/original.css`
- `docs/dime-m41-node-targeting-design.md`
- `playwright.config.ts`
- `playwright.m4.config.ts`
- `playwright.release.config.ts`
- `scripts/m4-production-performance.ts`
- `shared/originalDiscovery.ts`
- `shared/originalMining.ts`
- `shared/originalNodePlacement.ts`
- `shared/originalNodeTargeting.ts`
- `shared/originalQuest.ts`
- `tests/e2e/m3FullInventory.spec.ts`
- `tests/e2e/m4Nodes.spec.ts`
- `tests/m4NodeTargeting.test.ts`

## Validation

- `npm ci`: passed; dependency audit reported zero vulnerabilities.
- Lint, strict typecheck, formatting and `git diff --check`: passed.
- **314 Vitest tests / 49 files passed.** Property coverage includes **200 seeds × 8 mining zones = 1,600 generated worlds** and revision/generation/replay relocation checks.
- **Final complete Chromium suite: 123/123 passed with retries disabled** (57 production + 66 legacy). No isolated rerun was used as the final release gate. An earlier development run caught missing overcharge feedback after target clearing; that was fixed before restarting the full suite.
- Exact old-client reproduction: 2/2 confirmed the matching defect.
- Compiled Panel/Mobile/Desktop three-node targeting passed. Panel/Mobile continuous journeys approached/analyzed all three, fractured one, vacuumed all its pieces, overcharged another, refreshed and targeted the survivor. Existing navigation, recovery, vacuum, capacity, uncertainty, replay and First Contract suites passed.
- Default, Twitch, web and Lambda builds passed. The final Twitch archive contains the same bytes exercised by the production suite.
- Clean Linux-native SAM build and SAM validation passed; SAM `index.mjs` is byte-identical to `dist/server/index.mjs`.
- Source, built SAM, packaged and actual processed cfn-lint passed; all six source and four processed Guard rules passed. Source shorthand intrinsics were normalized equivalently for Guard parsing. CloudFormation template validation and predeployment `describe-events` checks passed.
- Stress performance: eight intact formations plus eight fragments and active vacuum effects, exact 80-unit collection per layout, zero errors/document scrolling. Vacuum-effect p95 frame time: **Panel 16.8 ms / Mobile 16.7 ms**. These are local Chromium measurements, not real Twitch webview results.
- Visual evidence: `formation-tiers.png`, `formations-Panel.png`, `formations-Mobile.png`, `formations-Desktop.png` in the evidence directory.

## Backend artifact and deployment

- Lambda ZIP: `/tmp/dime-m41-nodes/DIME-Lambda-4.1-node-targeting-fixed.zip`
- Size: **487721 bytes**
- ZIP SHA-256: `007a23384d403f81e41e1a32d9a1180a9bc115cbe3a9f10aa74b3600c65f1ed6`
- `index.mjs` SHA-256: `e7c0b35c402671c65b77b6a5987e4d26514bd2ea05648a27f91d9b1c055b6771`
- S3 key: `dime-v2/review/1d1e13cd9a855c69cadf31488279b767b0ab01f3/DIME-Lambda-4.1-node-targeting-fixed.zip`
- Bucket: `dime-v2-staging-artifacts-861738068626-us-east-2`
- S3 version: `.XsdAMyFDBGDc6pwgDWNcJ.A.zRmbQqv`
- Uploaded once with create-only `If-None-Match: *`, AES256 encryption and verified SHA-256 checksum.
- ZIP audit: only `index.mjs` at root, no frontend, tests/fixtures, maps, secret literals, real identities, tester tags, player snapshots or newly introduced migration module.
- Change set: `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m41-node-targeting-fixed-20260915-1/7fd606d7-614a-4fff-8b44-216c38e167f8`
- Executed exactly once after the clean full browser gate. Only operation: **Modify EbsFunction, no replacement**. Changed paths: Code/S3Key, Code/S3ObjectVersion, Environment/Variables/DIME_CONFIG_REVISION.
- Configuration revision: `m41-node-targeting-fixed-20260915-1`.
- Conversion verified **ENABLED**, tester tags verified empty without displaying sensitive configuration.
- Deployed Lambda code hash matches the artifact; Lambda Active/Successful. All eight routes remain. Invoke policy and IAM execution policy are identical before/after. All other processed resource/output definitions are structurally identical, including table configuration, CORS, stage/throttling, logs, alarms and secret references.
- No failed CloudFormation events before execution or after deployment. `describe-stack-events` was not used.
- Live public checks: all eight routes reject unauthenticated requests with 401/UNAUTHORIZED; exact-origin preflight succeeds and untrusted origins receive no allow-origin header. No authenticated live player fields were inspected.

## Twitch artifact and exact remaining action

- Filename: `DIME-Twitch-0.8.0-node-targeting-fixed-20260915.zip`
- Linux path: `/tmp/DIME-Twitch-0.8.0-node-targeting-fixed-20260915.zip`
- Windows/WSL path: `/mnt/c/Users/dylan/Downloads/DIME-Twitch-0.8.0-node-targeting-fixed-20260915.zip`
- Size: **98008 bytes**
- SHA-256: `d439c64064a51cd2a32995fffca95c1fbe731879e30d3adf7104820f31bbe107`
- Copies are byte-identical. Five root-relative HTML/JS/CSS files; correct Panel/Mobile entries, staging API and published privacy URL. No wrapper, maps, fixtures, unused images, copied external art, active legacy terminology, development endpoint or secret literals.
- Target **0.8.0**; **not uploaded by this session, console status unverified**. If immutable, use **0.8.1** without modifying/deleting the older version.

Authenticated Developer Console steps:

1. Upload the corrected ZIP to mutable DIME 0.8.0, otherwise create 0.8.1. Verify filename, size and successful processing. Keep panel.html, mobile.html, Panel height 500, authorized staging API allowlist and existing privacy URL.
2. Enter Local Test. In both Panel and Mobile, physically reach a mining zone, generate/scan at least three nodes, approach and target each using keyboard/touch. Confirm rock silhouettes, target brackets and range/tool feedback. For an invalid persisted position, a normal scan performs the bounded compatibility repair; no profile reset is required.
3. Fracture one node, vacuum its smaller pieces, overcharge another, refresh and target the survivor. Verify remaining fragments, exact inventory credit, no duplicate replay, pending deadlock, teleport navigation, blocking controls, console/network errors, 404 or 5xx.
4. After Local Test succeeds, move the corrected version into Hosted Test and repeat in real Twitch webviews. Do not submit for public review.

Prior vacuum-fixed v4 Twitch ZIP and Lambda artifact are preserved as format-compatible rollback artifacts; restoring them would restore the node presentation/eligibility defects. No website deployment or privacy publication was needed for this correction.

## Safety and evidence

No table wipe/reset, DynamoDB scan, direct player-record access, real player-field inspection, item-key display, secret retrieval/exposure, production/legacy deployment or unrelated-resource modification occurred. Synthetic state stayed local and in memory. No account reset is required. Live modifications were limited to the authorized create-only staging artifact and reviewed Lambda configuration/code update.

Evidence directory: `/tmp/dime-m41-nodes`. The only remaining release blocker is authenticated Twitch console upload and Local/Hosted Test verification.
