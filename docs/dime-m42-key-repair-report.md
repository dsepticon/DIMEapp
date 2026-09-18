# Dormant initialization deployment and web-key repair rollback

September 18, 2026. Branch `codex/dime-m4-graphics-web`, starting report `619f8c5`; source checkpoint `5d892c07e42fa581e1181d2b862652112c7f4b46`.

## Outcome

The approved initialization correction deployed successfully. The owner-approved key replacements passed isolated cryptographic validation, but the deployed readiness check failed with **SECRET_FORMAT**. Per the owner's failure instructions, prior secret-current labels were restored and a web-auth-only configuration rollback completed. No conclusion about the particular remaining credential is inferred from this category. No OAuth secret rotation was performed.

Final stack: **UPDATE_COMPLETE**. WebSignInMode **DISABLED**, AccountLinkingMode **DISABLED**, conversion **ENABLED**, tester tags empty. The constant-time guard and owner-readiness code remain deployed. Replacement key versions are retained as AWSPENDING; original versions are AWSCURRENT. No version was deleted. No TESTERS activation change set was created or executed because readiness did not pass. Existing older activation candidates must not be used as approval for this failed readiness state.

## Executed changes

| Step                                             | Change set                                                                                                                 | Exact operations                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Approved dormant initialization                  | `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-init-e67b774-review-1/d71cc9c0-a8cc-4830-b825-317333d85805`   | WebAuthFunction code; StagingHttpApi dynamic reevaluation with unchanged body           |
| Key refresh and requested guard/readiness update | `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-keys-5d892c0-review-1/7cf55fa8-02ba-43aa-91a8-49344deb6eb3`   | WebAuthFunction code plus non-secret DIME_AUTH_KEY_REVISION; unchanged API reevaluation |
| Required failed-readiness rollback               | `arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-keys-5d892c0-rollback-1/df676888-b248-47d4-a540-108a0749a0af` | WebAuthFunction DIME_AUTH_KEY_REVISION only; unchanged API reevaluation; code unchanged |

Each comparison had two non-replacing modifications, zero additions/removals/replacements. No gameplay Lambda, DynamoDB schema/index/TTL/PITR/encryption/billing/policy, IAM, route, invoke permission, CORS, log/alarm, secret reference, CloudFront, WAF, privacy or website definition changed. The shared ConfigurationRevision parameter stayed unchanged. Final web-auth-only revision is `web-key-rollback-20260918-1`. Predeployment validation and postdeployment checks found no failed CloudFormation events. Exact comparisons and operation evidence are retained with this report.

## Artifacts

Initial approved ZIP SHA-256: `2f3ef9e70dfc96c6a30d48e52d09a04fd713f6903772b1cc84dfff94f9a931e9`.

Final deployed web-auth ZIP: `/tmp/dime-m42-key-repair/DIME-WebAuth-key-repair-20260918.zip` — 494373 bytes. SHA-256: `bc02cf34389925b46e8ab580584fc43e5acef7f6ccb001224033374f28a50d0e`. Root index.mjs SHA-256: `5a7696bb4f309296d74e1f07cc38511bdd8d932e3260a8214aa1cf0fac9206da`. Archive contains only index.mjs and is byte-identical to the native SAM output. It contains no key values, resolver/provisioner tooling, frontend files, fixtures or source maps.

S3: `s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/5d892c07e42fa581e1181d2b862652112c7f4b46/web-auth-key-repair.zip`. Version `2UV2qMTsZsIRQx9X09TTKMuaNVDTEaJs`. Create-only upload, SHA-256 checksum verified, AES256 encryption.

Gameplay remained byte-identical: deployed ZIP CodeSha256 `4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=`, index.mjs SHA-256 `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`.

## Secret contract and staged versions

[Exact key-purpose, encoding and rollback contract](dime-m42-key-repair-contract.md).

Both web keys require full plaintext SecretString containing canonical padded Base64 for exactly 32 random bytes. No whitespace, JSON field, wrapper, guessing or fallback is permitted. Each root is generated independently. Identity and invitation operations use distinct versioned HMAC domains; invitation subkeys are cryptographically derived and held only in memory. Encryption is independent and used only for encryption. Equality-only reuse detection compares normalized decoded bytes with timingSafeEqual and returns KEY_REUSE; format and KEY_LENGTH remain separate. The OAuth client secret is independent, Twitch-issued and unchanged. No additional invitation secret, IAM permission or parameter was added.

| Purpose                   | Original/final AWSCURRENT              | Validated replacement/final AWSPENDING |
| ------------------------- | -------------------------------------- | -------------------------------------- |
| Identity root             | `9e4c517d-5c1e-4c58-ba0d-5241ac4bc00a` | `2b3b0bb7-b7f7-4f48-a0b2-4247d92743ad` |
| Authentication encryption | `2f0a0d10-46df-4286-aadf-23c3e923eb9a` | `dba8575c-3218-4fd3-ba3b-704957e0d104` |

