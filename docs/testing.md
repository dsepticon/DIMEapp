September 12 configuration-refresh pass under Node v22.23.2: `npm ci` passed (245 packages, 0 vulnerabilities); `npm run check` passed lint, strict typecheck, 74/74 Vitest tests in 9 files, frontend build and Lambda bundle. Playwright Chromium passed 5/5; `npm run format:check`, `git diff --check`, `sam validate --lint`, cfn-lint 1.56.3, source Guard 6/6 and offline-translated Guard 4/4 passed. SAM CLI 1.166.2 recognized the Node 22 bundle but `sam build` stalled after “package.json file not found. Continuing the build without dependencies.” in multiple temporary directories, with the process waiting in WSL `p9_client_rpc`; the attempts were interrupted, but WSL left an uninterruptible filesystem wait, so SAM build cannot be claimed as passing. The reviewed Lambda package can be made directly from the already checked single-file bundle, with ZIP contents and hash verified separately. No API test was performed after the owner corrected the secret, and no secret value was read.

## Milestone 3 working-tree validation — September 13, 2026

This is not a release validation. Under Node v22.23.2, `npm ci`, lint, strict typecheck, 191/191 Vitest tests in 23 files, frontend/Lambda builds, and the 46/46 Playwright Chromium suite passed before the latest added outpost-visual steps; those steps passed in a separate 2/2 browser rerun, with another full rerun underway. Formatting and `git diff --check` passed. Clean Linux-native `sam build --no-cached` passed; its Lambda file and `dist/server/index.mjs` both have SHA-256 `41705bb5c84a41dd264b57b67fa3474cd3b49a15e3bd183c96e5aea2f8bc5b3e`. `sam validate --lint`, source and offline-processed cfn-lint, all six normalized source Guard rules and all four processed Guard rules passed. Running Guard directly on the shorthand source YAML produces a known intrinsic-tag representation mismatch; the reviewed SAM-built normalized source passes. The offline transform contains 13 expected resources including the Milestone 2.3 reset-route permission. `scripts/m3-performance.ts` measured local synthetic production-preview walking and Area18 zone-response timing separately from reload timing. Passing checks do not close the visual, recording and longer-session performance requirements listed in [Milestone 3](dime-2d-rpg-m3-world-mining.md). Nothing was committed, pushed or deployed for this working tree.

# Validation record

## Staging toolchain validation — September 12, 2026, 16:22 MDT

With Node **v22.23.2**, SAM CLI **1.166.2**, cfn-lint **1.56.3**, CloudFormation Guard **3.2.1**, and offline `aws-sam-translator` **1.113.0**:

| Check                                                             | Exact result                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `sam validate --lint --template-file infra/staging/template.yaml` | Passed; valid SAM template                                                                                                                  |
| `cfn-lint infra/staging/template.yaml`                            | Passed; no findings                                                                                                                         |
| `sam build --template-file infra/staging/template.yaml`           | Passed; local `.aws-sam/build` contains only `template.yaml` and `EbsFunction/index.mjs`                                                    |
| `cfn-guard validate` with `staging.guard`                         | Passed **6/6** rules against SAM build template                                                                                             |
| Offline SAM transform and `processed.guard`                       | **12** expected translated resources; passed **3/3** processed rules                                                                        |
| Guard negative probes                                             | Rejected wildcard CORS, broad DynamoDB IAM, unexpected bucket, other-API invocation, other-function invocation, and processed wildcard CORS |
| `npm ci`                                                          | Passed; 245 packages installed, 246 audited, 0 vulnerabilities                                                                              |
| `npm run check`                                                   | Passed lint, strict typecheck, **68/68 Vitest tests in 8 files**, frontend build and Lambda ESM bundle                                      |
| `npm run test:e2e`                                                | Passed **5/5 Playwright Chromium tests**                                                                                                    |
| `npm run format:check`; `git diff --check`                        | Both passed                                                                                                                                 |

