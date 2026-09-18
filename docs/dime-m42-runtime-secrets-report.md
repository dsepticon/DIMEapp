# Web runtime secrets: dormant deployment and readiness

Date: 2026-09-18. Branch: `codex/dime-m4-graphics-web`.

## Result

The dormant web-auth update and web-only configuration refresh reached `UPDATE_COMPLETE`. Both replacement web keys passed all eleven readiness checks through the deployed production parser before promotion, and again as `AWSCURRENT` afterward. Sign-in and linking remain `DISABLED`; conversion remains `ENABLED`, with empty tester tags. The TESTERS activation change set is available but **unexecuted**. No invitation was generated.

Source commit: `83bbdfff375b982c8717576c6f5ae183aff390f3`. Test-only correction: `c78b09c` (durable refining recovery assertions instead of a transient toast). Baseline: `0e6c84f36b0637b9a9ecff30038372e5fc6e15cd`.

The owner's final six travel/world-state checks completed within the existing Chromium run. Completed Panel/Mobile vehicle-retrieval and surface-mining checks were preserved. No access-program override was used, and no application code was changed to work around a tool/API configuration error.

## Proven discrepancy and contract

The original current identity/encryption versions were successfully retrieved as strings but failed the strict plaintext-envelope contract. Source checks passed; envelope checks failed. Downstream encoding, length and cryptographic results therefore remained false; these are not separate diagnoses.

The earlier utility read replacement `AWSPENDING` keys directly. The previous broad deployed readiness path also initialized OAuth and Extension dependencies, so its generic `SECRET_FORMAT` result did not isolate a web key. This work does not attribute that historical error to uninspected OAuth or Extension values. The new IAM-only readiness isolates the two web keys and uses exactly the production parser.

| Boundary            | Previous path                      | Deployed path                                    |
| ------------------- | ---------------------------------- | ------------------------------------------------ |
| Configuration       | CloudFormation-resolved web values | Three complete ARN references only               |
| Retrieval           | Deployment-time dynamic references | Exact-ARN Secrets Manager retrieval              |
| Normal stage        | Resolved current version           | Explicit `AWSCURRENT`                            |
| Readiness stage     | Broad initialization               | Explicit current/pending, two web keys only      |
| Envelope            | Strict plaintext                   | Same strict plaintext; no JSON field selection   |
| Whitespace/encoding | No permissive conversion           | No trimming or guessing; canonical padded Base64 |
| Cache               | Lambda configuration lifetime      | 30-second memory cache; revision invalidation    |

Identity root and authentication-encryption keys each require independently generated **32 decoded bytes**, encoded as canonical padded Base64 in a plaintext `SecretString`. JSON envelopes, hexadecimal, whitespace and alternate encodings are rejected. No JSON property is supported. The OAuth secret remains the independent Twitch-issued plaintext value and was not rotated or retrieved for this readiness test.

Identity derivation uses `dime:oauth-subject:v1` with its NUL separator. Invitation subkeys are cryptographically derived using distinct versioned contexts `dime:web-tester:key:subject:v1` and `dime:web-tester:key:signature:v1`, followed by separate operation contexts. Derived keys remain in memory. Encryption is independent. The equality-only guard compares normalized decoded bytes in constant time and returns only a non-sensitive failure. Root rotation invalidates outstanding invitations; none were generated here.

The two existing Extension credential environment references, IAM permissions and loading interface remain unchanged. Their values were not retrieved, validated, rotated or compared.

## Changes and artifact

Changed source files: `package.json`, `package-lock.json`, `server/webAuth.ts`, `server/webEmergency.ts`, `server/webHandler.ts`, `server/webInitialization.ts`, new `server/webReadiness.ts`, new `server/webSecrets.ts`; tests `webEmergency`, `webInitialization`, `webSignIn`, new `webSecrets` and `webSecretsFixture`; new `infra/web/prepare_runtime_review.py`, `infra/web/runtime-secrets.guard`, and the runtime review document. The later test-only commit changes `tests/e2e/game.spec.ts`.

Artifact: `/tmp/dime-m42-runtime-secrets/DIME-WebAuth-runtime-secrets-20260918.zip`, **564282 bytes**.

