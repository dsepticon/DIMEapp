# Milestone 4.1 implementation ledger (uncommitted)

Date: 2026-09-14. This ledger records the uncommitted Milestone 4.1 candidate. Nothing has been deployed and no player record was accessed. Production builds select the original UI; the development server retains the established Milestone 3 harness so its regression suite remains executable.

## Approved material catalog

The 20 one-to-one replacements in [the reviewed matrix](dime-m4-final-mapping.json) are real-world material names with stable `mat.m001`–`mat.m020` IDs. The four gem slots remain non-refinable in DIME; 16 ore slots keep their original DIME processing eligibility. Prices, spawn weights, quantities and extraction classes are copied exactly from the source catalog. **Material names are real. DIME availability, rarity, values, extraction and Destroya Industries processing compatibility are fictional game rules, not real-world mining or market guidance.** These numbers are not real commodity prices, occurrence rates or processing instructions.

The matrix also assigns distinct original IDs to 14 ships and vehicles, 12 equipment/crew entries, four extraction classes, nine processing methods, five locations, 43 zones, currency, organizations, occupation, characters and quest terms. The historical [mapping-gate document](dime-m4-mapping-gate.md) predates the owner's functional-equivalence approval; it is not an active blocker. Character names receive only a preliminary exact/close web screen; no creator likeness, attributed dialogue or biography is used.

## Synthetic conversion contract

Content version 4 / save format 3 preserves save generation, wallet, wallet remainder, integer 0.01-cSCU quantities, holdings, cargo, order accounting, dynamic processing rates, quest counters, reward history, location/zone, nodes, fragments and progression. A pure preview validates every output field against a strict original schema; an unknown field or asset raises a generic `CONTENT_REVIEW_REQUIRED` status and leaves the source unchanged. The explicit conversion receipt records request ID, source revision/generation and source digest. The converter checks reviewed catalog signatures and current source mineral values and eligibility before writing.

`ContentConversionService` uses the existing two-item state-and-receipt transaction contract with expected revision and generation. Its synthetic tests prove a single mutation, original-ID replay, conflicting payload rejection, concurrent application, cross-player isolation and older whole-cSCU quantity upgrade. `DynamoStore` uses the version-aware parser in the proposed handler. The handler exposes the original contract below `/v4` and retains legacy routes only for the short unconverted-client cutover window. No player records have been read or changed. Synthetic reversal requires the supplied source fixture and its digest; there is no live rollback snapshot store.

`OriginalResetService` creates only the canonical original new-player state, starts at Tessick Station / Crew Ring, rotates generation, advances revision and keeps only technical receipts until their ordinary TTL. The proposed `/v4/profile/reset` route uses it; the client clears only the current DIME pending-action key.

## Mining model and boundary

The shared deterministic model runs at 50 ms per tick. Charge is an integer from 0 to 1,000. A held full-output beam gains `clamp(16 + 2r + 2s + m + floor(i/25), 16, 40)` plus bounded deterministic disturbance. Releasing discharges `clamp(8 + floor(s/2) + floor(m/2) + floor(i/25), 8, 20)`. The optimal width is `clamp(300 - 25r - 15s - floor(i/10), 120, 300)` centered around 650. Required stable ticks are `clamp(25 + 8r + 4s + 3m + ceil(i/10), 25, 100)`. Here `r` is DIME rarity tier 0–4, `s` node size 1–5, `m` server-derived mass 1–5 and `i` server-derived instability 0–100. Progress grows inside the band and recedes outside it. Charge 1,000 destroys the node with zero collectible output and a 30-minute respawn checkpoint.

At resolution the browser submits one run-length pulse trace, capped at 256 runs, 1,200 ticks and 90 seconds. The server replays its own immutable node parameters, checks elapsed bounds and determines success or destruction. This validates model consistency, **not physical browser input**. A successful node splits into 3–8 positive integer pieces, preserving exact yield. The server chooses positions from reachable, unblocked walkable tiles supplied by the authoritative zone; pieces are separated by at least 1.5 tiles. The local prototype uses one canvas and bounded particles; its synthetic acceptance is not the production authority.

The opt-in `OriginalMiningService` uses the same guarded transaction/receipt design for start, resolve, vacuum start, vacuum finish and cancel. Server checkpoints occur only on those actions. It validates node analysis, tool or owned/occupied ground rig, zone eligibility, range and line of sight through an injected authoritative spatial validator. A vacuum finish must match its server checkpoint and elapsed minimum; full hold or failure leaves the piece intact. Player movement and the visual beam/suction animation remain local. Browser-reported player position still cannot be physically attested; the server must constrain it to reachable tiles and line of sight. The proposed handler routes these actions under `/v4/actions` and validates them against the deterministic original-zone geometry.

`OriginalActionService` applies local zone transitions, assigned physical departures, integer-unit transfers, processing, market sales and the first contract with revision/generation guards and one request receipt. Deterministic discovery seeds nodes from save generation and zone, uses catalog spawn weights, requires scanner analysis and prevents reload rerolls. The first contract counts only accepted pieces from its exact 400-unit assignment node; it sells for 5,200 shift marks and grants the 500 reward once.

## Conversion rollout and recovery

