# Local tester invitation provisioning review

Branch: `codex/dime-m4-graphics-web`  
Base report: `e6e96be6ebceb5119c8672545d7ae58b58bbcad1`  
Correction commit: `df936e533f4e38a9dd0e8fd99eda02aa68ec2f7d`

## Decision

Review only. Sign-in and linking remain **DISABLED**; conversion remains **ENABLED**. No invitation for a real account was generated or delivered. No secret value was retrieved, no version label was changed, and no player record was accessed.

The historical provisioning failure is **not yet attributable to a particular runtime boundary**. The original operational helper discarded its child failure category. The exact original signer and two-tester orchestration succeed offline with synthetic IDs, a random synthetic root key, simulated exact-login Helix responses and intercepted metadata/resolver calls. This does not prove that real runtime resolution will succeed. Activation remains blocked pending review and a separately authorized secure diagnostic attempt.

## Proven defects and narrow corrections

1. `scripts/provision-tester.sh` did not forward arguments. Consequently, `--check` could not reach the hash-only check and unknown arguments were silently dropped. It now forwards arguments unchanged. Unknown flags reject before resolver initialization.
2. The signer, bridge and former outer controller collapsed independent failures into generic messages. The signer and bridge now use fixed, non-sensitive categories for input, key initialization, construction, resolver, child environment, timeout and output failures. Arbitrary exception text and subprocess diagnostics are never forwarded.
3. The bridge had no child deadline, did not reliably clear the child environment after exceptions, and accepted unbounded-expiry output. It now enforces the original 30-second operational deadline and 15-minute invitation limit, validates input before resolution, validates output before delivery, and clears the child environment in `finally`.
4. `scripts/provision-tester-delivery.py` provides a tested replacement for the old outer controller's category-losing delivery boundary. It validates both outputs before delivery, rejects duplicate/incomplete batches, rolls back exactly once on failure, and reports rollback failure accurately. It contains no AWS client, secret resolver, automatic activation or retry. Its execution and rollback callbacks must be supplied by the separately reviewed owner controller; it has not been connected to a live activation attempt.

Successful stdout remains invitation URL plus expiry only. Failure stderr contains only an allowlisted category. Signing keys are zeroed after construction and on error; encoded strings cannot be reliably zeroized by Python/JavaScript, so they are confined to the owner process/child environment and references are cleared. No format guessing, key derivation change, validation weakening or signing-protocol change was introduced.

The local signer does not persist invitations. The original operational helper wrote only batch-status metadata. One-use nonce consumption remains the existing server transaction; no local file is treated as replay protection.

## Boundary evidence

The preserved original helper and original signer bytes were exercised without network access. The original signer was loaded from base commit `e6e96be`, not substituted with the correction. The helper's AWS preflight, runtime resolver and Twitch HTTP transport were replaced only in the test process. No claim is made that a mocked transport proves live service availability.

| Boundary                  | Evidence                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI parsing               | Original shell drops flags; regression proves corrected forwarding and rejection before resolver loading.                                       |
| Signer/key initialization | Both synthetic tester slots sign successfully. Invalid synthetic key yields a fixed key category. Real keys were not read.                      |
| Invitation construction   | Both synthetic grants pass the unchanged protocol; server tests cover matching, expiry and replay.                                              |
| Persistence               | Injected metadata-write failure is reported only as `INVITATION_PROVISIONING` by the original helper. No real ledger was accessed.              |
| Environment/process       | Injected missing executable and timeout also collapse to `INVITATION_PROVISIONING` in the original helper. Corrected bridge distinguishes them. |
| Output/controller         | Old controller discards the child category. New boundary retains only allowlisted categories and rolls back on output failure without retrying. |

Thus the historical failure could not be reproduced with valid synthetic inputs. A claim that the real key, resolver transport, filesystem or signer caused it would exceed the available evidence. The correction makes the next approved failure diagnosable without exposing sensitive inputs.

Tests use synthetic stand-ins for the Dsepticon and Dorathaadestroya tester slots. No numeric ID was inferred, looked up or retained during this review. Batch validation does not replace the existing requirement for exact Helix login matching before any future real provisioning.

## Production compatibility and infrastructure

The application, authentication handler, invitation protocol, key parser, IAM and infrastructure sources are unchanged. Rebuilt bundles match the reviewed deployment:

- Web-auth `index.mjs`: `91cbd512c3fe7dc6eb3e161637c7935363a67eb4fdc6146140dcde5c6061a9e3`.
- Gameplay `index.mjs`: `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`.
- Existing reviewed web-auth ZIP: `c80c8793428b49810d98a73476f270fc4eb14941269250e9e7534abd5afef9b5`.

No replacement Lambda artifact or deployment change set is needed. The proposed infrastructure diff is empty: **zero Add, Modify, Remove, replacement, IAM, route or table changes**. Clean native SAM output is byte-identical to both local bundles. Source translation equals the unchanged deployed processed template.

## Secret-version preservation

Metadata-only verification confirms:

| OAuth version                          | Stage retained                            |
| -------------------------------------- | ----------------------------------------- |
| `861c81fb-3a3e-4826-aea0-369e55bd7683` | `AWSCURRENT` — previous value retained    |
| `3d2124fd-ec32-404e-8978-bd7cbf813a59` | `AWSPREVIOUS` — corrected value preserved |

