# Milestone 4.3 guest frontend — publication review

Status: **prepared only; not published**. Based on `codex/dime-m4-graphics-web` at `c39b5b18317f213197a4b4fd6e00102765707f98`.

Source implementation commit: `853669a4885e61226c07f13ab2b71b61e6f4020f`. The companion report commit adds only this review and its publication manifest.

## What this changes

A dedicated guest build opens the world using an explicit, deterministic in-memory adapter after a non-sensitive server capability check. It never constructs a Twitch/OAuth credential or connects a persistent action gateway. Reload recreates the demo; a new tab starts independently. The world retains physical navigation, compact controls, Ping/Analyze, charge control, fracture and vacuum. A compact guest notice stays visible beside expanded analysis; economy, cargo and quest details are labelled local demo state. Profile, reset, linking and deletion controls are unavailable.

The guest starts with a labelled 5,000-mark allowance, a Tessick refinery loaner and sample stock so processing can be demonstrated without changing mineral balance. A guest-only order-collection control completes the processing journey. No demo stock, money or progression can transfer to an authenticated account.

The adapter imports pure game functions only. It has no network, account, identity, storage, receipt or pending-action implementation. Mutation requests are strict-schema validated locally. The guest entry returns before request-ID construction and the persistent action pipeline; the release build replaces browser pending storage with a throwing stub. Normal Twitch/web builds replace the guest factory with an unavailable stub. No accessibility/display preference is persisted.

## Artifact and publication inventory

- ZIP: `/tmp/dime-m43-guest/DIME-Web-0.9.0-guest-demo-review-20260916.zip`
- Size: **111,138 bytes**
- SHA-256: **`1a0f24ff06051e2df27565e606f9bd2f5870147c780a0724bbce37cf5501e920`**
- Three files: one HTML entry and two hashed JS/CSS assets. No wrapper, maps, tests, fixtures, Twitch HTML or preview server.
- Exact object plan: [publication manifest](dime-m43-guest-publication-manifest.json).
- Local rollback ZIP: `/tmp/dime-m43-guest/website-rollback-before-guest.zip`, SHA-256 `b2f7513b6f1db142f1784de37515fcef93fa26fa112e4494792fa050f3c7ef23`.
- Current replaced `index.html`: 748 bytes, ETag `"a4c3c0e31f6f6aeaf91b0dacb9df1e88"`, no VersionId, SHA-256 `2bcc8de3c43b8ac7feef1f1e21d331f93a4f6a2d37e808ef2b64f006915dae1a`.
- `/privacy`: unchanged, SHA-256 `6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c`.

The bucket has no enabled versioning. Local backup bytes and metadata have been retained and restoration hashes verified. Remote create-only versioned backup keys are planned, not created; VersionIds must be recorded honestly as null where S3 supplies none. Before publication, refresh all metadata and hashes, back up each replaced object, upload assets create-only, and replace HTML only with If-Match against its verified ETag. The future single invalidation covers `/` and `/index.html`. Rollback restores the old HTML and distribution conditionally and retains new hashed assets.

## Separately reviewed routing and CSP

[Detailed review](../infra/web/guest-review/README.md) and [auxiliary template](../infra/web/guest-review/auxiliary-template.json).

Proposed additions: **one CloudFront Function and one response-headers policy**. Proposed existing distribution update: root entry, two HTTPS origins, four explicit cache behaviors and scoped associations. Privacy retains its original behavior. No distribution replacement/import is proposed. The offline generator requires actual auxiliary outputs and a fresh matching ETag before producing a concrete candidate. No CloudFormation change set, edge resource, distribution update or invalidation was created/executed.

The exact-path edge capability advertises a memory-only guest and disabled online features. It is not authentication and does not touch either Lambda. Remove/replace this static disabled-online contract as part of a later separately reviewed OAuth activation. Auth paths route to the existing staging backend without cache; the guest edge gate rejects all `/api/*` requests with 401 before forwarding; no permission or API Gateway route is added. The same-origin CSP disallows inline scripts, eval, third-party connections, framing and form submission; only style attributes used by existing HUD animation are allowed inline. Proposed headers were exercised with compiled browser fixtures, not claimed as deployed public headers.

