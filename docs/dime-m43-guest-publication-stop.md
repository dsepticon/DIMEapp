# Guest publication preflight — stopped before writes

Verified 2026-09-16 at 17:13 UTC, on reviewed branch HEAD `f77a24cdeedfacce43f925828e704654b20c8174` (implementation `853669a4885e61226c07f13ab2b71b61e6f4020f`). Intended URL: https://destroyaindustriesminingextension.com.

## Result

**Not published.** The owner authorized the exact reviewed build but explicitly required stopping if the gate affects unrelated domain paths. The reviewed routing generator changes the distribution's default behavior, which affects all paths outside its four explicit behaviors. This conflict was confirmed against the live configuration before any AWS mutation. It is not deployment drift: the live ETag still equals the reviewed baseline `E2GYT0DANXUABP`.

## Verified artifact

ZIP `/tmp/dime-m43-guest/DIME-Web-0.9.0-guest-demo-review-20260916.zip`, 111,138 bytes, SHA-256 `1a0f24ff06051e2df27565e606f9bd2f5870147c780a0724bbce37cf5501e920`.

All three archive entries, their sizes and hashes match the publication manifest; no additional files exist:

| File                      | SHA-256                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| index.html                | d854481cebcaa0e45ce6d727b166448108240c5a5b90a4cbf1971284f532fb9c |
| assets/index-BPyjZOOz.css | 235789dd82f9c565f0ee1e9b27709bb2526dfc0aba3b5420ce18df009d1ed9b6 |
| assets/index-K9AnuJ1n.js  | f0c4c5b95080719a74d45efd7d65af3755ac45f97af1a006cc220663988554dd |

Auxiliary template and function hashes also match the reviewed manifest: `0e2d03d9778b382d9ddd0254210349bb1afdf78518a4f121027d17309b8c7b33` and `7bea0577c3673f486f24bea57d189c974b1f82357daa277da7fa85c45e590828`.

## Blocking comparison

| Default behavior        | Live                                 | Reviewed proposal                         |
| ----------------------- | ------------------------------------ | ----------------------------------------- |
| Origin                  | Existing S3 website origin           | New HTTPS S3 REST origin                  |
| Cache policy            | 2e54312d-136d-493c-8eb9-b001f22f67d2 | 4135ea2d-6df8-44a3-9df3-4b5a84be39ad      |
| Response headers policy | None                                 | New restrictive guest CSP/security policy |

The exact `/privacy` behavior preserves its original delivery, but unrelated paths do not receive such an exception. They would inherit changed origin semantics, caching and CSP. The review README already describes this impact; the new publication instruction explicitly prohibits it. Static or unrelated pages with different script/style requirements could be affected. No live content failure was induced or claimed.

A corrected routing review must preserve the existing default behavior and scope application delivery/security headers to the guest entry and required application assets, with narrowly scoped capability/API behaviors and verified emergency-auth passthrough. That correction is a different routing candidate from the exact one approved here; it has not been silently substituted or deployed.

## Read-only AWS verification

- Account: `861738068626`.
- Bucket: `destroyaindustriesminingextension.com`, confirmed us-west-2 with expected-owner enforcement.
- Distribution: `EC269D02M2JLD`; expected domain alias; one original origin, zero ordered behaviors; ETag unchanged.
- Stack `dime-v2-review-20260912`: `UPDATE_COMPLETE`.
- WebSignInMode: `DISABLED`; AccountLinkingMode: `DISABLED`; ContentConversionMode: `ENABLED`.
- Amplify automatic patterns and connected branches remain only `main` and `codex/react-extension-rebuild`; this report branch is excluded.

## Publication and rollback evidence

No change set, CloudFront resource, distribution update, S3 backup/write, uploaded object version or invalidation was created. Therefore there are no execution/invalidation identifiers, newly uploaded hashes or public guest-play test results. Existing local rollback evidence and the publication manifest remain unchanged. No rollback was necessary because publication never began.

The prior prepared build passed 416 unit tests and 168 Chromium tests, as recorded in the guest review. Those are local review results, not public deployment verification. No new gameplay suite was run for this documentation-only stop report.

Neither Lambda, OAuth/linking configuration, `/privacy`, Twitch Extension or player data was changed. No player records, item keys or secret values were accessed. Resume requires a separately reviewed routing correction satisfying the unrelated-path stop condition.
