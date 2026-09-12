September 12 staging configuration update preparation: the owner manually corrected the Twitch signing SecretString to bare base64. The supplied secret ARN matches the deployed stack parameter exactly; no value was retrieved. A new required `ConfigurationRevision=twitch-secret-fix-20260912-1` parameter will force a reviewed Lambda configuration update to refresh dynamic references, and the handler will log only fixed diagnostic codes while preserving a generic 503 response. The UPDATE change set must not be executed until separately approved; do not call the API or build Twitch assets before that execution.

September 12 staging execution: the approved existing change set for `dime-v2-review-20260912` reached `CREATE_COMPLETE` with 12 staging resources and five outputs. API URL: `https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging`. Table, Lambda, routes, CORS, logs and alarms matched the reviewed configuration; exact-origin OPTIONS returned 204. An unauthenticated GET returned 503 `UNAVAILABLE`, with only a generic Lambda `configuration_error`, so runtime verification remains blocked. Neither secret value was retrieved, and no secret or stack configuration was changed. The Twitch frontend ZIP was not built or uploaded. See [staging verification](staging-verification.md); resolve the configuration error through a separately reviewed action before proceeding with hosted testing.

September 12, 16:51 MDT read-only staging parameter preflight: the owner confirmed Twitch client ID, version `0.4.0`, Panel/Mobile paths and exact hosted origin. `us-east-2` is recommended for isolated synthetic-player staging; proposed stack/prefix names had no current collision. No suitable dedicated staging artifact bucket or active Secrets Manager secret ARN was found. Both secret ARN parameters and artifact-bucket creation remain approval gates. The older Twitch `assets.zip` remains untouched. See the [eight-parameter worksheet](staging-parameter-preflight.md). No value was retrieved and no AWS/Twitch resource was changed.

September 12, 16:22 MDT toolchain pass: SAM CLI 1.166.2, cfn-lint 1.56.3 and Guard 3.2.1 validated the isolated staging template; SAM build succeeded locally. Guard passed 6/6 source and 3/3 offline-translated rules, and the translator showed exactly 12 expected resources. The offline view is not a CloudFormation-processed change set. Generated permissions target the staging API and exact routes with SAM's wildcard stage inside that API. CORS was moved into inline OpenAPI after translation exposed lost methods/headers with the parameterized SAM CORS property. Node v22.23.2 `npm ci`, full `npm run check` (68/68 tests), Playwright Chromium (5/5), format and diff checks passed. See [testing](testing.md) and the [staging guide](../infra/staging/README.md). No packaging, upload, change set, stack or resource modification occurred.

Earlier staging-source validation: CloudFormation ValidateTemplate accepted eight parameters after AWS CLI authentication was renewed. Live Amplify automatic creation patterns were the literal `main` and `codex/react-extension-rebuild`, with no review branch connected. The Lambda trust was corrected to use only `lambda.amazonaws.com`; CloudFormation dynamic secret references resolve into encrypted Lambda environment configuration, so `lambda:GetFunctionConfiguration` must remain restricted. No AWS/Twitch resource was modified.

Staging infrastructure source follow-up: `infra/staging/template.yaml` now defines an isolated SAM stack for synthetic/new players only, with separate table, Node 22 EBS, HTTP API, dedicated role, retained logs, alarms and existing-secret dynamic references. See [staging guide](../infra/staging/README.md). No packaging upload, change set, stack, secret or frontend publication was performed. Migration code was moved out of the Lambda import graph.

September 12, 2026, 14:56 MDT follow-up: Node v22.23.2 validation passed: `npm ci` (245 packages, 0 audit vulnerabilities), `npm run test:e2e` (5/5 Playwright Chromium tests), `npm run check` (lint, strict typecheck, 68/68 Vitest tests in 8 files, frontend build and Lambda ESM bundle), `npm run format:check`, and `git diff --check`. Tests used loopback/in-memory fixtures and synthetic identities; no production AWS or Twitch resource was accessed by the tests. See [testing](testing.md) for exact coverage. Real Twitch hosted staging verification remains outstanding. Earlier Node 24 browser-library failure was environment-specific and is superseded by this Node 22 run.

