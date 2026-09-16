# Milestone 4.3 menu-free scanner release candidate — 2026-09-15

## Result and release boundary

Implemented on `codex/dime-m4-graphics-web`, starting from local and remote `850cd47e7cad30b1a530adc93788085f3857d3fe`.

**This client requires the matching backend artifact before activation. Neither artifact was deployed.** The existing analysis action lacked player coordinates/range/line-of-sight validation. The additive `analyzeNearby` action supplies those checks through the existing route and receipt/recovery contract. Older clients retain their existing action; the new client does not silently fall back to it.

Pings are local. **P** activates a bounded expanding scanner pulse while walking. **Hold F** or the contextual touch Analyze target performs a 900ms scan; only authoritative confirmation reveals mineral information. **Q** cycles overlapping valid forward targets. Ping recalls confirmed details, which persist through the existing analyzed-node save state. Mine becomes available immediately after analysis. See [flow, geometry and compatibility details](dime-m43-scanner.md).

Explicit selection is protected from earlier sampled movement. Focused testing caught and fixed information-card interception of laser controls and touch-release fallthrough into Mine. Analysis now preserves its hit target through release. A deterministic delayed-frame test reproduced a negative canvas-arc radius from a frame timestamp preceding Ping; clamping pulse age prevents the canvas loop from stopping. The same regression asserts walking and targeting continue. Definitive rejection and lost-response replay are covered without storage clearing or blocked walking.

## Validation

- Locked `npm ci`: passed; lockfile unchanged.
- Lint, strict typecheck, formatting, `git diff --check`: passed.
- Complete unit/integration suite: **355 tests / 54 files passed**.
- One clean complete Chromium release suite: **152 passed**, no retries. Includes 12 scanner scenarios across Panel, Mobile and desktop plus existing navigation, targeting, vacuum, mining, economy, reset, recovery and web session regressions.
- Default, Twitch, standalone web and Lambda builds: passed.
- Clean Linux-native SAM build and SAM validation: passed. SAM Lambda bytes match `dist/server/index.mjs`.
- Source, offline packaged and offline SAM-transformed gameplay templates: cfn-lint and all source/processed Guard rules passed. Existing optional web offline review templates also pass lint and Guard. No CloudFormation change set or service-side transform was requested; offline checks do not constitute deployment approval.
- Production standalone web checks: synthetic HTTPS identity/session, movement, link-intent, logout, privacy entry point and credential-storage checks passed on all three sizes. Real Twitch/OAuth authentication was not exercised.
- Compiled content and archive audit: no wrapper, source maps, fixtures, development endpoint, secret values, synthetic identity literals or external art. Lambda archive contains only `index.mjs`; the build guard excludes unintended migration modules.

## Screenshots and coverage

[Scanner screenshots](/tmp/dime-m43-scanner/screenshots.html) include pulse, positional highlights, contextual Analyze and confirmed information at 318×500, 360×640 and 1280×900. Screenshots use synthetic profiles. The confirmed card fits into the larger clear band above or below the player and target, with internal scrolling when needed. Browser assertions verify no overlap with either actor. Starting mining removes it from the laser control area.

Normal gameplay coverage is unchanged from the world-first release. Full 44px hit rectangles count as covered; translucency is not discounted.

| Layout  | Station |  Node | Laser | Fragments |
| ------- | ------: | ----: | ----: | --------: |
| Panel   |   89.0% | 84.4% | 80.7% |     82.1% |
| Mobile  |   92.4% | 89.2% | 86.7% |     87.7% |
| Desktop |   98.5% | 97.8% | 97.3% |     97.5% |

Temporary ping feedback, world markers and expanded analysis details use additional space while active. Permanent Ping occupies part of the former summary footprint; Analyze replaces Mine and Q shares the same action strip.

## Performance

Compiled production builds in headless Chromium `153.0.8010.12`, using synthetic APIs. Stress included eight intact formations, eight fragments, repeated local pings, active vacuum/laser effects and busy city travel. No console/page/network errors, document scrolling or extra canvas appeared. Repeated pings made zero mutation requests.

| Layout  | Frame p95 / worst ms | Scanner p95 / worst ms | Transition mean / p95 / worst ms |
| ------- | -------------------: | ---------------------: | -------------------------------: |
| Panel   |          16.8 / 33.4 |            16.7 / 16.8 |               77.4 / 86.6 / 87.6 |
| Mobile  |          16.7 / 16.8 |            16.7 / 16.8 |               74.9 / 77.1 / 77.1 |
| Desktop |          16.8 / 83.4 |            16.7 / 16.8 |               77.7 / 87.6 / 87.9 |

Long-session test: 180 physical transitions over 30 cycles, one document, stable 141 DOM nodes and 185 listeners. Retained heap after GC ranged 4.669–4.770 MiB; final 4.770 MiB. The last interval was approximately flat, after a small warm-up increase. This finite local test is not a claim about every device or real Twitch webview performance.

## Prepared artifacts

Twitch **0.9.0** replacement:

- `/tmp/DIME-Twitch-0.9.0-scanner-20260915.zip`
- Byte-identical Windows copy: `/mnt/c/Users/dylan/Downloads/DIME-Twitch-0.9.0-scanner-20260915.zip`.
- **107,725 bytes**; SHA-256 `189c4ac1893d0957cbada62352742952b92cd22fbb75dce7193c413c07d326e8`.

Matching gameplay Lambda:

- `/tmp/DIME-Lambda-0.9.0-scanner-20260915.zip`
- **487,986 bytes**; ZIP SHA-256 `d51696bd1fa3cac5930885d478596e71103c315a7f9d5906a58780bc6c2f9589`.
- Module SHA-256 `9eef9357f3ff21436d1c7a069e2a5d4fbde9233e8bf9f493e2e6ac3a80040c1a`.

Web candidate: `/tmp/dime-m43-scanner/DIME-Web-0.9.0-scanner-candidate.zip`. Prior world-view client and backend artifacts remain available for rollback. No artifact upload, backend deployment, infrastructure execution, Twitch activation or public publication occurred. Do not activate the client until the matching backend has been separately deployed and verified.

## Safety and source

No table wipe/reset, real-player inspection, item-key access, credential disclosure or mineral rebalance occurred. All gameplay records exercised by tests were synthetic. Infrastructure, IAM, routes, CORS, conversion configuration, logs and outputs were not changed. Push is restricted to `codex/dime-m4-graphics-web` after final Amplify exclusion verification.

Changed files:

- `app/original/Main.tsx`
- `app/original/MiningConsole.tsx`
- `app/original/ScannerHUD.tsx`
- `app/original/WalkingWorld.tsx`
- `app/original/original.css`
- `app/original/scannerLayout.ts`
- `docs/dime-m43-scanner-release.md`
- `docs/dime-m43-scanner.md`
- `playwright.config.ts`
- `playwright.m4.config.ts`
- `playwright.release.config.ts`
- `scripts/m4-production-performance.ts`
- `server/originalActionService.ts`
- `shared/originalScanner.ts`
- `tests/e2e/m43Scanner.spec.ts`
- `tests/e2e/m43WorldView.spec.ts`
- `tests/m43Scanner.test.ts`
