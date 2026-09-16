# Emergency web-auth correction deployed — 2026-09-16

## Result

The web-auth-only correction is deployed to `dime-v2-review-20260912` in account `861738068626`, us-east-2. The stack is **UPDATE_COMPLETE**, both Lambda hashes match expectations, and all **19 non-mutating live HTTP checks passed**. No failed CloudFormation events were returned. Website objects and `/privacy` were not changed.

Source: `6a89255d65b957159c8b2a5091512d6ee0ee7958`, branch `codex/dime-m4-graphics-web`, based on deployment report `3b2983f`. Amplify exclusion was verified before pushing: only `main` and `codex/react-extension-rebuild` are connected/auto-created. No gameplay/frontend artifact was rebuilt or published.

## Root cause and correction

The old handler initialized OAuth login, Extension credentials, conversion configuration and storage before routing logout/deletion continuation. Its generic catch obscured the underlying initialization exception. The correction gives emergency routes a separate minimal dependency path. Status and cookie-less logout need no initialization; malformed deletion proof is rejected before credentials/storage are constructed. Verified recovery uses only the recovery keys, storage, and lazy provider revocation. No OAuth client secret or Extension signing/identity key is accessed by that path.

Logout succeeds idempotently without a session, expires session/login cookies on every response, and revokes a matching existing server session with CSRF protection. Revocation outage cannot restore a logged-out session. Verified deletion retains its durable checkpoint and grant on provider failure and returns a retryable 202 response. Invalid, wrong-account, expired and out-of-window replay proofs fail authorization. [Routing and retention specification](dime-m42-emergency-routing.md) documents the 35-day proof bound and fixed legacy-job compatibility deadline.