The corrected version was already `AWSPREVIOUS` after the earlier rollback; this run did not relabel it to `AWSPENDING`. Runtime readiness was deliberately not invoked because it retrieves real secret values. No Extension credential was retrieved or changed.

## Unexecuted activation plan

1. Review these local-tool changes and the unresolved historical boundary. Keep both modes disabled. Do not reuse the old category-discarding controller.
2. Separately authorize and review the secure resolver adapter and owner controller integration. Verify pinned resolver bytes and current tool interface through metadata before allowing resolution. The repository bridge retains its existing resolver pin; this review does not certify live resolver transport compatibility.
3. Run an authorized in-memory diagnostic using the production parser and synthetic tester IDs, with output captured and destroyed. Preserve fixed failure categories end to end. A failure stops the attempt; it does not justify a parser fallback or new secret rotation.
4. Only after that gate passes, separately review validation/promotion of the preserved corrected OAuth version, rollback labels and any required web-auth cache revision. No such operations are executed or authorized by this report.
5. Prepare a fresh parameter-only activation review: `WebSignInMode: DISABLED → TESTERS`, linking `DISABLED`, conversion `ENABLED`. Require unchanged Lambda code, IAM, table, routes, CloudFront, website, WAF and privacy. Do not reuse stale approvals as evidence of an exact comparison.
6. Following explicit activation approval, require current-stage readiness, disabled linking, unauthenticated rejection and confidential telemetry. Resolve the two exact intended logins through official Helix; never infer IDs. Provision at most one one-use grant per verified account, with no more than 15 minutes validity.
7. Supervise the two-grant delivery using the reviewed controller. Roll back sign-in and the secret stage on failure. If delivery may have partially occurred, do not retry; wait for the maximum invitation lifetime before another approved attempt. A failed rollback must remain an explicit blocker.
8. Perform live OAuth only with the intended account and owner interaction. Verify matching, session rotation, refresh, logout and replay rejection, with no gameplay/link writes. Keep linking disabled throughout.

No activation change set was created or executed in this run. The plan is intentionally unexecuted.

## Validation

See the accompanying machine-readable validation summary for final totals and measurements. Synthetic tests cover both tester slots, malformed inputs, key-format failures, resolver errors, timeout/environment failures, output/expiry validation, replay, wrong-account callback rejection, no partial batch delivery and rollback failure.

The first dependency/unit attempt hit sandbox process/network restrictions and was rerun with the required execution permission. The first browser attempt used a default web build rather than the required Twitch build and was aborted. The first performance attempt used the harness's stale default desktop artifact path; the corrected run explicitly selects this review's web build. These attempts are not counted as passing release gates. No application changes were made to address them.

## Scope and rollback

Only owner-side tooling, tests and review evidence changed. Tool rollback is a normal revert of this correction; no deployed resource requires rollback. The existing current secret and dormant configuration are already the requested safe state. Website, privacy, WAF, CloudFront, both Lambdas, identities and gameplay data remain untouched.

## Exact source/test files

- `scripts/provision-tester.sh`
- `scripts/provision-tester.ts`
- `scripts/provision-tester-runtime.py`
- `scripts/provision-tester-delivery.py` (new reviewed delivery boundary; not activated)
- `tests/provisionTesterRuntime.py`
- `tests/provisionTesterDelivery.py`
- `tests/testerInvitation.test.ts`

The report and non-sensitive evidence are under `docs/dime-m42-provisioning-review*`.

## Completed release gates

- Locked `npm ci`, lint, strict typecheck, formatting and `git diff --check` passed.
- **594 Vitest tests / 66 files**; **20 synthetic Python provisioning tests** passed.
- **170 Chromium tests** passed in one clean complete run (19.1 minutes, two workers, zero retries).
- **5 local guest Chromium tests** passed (6.7 minutes).
- Default, Twitch, web, guest, gameplay Lambda and web-auth Lambda builds passed.
- Clean native SAM, SAM validation, three cfn-lint suites, nine applicable Guard suites, source/processed equivalence and CloudFormation template validation passed.
- **36 synthetic IAM cases / 72 action decisions** passed. These were simulations, not actual storage or secret reads.
- **20 anonymous disabled-mode HTTP checks** and **14 invalid synthetic telemetry probes** passed.

| Production layout | Frame p95 / worst | Transition p95 | Browser errors |
| ----------------- | ----------------- | -------------- | -------------- |
| Panel             | 16.8 / 16.8 ms    | 87.75 ms       | 0              |
| Mobile            | 16.7 / 33.4 ms    | 88.87 ms       | 0              |
| Desktop           | 16.7 / 16.8 ms    | 97.53 ms       | 0              |

Each layout retained one canvas, no document scrolling, and correct eight-fragment quantity accounting. The independent heap run completed 180 transitions: retained heap grew from 4,929,584 to 5,024,104 bytes (+94,520 bytes, approximately 1.9%); DOM nodes and listeners stayed at 141 and 185. This finite synthetic run does not prove absence of every possible long-session leak or live Twitch webview issue.

The initial count-only telemetry search completed 30 CloudWatch queries with zero sentinel matches and six WAF interfaces with zero matching samples. A delayed search is recorded separately in the telemetry summary. No raw messages or sampled requests were included in the report.

The delayed search also completed 30 CloudWatch queries and six WAF interfaces with **zero matches and zero returned samples**, after a transient read-only API failure was retried. No additional probes were sent. Final metadata recheck confirms the same disabled modes, deployed hashes and secret stages.
