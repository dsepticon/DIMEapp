# Staging, deployment and rollback

No resource changes or deployment are authorized by the source rebuild. This document is the proposed sequence for explicit review.

## Review-branch publication safety

Amplify app d90ik3712sg8e has automatic creation patterns limited to literal `main` and `codex/react-extension-rebuild`; `codex/react-extension-rebuild-review` is not connected. Recheck live settings immediately before any review-branch push. The build workflow on the review branch is read-only. Do not push to the existing Amplify-connected branches or merge.

## Staging proposal

1. Review the inventory, compatibility differences, selected Twitch identity scope, and any legacy-save migration policy.
2. Review the authored [isolated staging SAM template](../infra/staging/template.yaml) and [operator guide](../infra/staging/README.md), then separately approve any staging stack creation. Do not import legacy resources or reuse DIMEtable/TwitchUsers.
3. Supply existing approved secret ARNs and exact Twitch origins through a secure operator workflow. The template creates a new dedicated Lambda role; do not use missing legacy roles.
4. Build from a clean lockfile install at a reviewed commit. Set VITE_DIME_MODE=twitch and the approved staging URL. Record SHA-256 hashes of frontend/server artifacts and source commit.
5. Deploy the EBS package with handler index.handler, Node 22 runtime, its own execution role and the approved new table. Package the contents of dist/server, not production-recovered ZIPs.
6. Upload only to a newly approved staging destination or Twitch hosted-test version, never the live website bucket.
7. Test a real Twitch session, refresh/expiry, persistent identity, cross-tab races, connectivity loss, full game flow, quotas, mobile/panel sizing, CORS and CSP. Use synthetic staging users.
8. Review metrics and sanitized errors. Decide production cutover and migration explicitly; provide a fresh deployment diff and rollback checkpoint before requesting approval.

## Reproducible build

Node 22, npm ci, npm run check and npm run test:e2e. Production-mode assets must never contain local authorization or backend secrets. CI checks are read-only and have no AWS credentials/deploy jobs. Build outputs are ignored, hashed and associated with their commit.

The proposed protected production workflow uses reviewed pull requests, required checks, protected main/tags, immutable artifacts and a manually approved deployment environment using scoped short-lived credentials. Branch pushes must not directly deploy production.

## Production verification (after separate approval)

Verify exact frontend asset hashes, HTTPS/CSP/allowed origins, API release version, Lambda configuration, table binding, PITR/deletion protection, and role scope. Exercise the game loop with a dedicated synthetic account only. Check duplicate request IDs, refresh persistence and two-tab conflicts. Inspect sanitized telemetry; never export whole requests or player tables for debugging.

## Rollback plan

Before any cutover, preserve the live index/manifest and every referenced asset, exact Lambda packages/configuration, API stage deployment IDs, CloudFront configuration, DNS and table recovery settings. The production website bucket currently lacks versioning, so this snapshot must be explicitly created and verified before upload.

For a frontend/EBS regression, return to the last approved artifact set and previous API/Lambda version/alias configuration. Prefer atomic asset-prefix/manifest or version-pointer cutover; keep old assets until the rollback window closes. Cache invalidation, DNS changes and rollback writes still require approval.

Keep legacy and v2 data separate during staging. Never roll back by overwriting balances or restoring an old full player-state dump over newer transactions. Retain v2 records and reconcile completed operations under an approved recovery plan. PITR restoration should create a separate recovery table for review. No destructive reverse migration is included.

Current rollback for this task: none is needed in AWS, because nothing was deployed. Source commits can be reviewed/reverted normally without rewriting history.
