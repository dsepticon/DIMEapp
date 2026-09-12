# Validation record

## Follow-up validation — September 11, 2026

After adding the offline legacy preview: `npm run check` passed lint, strict typecheck, **58 tests across 7 files**, frontend build and Lambda bundling. `npm run test:e2e` passed **5/5 Chromium tests**. `npm run format:check` and `git diff --check` passed. The same Node/browser paths documented below were used. Initial sandbox runs could not start local test servers; authorized runs outside the sandbox passed without application changes. No AWS/Twitch endpoints or production records were used.

`tests/legacy-preview.test.ts` adds 10 synthetic tests for complete source preservation, deterministic retry, exact mixed-unit mapping, retained orders/claims/unknown fields, fractional/out-of-range values, ambiguous refined cargo, ciphertext/corrupt inputs, conflicting locations/equipment and explicit-version handling. These verify the offline preview, not a deployed migration or DynamoDB transaction. Production conversion remains disabled and unimplemented pending [mapping approval](legacy-save-mapping.md).

Verified September 11, 2026 using Node 22.23.2, the committed lockfile and Chromium. All test users, signing keys and database contents are synthetic. No production endpoint, Lambda invocation or player-table operation was used for validation.

## Before repairs

The existing lockfile installed successfully. Baseline output is preserved in baseline-validation.json.

| Command/check | Observed result |
|---|---|
| npm ci | Passed after allowing package network access |
| npm run lint -- --no-cache | Exit 0, but opened the ESLint setup prompt; no valid lint run occurred |
| tsc --noEmit | Passed |
| npm test | Exit 1: missing test script; no unit/integration suite |
| npm run build | First failed with sandbox EPERM for Next IPC; permitted retry passed with CSS flex-alignment and outdated Browserslist warnings |
| npm audit | 86 findings: 13 low, 44 moderate, 25 high, 4 critical |

The old Next/Amplify dependency graph was removed from the active static extension build after confirming it was starter/SSR infrastructure, not the original game. React remains on version 18. Recovered legacy code is archived as text and is not compiled or executed.

## Final validation

| Command/check | Result |
|---|---|
| npm ci --cache /tmp/dime-npm-cache | Exit 0; 245 packages installed; audit 0 vulnerabilities |
| npm run lint | Exit 0; no errors or warnings |
| npm run typecheck | Exit 0 |
| npm test | Exit 0; 48 tests passed in 6 files |
| npm run build | Exit 0; static index/panel/mobile bundles and separate Lambda ESM package generated |
| npm run check | Exit 0; runs lint, typecheck, tests and build sequentially |
| npm run format:check | Exit 0 |
| npm run test:e2e | Exit 0; all 5 Chromium tests passed |
| VITE_DIME_MODE=local npm run build | Expected exit 1; verified explicit rejection before release output generation |
| git diff --check (final changes) | Passed; recovered reference whitespace is explicitly preserved by .gitattributes |
| Local credential-pattern scan | No private keys, AWS access-key IDs, complete JWTs or credential-bearing URLs found in candidate tracked files |

Frontend build: 123 modules, main JavaScript 257.11 kB (79.67 kB gzip), CSS 7.62 kB (2.27 kB gzip). No release source maps are published with the frontend. Backend source maps are local build artifacts. Size is a build observation, not a hosted performance measurement.

The shell harness sets both NO_COLOR and FORCE_COLOR, so Playwright prints a harmless color-precedence warning. There are no application build/lint warnings in the final run. Audit results are a point-in-time known-vulnerability check, not a guarantee of security.

## Coverage

- domain.test.ts: mining ownership/timing/rewards, raw cargo, integer/invalid quantities, capacity, refinery fees and timing, partial collection, sale removal/credit, shop ownership and Mole stations.
- auth.test.ts: signed Twitch roles/identity, expiration, wrong algorithm/key, configured rotation, delayed helper initialization, refresh, cleanup and local-mode separation.
- client.test.ts: current-token requests, authorization failure, network failure and invalid-response handling.
- service.test.ts: concurrent mutations, duplicate request replay, conflicting IDs, stale revisions/expired receipts, player separation, HTTP errors and safe database failures.
- dynamo.test.ts: consistent reads, conditional state-plus-receipt transaction, conditional cancellation reconciliation, propagation of other failures. Uses a mocked SDK sender.
- local.test.ts: actual loopback API, process restart, file/receipt persistence, replay, origin restrictions and refusal to start in production mode.
- e2e/game.spec.ts: complete mine/refine/collect/sell with refresh; lost response and same-ID retry; 320px navigation/overflow; fresh zero-balance hand-mining earnings; explicit transaction blocking for corrupt retry storage.

Browser tests route requests to the real domain/service logic backed by MemoryStore, using a controlled server clock. They do not prove AWS IAM/table/service configuration or real Twitch hosted authorization.

## Browser environment and failures repaired

Initial Chromium launch failed because libnspr4, libnss3 and libasound2 were missing. They were downloaded and extracted under /tmp, without changing system packages. The run used:

```sh
PATH=/tmp/node-v22.23.2-linux-x64/bin:$PATH \
LD_LIBRARY_PATH=/tmp/dime-browser-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=/tmp/dime-browsers npm run test:e2e
```

Once Chromium launched, it exposed an unbound native fetch invocation that mocked unit calls did not reproduce. The client now uses a wrapper around native fetch. A strict label selector also failed despite the select having a correct accessible name; browser tests now select by combobox role/name. The full suite was rerun successfully after these fixes and after separating travel/cargo selection.

On a normal Linux workstation/CI image, install Chromium prerequisites with the documented Playwright setup command. Do not run two local API servers on port 8787. The local integration test uses a separate temporary state directory and removes only its own test files.

## Remaining release validation

Requires a separately approved staging deployment: actual Twitch hosted-test authorization/CSP, mobile Twitch webview behavior, real DynamoDB/IAM conditional writes, API Gateway integration/CORS/throttles, service telemetry and deployment/rollback rehearsal. No production readiness claim substitutes these release gates.

The initial staged recovery diff reported trailing whitespace in authored archive files. Those files are provenance references, so their text was preserved. .gitattributes exempts only docs/recovered/** from whitespace normalization/checking; maintained source still receives normal diff and formatter checks.

Global-save synthetic tests verify signed JWT derivation is channel-independent, different players remain isolated, forged body identities fail, anonymous identities are blocked, and browser retry keys do not contain raw Twitch IDs. The read-only migration-gate tests verify existing v2 priority, unverified links, duplicate-source reconciliation and deterministic no-write retry. A mocked DynamoDB test checks the prepared three-item conditional migration transaction and permanent source/player receipts. It is unreachable from the Lambda; verified legacy linking, complete field mapping and live transactional migration tests remain unavailable. Real Twitch two-channel staging verification is still required.

September 12 local validation: lint pass; format:check pass; typecheck pass; `npm test` 68/68 in 8 files; `npm run build` pass (Vite frontend and Lambda bundle). `npm run test:e2e` attempted twice: first missing Playwright Chromium, then browser download succeeded but launch failed on missing libnspr4/libnss3/libasound. `npx playwright install-deps chromium` could not complete because sudo needs a terminal for authentication. Node v24.21.0 was available; package engine requests Node 22.