During promotion, original versions were retained as AWSPREVIOUS. Rollback restored their AWSCURRENT labels; candidate versions now remain AWSPENDING, with no version deletion. Metadata evidence includes the exact unchanged ARNs. The failed initial CLI stdin transport created no version; the successful upload used an anonymous RAM-backed descriptor, truncated and closed after use. The pinned asm-exec resolver was unavailable; the explicitly authorized isolated SDK canary read only the exact staged version IDs, returned an exact Boolean allowlist, and suppressed SDK/exception output. Secret material did not enter command arguments, shell history, source files, reports or Codex output.

AWSPENDING and temporarily promoted AWSCURRENT candidate validation returned true for contractValid, keysDistinct, identityReady, invitationVerifierReady, encryptionReady and crossDomainRejected. Synthetic ciphertext and invitation output were not retained. These successful candidate checks do **not** mean the final restored original keys are valid or that deployed readiness passed.

CloudFormation injects resolved SecretString values. Restoring labels alone was insufficient, so the exact rollback refreshed only web-auth environment configuration. No runtime secret-read permission was added to Lambda.

## Readiness, regression and confidentiality evidence

The owner-only direct Lambda Invoke returned a generic failure and correlation ID. The only retrieved diagnostic was aggregate category SECRET_FORMAT; no log message or configuration value was exported. This check initializes dependencies without contacting DynamoDB or provider APIs. Storage readiness is construction/configuration plus IAM verification, not a database mutation probe. The rollback was verified before proceeding with final disabled-route checks.

- Unit: **533 passed / 65 files**.
- Complete Chromium: **170 passed**, zero failures, retries disabled, 36.3 minutes.
- Public Guest Demo: **5 passed**, keyboard/touch target cycling and three viewport journeys, 7.7 minutes. Movement, physical travel, scanning, mining, fracture, vacuum, memory-only progress, reload/tab independence and storage/network safeguards passed.
- Restricted utility tests: **6 passed**, including in-memory transport, no diagnostic propagation, pending-version collision, synthetic cryptographic domains/reuse, and idempotent rollback label retention.
- Live disabled HTTP/CORS checks: **20 passed** after rollback. Login/callback/link creation stay unavailable; status non-sensitive; logout succeeds and expires cookies; missing deletion proof rejects; unauthenticated persistent APIs reject.
- IAM: **17 synthetic cases / 49 decisions passed**; no real DynamoDB reads/writes. No permissions changed.
- npm ci, lint, strict typecheck, formatting, diff check, clean native SAM, SAM validation, source/packaged/processed cfn-lint and applicable staging/shared/routing/guest/sampling Guard rules passed. Offline source translation matches the reviewed processed refresh template. Early sandbox-only process failures were resolved with an unrestricted full unit run; they are not counted as release passes.
- Twitch compatibility is evidenced by unchanged deployed gameplay hash/routes, live unauthenticated boundary checks and complete synthetic client journeys. No real authenticated Extension save was accessed or mutated.
- Telemetry: 14 malformed synthetic probes, 30 count-only CloudWatch searches, zero sentinel matches, zero WAF sample matches, no raw messages/samples retained. Delayed search repeated after rollback. Six sampling settings remain disabled; aggregate metrics remain enabled; CloudFront standard/realtime logs and WAF full logging remain absent. No telemetry configuration changed.

## Performance

Panel/Mobile/desktop final frame p95 16.7 ms, worst 16.8 ms. Transition average/p95/worst (ms): Panel 78.78/87.60/89.13; Mobile 75.68/77.73/88.90; desktop 76.36/87.39/87.46. Eight nodes/eight fragments and active scanner/laser/vacuum effects tested; one canvas, no document scrolling or browser errors. Thirty heap cycles / 180 physical transitions held one document, 141 nodes and 185 listeners; retained heap moved from 4,915,976 to 5,022,640 bytes after warmup. This bounded run showed no unbounded growth, not a guarantee about infinite sessions.

## Remaining gate and rollback readiness

Remaining failure category: **SECRET_FORMAT**. Keep both authentication modes disabled. A separate non-disclosing review must resolve that category before promotion is retried or an activation candidate is prepared. Do not assume the OAuth secret is invalid, rotate it, or regenerate a real invitation from this result. No login or live OAuth is authorized by this report.

The original current versions and candidate pending versions remain available. `scripts/repair-web-keys.py rollback` verifies exact account, stack/modes and version metadata; it restores current labels and retains pending candidates. Any future rotation rollback must also refresh the web-auth-only revision because values are deployment-resolved. The older key versions are retained for compatibility; no real-account inventory, migration, merge, deletion or assumption of empty storage was performed.

Amplify was rechecked: only main and codex/react-extension-rebuild are automatically connected; this branch is excluded. Only codex/dime-m4-graphics-web is pushed. No website, privacy, CloudFront, WAF, OAuth/linking activation, public Twitch release, player-data access/reset/wipe, or real invitation occurred. No secret value or secret-derived fingerprint was exposed or committed.
