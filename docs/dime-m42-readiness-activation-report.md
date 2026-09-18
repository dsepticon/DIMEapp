# Readiness deployment and TESTERS activation

Branch: `codex/dime-m4-graphics-web`, starting HEAD `b0d926768d4a9035c7a4726854bec6ae1b3d62e1`. Application source remains `a51c774340a6d47cb148dfbaa838a905e876cc7f`; no application change was made during deployment.

## Deployment

Account `861738068626`, region `us-east-2`, stack `dime-v2-review-20260912`.

Executed code correction exactly once:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-readiness-a51c774-review-1/1d05d2ac-82ef-4e1c-b9e4-3255daca82b1`

Final review matched the approved two non-replacing modifications: web-auth Code and structurally unchanged API reevaluation. Zero additions, removals, replacements, gameplay Lambda, IAM, table, route, environment or secret-version changes. Website, privacy, CloudFront and WAF were untouched. Local ZIP and uploaded version checksum were checked immediately before execution.

- ZIP SHA-256: `c80c8793428b49810d98a73476f270fc4eb14941269250e9e7534abd5afef9b5`.
- Deployed web-auth CodeSha256: `yAyHk0KLSYENmKc0dvJw/E6xSUEmklDp51NKvVr++bU=`.
- Gameplay CodeSha256 remained `4kbdkFYYfB2vTSanDcaKtcwObvYhNxqLqbbKD1OkKvY=`.
- Stack reached `UPDATE_COMPLETE`; no failed resource events; 23 routes unchanged.
- Dormant readiness passed all eleven Booleans. Both modes stayed DISABLED, conversion ENABLED, tester tags empty.
- Twenty live disabled-mode HTTP/CORS checks and public guest walking at 318×500, 360×640 and 1280×900 passed.
- Fourteen malformed synthetic telemetry probes produced no sensitive echo. Thirty CloudWatch count queries and six WAF sampling checks found zero sentinel matches.

The complete unit suite passed **592 tests / 66 files**. Its first sandboxed attempt had two process-spawning failures (`EPERM` / local server startup); the complete unrestricted rerun passed without changing application code or assertions. The prior clean 170-test Chromium release gate remains applicable to this unchanged source; it is not represented as a newly rerun full suite here.

## First activation and automatic rollback

The older activation prepared against the previous bundle was not used. A new candidate used the corrected live template with only `WebSignInMode: DISABLED → TESTERS`. Linking remained DISABLED and conversion ENABLED. Template, code, IAM, routes and secret versions were unchanged.

First activation, executed once and completed:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-readiness-a51c774-activation-1/004aa872-ec8b-4c86-9ece-6d4a95a8a12b`

TESTERS AWSCURRENT readiness passed 11/11. AWSPENDING, AWSPREVIOUS, arbitrary stages and both HTTP/CloudFront-shaped direct events were rejected. Uninvited, malformed, expired and wrong-signature login probes returned 401 before the verifier reached the public readiness-query check.

That verifier incorrectly expected `/auth/status` with unapproved readiness query names to return the normal 200 capability response. The deployed edge correctly returned **400**, as required by the reviewed exact query-name allowlist. The verifier assertion failed and immediately initiated the approved parameter-only rollback:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-readiness-a51c774-rollback-1/5db0178a-5eed-492b-9fcc-327e3da67aa9`

Rollback completed with sign-in and linking DISABLED, conversion ENABLED, corrected code retained, unchanged routes/versions and 11/11 readiness. No owner invitation or live OAuth flow had started.

Diagnosis while disabled confirmed the reviewed `AuthMethodGuard` accepts no query names for `/auth/status` and returns 400 for unknown names. A fresh public probe returned the expected generic body and `FunctionGeneratedResponse` CloudFront evidence. This was a verifier expectation error, not an application or deployment defect. Only the temporary verification assertion was corrected; no Lambda, edge, website or application code changed.

## Second activation and verifier-command rollback

After the completed rollback and proof of intended edge behavior, a fresh candidate was reviewed and executed once:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-readiness-a51c774-activation-2/0c243b47-2cc1-457b-b646-5f80b302c3b6`

The processed template was identical to the corrected live template. The only parameter change was DISABLED → TESTERS; linking stayed DISABLED, conversion ENABLED. Two non-replacing Lambda-environment/API reevaluations; zero code, IAM, route, stateful or secret changes. It reached `UPDATE_COMPLETE`.

Current-mode readiness passed all eleven Booleans. Five negative readiness checks passed. Twenty-five live HTTP/CORS checks passed, including the intended edge-generated 400, uninvited/invalid/expired login 401s, disabled linking, non-sensitive capabilities, idempotent logout/cookie expiry, missing deletion proof and rejection of unauthenticated Extension gameplay requests. Three public guest smoke layouts passed with movement and empty browser storage.