- ZIP SHA-256: `2563c5635239d69dbe290f145d8370fd029f7b9e5545988b33c02d0d39e67e92`
- Deployed CodeSha256: `JWPFY1I51p2+KQ8UXYNw/QKfe55VRZiLM8AtDTnmfpI=`
- Bundled index SHA-256: `f39d80895841820bd07340d04c9b2dd122e4538fa760b06bb8ed6bb9d7362862`
- S3: `s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/83bbdfff375b982c8717576c6f5ae183aff390f3/web-auth-runtime-secrets.zip`
- S3 version: `NGDQrXrOXMSQ32XZec5QMd4hXzRVTkXa`

Upload was create-only, encrypted and checksum-verified. Archive contains only root `index.mjs`, byte-identical to the clean native SAM build. No frontend, maps, fixtures or provisioning utility is included. Gameplay Lambda remains byte-identical: `4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=`.

## Exact infrastructure operations

Account `861738068626`, region `us-east-2`, stack `dime-v2-review-20260912`.

Executed once:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-runtime-83bbdff-review-1/3c2773b3-965f-46f9-8567-dc70d05d2ae9`

Three non-replacing modifications: `WebAuthFunction` code/configuration; `WebAuthExecutionRole` two scoped statements; `StagingHttpApi` dynamic reevaluation with structurally unchanged processed definition. Zero additions, removals or replacements.

New permissions are only `secretsmanager:GetSecretValue`: identity/encryption exact ARNs with `VersionStage` current or pending, and OAuth exact ARN with current only. No ListSecrets, wildcard secret, Extension credential or KMS grant was added. Existing role statements remain unchanged. Metadata identified AWS-managed encryption keys. No table, index, TTL, PITR, encryption, billing, gameplay route, permission, log, alarm or output change.

Executed web-only cache refresh:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-runtime-83bbdff-refresh-1/04a87ec4-0e61-4c59-b89e-b9003d42b5e3`

Only structural difference: `DIME_AUTH_KEY_REVISION=web-runtime-current-20260918-1`; unchanged API reevaluation. No artifact/reference/parameter changes. Refresh operation `7bb7f0b8-1dbd-4214-8f26-08bf51bcb36f` succeeded between 19:14:04.093 and 19:14:19.134 UTC. Deployment failed-event checks returned zero; projected events are included in evidence. No `describe-stack-events` was used.