The sign-in gate blocks only login/callback and link initiation/acceptance. Existing protected operations continue to require their normal session/ownership/CSRF checks. Sign-in disablement is never an authentication bypass. Linking remains independently disabled. Provider revocation needs only a public client ID and existing token, per [Twitch's revocation API](https://dev.twitch.tv/docs/authentication/revoke-tokens).

Changed source files: `server/webEmergency.ts`, `server/webHandler.ts`, `server/webHttp.ts`, `server/webSignIn.ts`, `server/webAuth.ts`, `server/accountDeletion.ts`, `server/twitchOAuth.ts`. Tests: `tests/webEmergency.test.ts`, `tests/webSignIn.test.ts`, `tests/accountLifecycle.test.ts`, `tests/e2e/m42Emergency.spec.ts`. No infrastructure source files changed.

## Exact reviewed execution

Change-set ARN:

`arn:aws:cloudformation:us-east-2:861738068626:changeSet/m42-emergency-6a89255-1/6ccdd27f-2848-42a8-a4d7-2465d69d27cd`

Executed once with token `m42-emergency-6a89255-owner-20260916`, after confirming CREATE_COMPLETE / AVAILABLE and stack UPDATE_COMPLETE.

| Operation              | Resource        | Review                                                             |
| ---------------------- | --------------- | ------------------------------------------------------------------ |
| Modify, no replacement | WebAuthFunction | Code reference only                                                |
| Modify, no replacement | StagingHttpApi  | Dynamic WebAuthFunction.Arn reevaluation; processed Body identical |

**Zero additions, removals or replacements.** The complete processed-template comparison has exactly one difference: `WebAuthFunction.Properties.Code`. Every parameter and all other resource definitions remain identical, including gameplay Lambda, routes, permissions, IAM, table/index/TTL/PITR/encryption/billing, logs, alarms, outputs and secret references. ConfigurationRevision intentionally remains `m42-signin-289cadc-review-1` to avoid an unrelated gameplay environment update; the source commit and artifact version identify this code release.

Postdeployment processed-template equality and all 23 deployed route keys were verified. No website, privacy or CloudFront operation occurred.

## Artifact and unchanged gameplay

Web-auth ZIP: `/tmp/dime-m42-emergency/web-auth-emergency-6a89255.zip`, **491,049 bytes**.

- ZIP SHA-256: `7e3ef5b90f44aba745fcc83e8baa147f8ed87afd25713eac1f7021ecdd4485ad`.
- Module SHA-256: `63de7251010498e7bdef8cf6674709a03549a010baf31172fcc25e66a3b590e8`.
- S3 bucket: `dime-v2-staging-artifacts-861738068626-us-east-2`.
- Key: `dime-v2/review/6a89255d65b957159c8b2a5091512d6ee0ee7958/web-auth-emergency-6a89255.zip`.
- Version: `Pa5iTi5B4j4foI1ACOOodpcjDvlxyNkW`.
- Uploaded once with If-None-Match `*`, AES256 encryption and verified SHA-256 checksum. ZIP contains only root `index.mjs`; no maps, fixtures, frontend, literal credentials or unintended migration modules. Clean Linux-native SAM output is byte-identical.

Gameplay was **not rebuilt or redeployed**. Its retained module SHA-256 remains `161f0598d7d0b3bb3611c3b5e112cc4bb19cfd7a02b94f15ff6b6f1ff3dc26d4`, and live Lambda ZIP SHA-256 remains `e246dd9056187c1daf4d26a70dc68ab5cc0e6ef621371a8ba9b6ca0f53a42af6`.

## Tests and live results

- **410/410 unit/integration tests**, 58 files. Includes existing Extension/domain/scanner/mining/recovery tests, valid and absent sessions, repeated logout, cookie expiry, credential-free handler paths, CSRF, deletion ownership/expiry/replay, revocation outage/retry and no writes on disabled authentication expansion.
- **6/6 Chromium protocol tests** across 318×500 Panel, 360×640 Mobile and desktop: cookie expiry, repeated logout, refresh, disabled login/callback, deletion continuation after session revocation and no frontend credential storage. These are the targeted emergency/deletion suite, not a new full visual/gameplay browser release run.
- Strict typecheck, lint, configured formatting and git diff --check passed. Web-auth build, clean SAM build/validation, source/packaged/actual-processed cfn-lint, shared source/processed Guard rules, CloudFormation template validation and describe-events predeployment checks passed.
- First unit attempt hit sandbox local-server restrictions and an overly narrow mock call count (read plus condition-check). After correcting the assertion and allowing the local server, the complete suite passed cleanly.

Live API: `https://t2la0784p6.execute-api.us-east-2.amazonaws.com/staging`.

| Check                                   | Result                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Logout, twice without cookies           | 200 `{"signedOut":true}`; both Secure/HttpOnly authentication cookies expired |
| Deletion continuation without proof     | 401 UNAUTHORIZED; no configuration 503                                        |
| Deletion continuation with wrong origin | 403                                                                           |
| Login and synthetic invalid callback    | 503 WEB_SIGN_IN_UNAVAILABLE; no redirect or cookie                            |
| Link intent and accept                  | 503 WEB_SIGN_IN_UNAVAILABLE                                                   |
| Status                                  | 200, exactly signInAvailable=false / linkingAvailable=false; no-store         |
| Eight existing Extension endpoints      | 401 UNAUTHORIZED without authentication                                       |
| Exact Extension-origin preflight        | Correct allow-origin                                                          |
| Untrusted-origin preflight              | No allow-origin                                                               |

Valid-session logout and valid deletion continuation were exercised against synthetic in-memory records, including the exported Lambda handler. Live verification deliberately used no session cookie or deletion credential and therefore did not inspect or alter any real account/player data. No authenticated live gameplay/deletion success is claimed. The original hidden configuration exception was not diagnosed by reading secrets; route-specific initialization removes the inappropriate dependency for these operations.

Final modes: **WebSignInMode DISABLED**, **AccountLinkingMode DISABLED**, **ContentConversionMode ENABLED**. Tester tags retain the previously reviewed empty value through unchanged parameters; no resolved secret/environment values were retrieved. TESTERS eligibility remains unavailable.

## Publication and rollback

The website and `/privacy` are unchanged. No object versions/backups/invalidation were created by this correction. The previously identified same-origin CloudFront routing, HTTPS origin and CSP work remains a separate publication prerequisite. No Twitch upload or public release occurred.

The prior web-auth ZIP remains versioned, but restoring it would reintroduce the emergency 503 defect. Prefer a reviewed forward correction; preserve all disabled modes and the current manifest-aware gameplay writer. No data rollback, reset or deletion is necessary or authorized for this code update.

Filtered [deployment evidence](dime-m42-emergency-deployment-evidence.json) records the exact resources, events, hashes, parameters and HTTP results. Additional local evidence is under `/tmp/dime-m42-emergency`. No secret value, player field or item key was retrieved or exposed; no table scan/reset/wipe, unrelated resource change or mineral-balance change occurred.