## Backend and data boundary

Read-only verification: account `861738068626`, stack `dime-v2-review-20260912` remains `UPDATE_COMPLETE`; sign-in `DISABLED`, linking `DISABLED`, conversion `ENABLED`. All 16 anonymous/invalid-marker checks across the eight Extension routes returned 401 from the allowed Extension origin. A website-origin request to a legacy route returned 403 at its origin guard, also without reaching gameplay. Eight probes across direct staging web state/actions/reset/conversion paths currently reject with a generic 503 (existing behavior; its backend root cause is outside this frontend-only review); the reviewed public-domain edge gate returns 401 without invoking it. No deployed Lambda was modified to change this. Public `/auth/status` returns only disabled sign-in/linking booleans; the new guest capability is not deployed.

Both local Lambda bundles remain byte-identical to the previously deployed sources:

| Bundle               | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| Gameplay `index.mjs` | `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4` |
| Web-auth `index.mjs` | `63de7251010498e7bdef8cf6674709a03549a010baf31172fcc25e66a3b590e8` |

No Lambda was rebuilt or deployed. No live DynamoDB request, player inspection, scan, reset, wipe, secret-value retrieval, OAuth change, linking change, privacy write, website write or Twitch upload/public release occurred.

## Validation evidence

Evidence directory: `/tmp/dime-m43-guest`. Unit suite: **416 passing tests in 60 files**. Lint, strict TypeScript, formatting, diff whitespace, guest/Twitch/web builds, cfn-lint, Guard and AWS template validation pass. Template validation reports no IAM capability. Compiled guest audit finds no browser-storage implementation, persistent API/development endpoint, Twitch helper, signing credential or secret reference. Guest simulation code is absent from the Twitch bundle. The final Twitch output is byte-identical to the full regression build.

The complete existing Chromium release suite passes **164 tests in one clean run (36.6 minutes)**. Together with the separate complete guest suite, the final Chromium total is **168 passing tests**.

The final guest Chromium suite passes **4 tests** in one clean run (6.4 minutes), with no retries. Three complete gameplay journeys have no console errors, generated credentials, cookies, authenticated mutation requests or progress in local/session storage. The fourth test sends eight anonymous/explicitly invalid-marker probes to the exact reviewed edge function and verifies 401 before any origin. Panel and Mobile use touch; desktop uses keyboard; Mobile includes reduced motion. New-tab isolation, refresh reset, local sale/processing, menu pause, hidden profile/sign-in controls and no map teleport are checked. Earlier guest fixture failures were corrected (destination selection, duplicate touch-release events and market selection); they are not counted as clean passes. No gameplay shortcut, injected browser state or mock authentication is used in guest journeys. The independent synthetic oracle only predicts node geometry for walking tests. Browser requests are restricted to static build bytes and the exact proposed public capability, with credentials/cookies forbidden.

## Changed source areas

- `app/original/guestRuntime.ts`, guest unavailable/pending-storage adapters, `app/guestCapability.ts`: explicit runtime and fail-closed boundary.
- `app/original/Main.tsx`, `ServiceConsole.tsx`, `original.css`, `app/main.tsx`: guest admission, compact notice, local services, safe error copy and unavailable profile actions.
- `vite.config.ts`, guest build/preview scripts: isolated artifact and compilation guards.
- `infra/web/guest-review/*`, routing generator: unexecuted edge/routing/CSP review.
- Guest unit/edge tests and compiled-browser journeys/configuration.

## Owner action

Review this distinct guest artifact and the proposed CloudFront changes before authorizing publication. OAuth credentials or Twitch login are not needed for this memory-only demo. No activation or publication is inferred from this preparation task.

### Viewport and frame measurements

Compiled guest, Chromium headless, 120 initial-world frame intervals per size, while regression tests also ran. These are local review measurements, not claims about all user devices or long-session heap behavior.

