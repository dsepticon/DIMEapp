# Milestone 4 industrial services — pre-release review

## Scope and reason

Base: `59b006aa72819924b955396b5616708fd14881d4` on `codex/dime-m4-graphics-web`.
Work branch: `codex/dime-m4-industrial-services`.

The existing processing API was complete, but the production service console exposed order collection only to guests. Cargo and sale actions silently used the first material and ship, and quantities were silently reduced to available stock. This prevented players from deliberately managing their inventory and completing the industrial loop.

This frontend-only checkpoint completes that loop using the existing `transfer`, `startProcessing`, `collectOrder` and `sell` contracts:

- Explicit material, extraction hold, receiving ship and sale-cargo selection.
- Local, owned, compatible holds only; distinct raw and processed cargo.
- Decimal cSCU input converted to exact integer minor units. Invalid precision and insufficient stock are rejected in the UI, never silently clamped.
- Shared authoritative quote calculation for processing and wallet-remainder-aware sale estimates.
- Capacity previews include both raw and processed cargo.
- All clients can collect ready orders, including partial collection. Remaining output stays on the order.
- Device-clock countdowns are advisory; the server rechecks readiness and capacity.
- Stable selections do not silently switch to another material when stock is depleted. Location, zone and save-generation changes reset the service view.
- Existing revision/generation/request-ID recovery handles uncertainty and rejection. No new transport, persistence or storage mechanism.
- Service details stay inside the existing paused, internally scrolling menu. No additional permanent world overlay.

## Boundaries

No server, shared economy, catalog, navigation, mining, identity, infrastructure or deployment source changes. Both Lambda builds must remain byte-identical to the base. No live player requests, secret reads, secret promotions, invitation generation, AWS writes, website publication or Twitch upload are part of this checkpoint. OAuth activation and rollback artifacts remain untouched. Sign-in/linking configuration is not changed; conversion configuration is not changed.

## Validation and release evidence

Functional validation is complete. This is a pre-release review only, not deployment authorization. Detailed evidence and performance limitations follow.

## Compatibility and limits

- Existing v4 snapshots, orders, wallet remainder, integer quantities, revision and generation are consumed unchanged. No migration or conversion is introduced.
- Rebuilt gameplay SHA-256: `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`.
- Rebuilt web-auth SHA-256: `91cbd512c3fe7dc6eb3e161637c7935363a67eb4fdc6146140dcde5c6061a9e3`.
- Both bundles are byte-identical to the base worktree. Neither Lambda needs deployment for this change.
- Read-only AWS metadata confirmed the authorized account, stack `UPDATE_COMPLETE`, sign-in/linking `DISABLED`, and conversion `ENABLED`. Only `main` and `codex/react-extension-rebuild` are connected to/automatically created by Amplify; this branch is excluded.
- Twitch Preview screenshots use the compiled Twitch client in a local Chromium preview with a synthetic Extension bridge. They are **not** evidence of an authenticated Twitch Developer Console test.
- Authenticated web layout tests use intercepted synthetic sessions and an in-memory API store. Public sign-in remains disabled; these tests do not claim live OAuth verification.
- Order countdowns use the device clock; a clock ahead of the server may show readiness early. The existing non-mutating rejection and refresh path safely reconciles that case.
- The original published Guest Demo gate allowlists exact hashed asset names. A new build cannot be published under that unchanged allowlist. The review-only candidate adds exactly two new asset paths, retaining the old paths for rollback; the function body outside that list is identical. No deployed function, behavior, policy, origin, authentication route or website object was changed. A fresh deployed snapshot/diff and owner review are required before a later release.

## Screenshots

All images use deterministic synthetic state. Service panels are inside the paused, internally scrolling operations menu; the world-view HUD is unchanged.

