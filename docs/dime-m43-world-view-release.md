# Milestone 4.3 world-first correction — 2026-09-15

## Source and scope

Branch: `codex/dime-m4-graphics-web`. Local and remote starting HEAD were both `851ba9f9fe610a05efe5a74ac5a8aee2d923eaeb`.

The canvas now fills the Panel, Mobile and web viewport. Compact translucent edge controls replace permanent layout rows. Movement keeps four 44×44 CSS-pixel targets with smaller visual glyphs at bottom-left; contextual physical and tool actions occupy bottom-right. The wallet/cargo/objective summary and small Menu button open paused, internally scrolling details. Desktop web can hide movement and tool hold controls and use keyboard input. Safe areas, high contrast, reduced motion, immediate pointer/keyboard activity feedback, and controller activity polling are retained.

Mine uses the existing scan, analysis and laser APIs sequentially, stopping on a failed result or generation change. The existing charge controller, automatic fracture, authoritative vacuum collection and recovery classifier are unchanged. Menus release held inputs without conflating a paused world with a busy server request. Existing active-session movement locks remain in place; simultaneous touch does not steal laser input.

Objective text is expandable; destination selection still sets a world marker and never travels automatically. Details and service actions remain in the paused operations overlay. Pending uncertainty retains a compact visible Retry entry point and the existing confirmed-discard workflow.

See [the UI specification](dime-m43-world-view.md) and [before/after comparisons](/tmp/dime-m43-world-ui/comparison.html). All screenshots and data use synthetic profiles.

## Validation

- Locked `npm ci`: passed, no lockfile change, zero reported dependency vulnerabilities.
- Lint, strict typecheck, formatting and `git diff --check`: passed.
- Complete Vitest suite: **343 passed / 53 files**.
- One clean complete Chromium release suite: **140 passed**, one worker, no retries. Command: `NODE_OPTIONS='--import tsx' npx playwright test --config playwright.release.config.ts --reporter=line`.
- Default, Twitch, web and Lambda builds: passed. The legacy test runner excludes compiled-client tests; the release runner includes all production and legacy scenarios.
- Coverage includes five-world physical travel, three-node targeting/mining/vacuum journeys, overcharge, safe-area padding, pointer cancellation, simultaneous touch, keyboard-only desktop play, reduced motion, high contrast, overlay pause/scrolling, generation/revision recovery, replay and synthetic web sessions.
- Diagnostic runs are retained separately and are not counted as release passes. They caught mode switching being disabled by the menu pause flag and hidden mining-outcome feedback. A focused touch regression also caught a 29px Vacuum button jump after collection; feedback now sits outside layout flow and the hold target remains fixed. Native gamepad-policy denial, immediate opacity restoration and scrolling-menu closure are covered. Tests were updated for secondary details now requiring the menu and for Vacuum correctly disappearing when no target remains.

## Viewport coverage

Rectangular-union measurement counts full touch targets as covered, without discounting translucency. Node, laser and fragment measurements include an active destination.

| Layout           | Station |  Node | Laser | Fragments |
| ---------------- | ------: | ----: | ----: | --------: |
| Panel 318×500    |   89.0% | 84.4% | 80.7% |     82.1% |
| Mobile 360×640   |   92.4% | 89.2% | 86.7% |     87.7% |
| Desktop 1280×900 |   98.5% | 97.8% | 97.3% |     97.5% |

Raw coverage: `/tmp/dime-m43-world-ui/coverage.json`. These are normal gameplay states; expanded menus and transient rejection/recovery details intentionally use more space.

## Performance

Headless Chromium `153.0.8010.12` using compiled production clients and synthetic authoritative APIs. The default-duration release benchmark includes eight visible formations, eight fragments, vacuum, laser, physical transitions and the busiest city district. It passed on all three layouts with one canvas, no document scrolling and no console/page/network errors.

