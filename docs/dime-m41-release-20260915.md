# Milestone 4.1 release preparation — September 15, 2026

Starting source: `1fd284cc183b551b77fb7786f7c04f655c7cdf96`, local and GitHub HEAD verified identical. The requested temporary checkout did not exist; work used the clean `/home/dsepticon/projects/DIMEapp` checkout on `codex/dime-m4-destroya-universe`.

AWS account `861738068626` verified. Amplify app `d90ik3712sg8e` had only literal automatic patterns and connected branches `main` and `codex/react-extension-rebuild`. No push is allowed without a fresh verification.

## Changes

Prepared [privacy policy](privacy-m41.html), preserving verified contact and operational disclosures. Added the missing privacy link to the original client and clarified reset semantics. Receipt retention is accurately separated: request receipt TTL eligibility is 30 days; conversion provenance is embedded in the save. Publication must recheck the actual date and current ETag.

## Evidence

Local evidence directory: `/tmp/dime-m41-release`. Clean locked install: 245 packages, zero npm audit findings. Lint, strict typecheck, 266 Vitest tests across 42 files, default/Twitch/web/Lambda builds, formatting and Linux-native SAM build passed. SAM output is byte-identical to the reviewed Lambda bundle. Source/built/offline-processed cfn-lint and six source/four processed Guard rules passed. CloudFormation processing, cfn-lint and all processed Guard rules also passed. The processed candidate exactly matched the source transform, and the final deployed template exactly matched the candidate.

All 66 Chromium scenarios passed in 24.2 minutes. The ten-minute production-preview run completed 498 travel cycles with zero errors; average transition 74.13 ms, p95 92.80 ms, worst 128.42 ms. DOM nodes held at 41, canvas count at one, no document scrolling; post-idle heap 6,506,075 bytes. This is a local surrogate, not real Twitch webview performance. Privacy HTML text, structure, two verified mailto links, no horizontal overflow, and desktop/mobile screenshots passed.

Artifacts:

- `/tmp/DIME-Twitch-0.8.0-destroya-universe.zip`: 88,753 bytes; SHA-256 `7df65fabfd59e72ded4d36c6f620a8fd4a201293e1da8fd59614253e69ac6f27`. Windows Downloads copy byte-identical.
- `/tmp/dime-m41-release/DIME-Twitch-0.8.0-v4-rollback.zip`: identical v4 candidate; local verification only, not Hosted Test verified.
- `/tmp/dime-m41-release/lambda.zip`: 486,103 bytes; SHA-256 `af166797d6797a66e5681e922da02d20ecc7601b5caed0a248ae5b8f61ff1e70`. Only `index.mjs` at archive root.
- Lambda module SHA-256 `71373847f69defa92afbc836d8ccf1d02476bcb540d39cf8e5ec973b7274144e` matches the original reviewed commit.
- Privacy candidate: 8,502 bytes; SHA-256 `6887c3553816e44e701f4965554b5b85bedc584acd13665727050714f216dc6c`.
- Privacy backup `/tmp/dime-m41-release/privacy-before.html`: 7,130 bytes; SHA-256 `00217796f4389652d4e4984236406601906a0daa21be40c81f1b312129aea8fb`; ETag `"0683de5bbcd76a57456f5ceb8916ccf3"`. AES256, inline HTML UTF-8, public max-age 300.

Frontend archive contains three root HTML files and one JS/CSS pair, no images, maps, fixtures or wrapper. Scans checked protected legacy terms, local endpoints, synthetic fixture text, expected staging API, privacy URL and original universe. Lambda is bundled from the clean source, contains no frontend/maps/fixtures, and passed forbidden migration-module and common credential-pattern checks. Such pattern checks are not a mathematical proof that arbitrary secret strings cannot exist.

## Completed publication and deployment

AWS login was renewed with owner authorization through a browser callback; no authorization code or credential was copied into chat. Account and Amplify exclusion were reverified.

Privacy was published conditionally against the backed-up ETag with AES256 and preserved content metadata. New ETag: `"36b650808ecff4e13988e43a3159e62d"`. CloudFront invalidation `I6RMEIH55BIAGXQW1DD4YDTWFW` affected only `/privacy` and completed. Public HTTPS returned 200 and exact candidate bytes/hash, required headers, effective date and mailto links. Public desktop/mobile Chromium rendering passed.

Lambda create-only upload:

- Bucket: `dime-v2-staging-artifacts-861738068626-us-east-2`
- Key: `dime-v2/review/1fd284cc183b551b77fb7786f7c04f655c7cdf96/DIME-Lambda-4.1-original-universe.zip`
- Version: `S3yh29eIbXGuWR7su4pVComz734DpTTo`
- SHA-256 checksum (base64): `rxZnl9Z5emblaB6SLaAtIOzHYBtcrtCiSK5bj2H/HnA=`

UPDATE change set `m41-original-universe-20260915-1` (`d4c9ab37-9d4d-4ff9-8ed1-76440b8b38fd`) was reviewed and executed once. It added exactly five route-scoped invoke permissions and modified only EbsFunction/StagingHttpApi without replacement. IAM, stateful resources, logs, alarms, stage, throttling, existing CORS and outputs were structurally identical. No correction was needed. Predeployment describe-events passed and postdeployment failed-event count was zero. Stack reached UPDATE_COMPLETE.

Deployed function is Active/Successful; ZIP CodeSha256 matches the upload. Configuration revision `m41-original-universe-20260915-1`, conversion `DISABLED`, tester tags empty (verified as a boolean without displaying configuration secrets). Eight exact routes and eight route-scoped invoke permissions verified. All unauthenticated requests returned 401: GET /state and /v4/state; POST /actions, /profile/reset, /v4/actions, /v4/content/preview, /v4/content/convert and /v4/profile/reset. Approved-origin preflight returned 204 with the exact origin; an unapproved origin received no allow-origin header.

## Remaining external gates

No authenticated Twitch Developer Console session is exposed. Version creation/upload, Local Test, Hosted Test and real Twitch webview performance remain unverified. No approved live synthetic-authorization mechanism was available, so authenticated live legacy gameplay and conversion-preview regression were not performed. Local synthetic legacy tests passed; those are not a substitute for live authentication. The rollback ZIP is a locally verified v4-compatible candidate, not a Hosted Test verified rollback.

No website application deployment occurred; only `/privacy` was replaced, with its verified backup retained. No DNS or unrelated website object changed. Milestone 4.2 continues on the isolated web-oauth branch; it was not included in this Lambda or Twitch ZIP.

No secret values, real JWTs/cookies, real player identifiers or player fields were fetched, printed or changed. No player data was scanned, exported, converted, reset or deleted. No prohibited branch or AWS resource was modified. Conversion was never enabled. No production/public Twitch submission or release occurred.
