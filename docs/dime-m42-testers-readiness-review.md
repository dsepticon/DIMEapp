# IAM-only TESTERS readiness correction — unexecuted review

## Scope and status

Source: `a51c774340a6d47cb148dfbaa838a905e876cc7f`, branch `codex/dime-m4-graphics-web`, after preflight report `c79e537` (original requested baseline `252eb71`).

The previous code allowed readiness only while sign-in was disabled, so TESTERS activation could not pass the mandatory post-activation check. This correction changes only the readiness dispatch guard in `server/webHandler.ts` and adds focused tests in `tests/webSecrets.test.ts`. Ordinary login, callback, session, linking, gameplay and deletion routing is unchanged.

No change set has been executed. Live sign-in and linking remain `DISABLED`; conversion remains `ENABLED`, with empty tester tags. No real invitation, OAuth exchange or player-record access occurred.

## Readiness security policy

Linking must remain `DISABLED` for all readiness invocations.

| Sign-in mode                | AWSCURRENT | AWSPENDING                            | AWSPREVIOUS / arbitrary / missing stage |
| --------------------------- | ---------- | ------------------------------------- | --------------------------------------- |
| DISABLED                    | Allow      | Allow (reviewed alternate stage only) | Deny                                    |
| TESTERS                     | Allow      | Deny                                  | Deny                                    |
| ENABLED                     | Deny       | Deny                                  | Deny                                    |
| Missing, malformed, unknown | Deny       | Deny                                  | Deny                                    |

Direct invocation requires the existing AWS Lambda IAM authorization before the handler runs. No event field substitutes for IAM authorization. The only accepted event has exactly two own properties: the fixed readiness operation marker and an allowed stage. Additional HTTP/API/CloudFront wrapper fields cause rejection before dependencies load. A body/query marker cannot turn a normal integration event into direct readiness. No public readiness route, Lambda URL, IAM grant or API mapping is added.

Successful readiness returns exactly the existing eleven Boolean fields. The unchanged readiness implementation reads only the two web keys, performs synthetic in-memory cryptographic self-tests, clears transient material and performs no storage/provider calls. It does not retrieve OAuth or Extension credentials. Rejections log only an allowlisted category and random correlation ID; no stage contents, ARN, secret value, identifier or derived material is logged. Synthetic cryptographic invitations exist only in memory during the existing self-test; no usable owner invitation or invitation ledger entry is produced.

Forty additional unit checks cover mode/stage allowlisting, exact-output and exact-secret-read scope, no storage/provider calls, HTTP/CloudFront rejection, linking restrictions and non-sensitive failures. The unsigned AWS invocation check confirms missing authentication is rejected by AWS before the handler, independently of application mode. A separate deployed-role policy simulation returns `implicitDeny` for direct invocation by the existing execution role, which has no InvokeFunction grant. No function was invoked by that simulation. Unit tests do not claim to emulate AWS IAM enforcement.

## Artifact

Local ZIP: `/tmp/dime-m42-readiness-testers/DIME-WebAuth-testers-readiness-20260918.zip`.

- Size: **564314 bytes**.
- ZIP SHA-256: `c80c8793428b49810d98a73476f270fc4eb14941269250e9e7534abd5afef9b5`.
- Expected Lambda CodeSha256: `yAyHk0KLSYENmKc0dvJw/E6xSUEmklDp51NKvVr++bU=`.
- Bundled index SHA-256: `91cbd512c3fe7dc6eb3e161637c7935363a67eb4fdc6146140dcde5c6061a9e3`.
- S3: `s3://dime-v2-staging-artifacts-861738068626-us-east-2/dime-v2/review/a51c774340a6d47cb148dfbaa838a905e876cc7f/web-auth-testers-readiness.zip`.
- S3 version: `QlkT8PKgd6eHt1Bmr6e_bQW0nohZfz4o`.