The first SAM validation found an invalid HTTP API `Name` alongside inline OpenAPI title; cfn-lint found redundant `DependsOn`. Both were removed. Offline translation then showed SAM's CORS property lost methods and headers with a parameterized origin list; CORS now lives in the inline OpenAPI definition and all fields survive translation. The offline transform used an inert S3 CodeUri **in memory only** to reveal generated resources; no packaging, upload, bucket, change set or stack was created. It is not a CloudFormation-processed change set.

The translated inventory is one table, one Lambda, one role, two log groups, one HTTP API, one `staging` stage, two route-specific Lambda invoke permissions and three alarms. Permission SourceArns reference only the staging API ID and the exact GET `/state` or POST `/actions` route; SAM wildcards the stage **within that API**. The transformed OpenAPI retains exact parameterized Twitch origins, GET/POST/OPTIONS, authorization/content-type headers and `allowCredentials: false`. The execution role retains only `GetItem`, `PutItem`, `CreateLogStream` and `PutLogEvents` on the new table or its own log streams. No production/legacy resource, bucket, domain, frontend asset or production stage appears in the inventory. The SAM-copied Lambda has the same SHA-256 as `dist/server/index.mjs` (`71eb9a6ad57c7b46e1e33a64f31110033f477fb895266a7e84335fe387b08283`) and no migration markers. Secret fields remain dynamic references in the template; no secret values were provided or embedded. The SAM CLI printed a non-fatal warning because its global metadata file under the sandboxed home directory was read-only; each SAM command exited 0.

These checks used local files, loopback fixtures and synthetic identities. No production AWS or Twitch resource was accessed by the test suite. The later live Amplify branch-pattern recheck is read-only and separate from these validators.

## Staging infrastructure source validation — September 12, 2026

With Node v22.23.2, `npm run check` passed (lint, strict typecheck, **68/68 Vitest tests in 8 files**, frontend build and Lambda bundle), `npm run test:e2e` passed **5/5 Playwright Chromium tests**, and `npm run format:check` and `git diff --check` passed. The rebuilt Lambda package contains only `index.mjs`; the build-time migration exclusion guard and a direct bundle scan found no `MIGRATION#v1#`, `LEGACY#v1#`, `commitMigration`, `previewLegacySave` or `assessLegacySources` marker. `server/migration-dynamo.ts` is not imported by the Lambda.

`aws cloudformation validate-template` accepted `infra/staging/template.yaml` and reported the eight expected parameters and `CAPABILITY_AUTO_EXPAND`; this is a read-only syntax check, not a stack/change-set operation or proof of successful SAM expansion. A local PyYAML structural audit found 9 source resources, four exact IAM actions with no account-wide wildcard resource, no bucket/secret/CloudFront resource, and no migration module in the Lambda bundle. At that earlier point `sam`, `cfn-lint` and `cfn-guard` were unavailable, so SAM build/processed-template lint and compliance validation could not run. Review the actual CloudFormation-processed template and generated route permissions before any separately approved change set execution. No AWS/Twitch resource was created, deployed, modified or invoked by these validations.

## Node 22 review-branch validation — September 12, 2026, 14:56 MDT

Verified in the `codex/react-extension-rebuild-review` worktree with Node **v22.23.2** and the committed lockfile:

