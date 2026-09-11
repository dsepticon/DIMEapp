# DIME React/Twitch rebuild handoff

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

Before release, approve isolated staging, exact Twitch origins/secret references, channel-scoped identity semantics, and any legacy-save migration policy. Existing tables/APIs are incompatible with v2; never deploy the new frontend against them. Untrusted browser saves must not become authoritative balances through an automatic importer. Real Twitch hosted testing and actual AWS integration tests remain release gates.

## Git status and publication blockers

Local commits were created using the author identity supplied by the owner:

- 9ff5cb2 — inventory AWS and preserve recovered DIME source.
- d8f7a62 — rebuild authoritative Twitch mining loop with isolated tests.
- This handoff is recorded in the following documentation commit.

The working branch is codex/react-extension-rebuild; main and the original dirty worktree were not changed. [changed-files.md](changed-files.md) lists exact paths.

No push occurred. Amplify app d90ik3712sg8e has automatic builds enabled for this branch, automatic branch creation and an inline build specification. Publishing the branch could trigger AWS changes despite the repository's defensive failing amplify.yml. Obtain explicit approval to disable automatic builds for this branch, verify that setting, then check GitHub write authentication and push only this branch. Do not merge main. The gh CLI is unavailable. GIT_TERMINAL_PROMPT=0 git push --dry-run origin codex/react-extension-rebuild returned exit 128: no GitHub username/credential was available. The dry run changed no remote refs. Configure GitHub authentication outside this conversation without sharing tokens, then recheck access before any approved push.

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
