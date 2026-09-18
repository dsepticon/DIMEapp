# Owner tester activation: preflight complete, browser step deferred

Date: 2026-09-18. Branch: `codex/dime-m4-graphics-web`.

Reviewed source commits: `df936e533f4e38a9dd0e8fd99eda02aa68ec2f7d` and `d3790939e336bd25924408292acc401460326e4b`.

## Outcome

The owner approved the activation plan, then confirmed they **cannot complete browser sign-in now**. This session has no authenticated browser-control tool, and no control connection was found on the two local browser ports checked.

Activation and delivery were therefore deferred before any mutation. Failure/blocker category: **`OWNER_BROWSER_UNAVAILABLE`**. The existing approval is retained; no further routine deployment approval is requested by this report.

- Sign-in remains **DISABLED**.
- Linking remains **DISABLED**.
- Conversion remains **ENABLED**; deployed tester tags remain empty.
- Stack remains `UPDATE_COMPLETE`.
- No secret promotion, configuration refresh, change-set creation or execution occurred.
- No Helix lookup, real invitation generation or delivery occurred. No invitation files were created in Windows Downloads.
- No authenticated OAuth callback, new session, identity, account, manifest, receipt or gameplay save was created by this run.
- No gameplay data was accessed or modified. Gameplay Lambda, website, privacy, CloudFront, WAF, IAM and DynamoDB configuration are unchanged.

This is metadata and dormant-readiness preflight. The secure local resolver/signer diagnostic, fresh Helix matching and live owner-controller integration were not attempted. The historical provisioning cause remains unproven as recorded in the preceding review.

## Verified preflight

- Local branch and remote HEAD matched `d3790939e336bd25924408292acc401460326e4b`; its parent is the reviewed correction commit. Worktree was clean before this report.
- AWS account matches `861738068626`; staging operations are scoped to `us-east-2`.
- Amplify auto-creation patterns and connected branches remain exactly `main` and `codex/react-extension-rebuild`. The working branch remains excluded.
- Deployed processed template matches the prior reviewed template exactly.
- Reviewed web-auth ZIP SHA-256 remains `c80c8793428b49810d98a73476f270fc4eb14941269250e9e7534abd5afef9b5`.
- Web-auth bundle SHA-256 remains `91cbd512c3fe7dc6eb3e161637c7935363a67eb4fdc6146140dcde5c6061a9e3`.
- Gameplay bundle SHA-256 remains `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`.
- Deployed Lambda code hashes still match the reviewed artifacts.
- Previously recorded format-only validation and provider-credential validation evidence remains intact.

CloudFormation masks the conversion tester-tag parameter. An initial preflight assertion incorrectly treated the masked value as a literal value; it was corrected to query only the deployed empty-tags Boolean. No tag value was displayed. Subsequent transient CLI failures were recovered through read-only checks; no failed or uncertain mutation was retried.

## Secret versions preserved

| OAuth version                          | Unchanged stage                                                  |
| -------------------------------------- | ---------------------------------------------------------------- |
| `861c81fb-3a3e-4826-aea0-369e55bd7683` | `AWSCURRENT` — former value retained                             |
| `3d2124fd-ec32-404e-8978-bd7cbf813a59` | `AWSPREVIOUS` — validated whitespace-corrected version preserved |

No operator-side secret resolution was performed. The IAM-only readiness invocation used the deployed runtime and returned only the approved 11 Booleans. It does not validate the OAuth client-secret value and is not evidence of a completed OAuth exchange. No rollback or cache refresh was necessary because no version label or configuration changed.

## Checks performed

- IAM-only `AWSCURRENT` readiness: **11/11 passed** in DISABLED mode.
- Anonymous disabled-mode HTTP/CORS: **20 checks passed**, including login/callback rejection without redirect, non-sensitive status, idempotent logout/cookie expiry, missing deletion proof, legacy/v4 unauthenticated rejection and exact-origin CORS.
- Public guest smoke: **Panel, Mobile and desktop passed**. Canvas and walking work; guest notice is visible; no gameplay storage, credentials or authenticated requests were observed.
- Focused synthetic invitation/readiness regression: **82 tests passed in two files**, including invalid/expired/mismatched-account/replayed invitations and readiness restrictions. These are synthetic results, not claims of live tester sign-ins.
- Telemetry configuration: six sampling settings remain disabled, aggregate metrics enabled, CloudFront standard/real-time logging disabled, WAF association unchanged.
- Fourteen structurally invalid synthetic telemetry probes passed, without redirects, sensitive echoes or real credentials. Initial and delayed count-only search results are recorded in the accompanying evidence.

No application code changed; the complete validation results in the preceding provisioning review remain applicable. This run adds only this report and non-sensitive evidence.

## Resume point

Resume when the owner can promptly complete both intended Twitch sign-ins. Recheck the mutable metadata and comparison gates before any mutation. Then follow the approved sequence: secure diagnostic, promotion of only the validated corrected version, reviewed web-auth refresh, 11/11 readiness, parameter-only TESTERS activation, exact official Helix matching, protected separate invitation files, and the two live OAuth tests.

Keep linking disabled. Do not claim live mismatch, replay, rotation, refresh or logout results until those steps are actually completed. Any failure after mutation must invoke the reviewed rollback, restoring the former current version and DISABLED sign-in before further delivery. Invitations must not appear in reports or logs.

Initial and delayed telemetry searches each completed 30 CloudWatch queries and six WAF sampling checks: **zero sensitive sentinel matches and zero returned WAF samples**. No new probes were sent during the delayed search.