| Layout  | Frame p95 ms | Worst frame ms | Transition mean / p95 / worst ms |
| ------- | -----------: | -------------: | -------------------------------: |
| Panel   |         16.7 |           33.4 |              85.1 / 93.2 / 263.5 |
| Mobile  |         16.7 |           16.8 |               75.6 / 87.0 / 87.7 |
| Desktop |         16.7 |           16.8 |               77.5 / 87.2 / 87.8 |

Independent browser-owned physical travel completed 180 transitions over 30 cycles. Retained heap after GC ranged from 4.54 to 4.66 MiB; the final sample was 4.59 MiB. All samples had one document, 134 DOM nodes including internal nodes and 178 listeners. No monotonic retained-heap growth was observed. This finite synthetic run is not a claim about every device or real Twitch webview performance.

Evidence: `performance-release.json`, `heap-stability-final.json` and their logs under `/tmp/dime-m43-world-ui`.

## Artifacts and backend

Twitch replacement: `/tmp/DIME-Twitch-0.9.0-world-view-20260915.zip`.

- Version target: **0.9.0**.
- Byte-identical Windows copy: `/mnt/c/Users/dylan/Downloads/DIME-Twitch-0.9.0-world-view-20260915.zip`.
- Size: **105,301 bytes**.
- SHA-256: `bfaed9cbfcb746f99165330db345f32d5049d9bfdc7cc4d044b169488dbc6a26`.
- Archive root contains `panel.html`, `mobile.html`, `index.html` and only their referenced production JS/CSS. No wrapper, source maps, tests, unused images, development endpoint, credential values or synthetic identity literals.
- The previous 0.9.0 candidate is preserved for rollback.

Web candidate: `/tmp/dime-m43-world-ui/DIME-Web-0.9.0-world-view-candidate.zip`. Compiled production web checks passed with synthetic HTTPS sessions at all three sizes: local walking, one-use link-intent creation, logout, privacy before sign-in, clean URL and no credential storage. Real OAuth provisioning remains outside this UI correction and the website was not deployed.

The gameplay Lambda is byte-identical: `e7c0b35c402671c65b77b6a5987e4d26514bd2ea05648a27f91d9b1c055b6771`. No API contract, server/shared gameplay source, routes, permissions, conversion configuration, CloudFormation, AWS data or backend deployment changed.

No Twitch upload, Hosted Test activation, public review or public publication was performed for this packaging request. The replacement is prepared for the existing 0.9.0 review flow.

No table wipe/reset, real player inspection, item-key access or secret exposure occurred. Only synthetic test profiles were read or reset. AWS access was limited to authorized-account and Amplify metadata checks. Push remains limited to the isolated graphics/web branch after confirming Amplify excludes it.

## Changed files

- `app/original/Main.tsx`
- `app/original/MiningConsole.tsx`
- `app/original/PhysicalNavigation.tsx`
- `app/original/VacuumConsole.tsx`
- `app/original/original.css`
- `docs/dime-m43-world-view-release.md`
- `docs/dime-m43-world-view.md`
- `playwright.config.ts`
- `playwright.m4.config.ts`
- `playwright.release.config.ts`
- `scripts/m4-production-performance.ts`
- `scripts/m43-heap-stability.ts`
- `scripts/m43-web-production.ts`
- `scripts/m43-world-view-baseline.ts`
- `scripts/m43-world-view-metrics.ts`
- `tests/e2e/m42Web.spec.ts`
- `tests/e2e/m43Travel.spec.ts`
- `tests/e2e/m43Visual.spec.ts`
- `tests/e2e/m43WorldView.spec.ts`
- `tests/e2e/m4Harness.ts`
- `tests/e2e/m4Movement.spec.ts`
- `tests/e2e/m4Nodes.spec.ts`
- `tests/e2e/m4OriginalUi.spec.ts`
- `tests/e2e/m4Release.spec.ts`
- `tests/e2e/m4Vacuum.spec.ts`