September 12 global-save decision: the owner approved one save per persistent signed Twitch player across channels. The review implementation derives `PLAYER#v1#<server HMAC>` without channel in the key; Twitch documentation supports cross-channel U opaque IDs. Real hosted two-channel staging verification and legacy identity/field reconciliation remain release gates. No migration writes were enabled.

# DIME React/Twitch rebuild handoff

September 12 follow-up: the owner approved narrowing Amplify automatic creation patterns to the literal branches `main` and `codex/react-extension-rebuild`. The change was applied and verified with existing builds still enabled. Local branch `codex/react-extension-rebuild-review` now contains the review work and does not match either pattern. See [review push safety](review-push-safety.md) for the current decision; the earlier blocked-push findings below are historical.

Review date: September 11, 2026. Scope: Dsepticon/DIMEapp only. Working branch: codex/react-extension-rebuild, isolated checkout /tmp/dime-react-extension-rebuild. The original /mnt/c/projects/DIMEapp main checkout and its 24 pre-existing changes are preserved.

The safe local investigation, recovery, implementation and validation work is complete. AWS production remains unchanged. This is a reviewed-source candidate for isolated staging, not a deployed replacement or a claim that live production is now repaired.

## AWS and Git findings

CLI 2.36.43 met the >=2.32.0 requirement; STS authenticated account 861738068626. No new login was required. Core discovery covered all 17 enabled regions; related resources span us-west-2, ca-central-1, us-east-2, us-west-1 and global/us-east-1 support.

The custom domain uses S3/CloudFront in us-west-2 with October 2024 frontend artifacts. Separately, repository-linked Amplify in us-east-2 last successfully built the November 2023 starter commit. DIME-associated tables and Lambda APIs also exist in Canada/west-2, but the recovered game saves browser-local state rather than using an authoritative game EBS. Both application Lambda configurations are incompatible with recovered package filenames; their execution role is missing. See [AWS inventory](aws-inventory.md) for resources, schemas, environment names, tags, metrics, evidence boundaries and gaps.

The original main is 99cf684; the requested branch began at 98c8c75. The latter's simplified browser-only rebuild also differed from the active game's rules. [Reconciliation](reconciliation.md) records what was missing/broken and the compatibility risks.

## Recovery and reconstruction

- Recovered 17 authored frontend files from active source maps and 2 application Lambda files from hash-verified packages. They are non-executable text references with original/archive hashes; 2 files have a browser obfuscation key removed. Other copies preserve authored text with possible newline normalization.
- Preserved existing artwork and branding; restored catalog values for 20 ores, ships, equipment, locations, asteroid weights, nine refinery methods and travel timing.
- Reconstructed a maintainable static React/TypeScript/Vite client, typed domain rules, Twitch-validating Lambda EBS, transactional DynamoDB adapter, explicit local file-backed server and automated tests.
- Archived obsolete Amplify definitions; removed the active Next/Amplify starter dependency graph and duplicate prototype rules. Kept React 18. Added strict validation, actual linting, formatting, locked dependencies and a read-only CI workflow.

## Gameplay and security fixes

Mining rewards, cargo transfers, refinery fees/orders, collection, sales and wallet credits now share authoritative validated state. Server deadlines survive refresh. State and idempotency receipts commit together, guarded by revision/absence conditions. Repeated requests and concurrent clicks cannot apply one action twice. Invalid quantities, insufficient cargo/funds, capacity overflow, unowned equipment and invalid transitions are rejected.

Raw transfers remain raw, collection accounts for both cargo categories, partial orders persist, completed orders disappear correctly, and Aluminium pricing is consistent. Default heads and Mole station ownership are corrected. Recovered economy changes are explicitly explained in [gameplay.md](gameplay.md).

Twitch tokens refresh in memory and are validated with HS256/expiry/signed identity on the EBS. Anonymous or unauthorized tokens cannot transact. No browser-supplied identity, balance or total is trusted. Local mode is restricted to loopback development and refused by the release build/Lambda. Errors are safe, pending requests retry with the same ID, and late responses cannot overwrite a newer identity/revision. Responsive navigation, loading/error/empty states and keyboard focus are implemented.