| Layout                                        | Evidence                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Panel, 318×500                                | [Cargo selection and capacity](dime-m44-industrial-services-review/screenshots/Panel-cargo.png)                        |
| Mobile, 360×640, reduced motion/high contrast | [Market selection and exact quantity](dime-m44-industrial-services-review/screenshots/Mobile-market.png)               |
| Twitch Preview emulation, 960×720             | [Processing order collection](dime-m44-industrial-services-review/screenshots/Twitch-Preview-processing.png)           |
| Standalone web, 1280×900                      | [Existing order collection without raw stock](dime-m44-industrial-services-review/screenshots/web-1280-processing.png) |

Full local screenshots: `/tmp/dime-m44-services-review/screenshots/`.

## Recommended release steps — not executed

1. Review this branch, screenshot evidence and the clean validation results. Keep OAuth and linking disabled.
2. Recheck the frontend ZIP/file hashes in [artifacts.json](dime-m44-industrial-services-review/artifacts.json).
3. For Twitch, use the current mutable test version or a separately approved new version, then run authenticated Panel/Mobile Local Test and Hosted Test with deliberate service selections and collection retry. Do not publicly release without separate authorization.
4. For Guest Demo, obtain a fresh CloudFront function snapshot/ETag. Review the **asset-list-only** candidate against that snapshot; retain old paths for rollback. Use the [review publication manifest](dime-m44-industrial-services-review/guest-publication.review.json), back up the existing entry with version/hash metadata, create new hashed assets with conditional writes, then conditionally replace only `/game/index.html`. Invalidate only game entry paths. Do not change root, `/privacy`, authentication routes, policies or default behavior.
5. Verify public Guest Demo, storage isolation and the exact edge API-denial paths. On failure restore the prior entry and function snapshot while retaining old assets. No save rollback is needed because the schema/server/economy are unchanged.
6. The authenticated web ZIP is prepared for review only. Do not publish or activate sign-in as part of this game update.

No deployment, Twitch upload, public release, real-player operation, secret access/promotion or invitation generation occurred.

Guest world screenshots: [318×500](dime-m44-industrial-services-review/screenshots/guest-318.png), [360×640](dime-m44-industrial-services-review/screenshots/guest-360.png), [1280×900](dime-m44-industrial-services-review/screenshots/guest-1280.png).

### Reproduction commands

Use locked Node 22 dependencies (`npm ci`). The production browser suite requires `NODE_OPTIONS='--import tsx'` for repository JSON/TypeScript imports.

```sh
npm run lint
npm run typecheck
npm test
npm run format:check
VITE_DIME_MODE=twitch VITE_DIME_API_URL=https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging npx vite build
NODE_OPTIONS='--import tsx' npx playwright test --config playwright.release.config.ts --workers 2
node scripts/build-guest.mjs
node scripts/prepare-services-guest-review.mjs
NODE_OPTIONS='--import tsx' npx playwright test --config playwright.guest.config.ts
VITE_DIME_MODE=web npx vite build --outDir /tmp/dime-m44-services-review/web-build
node --import tsx scripts/m44-services-web-review.ts
DIME_WEB_BUILD=/tmp/dime-m44-services-review/web-build DIME_PERFORMANCE_OUTPUT=/tmp/dime-m44-services-review/performance.json node --import tsx scripts/m4-production-performance.ts
DIME_HEAP_REPORT=/tmp/dime-m44-services-review/heap-stability.json node --import tsx scripts/m43-heap-stability.ts
node scripts/build-server.mjs
node scripts/build-web-server.mjs
git diff --check
```

Do not rebuild `dist/frontend` during the production browser/performance run. Run frame-time measurement without concurrent browser suites. The optional review preparation command changes only local review files; it never makes AWS calls. All API/session fixtures above are synthetic and intercepted locally.

## Clean validation results