Prepared after current readiness passed, not executed:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-runtime-83bbdff-testers-review-1/88d00bb7-aa8c-40e3-9b5b-9859d72996b8`

`CREATE_COMPLETE / AVAILABLE`. Only parameter difference is sign-in `DISABLED` to `TESTERS`; linking stays disabled. Two non-replacing Lambda/API reevaluations, identical template/artifacts/IAM. Activation needs its separate review and live OAuth procedure.

## Readiness and version stages

Readiness is direct-IAM-invocation only, with an exact two-field event and both modes disabled. API Gateway event shapes cannot invoke it. Response body contains only the eleven Booleans. It neither reads OAuth/Extension credentials nor touches storage.

| Check                       | Original current | Replacement pending | Promoted current |
| --------------------------- | ---------------- | ------------------- | ---------------- |
| identity_source_valid       | true             | true                | true             |
| identity_envelope_valid     | false            | true                | true             |
| identity_encoding_valid     | false            | true                | true             |
| identity_length_valid       | false            | true                | true             |
| encryption_source_valid     | true             | true                | true             |
| encryption_envelope_valid   | false            | true                | true             |
| encryption_encoding_valid   | false            | true                | true             |
| encryption_length_valid     | false            | true                | true             |
| keys_distinct               | false            | true                | true             |
| derived_invitation_ready    | false            | true                | true             |
| encryption_round_trip_ready | false            | true                | true             |

| Secret     | Current (also retains pending label)   | Previous                               |
| ---------- | -------------------------------------- | -------------------------------------- |
| Identity   | `2b3b0bb7-b7f7-4f48-a0b2-4247d92743ad` | `9e4c517d-5c1e-4c58-ba0d-5241ac4bc00a` |
| Encryption | `dba8575c-3218-4fd3-ba3b-704957e0d104` | `2f0a0d10-46df-4286-aadf-23c3e923eb9a` |

OAuth current remains `861c81fb-3a3e-4826-aea0-369e55bd7683`. Previous versions retain `AWSPREVIOUS`; none were deleted. Promotion followed fresh all-true pending readiness and metadata-race checks. No plaintext, fingerprints or derived material appears in evidence.

## Validation and limitations

- Locked install, lint, strict typecheck, formatting and diff checks passed; dependency audit zero vulnerabilities.
- Vitest: **552 passed, 66 files**.
- Clean complete Chromium: **170 passed, zero retries**, 36.2 minutes. Earlier run had one transient-toast assertion failure; the test-only correction retained durable state/recovery checks, followed by the complete clean run. No application change was needed.
- Public guest browser: **5 passed**. Restricted secure-wrapper synthetic tests: **6 passed**. Promotion safety tests: **5 passed**, including partial-failure rollback and metadata races.
- Default, Twitch, web, Lambda builds; clean SAM build/validation; source, packaged and processed cfn-lint; applicable source/processed/runtime/staging/routing/guest/WAF Guard checks passed. Offline SAM translation matches the reviewed processed template.
- Prospective and deployed IAM: **36 cases / 72 decisions each**. Exact deployed policies match review.
- Live HTTP boundaries: **20 passed**. Disabled login/callback/linking do not redirect. Status is non-sensitive. Repeated logout returns 200 and expires three Secure HttpOnly cookies. Missing deletion proof returns 401, wrong origin 403. Eight gameplay routes reject unauthenticated requests with 401. Exact-origin CORS passes; untrusted origin is excluded.
- All 23 routes and 15 web/eight gameplay route-scoped invocation permissions remain unchanged.

Compatibility is supported by synthetic gameplay journeys, identical deployed gameplay code and public authentication-boundary checks. No real player's authenticated save was inspected or mutated. Live OAuth and future Extension linking credentials remain outside this readiness test.

| Viewport | Frame p95 / worst (ms) | Transition average / p95 / worst (ms) |
| -------- | ---------------------- | ------------------------------------- |
| Panel    | 16.7 / 16.8            | 78.57 / 86.77 / 87.11                 |
| Mobile   | 16.8 / 16.8            | 75.37 / 76.97 / 86.85                 |
| Desktop  | 16.8 / 16.8            | 77.71 / 87.74 / 87.78                 |

Effects coverage includes eight nodes/fragments, scanner, laser, vacuum and city. One canvas, no scroll/errors. Heap observation: 30 cycles/180 transitions, one document, 141 DOM nodes, 185 listeners; 4,909,408 to 5,019,556 bytes after warmup. This is bounded measured evidence, not an unlimited-duration guarantee.

Telemetry retains six sampling-disabled WAF settings and aggregate metrics. CloudFront standard/realtime logging is off, WAF full logging is absent, and API logs allowlist non-sensitive metadata. Fourteen malformed synthetic probes produced expected status categories without redirect or echo. The delayed search completed 30 CloudWatch count queries with zero matches and six WAF sampling queries with zero sensitive matches. Count-only results are preserved with their final timestamps; no raw messages/samples or sentinel values are committed.

## Rollback and scope

The complete before/after processed templates and version metadata are retained in the adjacent evidence directory. Local operational scripts remain under `/tmp/dime-m42-runtime-secrets`; copies document the exact procedure and require that directory's evidence files. Keep both modes disabled. The reviewed `promote.py rollback` restores prior current labels without deleting versions; review and execute a web-only revision refresh using `refresh-review.py rollback-create`, `rollback-review`, then `rollback-execute`. Re-run Boolean readiness and boundary checks. Prior keys failed the contract, so rollback restores the previous dormant state, not functioning sign-in.

A code rollback must pair its code with its matching environment contract; never restore the old bundle while retaining ARN-only environment entries. After future account creation, root/encryption rollback requires a separate compatibility review. No rollback was required here; synthetic partial-failure handling passed. S3 lifecycle retention is finite; retain the local artifact and templates for the required rollback period.

No website, privacy, CloudFront, WAF or Twitch publication change occurred. No player records, item keys, real identities or Extension secret values were read. No table scan/wipe/reset, save conversion, linking, account deletion, real invitation or OAuth exchange occurred. No secret values or secret-derived fingerprints were exposed.

Amplify auto-branch patterns and connected branches contain only `main` and `codex/react-extension-rebuild`; the integration branch remains excluded. Push is limited to `codex/dime-m4-graphics-web` without force or history rewriting.

Evidence: [runtime deployment evidence](dime-m42-runtime-secrets/).