## Validation

Clean npm ci: passed, 0 known vulnerabilities. Lint and strict typecheck: passed. Unit/integration tests: 48/48 across 6 files. Chromium: 5/5, including the full loop, fresh-player first earnings, lost-response recovery, refresh and 320px navigation. Frontend and Lambda builds: passed. Formatting and diff checks: passed. Release-local-mode rejection: verified expected exit 1.

[testing.md](testing.md) records exact commands, baseline failures, repaired browser issues, environment details and the limits of mocked AWS/Twitch validation. No tests used production data.

## Architecture and release plan

Use static Twitch-hosted React assets, an HTTPS HTTP API, separate Lambda EBS and a new transactional DynamoDB v2 table. Keep existing resource ownership intact. A SAM/CloudFormation staging plan is in [infra/README.md](../infra/README.md); no infrastructure import/deploy was run.

Before release, approve isolated staging, exact Twitch origins/secret references, global identity semantics, and any legacy-save migration policy. Existing tables/APIs are incompatible with v2; never deploy the new frontend against them. Untrusted browser saves must not become authoritative balances through an automatic importer. Real Twitch hosted testing and actual AWS integration tests remain release gates.

## Git status and publication blockers

Local commits were created using the author identity supplied by the owner:

- 9ff5cb2 — inventory AWS and preserve recovered DIME source.
- d8f7a62 — rebuild authoritative Twitch mining loop with isolated tests.
- This handoff is recorded in the following documentation commit.

The working branch is codex/react-extension-rebuild; main and the original dirty worktree were not changed. [changed-files.md](changed-files.md) lists exact paths.

No push occurred. Follow-up read-only inspection confirmed working GitHub CLI authentication and Amplify creation patterns `["*", "*/**"]` with automatic builds enabled for new branches. Both existing branches also have builds enabled. The requested `codex/react-extension-rebuild-review` branch is therefore unsafe to push. **Do not disable builds or deploy.** [Review push safety](review-push-safety.md) records exact settings, production identification and the proposed one-field pattern restriction requiring owner approval. No review branch was created or pushed.

The provisional save policy is recorded in [legacy save mapping](legacy-save-mapping.md), with an offline loss-preserving preview and 10 synthetic migration-preview tests. Existing saves are not yet supported by the new API's load path; decoder, identity binding and an approved migration writer remain release gates. [Staging verification](staging-verification.md) lists the required access/resources/configuration and checklist. Use existing verified staging only; no resource creation, modification or deployment is authorized.

## Rollback

No AWS rollback is needed for this investigation because nothing was deployed. Future cutover requires a verified snapshot of active frontend assets/index, Lambda packages/configuration, API stage deployment IDs, CloudFront/DNS configuration and data-recovery settings. The live frontend bucket lacks versioning, so do not rely on object history. Restore a previous approved artifact/version pointer for code rollback; preserve newly committed player transactions. Never overwrite live balances with an old dump. Full staging, production verification and rollback steps are in [deployment.md](deployment.md).

## File map

| Area | Material changes |
|---|---|
| app/ | React views, travel/mining panels, branded responsive styles, current-token API, Twitch lifecycle, retry/state hook, error boundary |
| shared/ | Recovered catalog, strict schemas, immutable authoritative gameplay rules |
| server/ | JWT verification, HTTP adapter, state service, DynamoDB transactions, memory/file stores, Lambda entry |
| tests/ | Domain/auth/client/service/DynamoDB/local integration tests and Chromium game-flow tests |
| scripts/, root configuration | Static multi-entry Vite build, separate bundled EBS, pinned lockfile, lint/typecheck/format/test setup, safe env example |
| .github/, amplify.yml | Read-only validation workflow and defensive deployment block |
| docs/, infra/ | Sanitized inventory, recovery references/provenance, legacy source archive, architecture, gameplay, testing, Twitch, staging, deployment and rollback |
| removed active starter files | Next runtime/layout/config/types, unused starter SVGs/HTML, duplicate prototype game rules, active Amplify starter definitions |

The exact changed paths are available through git diff --name-status (or git diff --cached --name-status after staging). Build outputs, downloaded packages, credentials and private data are excluded.