The five full public guest Chromium tests also passed (7.6 minutes), including mining, vacuum, refresh, keyboard and touch targeting. The next synthetic compatibility command failed before starting any tests because its positional filenames followed Playwright’s variadic `--project` argument. The verifier immediately initiated rollback; an AWS credential-refresh error interrupted preparation, then a successful metadata authentication check and retry completed it:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-readiness-a51c774-rollback-2/6dc177ab-de62-41d3-b1d6-e097253a3a94`

Rollback reached UPDATE_COMPLETE with both authentication modes DISABLED, conversion ENABLED, unchanged hashes/routes/secret stages and readiness 11/11. The corrected compatibility command was then proven while disabled: all five tests passed (Panel/Mobile synthetic Extension world-state regressions plus three tester session/logout layouts; 1.5 minutes). The delayed telemetry search returned zero matches. This second failure was also in the temporary verification harness; no application correction was needed.

## Final parameter-only activation

After proving the corrected compatibility command, a fresh candidate was reviewed against the current deployed template and executed once:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-readiness-a51c774-activation-3/df54c922-46ba-4cc0-ad35-b244c02a3a43`

The only parameter difference was `WebSignInMode: DISABLED → TESTERS`. The processed template remained identical. CloudFormation reported two non-replacing environment/API reevaluations and no additions/removals/replacements. Linking remained DISABLED and conversion ENABLED. Both Lambda artifacts, all secret versions, IAM, DynamoDB and routes were unchanged. UPDATE_COMPLETE was confirmed before verification.

The completed five-test public guest run and five-test compatibility run were preserved because application code, guest files and Extension routes were unchanged. Fresh live readiness, HTTP/CORS, three-layout guest smoke and telemetry checks were run after this final activation.

Final checks passed: AWSCURRENT readiness **11/11**, five negative readiness cases, **25 live HTTP/CORS checks**, and three guest smoke layouts. Fourteen new malformed synthetic telemetry probes had zero sensitive response echoes. Initial and delayed searches each completed **30 CloudWatch count queries and six WAF sampling checks with zero sentinel matches**. WAF sampling remained disabled, aggregate metrics enabled, and CloudFront standard/realtime logging disabled. No telemetry configuration was changed.

Final configuration: **WebSignInMode=TESTERS; AccountLinkingMode=DISABLED; ContentConversionMode=ENABLED; tester tags empty**. Stack UPDATE_COMPLETE; no failed deployment events. The approved corrected web-auth hash is deployed; gameplay hash, 23 routes and all secret-version stages remain unchanged.

## Evidence limits and owner stop point

No valid owner invitation has been generated. The owner's verified numeric Twitch user ID has not been provided in this conversation and must not be inferred from a username or taken from synthetic fixtures.

The repeated invalid-signature probes prove repeated invalid requests are rejected without mutation. They do **not** prove a consumed valid invitation's live replay behavior. Valid one-use replay, intended-user matching and isolated session semantics have synthetic unit/browser coverage; the real owner callback, session rotation/refresh/logout/expiry and valid invitation replay remain pending the owner invitation.

No real account/session/gameplay credentials were used in probes. No player record was inspected to establish record counts. Non-creation is supported by the rejected pre-authentication paths, reviewed control flow, synthetic write-isolation tests and the absence of any valid invitation/authenticated mutation in this run. No gameplay inspection, reset, merge, conversion test, table scan or wipe occurred.

The owner stop point requires only the verified numeric Twitch user ID. The reviewed callback remains `https://destroyaindustriesminingextension.com/auth/callback`. Generate a single short-lived invitation using the reviewed secure utility only after receiving that verified identifier. Do not put the identifier, invitation, cookies, codes, tokens or derived material in this report.

For any subsequent live OAuth failure, immediately prepare/review/execute the same parameter-only return to DISABLED, retaining corrected code, disabled linking and enabled conversion. Wait for UPDATE_COMPLETE and verify readiness and public boundaries. Both completed rollbacks above supply actual tested rollback evidence. Do not use the old pre-correction activation template or change secret versions.

The final pre-invitation summary and non-sensitive operation events are retained alongside this report. No public Extension release, shared-save linking, website/privacy publication or telemetry-configuration change occurred.

## Evidence index

- [Final stack/hash/mode verification](dime-m42-readiness-activation/final-activation-verification.json)
- [Exact final parameter-only comparison](dime-m42-readiness-activation/final-activation-review.json)
- [Readiness Booleans](dime-m42-readiness-activation/final-activation-readiness.json) and [negative cases](dime-m42-readiness-activation/final-activation-readiness-rejections.json)
- [HTTP/CORS results](dime-m42-readiness-activation/final-testers-http-results.json)
- [Guest layout/movement/storage smoke](dime-m42-readiness-activation/final-activation-guest-smoke.json)
- [Completed pre-invitation summary](dime-m42-readiness-activation/pre-invitation-pass.json)
- [Initial telemetry search](dime-m42-readiness-activation/final-telemetry-initial-search.json) and [delayed search](dime-m42-readiness-activation/final-telemetry-delayed-search.json)
- [Test totals and provenance](dime-m42-readiness-activation/test-summary.json)
- [Resource operation events](dime-m42-readiness-activation/resource-events.json)
- [Amplify branch exclusion](dime-m42-readiness-activation/amplify-exclusion.json)

Application source, gameplay resources, website, privacy, WAF and CloudFront remain unchanged by this deployment. The report and projected evidence are the only repository changes. No secret values were retrieved by the operator, displayed or written to reports. Runtime readiness resolved only its reviewed web-key dependencies and returned Booleans. No real identity, invitation, cookie, code, token or player field appears in this report.