- Locked install on Node 22.23.2; dependency audit reported zero vulnerabilities.
- Lint, strict typecheck, formatting and `git diff --check`: pass.
- **599/599 unit tests**, 68 files.
- **176/176 Chromium release tests**, one complete run, zero retries, 19.4 minutes. Includes new service scenarios and existing current/legacy navigation, scanner, laser/fracture, vacuum, cargo, market, quest, reset and recovery coverage.
- **5/5 guest Chromium tests**, one complete run, zero retries, 6.7 minutes. Physical journey, services, refresh/new-tab independence, storage isolation and the updated review-only routing candidate.
- **3/3 standalone-web service scenarios** at 318×500, 360×640 and 1280×900. Exactly one synthetic collection per scenario, no unexpected errors, all service controls at least 44 CSS pixels high.
- Default, Twitch, authenticated-web, guest, gameplay Lambda and web-auth Lambda builds pass. Both Lambda bundles are unchanged.
- Three review ZIPs pass CRC/integrity inspection. Only HTML/JS/CSS, no wrapper directory, source maps, tests, runtime secret retrieval, secret ARNs or local development endpoints. Twitch uses the reviewed staging API. Full file hashes are in the artifact manifest.
- The initial guest routing smoke test correctly detected the old manifest/build mismatch. The final complete guest run used the explicit additive-only review candidate; it did not bypass the edge function.

The frame and heap results below are local synthetic measurements, not real Twitch webview performance claims. All functional and performance checks are complete; no release action was taken.

## Performance

Chromium 153, compiled production clients, synthetic in-memory authoritative API, no concurrent browser suites. Eight visible nodes and eight fragments; scanning, laser, vacuum and Avenbolt Commodity Hall effects included. Each layout completed 36 physical transitions. One canvas throughout, no document scrolling and no unexpected console/network/page errors.

| Layout      | Frame p95 | Worst frame (instrumented travel) | Transition average / p95 / worst |
| ----------- | --------- | --------------------------------- | -------------------------------- |
| Panel       | 16.8 ms   | 83.3 ms                           | 78.6 / 86.2 / 96.4 ms            |
| Mobile      | 16.7 ms   | 16.8 ms                           | 75.3 / 86.9 / 87.6 ms            |
| Desktop web | 16.7 ms   | 16.8 ms                           | 75.7 / 87.7 / 89.1 ms            |

Scanner, laser, city and vacuum effects individually had p95/worst frames no higher than 16.8 ms in all layouts. The Panel travel outlier is retained in the evidence; the measurement includes instrumentation and forced GC, so it is not attributed to a particular application cause without proof.

The separate heap test performed 180 physical transitions over 30 cycles. Retained heap after the warmup sample rose from 4,977,972 to 5,095,852 bytes (+117,880, about 2.4%); later increments decreased. One document, 141 DOM nodes and 185 listeners remained constant. This demonstrates stable structural counts over the tested duration, not zero retained-heap growth or proof against every leak. Longer real-webview profiling remains a release follow-up.

Twitch frontend assets total 376,588 bytes, 108,894 gzip bytes. Full frame/effect details: [performance.json](dime-m44-industrial-services-review/performance.json). Heap method and samples: [heap-stability.json](dime-m44-industrial-services-review/heap-stability.json).

## Changed files

Application changes: `app/original/ServiceConsole.tsx`, `app/original/serviceModel.ts`, `app/original/original.css`.

Test/review tooling: `playwright.release.config.ts`, `tests/e2e/m44Services.spec.ts`, `tests/m44Services.test.ts`, `tests/m44GuestReview.test.ts`, `tests/guest-browser/journey.ts`, `tests/guest-browser/routing.spec.ts`, `tests/guest-live/journey.ts`, `scripts/m44-services-web-review.ts`, `scripts/prepare-services-guest-review.mjs`.

This report and its evidence directory are the remaining changes. The complete file list, including each screenshot and review artifact, is [changed-files.json](dime-m44-industrial-services-review/changed-files.json).

### Panel outlier confirmation

An unchanged-artifact repeat measured **16.7 ms p95 / 16.8 ms worst**, with transition average/p95/worst **79.1 / 85.7 / 86.0 ms**, one canvas, no document scroll and no errors. The original 83.3 ms outlier did not recur; both results are retained. This repeat checks the outlier and does not replace the clean complete Chromium release gate. [Confirmation evidence](dime-m44-industrial-services-review/performance-panel-confirmation.json).