The Lambda enforces `ContentConversionMode`; its template default is `DISABLED`. `GET /v4/state` reports compatibility plus a boolean conversion-availability result, and preview remains non-mutating in every mode. Apply returns generic `CONVERSION_NOT_ENABLED` without a receipt or state mutation when the caller is ineligible. `TESTERS` uses the explicitly domain-separated HMAC message `dime:v4:conversion-tester:<derived-player-key>` inside the existing identity-secret boundary. Both candidate and configured values must be exactly 64 lowercase hexadecimal characters before a fixed-length constant-time comparison. Parsing removes empty entries, deduplicates tags, allows at most 20 unique tags, limits the environment value to 2,048 characters and fails closed on every malformed or excessive value. An empty `TESTERS` list permits nobody. Templates contain only non-reversible tags, never Twitch opaque IDs or internal player keys, and application logs contain neither inputs nor calculated tags. `ContentConversionTesterTags` is `NoEcho`; this reduces incidental CloudFormation display but is not secret storage and does not protect every downstream interface. `ENABLED` requires a later configuration review. This adds no IAM action, data scan or allowlist resource.

Required activation sequence:

1. Deploy the Milestone 4 backend with conversion `DISABLED`.
2. Verify the unchanged Milestone 3 state, action, pending recovery, travel, mining, cargo, processing, market, First Contract and reset paths.
3. Put the Milestone 4 frontend in Local Test and verify `/v4` parsing, maps, controls, HUD, laser, fracture and vacuum using preview or synthetic state.
4. Move that frontend to Hosted Test while conversion remains `DISABLED`; verify real Twitch loading and performance.
5. Separately approve `TESTERS`; convert only designated staging testers and verify refresh, reset, actions and recovery.
6. Separately approve `ENABLED` only after privacy and rollback release gates close.

The Milestone 4 client reads both unconverted compatibility responses and converted saves. Disabling conversion never disables `/v4/state` or existing converted gameplay. Keep a previously verified v4-compatible frontend package for frontend rollback. Milestone 3 cannot be used as the rollback client for converted saves. Preview remains non-mutating, apply remains atomic/idempotent, and reversal remains synthetic/test-only unless a separate secure production design is approved.

## Compatibility

The current Twitch client expects legacy schema version 2 and old IDs; it cannot render a version-3 snapshot after conversion. It remains compatible with the proposed backend through unchanged legacy endpoints, and no legacy request invokes conversion. A Milestone 4 client cannot run against the deployed M3 backend, which lacks `/v4`. The rollout above deliberately separates backend compatibility deployment, frontend testing and conversion activation.

Production bundles select the original Destroya UI and exclude protected legacy display terms. Protected terms remain in the old engine and conversion aliases only to read established saves and support the short cutover. New stable identifiers and the active compiled UI contain none. Compatibility code needs a separately reviewed retirement after the conversion window.

Web OAuth/account linking belong to Milestone 4.2 and remain unstarted. Web mode deliberately shows an authentication-unavailable message and contains no client secret, redirect URI, token store or session implementation.

## Privacy impact

Milestone 4.1 adds content/save-format versions and a conversion receipt containing request ID, source revision, source save generation and a non-reversible source digest. It adds no analytics, advertising, OAuth or linked account data. Before release, policy wording should include the conversion receipt among technical idempotency records.

## Pre-commit validation evidence

The final local validation used Node 22.23.2. `npm ci` installed 245 packages with no audit findings. Lint, strict typecheck, 266 Vitest tests in 42 files, the default frontend build and Lambda build passed. The final complete Chromium suite passed 66/66 scenarios, including the original Panel, Mobile and desktop presentation and the retained Milestone 3 regression suite. Twitch and web-mode builds passed separately. Formatting and `git diff --check` passed.

A clean Linux-native SAM build under `/tmp/dime-m4-sam-final` passed. Its Lambda `index.mjs` is byte-identical to `dist/server/index.mjs`; both have SHA-256 `71373847f69defa92afbc836d8ccf1d02476bcb540d39cf8e5ec973b7274144e`. SAM validation, source/built/processed cfn-lint, all six source Guard rules and all four processed Guard rules passed. The offline transform has the expected 18 resources: the existing protected staging resources plus route-scoped permissions for the original `/v4` API. Lambda IAM actions remain unchanged.

The first endurance run's constant 10,000,000-byte heap was Chromium's fixed placeholder without precise-memory mode and is withdrawn as heap evidence. The repaired benchmark enables `--enable-precise-memory-info`, preserves byte-level `performance.memory.usedJSHeapSize` readings, and classifies missing or fixed-placeholder readings as unavailable.

The final production-preview run used Chromium 153.0.8010.12 on Linux x64 with 16 logical CPUs. It completed 488 Tessick Station → Loam Crescent → Mica Slope → Avenbolt → Tessick Station cycles over 630,329 ms, including a final 30-second no-interaction observation. Average transition duration was 75.64 ms, p95 was 92.69 ms and worst was 130.61 ms. Settled frame p95/worst were 16.8 ms. Heap was 5,680,816 bytes initially, 31,551,022 at the midpoint, 12,480,699 at active completion and 13,115,739 after idle, with a 5,680,816–54,434,907 byte sawtooth range. No garbage collection was forced. Quarter minima were 5.68, 11.66, 8.96 and 6.84 MB, showing repeated collection rather than continuously increasing retention; the post-idle value is still 7.44 MB above cold startup and remains a Hosted Test observation point. DOM nodes stayed at 40 and canvas count at one. There was no document scrolling, console error, unhandled rejection or failed request. This is a local production-preview surrogate. Real Twitch webview and public-domain performance remain release gates.

Production frontend output contains three root HTML entry points and one CSS/JavaScript pair. The default/web JavaScript is 294.82 kB (85.10 kB gzip); Twitch mode is 297.54 kB (85.96 kB gzip); CSS is 4.90 kB (1.85 kB gzip). The production frontend contains no source maps, fixtures, dependency directory, copied artwork or protected legacy display terms.
