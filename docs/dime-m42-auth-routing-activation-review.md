# Gate 1 — exact auth routing and confidentiality review

2026-09-16. **Prepared only. No CloudFront/WAF/website change was applied. Do not activate TESTERS until this gate and the privacy/callback gates pass.**

## Exact distribution comparison

Distribution `EC269D02M2JLD`; captured ETag `E3GPEVCIK9UL3J`. Preserve the existing S3 website origin, default behavior/document, custom error responses, TLS certificate, root, `/privacy`, `/game/*`, all four exact guest API-denial behaviors, WAF attachment, and all unrelated settings. Add one HTTPS-only custom origin: `t2la0784p6.execute-api.us-east-2.amazonaws.com`, origin path `/staging`, TLS 1.2. Do not forward the viewer Host header.

Append only ten exact behaviors, with no `/auth/*` wildcard. Existing five behavior definitions and ordering are byte-structurally unchanged. Existing `/api/v4/*` persistent API routing and direct Twitch Extension APIs are untouched. Unknown `/auth/...` paths keep their existing default-site routing. Viewer method guard rejects raw-path aliases, unsupported methods and unexpected query names before forwarding.

[Exact before configuration](dime-m42-testers-dormant-review/routing/distribution-before.json), [proposed configuration](dime-m42-testers-dormant-review/routing/distribution-proposed-unresolved.json), [comparison and resource list](dime-m42-testers-dormant-review/routing/routing-comparison.json), [forwarding contract](dime-m42-testers-dormant-review/routing/routing-contract.json).

The proposed configuration deliberately contains unresolved CloudFormation references for new policy/function IDs. It is **not an executable update-distribution request**. A future separately approved auxiliary deployment must resolve these IDs, then rerun the exact comparison against a fresh ETag before any distribution update.

## Paths and forwarding

The website calls these paths on its own origin. Existing API CORS remains Extension-only: a web-origin OPTIONS request returns 204 without allow-origin, so direct cross-origin web access is unsupported. Same-origin website requests do not require CORS preflight permission. No CORS expansion is proposed.

Every path forwards Origin and the two CORS preflight headers when supplied. No policy forwards all headers, all cookies or all query strings. GET/POST below refers to the application method; OPTIONS passes to existing API CORS. CloudFront requires its seven-method set for POST-capable behaviors, so the associated function denies PUT/PATCH/DELETE/GET/HEAD on POST routes. Read routes deny HEAD and other unreviewed methods. TLS is required; auth requests are not redirected from plaintext HTTP.

| Exact path            | Method | Cookies forwarded | Query values forwarded   | Other headers               |
| --------------------- | ------ | ----------------- | ------------------------ | --------------------------- |
| `/auth/login`         | GET    | None              | `invitation`             | None                        |
| `/auth/callback`      | GET    | login, session    | `code`, `state`, `error` | None                        |
| `/auth/status`        | GET    | None              | None                     | None                        |
| `/auth/session`       | GET    | session           | `view`                   | None                        |
| `/auth/logout`        | POST   | session           | None                     | Content-Type, X-Dime-Csrf   |
| `/auth/link/intent`   | POST   | session           | None                     | Content-Type, X-Dime-Csrf   |
| `/auth/link/accept`   | POST   | None              | None                     | Content-Type, Authorization |
| `/auth/unlink`        | POST   | session           | None                     | Content-Type, X-Dime-Csrf   |
| `/auth/delete/intent` | POST   | session           | None                     | Content-Type, X-Dime-Csrf   |
| `/auth/delete/resume` | POST   | session, deletion | None                     | Content-Type, X-Dime-Csrf   |

Cookie names above expand to `__Host-dime-<name>`. Provider callback `scope` and `error_description` query names are tolerated but not forwarded; callback state/error handling and cookie cleanup still reach the backend. Duplicate mandatory query values remain subject to backend rejection. No cookie, query value, authorization code, invitation or body is read or logged by the edge function.

The sign-in phase still blocks linking and every authenticated gameplay route. Merely routing link endpoints does not enable them. Existing direct Extension link-accept calls remain unchanged; this website behavior adds no gameplay permission or API route.

## Caching and response protection

Use AWS managed **CachingDisabled**, ID `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`, on all ten routes: minimum/default/maximum TTL zero. No auth cache key or response reuse; no real-time logging attachment. Origins already return `Cache-Control: no-store`. A scoped response policy adds `no-store, private, max-age=0`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, nosniff and DENY framing. Preserve the backend's per-response nonce CSP and existing CORS rather than replacing either with a global policy.

AWS documents that [CachingDisabled has all TTLs zero](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html#managed-cache-policy-caching-disabled) and [does not cache error status codes/custom error pages](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html). The current [Authorization forwarding guidance](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html#forward-authorization-header) permits individual origin-policy forwarding; it is limited here to the exact link-accept path with caching disabled. No all-viewer policy is used.

Proposed new managed resources: **ten OriginRequestPolicy resources, one ResponseHeadersPolicy, one CloudFront Function**. No cache policy, Lambda@Edge, IAM, API route, table or gameplay resource is added. Auxiliary CloudFormation template validation, cfn-lint, Guard and path/forwarding tests cover the proposal; no routing auxiliary change set has been created or executed.

## Blocking finding: WAF samples are not confidential yet

Current distribution standard logging is disabled and no real-time logging is attached. API access logs contain only request ID, route key, status and response latency. However, the attached WAF ACL and all five rules have `SampledRequestsEnabled=true` and no DataProtectionConfig. GetLoggingConfiguration reports no logging configuration; that does not disable sampled-request capture. Only configuration metadata was read—**no logs or sampled requests were retrieved**.

AWS confirms that [logging redaction does not protect request sampling](https://docs.aws.amazon.com/cli/latest/reference/wafv2/get-logging-configuration.html), while [WebACL-level data protection covers sampling and other collection](https://docs.aws.amazon.com/waf/latest/APIReference/API_DataProtectionConfig.html). A real invitation, callback code or cookie could therefore be captured if tests began under the current setup. **Do not route real OAuth traffic or issue invitations yet.**

[Separate confidentiality proposal](dime-m42-testers-dormant-review/waf-confidentiality-review.json): substitute query strings, bodies and credential-bearing headers/cookies in all WAF collection, without changing allow/deny rules or bypassing inspection. This applies at ACL scope, including unrelated diagnostic collection, so it requires a distinct owner review. An alternative is reviewed disabling of sampling at the ACL and every rule. Neither option was applied; neither is silently bundled into the narrow CloudFront proposal. Future logging or Security Lake integration must preserve the same protection.

## Future rollout and rollback

1. Review/resolve WAF confidentiality; verify using non-sensitive synthetic markers only.
2. Approve exact auxiliary resources and auth behaviors with fresh distribution ETag. Preserve existing origins/behaviors verbatim; no wildcard, global header policy or persistent-API routing changes.
3. Wait for Deployed; test disabled endpoints, method/query/cookie forwarding, no caching, CSP, CORS and cookie expiry. Do not issue a real invitation while either privacy or Twitch callback confirmation is no longer current.
4. Preserve `/game/*`, root and `/privacy` public bytes. Auth routing alone requires no S3 writes or application invalidation. If a previously cached exact auth path needs invalidation, review only those paths separately.
5. If routing fails before activation, restore the captured distribution configuration using its then-current ETag and wait for Deployed. Keep both modes DISABLED. Do not remove logout/deletion recovery access after any future authenticated activation until safe shutdown/recovery is complete. Never roll WAF confidentiality protection back while credential-bearing traffic remains possible.