| Layout                         | Unobstructed world, including full hit areas and guest notice | Frame p95 / worst | Canvas / DOM | Document scrolling |
| ------------------------------ | ------------------------------------------------------------: | ----------------: | -----------: | ------------------ |
| Panel 318×500                  |                                                        84.74% |    16.7 / 16.8 ms |       1 / 60 | None               |
| Mobile 360×640, reduced motion |                                                        89.47% |    16.7 / 16.8 ms |       1 / 60 | None               |
| Desktop 1280×900               |                                                        97.89% |    16.7 / 16.8 ms |       1 / 60 | None               |

Screenshots are in `/tmp/dime-m43-guest/screenshots`: `guest-318.png`, `guest-360.png`, `guest-1280.png`, and corresponding `analyzed-*` / `fracture-*` images. The Panel analysis screenshot verifies the compact guest notice and analysis panel do not overlap. No image assets or mineral balance were changed.

### Edge gate review fingerprint

Auxiliary template SHA-256: `0e2d03d9778b382d9ddd0254210349bb1afdf78518a4f121027d17309b8c7b33`. Capability/API-gate source SHA-256: `7bea0577c3673f486f24bea57d189c974b1f82357daa277da7fa85c45e590828`. The publication manifest binds these separately reviewed prerequisites to the unchanged frontend ZIP. No new API request can authorize through the guest edge gate, including encoded or dot-segment path variants; valid logout and deletion-resume paths pass through with their existing checks.

### Production renderer performance regression

The existing synthetic production performance study completed at all three layouts with the current Twitch and web builds, 8 intact formations, 8 fragments, scanner/laser/vacuum effects, physical transitions and Avenbolt Commodity Hall. One earlier attempt used the script’s stale default desktop artifact and failed its Menu selector; the complete study was rerun with `DIME_WEB_BUILD=/tmp/dime-m43-guest/web-regression`.

| Layout  | Frame p95 / worst across effects | Transition average / p95 / worst | Post-study retained heap | Errors |
| ------- | -------------------------------: | -------------------------------: | -----------------------: | -----: |
| Panel   |                   16.7 / 16.8 ms |            77.2 / 86.8 / 87.2 ms |                  5.02 MB |      0 |
| Mobile  |                   16.8 / 16.8 ms |            77.2 / 87.0 / 88.0 ms |                  5.07 MB |      0 |
| Desktop |                   16.7 / 33.4 ms |            71.7 / 86.3 / 96.7 ms |                  5.33 MB |      0 |

One canvas throughout; no document scrolling; 30–36 physical transitions per layout; all eight fragments collected with exact 80-unit conservation in the stress fixture. Ordinary DOM stabilized at 57 nodes. Heap samples warmed from about 3.7–3.8 MB to 6.3–6.5 MB, then measured 5.0–5.3 MB after the final scene. This finite local study is not proof of arbitrarily long-session heap stability or real Twitch-webview/network performance. Full data: `/tmp/dime-m43-guest/twitch-performance.json`.

## Exact changed files

- `app/guestCapability.ts`
- `app/main.tsx`
- `app/original/Main.tsx`
- `app/original/ServiceConsole.tsx`
- `app/original/guestPendingUnavailable.ts`
- `app/original/guestRuntime.ts`
- `app/original/guestUnavailable.ts`
- `app/original/original.css`
- `app/original/pendingStorage.ts`
- `infra/web/guest-review/README.md`
- `infra/web/guest-review/auxiliary-template.json`
- `infra/web/guest-review/distribution-diff.json`
- `infra/web/guest-review/guest.guard`
- `infra/web/guest-review/security-headers.json`
- `infra/web/guest-review/status-function.js`
- `playwright.guest.config.ts`
- `scripts/build-guest.mjs`
- `scripts/prepare-guest-routing.mjs`
- `scripts/preview-guest.mjs`
- `tests/guest-browser/guest.spec.ts`
- `tests/guest-browser/journey.ts`
- `tests/guestEdge.test.ts`
- `tests/guestRuntime.test.ts`
- `vite.config.ts`
- `docs/dime-m43-guest-review.md`
- `docs/dime-m43-guest-publication-manifest.json`