Upload was create-only with AES256 encryption and verified SHA-256. Archive contains only root `index.mjs`, byte-identical to the clean Linux-native SAM output. There are no source maps, frontend files, fixtures or provisioning tools. Dependencies and gameplay source are unchanged. Rebuilt gameplay index SHA-256 remains `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`; deployed gameplay CodeSha256 remains `4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=`.

## Exact CloudFormation comparison

Account `861738068626`, region `us-east-2`, stack `dime-v2-review-20260912`.

New review change set:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-readiness-a51c774-review-1/1d05d2ac-82ef-4e1c-b9e4-3255daca82b1`

`CREATE_COMPLETE / AVAILABLE`, unexecuted. Stack remains `UPDATE_COMPLETE`.

| Resource        | Reported operation     | Processed definition difference            |
| --------------- | ---------------------- | ------------------------------------------ |
| WebAuthFunction | Modify, no replacement | Code S3 bucket/key/version reference only  |
| StagingHttpApi  | Modify, no replacement | None; dynamic Lambda ARN/body reevaluation |

Two modifications; zero additions, removals or replacements. Restoring the prior WebAuthFunction Code property makes the entire proposed template structurally identical to the live template. Parameters, environment, secret references, secret stages, IAM, table configuration, permissions, routes, CORS, stage, throttling, logs, alarms and outputs are unchanged. Website, privacy, CloudFront and WAF are not modified. CloudFormation failed-event predeployment check returned zero events via `describe-events`.

The first preparation attempt stopped before upload because a masked CloudFormation tester-tag parameter cannot prove emptiness. A Boolean projection from the existing Lambda configuration confirmed empty tags; no value was displayed. Preparation then proceeded with all parameters using their previous values.

Source SAM, packaged template and processed template pass cfn-lint. Offline SAM translation equals the proposed processed template. Nine applicable Guard validations cover shared source/processed, runtime source/processed and unchanged staging/routing/guest/WAF baselines. Older standalone-web templates are not the deployed shared architecture and are not substituted for these checks.

## Validation evidence

All required validation completed successfully:

- Locked `npm ci`, lint, strict typecheck, formatting and `git diff --check` passed; dependency audit found zero vulnerabilities.
- Complete Vitest: **592 passed / 66 files**, including 40 new readiness checks.
- One clean complete Chromium release run: **170 passed** in 36.4 minutes, one worker, zero retries, no failed or isolated rerun substituted for the release gate.
- Local guest Chromium: **5 passed**. Public Guest Demo Chromium: **5 passed**.
- Default, Twitch, web, guest and both Lambda builds passed; gameplay bytes remain unchanged. No frontend build was published.
- Clean native SAM build and validation, source/packaged/processed cfn-lint and nine applicable Guard suites passed.
- Existing dormant HTTP/CORS boundaries: **20 passed**, including disabled login/callback, non-sensitive status, idempotent logout/cookie expiry, missing deletion proof and unauthenticated gameplay rejection.
- Production performance and the independent 30-cycle / 180-transition heap run passed their integrity checks; measurements and limits follow below.

Evidence is preserved in [validation summary](dime-m42-testers-readiness-review/validation-summary.json) and the adjacent review records. Complete raw test/build logs remain under `/tmp/dime-m42-readiness-testers`.

Prospective and deployed IAM each pass **36 cases / 72 decisions**, including explicit secret stages, unrelated-secret denial, no new gameplay secret reads and no secret administration. Deployed role policies still match the reviewed policies. No permissions changed.

Telemetry testing uses malformed synthetic markers against the current dormant deployment. WAF sampling remains disabled in all six settings, aggregate metrics stay enabled, CloudFront standard/realtime logs remain off and API logs retain the existing non-sensitive format. Count-only CloudWatch/WAF searches never return raw messages or sampled requests. Both initial and delayed searches completed 30 CloudWatch count queries and six WAF sampling queries with zero sensitive matches. Fourteen synthetic probes were sent once; the delayed search reused them. A transient read-only AWS error was retried after account verification, without resending probes. Candidate-specific output confidentiality is covered by local tests; these live telemetry checks do not imply the candidate has been deployed.

Prior completed gameplay results were not invalidated by a gameplay code change. The owner explicitly requested a complete new validation run for this readiness correction; gameplay test expectations were not changed.

### Production performance

Measured during the browser validation workload with synthetic in-memory state; real Twitch webview performance is not claimed.

| Layout  | Maximum measured p95 / worst frame (ms) | Transition mean / p95 / worst (ms) | Canvas / errors |
| ------- | --------------------------------------- | ---------------------------------- | --------------- |
| Panel   | 16.80 / 16.80                           | 79.02 / 87.22 / 88.07              | 1 / 0           |
| Mobile  | 16.80 / 16.80                           | 76.01 / 87.12 / 88.02              | 1 / 0           |
| Desktop | 33.30 / 33.40                           | 73.24 / 88.80 / 98.87              | 1 / 0           |

Coverage includes scanner, laser, vacuum, eight visible nodes/fragments, physical transitions and the busiest city zone. No per-frame walking or Ping writes, quantity loss, document scrolling or browser errors were observed.

The independent heap run completed 30 cycles / 180 transitions: one document, 141 DOM nodes and 185 listeners in every sample, with no errors. Retained heap rose from 4,911,136 to 5,018,900 bytes after the first six cycles (about 2.2%); the last twelve cycles added 14,032 bytes. Final heap is comparable to the preceding baseline (5,019,556 bytes). This finite warm-up observation does not prove absence of every long-session leak.

## Revised deployment and activation sequence

1. Owner reviews this code-only change set. Before any future execution, recheck current code/template, dormant parameters, exact operations and artifact hash. Execute only with approval; wait for `UPDATE_COMPLETE`.
2. Verify the corrected deployed hash. Invoke IAM-only AWSCURRENT readiness in DISABLED mode and require all eleven Booleans true. Verify alternate-stage policy with synthetic unit evidence; do not select real alternate versions unnecessarily. Verify dormant login, callback, logout, deletion continuation, routes and telemetry.
3. **Do not execute the older `m42-runtime-83bbdff-testers-review-1` activation change set after updating the code.** It was prepared against the old template. Leave it unexecuted until separately recorded cleanup/supersession.
4. Create a fresh parameter-only activation candidate from the corrected live template with `UsePreviousTemplate`. Its only parameter difference must be `WebSignInMode: DISABLED → TESTERS`; linking stays DISABLED and conversion ENABLED. Its code hash must remain the corrected artifact hash. Review it separately before execution.
5. After separately authorized activation, require direct AWSCURRENT readiness 11/11. Alternate-stage readiness must reject before retrieval. Check public uninvited/malformed/expired/replayed invitation behavior, disabled linking, Guest Demo, Extension boundaries and delayed telemetry.
6. Only then request the owner's verified numeric Twitch user ID if not securely provided. Generate one short-lived invitation using the reviewed secure utility; never infer an ID. Complete intended-user callback/session/refresh/logout/expiry/replay tests without gameplay access or linking. Keep invitation and identity material out of reports.
7. On failure, return sign-in to DISABLED using a reviewed parameter-only rollback that retains corrected code and disabled linking. Do not rotate secrets or change routing to mask a failure. No linking activation or public Extension release is authorized.

Rollback for the dormant code update is a separately reviewed Code-property-only update to the saved prior artifact, with both modes disabled. The old code cannot satisfy TESTERS readiness; therefore disable before any rollback to it. No secret-version rollback is needed for this correction.

No real secret values or player fields were retrieved. No real invitation, session, identity, manifest, gameplay save or receipt was created or modified. No player table scan/reset/wipe, OAuth activation, linking, website/privacy publication or Twitch release occurred.

Amplify exclusion was confirmed immediately before the report push: auto-branch patterns and connected branches contain only `main` and `codex/react-extension-rebuild`. The integration branch remains excluded. Only `codex/dime-m4-graphics-web` is pushed.