| Command                | Result                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`               | Passed; 245 packages installed, 246 audited, 0 vulnerabilities                                                                                                                      |
| `npm run test:e2e`     | Passed; **5/5 Playwright Chromium tests** (6.1 seconds): mine/refine/collect/sell with refresh; lost-response retry; 320px panel layout; first wallet credit; corrupt retry storage |
| `npm run check`        | Passed: ESLint, strict TypeScript check, **68/68 Vitest tests across 8 files**, Vite frontend build and Lambda ESM bundle                                                           |
| `npm run format:check` | Passed; all matched files use Prettier style                                                                                                                                        |
| `git diff --check`     | Passed; no whitespace errors                                                                                                                                                        |

The E2E web server ran only on `127.0.0.1:5173`; its API calls to `127.0.0.1:8787` were intercepted by an in-memory `GameService` fixture. The test aborts the Twitch helper request. Integration tests use synthetic JWTs, mocked DynamoDB senders and a loopback local server with temporary file state. These validation commands did not access production AWS or Twitch resources, invoke deployed Lambdas, or read/write production player records. `npm ci` contacted the npm registry for locked packages. Browser and build outputs are ignored and are not part of the documentation commit. Real hosted Twitch and AWS staging verification remains a separate release gate.

## Follow-up validation — September 11, 2026

After adding the offline legacy preview: `npm run check` passed lint, strict typecheck, **58 tests across 7 files**, frontend build and Lambda bundling. `npm run test:e2e` passed **5/5 Chromium tests**. `npm run format:check` and `git diff --check` passed. The same Node/browser paths documented below were used. Initial sandbox runs could not start local test servers; authorized runs outside the sandbox passed without application changes. No AWS/Twitch endpoints or production records were used.

`tests/legacy-preview.test.ts` adds 10 synthetic tests for complete source preservation, deterministic retry, exact mixed-unit mapping, retained orders/claims/unknown fields, fractional/out-of-range values, ambiguous refined cargo, ciphertext/corrupt inputs, conflicting locations/equipment and explicit-version handling. These verify the offline preview, not a deployed migration or DynamoDB transaction. Production conversion remains disabled and unimplemented pending [mapping approval](legacy-save-mapping.md).

Verified September 11, 2026 using Node 22.23.2, the committed lockfile and Chromium. All test users, signing keys and database contents are synthetic. No production endpoint, Lambda invocation or player-table operation was used for validation.

## Before repairs

The existing lockfile installed successfully. Baseline output is preserved in baseline-validation.json.

| Command/check              | Observed result                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| npm ci                     | Passed after allowing package network access                                                                                    |
| npm run lint -- --no-cache | Exit 0, but opened the ESLint setup prompt; no valid lint run occurred                                                          |
| tsc --noEmit               | Passed                                                                                                                          |
| npm test                   | Exit 1: missing test script; no unit/integration suite                                                                          |
| npm run build              | First failed with sandbox EPERM for Next IPC; permitted retry passed with CSS flex-alignment and outdated Browserslist warnings |
| npm audit                  | 86 findings: 13 low, 44 moderate, 25 high, 4 critical                                                                           |

The old Next/Amplify dependency graph was removed from the active static extension build after confirming it was starter/SSR infrastructure, not the original game. React remains on version 18. Recovered legacy code is archived as text and is not compiled or executed.

## Final validation

| Command/check                      | Result                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| npm ci --cache /tmp/dime-npm-cache | Exit 0; 245 packages installed; audit 0 vulnerabilities                                                        |
| npm run lint                       | Exit 0; no errors or warnings                                                                                  |
| npm run typecheck                  | Exit 0                                                                                                         |
| npm test                           | Exit 0; 48 tests passed in 6 files                                                                             |
| npm run build                      | Exit 0; static index/panel/mobile bundles and separate Lambda ESM package generated                            |
| npm run check                      | Exit 0; runs lint, typecheck, tests and build sequentially                                                     |
| npm run format:check               | Exit 0                                                                                                         |
| npm run test:e2e                   | Exit 0; all 5 Chromium tests passed                                                                            |
| VITE_DIME_MODE=local npm run build | Expected exit 1; verified explicit rejection before release output generation                                  |
| git diff --check (final changes)   | Passed; recovered reference whitespace is explicitly preserved by .gitattributes                               |
| Local credential-pattern scan      | No private keys, AWS access-key IDs, complete JWTs or credential-bearing URLs found in candidate tracked files |

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

## Milestone 3 local pre-push validation (2026-09-14)

On Node 22.23.2, `npm ci` installed 245 packages without an audit finding. Full lint, strict typecheck, 191 Vitest tests across 23 files, frontend/Lambda builds, and 53/53 Chromium tests passed. A subsequent screenshot paint-ready assertion passed its targeted Panel/Mobile replay 2/2. The continuous synthetic route travels ARC-L1 → Lyria → Wala → Area18 → ARC-L1. `npm run format:check`, `git diff --check`, `sam validate --lint`, and source/processed `cfn-lint` passed. A clean `sam build --no-cached` in Linux-native `/tmp` and all source/processed Guard rules passed; the SAM Lambda is byte-identical to the local build.

The production-mode synthetic benchmark in `scripts/m3-performance.ts` writes `test-results/m3-performance.json`. It uses a localhost preview and intercepts the configured staging API URL with an in-memory service; it does not send a staging request. The longer `scripts/m3-long-session.ts` benchmark completed 20 four-location cycles over 19.05 minutes with no console/page/network errors or increasing retained heap, DOM, or canvas counts; see `test-results/m3-long-session-performance.json`. The visual manifest records 64/64 required Panel/Mobile screenshot pairs with manual observations. All 17 local gameplay recordings were reviewed through contact sheets and their original videos; see `test-results/m3-recording-audit.json` and `test-results/m3-recording-review.json`. Real Twitch Hosted Test webview performance remains a release gate.

Requires a separately approved staging deployment: actual Twitch hosted-test authorization/CSP, mobile Twitch webview behavior, real DynamoDB/IAM conditional writes, API Gateway integration/CORS/throttles, service telemetry and deployment/rollback rehearsal. No production readiness claim substitutes these release gates.

The initial staged recovery diff reported trailing whitespace in authored archive files. Those files are provenance references, so their text was preserved. .gitattributes exempts only docs/recovered/\*\* from whitespace normalization/checking; maintained source still receives normal diff and formatter checks.

Global-save synthetic tests verify signed JWT derivation is channel-independent, different players remain isolated, forged body identities fail, anonymous identities are blocked, and browser retry keys do not contain raw Twitch IDs. The read-only migration-gate tests verify existing v2 priority, unverified links, duplicate-source reconciliation and deterministic no-write retry. A mocked DynamoDB test checks the prepared three-item conditional migration transaction and permanent source/player receipts. It is unreachable from the Lambda; verified legacy linking, complete field mapping and live transactional migration tests remain unavailable. Real Twitch two-channel staging verification is still required.

Earlier September 12 Node 24 validation: lint pass; format:check pass; typecheck pass; `npm test` 68/68 in 8 files; `npm run build` pass (Vite frontend and Lambda bundle). `npm run test:e2e` attempted twice: first missing Playwright Chromium, then browser download succeeded but launch failed on missing libnspr4/libnss3/libasound. `npx playwright install-deps chromium` could not complete because sudo needs a terminal for authentication. Node v24.21.0 was available; package engine requests Node 22.

# Milestone 4.1 synthetic coverage

The `m4*` Vitest files cover mapping completeness, strict preview/apply/replay, synthetic rollback, whole-unit upgrade, original reset, all 43 zones, directional travel, deterministic discovery, integer economy, authoritative mining and request receipts. `m4Prototype.spec.ts` covers held charge, release decay, reduced motion, 3–8-piece conservation, zero-yield destruction, vacuum, capacity refusal, Panel, Mobile and desktop using synthetic state only. Production original-UI screenshots are stored outside the repository under `/tmp/dime-m4-original-review` during pre-commit review.
September 14 Milestone 4.1 pre-commit validation under Node v22.23.2: `npm ci` installed 245 packages with no audit findings; lint, strict typecheck, 266/266 Vitest tests in 42 files, default/Twitch/web frontend builds and the Lambda build passed. The final complete Playwright Chromium run passed 66/66 scenarios. Formatting and `git diff --check` passed. A clean Linux-native SAM build in `/tmp/dime-m4-sam-final` produced a Lambda byte-identical to `dist/server/index.mjs` with SHA-256 `71373847f69defa92afbc836d8ccf1d02476bcb540d39cf8e5ec973b7274144e`. SAM validation, source/built/processed cfn-lint, six source Guard rules and four processed Guard rules passed. The repaired 630-second production-preview run completed 488 five-location cycles without an error, fixed DOM/canvas counts and repeated heap collection. Chromium's former fixed 10,000,000-byte placeholder is explicitly rejected rather than reported as measured heap. Real Twitch webview and public-domain performance remain release gates. No external system or player record was accessed.
